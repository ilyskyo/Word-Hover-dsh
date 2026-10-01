#!/usr/bin/env node
/**
 * 宿主端端到端测试。
 *
 * 用真实的 node:http 服务器 + 假装成 ctx.webServer 的注册表，
 * 验证：路由注册 → 输入校验 → 限流 → **不缓存** → 降级 → 错误不崩。
 *
 * 默认**不**打外网（上游被替换成可控桩），所以这个测试是确定性的、可离线运行。
 * 加 --live 参数会额外跑一次真实联网自检，只报告结果、不影响退出码。
 *
 * 用法： node scripts/test-host.mjs [--live]
 */

import http from 'node:http';
import { apply, RateLimiter } from '../lib/index.js';
import * as youdao from '../lib/providers/youdao.js';
import * as suggest from '../lib/providers/suggest.js';
import * as freedict from '../lib/providers/freedict.js';

let failures = 0;
let checks = 0;
function check(label, condition, detail = '') {
  checks += 1;
  if (condition) console.log(`  ✓ ${label}`);
  else { failures += 1; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

// ── 用可控桩替换真实 provider 的网络调用 ──────────────────────────
// 通过改写模块里的 httpFetch 做不到（ESM 导出不可写），所以改成拦截全局 fetch。
// 桩必须确定性：不依赖 URL 之外的状态，否则用例之间会互相污染。
const realFetch = globalThis.fetch;
let fetchCalls = [];
/**
 * 上游故障模式：
 *   'ok'           全部正常
 *   'primary-down' 只有主源（有道 jsonapi）挂掉，降级源正常 → 用来验证降级链
 *   'network-error' 全部网络异常 → 用来验证全链路失败时的兜底行为
 *   'http-500'      全部返回 500
 */
let fetchBehaviour = 'ok';
/**
 * 上游桩的响应延迟（毫秒）。
 * 默认 0（快速）；测「单飞」这类并发行为时必须调大，否则请求根本不会重叠。
 */
let stubDelayMs = 0;

/** 造一个 JSON 响应。 */
function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** 按 URL 返回固定的上游响应。 */
function stubResponse(rawUrl) {
  const url = String(rawUrl);
  if (url.includes('dict.youdao.com/jsonapi')) {
    return jsonResponse({
      simple: { word: [{ usphone: '\u02c8test', ukphone: '\u02c8test' }] },
      ec: { word: [{ trs: [{ tr: [{ l: { i: ['n. \u6d4b\u8bd5\u8bcd'] } }] }] }], exam_type: ['CET4'] },
    });
  }
  if (url.includes('dict.youdao.com/suggest')) {
    // 回显查询词：provider 内部按 entry === word 匹配，写死 hello 会导致匹配失败
    let q = 'hello';
    try { q = new URL(url).searchParams.get('q') || q; } catch { /* 保持默认 */ }
    return jsonResponse({
      result: { code: 200 },
      data: { entries: [{ entry: q, explain: 'int. \u5582\uff0c\u4f60\u597d' }] },
    });
  }
  if (url.includes('dictionaryapi.dev')) {
    return jsonResponse([{
      word: 'hello',
      phonetics: [{ text: '/h\u0259\u02c8l\u0259\u028a/', audio: '' }],
      meanings: [{
        partOfSpeech: 'interjection',
        definitions: [{ definition: 'A greeting.', example: 'Hello there.' }],
      }],
    }]);
  }
  return new Response('not found', { status: 404 });
}

globalThis.fetch = async (url) => {
  const target = String(url);
  fetchCalls.push(target);
  if (stubDelayMs > 0) await new Promise((r) => setTimeout(r, stubDelayMs));
  if (fetchBehaviour === 'primary-down' && target.includes('dict.youdao.com/jsonapi')) {
    throw new TypeError('Failed to fetch');
  }
  if (fetchBehaviour === 'network-error') throw new TypeError('Failed to fetch');
  if (fetchBehaviour === 'http-500') return new Response('boom', { status: 500 });
  return stubResponse(target);
};

// ── 搭一个最小的 Cordis ctx ────────────────────────────────────────
/** 每个场景用独立的 ctx + server，避免限流配额互相污染（这是踩过的坑）。 */
async function makeHarness(config) {
  const routes = new Map();
  const disposers = [];
  const warnings = [];
  const harnessCtx = {
    logger: { info() {}, warn: (msg) => warnings.push(String(msg)) },
    effect(fn) {
      const dispose = fn();
      if (typeof dispose === 'function') disposers.push(dispose);
      return () => { const i = disposers.indexOf(dispose); if (i >= 0) disposers.splice(i, 1); dispose(); };
    },
    webServer: {
      register(route) {
        if (!route || typeof route.path !== 'string' || typeof route.handler !== 'function') {
          throw new Error('route 形状不对');
        }
        if (routes.has(route.path)) throw new Error(`重复路由 ${route.path}`);
        routes.set(route.path, route);
        return () => routes.delete(route.path);
      },
    },
  };
  apply(harnessCtx, config);
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const route = routes.get(url.pathname);
    if (!route) { res.writeHead(404); res.end('no route'); return; }
    try { route.handler(req, res); } catch (error) { res.writeHead(400); res.end(String(error)); }
  });
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${srv.address().port}`;
  return {
    routes, warnings, disposers,
    get: async (path) => {
      const response = await realFetch(origin + path);
      let body = null;
      try { body = JSON.parse(await response.text()); } catch { body = null; }
      return { status: response.status, body, headers: response.headers };
    },
    close: () => new Promise((resolve) => srv.close(resolve)),
  };
}

// 主场景：限流放到很宽松，避免影响功能断言
const h = await makeHarness({
  provider: 'youdao',
  fallbackProviders: ['suggest'],
  proxyRateLimitPerMinute: 6000,
});
const { routes } = h;
const get = h.get;

console.log('宿主端端到端测试\n');

console.log('[1] 路由注册');
check('注册了 3 条路由', routes.size === 3, `实际 ${routes.size}: ${[...routes.keys()].join(', ')}`);
check('查词路由存在', routes.has('/word-hover/dict'));
check('自检路由存在', routes.has('/word-hover/test'));
check('已移除清缓存路由（不再有缓存可清）', !routes.has('/word-hover/cache'));

console.log('\n[2] 查词主链路');
const r1 = await get('/word-hover/dict?word=hello');
check('HTTP 200', r1.status === 200, String(r1.status));
check('返回音标', r1.body?.phonetic === '\u02c8test', JSON.stringify(r1.body?.phonetic));
check('返回中文释义', r1.body?.meanings?.[0]?.translation === '\u6d4b\u8bd5\u8bcd', JSON.stringify(r1.body?.meanings?.[0]));
check('source 为 youdao', r1.body?.source === 'youdao', String(r1.body?.source));
check('响应里没有 cached 字段', !('cached' in (r1.body || {})), JSON.stringify(Object.keys(r1.body || {})));
check('调用了上游接口', fetchCalls.length === 1, String(fetchCalls.length));

console.log('\n[3] ★ 不缓存：同一个词每次都要真实请求上游');
const callsBefore = fetchCalls.length;
const r2 = await get('/word-hover/dict?word=hello');
check('第二次请求仍然打到上游', fetchCalls.length === callsBefore + 1, `${fetchCalls.length} vs ${callsBefore}`);
check('第二次响应内容仍然正确', r2.body?.meanings?.[0]?.translation === '\u6d4b\u8bd5\u8bcd', JSON.stringify(r2.body?.meanings?.[0]));
const r2b = await get('/word-hover/dict?word=HELLO');
check('大小写不同也各自请求上游', fetchCalls.length === callsBefore + 2, String(fetchCalls.length));
check('响应头禁止 HTTP 缓存', String(r1.headers.get('cache-control') || '').includes('no-store'), String(r1.headers.get('cache-control')));

console.log('\n[3b] 单飞：并发同一词只打一次上游（去重不等于缓存）');
// ⚠️ 必须让 mock 慢下来，否则第一个请求会在后续请求发出之前就完成，
//    inflight 条目早已删除 —— 那样根本不存在并发窗口，测不到单飞。
stubDelayMs = 120;
const beforeBurst = fetchCalls.length;
const [c1, c2, c3] = await Promise.all([
  get('/word-hover/dict?word=concurrent'),
  get('/word-hover/dict?word=concurrent'),
  get('/word-hover/dict?word=concurrent'),
]);
stubDelayMs = 0;
check('三个并发响应都成功', [c1, c2, c3].every((r) => r.status === 200 && r.body?.meanings?.length > 0));
check('只调用一次上游', fetchCalls.length === beforeBurst + 1,
  `新增 ${fetchCalls.length - beforeBurst} 次: ${fetchCalls.slice(beforeBurst).join(' | ')}`);
const afterBurst = fetchCalls.length;
await get('/word-hover/dict?word=concurrent');
check('并发结束后再次请求会重新打上游（结果没被留下复用）', fetchCalls.length === afterBurst + 1, `新增 ${fetchCalls.length - afterBurst} 次`);

console.log('\n[4] 输入校验（安全要求：只发单个单词）');
for (const [label, word, expectStatus] of [
  ['整段句子被拒绝', encodeURIComponent('hello world this is a sentence'), 400],
  ['超长串被拒绝', 'a'.repeat(80), 400],
  ['纯数字被拒绝', '12345', 400],
  ['中文被拒绝', encodeURIComponent('\u4f60\u597d'), 400],
  ['注入尝试被拒绝', encodeURIComponent("'; DROP TABLE--"), 400],
  ['空值被拒绝', '', 400],
]) {
  const r = await get(`/word-hover/dict?word=${word}`);
  check(label, r.status === expectStatus, `状态 ${r.status}`);
  if (label === '整段句子被拒绝') {
    check('被拒绝时返回结构化错误', r.body?.error === '\u53ea\u652f\u6301\u5355\u4e2a\u82f1\u6587\u5355\u8bcd', JSON.stringify(r.body));
  }
}

console.log('\n[5] 限流（独立服务器，5 次/分钟）');
const rlHarness = await makeHarness({
  provider: 'youdao',
  fallbackProviders: ['suggest'],
  proxyRateLimitPerMinute: 5,
});
let sawRateLimit = false;
let rateLimitBody = null;
for (let i = 0; i < 12; i += 1) {
  const r = await rlHarness.get(`/word-hover/dict?word=rate${i}ab`);
  if (r.status === 429) { sawRateLimit = true; rateLimitBody = r.body; break; }
}
check('触发 429', sawRateLimit, '未触发限流');
check('429 带中文提示', /\u9891\u7e41/.test(rateLimitBody?.error || ''), JSON.stringify(rateLimitBody?.error));
check('429 带 retryAfterMs', typeof rateLimitBody?.retryAfterMs === 'number', String(rateLimitBody?.retryAfterMs));
await rlHarness.close();

console.log('\n[6] 设置回显');
const rs = await get('/word-hover/settings');
check('返回当前 provider', rs.body?.provider === 'youdao', JSON.stringify(rs.body?.provider));
check('返回可用 provider 列表', Array.isArray(rs.body?.providers) && rs.body.providers.includes('youdao'), JSON.stringify(rs.body?.providers));

console.log('\n[8] 降级链（主源挂掉 → suggest 兜底）');
// 注意：这里必须只让主源失败。早期版本用 network-error 让所有上游都抛错，
// 导致降级源也拿不到数据，误判成产品 bug —— 降级链本身是对的。
fetchBehaviour = 'primary-down';
const rd = await get('/word-hover/dict?word=freshword2');
check('降级后仍有释义', rd.body?.meanings?.length > 0, JSON.stringify(rd.body));
check('source 标为 suggest', rd.body?.source === 'youdao-suggest', String(rd.body?.source));
check('标记为降级结果', rd.body?.degraded === true, String(rd.body?.degraded));
check('记录了尝试过的 provider 链', Array.isArray(rd.body?.providerChain) && rd.body.providerChain.length >= 2, JSON.stringify(rd.body?.providerChain));

console.log('\n[9] 全链路失败时不抛异常');
fetchBehaviour = 'network-error';
const rf = await get('/word-hover/dict?word=failword2');
check('仍然返回 HTTP 200', rf.status === 200, String(rf.status));
check('返回错误态而非异常', typeof rf.body?.error === 'string' && rf.body.error.length > 0, JSON.stringify(rf.body));
check('meanings 为空数组', Array.isArray(rf.body?.meanings) && rf.body.meanings.length === 0, JSON.stringify(rf.body?.meanings));
check('宿主端记录了 warning', h.warnings.length > 0, `${h.warnings.length} 条`);

fetchBehaviour = 'ok';

console.log('\n[10] 限流器单元行为');
const rl = new RateLimiter(3);
check('前 3 次放行', rl.take('a', 0).ok && rl.take('a', 0).ok && rl.take('a', 0).ok);
check('第 4 次被拦', rl.take('a', 0).ok === false);
check('不同 IP 互不影响', rl.take('b', 0).ok === true);
check('等待后恢复', rl.take('a', 60000).ok === true);

console.log('\n[11] 卸载时释放路由（Cordis effect 回收）');
const before = routes.size;
while (h.disposers.length > 0) h.disposers.pop()();
check('路由全部移除', routes.size === 0, `剩余 ${routes.size}（之前 ${before}）`);
await h.close();

// ── 可选：真实联网自检 ────────────────────────────────────────────
if (process.argv.includes('--live')) {
  console.log('\n[12] 真实联网自检（不影响退出码）');
  globalThis.fetch = realFetch;
  for (const [label, provider] of [['youdao', youdao], ['suggest', suggest], ['freedict', freedict]]) {
    const started = Date.now();
    try {
      const info = await provider.lookupWord('hello', { timeoutMs: 8000 });
      const ok = Array.isArray(info?.meanings) && info.meanings.length > 0;
      console.log(`  ${ok ? '✓' : '✗'} ${label}: ${ok ? '可用' : (info?.error || '无释义')} (${Date.now() - started}ms)`
        + (ok ? ` 例：${(info.meanings[0].translation || info.meanings[0].definition || '').slice(0, 40)}` : ''));
    } catch (error) {
      console.log(`  ✗ ${label}: 抛出 ${error?.name}: ${error?.message} (${Date.now() - started}ms)`);
    }
  }
} else {
  globalThis.fetch = realFetch;
}

console.log(`\n结果：${checks - failures}/${checks} 通过`);
if (failures > 0) { console.log(`失败 ${failures} 项`); process.exitCode = 1; } else { console.log('全部通过 ✓'); }
