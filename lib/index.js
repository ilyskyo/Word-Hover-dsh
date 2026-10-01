/**
 * 宿主端插件：为客户端提供同源查词代理。
 *
 * 它解决四件事（对应需求「安全与合规」）：
 *   1. 隐藏实现细节：客户端只请求 /word-hover/*，不直连第三方；
 *   2. 输入校验：只接受单个英文单词，拒绝句子、超长串、非法字符；
 *   3. 限流 + 在途合并：把第三方调用量压到最低；
 *   4. 合规：非官方接口仅作降级，并在响应里带上风险标识。
 *
 * 上游响应不会被保留：查词结果直接回给本次请求，随即丢弃。
 * 唯一保留的是「在途合并」—— 同一瞬间对同一个词的重复请求折叠成一次外部调用，
 * 请求结束立刻从表里删除。
 *
 * 暴露的路由（都在 ctx.webServer 上注册，随插件卸载自动释放）：
 *   GET  {lookupPath}?word=hello&lang=zh-CN&provider=youdao&fallback=suggest,freedict
 *   GET  {settingsPath}                   读取当前配置（设置面板回显用）
 *   GET  {testPath}                       连通性自检（带 CORS 头，便于排查）
 */

import * as youdaoProvider from './providers/youdao.js';
import * as suggestProvider from './providers/suggest.js';
import * as freedictProvider from './providers/freedict.js';

export const name = 'dshWordHover';
export const inject = ['webServer'];

/** 默认配置（与 cordis.patch.yml 保持一致）。 */
const DEFAULTS = Object.freeze({
  enabled: true,
  targetLang: 'zh-CN',
  provider: 'youdao',
  fallbackProviders: ['suggest', 'freedict'],
  timeoutMs: 8000,
  lookupPath: '/word-hover/dict',
  settingsPath: '/word-hover/settings',
  testPath: '/word-hover/test',
  proxyRateLimitPerMinute: 120,
  customEndpoint: '',
  allowedOrigins: [],
  debug: false,
});

const PROVIDERS = new Map([
  [youdaoProvider.id, youdaoProvider],
  [suggestProvider.id, suggestProvider],
  [freedictProvider.id, freedictProvider],
]);

/**
 * 合法的单词：以字母开头，允许内部数字、撇号、连字符，长度 1–64。
 * 与客户端 src/client/word.js 的规则保持一致（两端都做同一套校验）。
 * 允许数字是为了支持 utf8 / gpt4 / sha256 这类技术词；首字符必须是字母，
 * 这样 12345 这类纯数字串仍然会被拒绝。
 */
const WORD_RE = /^[A-Za-z\u00C0-\u024F][A-Za-z0-9\u00C0-\u024F'\u2019-]{0,63}$/;

/** 简易令牌桶：按来源 IP 限流。 */
export class RateLimiter {
  constructor(perMinute = 120) {
    this.perMinute = Math.max(1, perMinute | 0);
    this.buckets = new Map();
    this.maxKeys = 4096;
  }

  /** @returns {{ok:boolean, retryAfterMs?:number}} */
  take(key, now = Date.now()) {
    const capacity = this.perMinute;
    const refillPerMs = capacity / 60000;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= this.maxKeys) {
        // 简单的淘汰：清掉最久没更新的那一批
        const oldest = [...this.buckets.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, this.maxKeys >> 1);
        for (const [k] of oldest) this.buckets.delete(k);
      }
      bucket = { tokens: capacity, at: now };
      this.buckets.set(key, bucket);
    }
    bucket.tokens = Math.min(capacity, bucket.tokens + (now - bucket.at) * refillPerMs);
    bucket.at = now;
    if (bucket.tokens < 1) {
      return { ok: false, retryAfterMs: Math.ceil((1 - bucket.tokens) / refillPerMs) };
    }
    bucket.tokens -= 1;
    return { ok: true };
  }
}

/** 取一个用于限流的来源标识。 */
function clientKey(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function sendJson(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    ...extraHeaders,
  });
  res.end(payload);
}

export function apply(ctx, rawConfig) {
  const config = { ...DEFAULTS, ...(rawConfig && typeof rawConfig === 'object' ? rawConfig : {}) };
  const limiter = new RateLimiter(config.proxyRateLimitPerMinute);
  /**
   * 同一瞬间对同一个词的重复请求合并成一次上游调用。
   * task 在 finally 里立刻从表里删除，上游响应不会被保留下来供后续请求复用。
   */
  const inflight = new Map();

  /** 校验并归一化查询词。 */
  function parseWord(value) {
    if (typeof value !== 'string') return null;
    const word = value.trim().toLowerCase();
    if (word.length === 0 || word.length > 64) return null;
    if (!WORD_RE.test(word)) return null;
    return word;
  }

  function providerOrder(primary, fallbackParam) {
    const fallbacks = typeof fallbackParam === 'string' && fallbackParam.length > 0
      ? fallbackParam.split(',').map((s) => s.trim()).filter(Boolean)
      : (Array.isArray(config.fallbackProviders) ? config.fallbackProviders : []);
    const ids = [primary, ...fallbacks]
      .filter((id) => typeof id === 'string' && id !== 'auto' && id !== 'custom' && PROVIDERS.has(id));
    return [...new Set(ids)];
  }

  /** 依次尝试 provider，返回第一个有释义的结果；全失败返回错误态。 */
  async function resolveWord(word, providerId, fallbackParam, signal) {
    const chain = providerOrder(providerId, fallbackParam);
    if (chain.length === 0) chain.push('youdao');

    let lastError = '暂无释义';
    const tried = [];
    for (const id of chain) {
      const provider = PROVIDERS.get(id);
      if (!provider) continue;
      tried.push(id);
      try {
        const info = await provider.lookupWord(word, { timeoutMs: config.timeoutMs, signal });
        const hasMeanings = Array.isArray(info?.meanings) && info.meanings.length > 0;
        if (hasMeanings) {
          return {
            ...info,
            word,
            source: info.source || id,
            degraded: tried.length > 1,
            providerChain: tried,
          };
        }
        lastError = info?.error || lastError;
        // 降级是可观测的：每次降级都记一条 warning（与 debug 无关，便于排错）
        ctx.logger?.warn?.(`[word-hover] provider ${id} 未返回释义：${lastError}`);
      } catch (error) {
        lastError = error?.name === 'AbortError' ? '查询超时' : '网络错误';
        ctx.logger?.warn?.(`[word-hover] provider ${id} 失败：${error?.message || error}`);
      }
    }
    return {
      word,
      phonetic: '',
      meanings: [],
      source: tried[0] || 'error',
            error: lastError || '暂无释义',
      providerChain: tried,
    };
  }

  // ── 查词路由 ───────────────────────────────────────────────────
  function handleLookup(req, res) {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      sendJson(res, 400, { word: '', meanings: [], source: 'error', error: '请求地址非法' });
      return;
    }

    const word = parseWord(url.searchParams.get('word'));
    if (!word) {
      // 输入校验：只接受单个英文单词（拒绝整段对话、注入、超长串）
      sendJson(res, 400, { word: '', phonetic: '', meanings: [], source: 'error', error: '只支持单个英文单词' });
      return;
    }

    const limit = limiter.take(clientKey(req));
    if (!limit.ok) {
      sendJson(res, 429, {
        word, phonetic: '', meanings: [], source: 'error', error: '请求过于频繁，请稍后再试',
        retryAfterMs: limit.retryAfterMs,
      }, { 'retry-after': String(Math.ceil((limit.retryAfterMs || 1000) / 1000)) });
      return;
    }

    const providerId = url.searchParams.get('provider') || config.provider;
    const fallback = url.searchParams.get('fallback');
    // 只用作"在途请求"的键，请求结束即删除；不保存任何上游响应
    const inflightKey = `${word}|${providerId}|${config.targetLang}`;

    // 单飞：同一瞬间对同一个词的并发请求合并成一次外部调用
    let task = inflight.get(inflightKey);
    if (!task) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error('timeout')), config.timeoutMs + 2000);
      task = resolveWord(word, providerId, fallback, controller.signal)
        .finally(() => {
          clearTimeout(timer);
          inflight.delete(inflightKey);
        });
      inflight.set(inflightKey, task);
    }

    task.then((info) => {
      // 响应直接返回给本次请求，不写入任何容器
      sendJson(res, 200, { ...info });
    }).catch((error) => {
      if (config.debug) ctx.logger?.warn?.(`[word-hover] 查询失败: ${error?.message || error}`);
      sendJson(res, 200, {
        word, phonetic: '', meanings: [], source: 'error',         error: error?.name === 'AbortError' ? '查询超时' : '网络错误',
      });
    });
  }

  // ── 设置回显路由 ───────────────────────────────────────────────
  function handleSettings(req, res) {
    sendJson(res, 200, {
      enabled: config.enabled,
      provider: config.provider,
      fallbackProviders: config.fallbackProviders,
      timeoutMs: config.timeoutMs,
      targetLang: config.targetLang,
      proxyRateLimitPerMinute: config.proxyRateLimitPerMinute,
      /** 明确声明：宿主端不保留任何查词结果 */
      caching: false,
      providers: [...PROVIDERS.keys()],
    });
  }

  // ── 连通性自检路由（带 CORS，方便从任意页面排查） ─────────────────
  async function handleTest(req, res) {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { url = new URL('http://localhost/'); }
    const word = parseWord(url.searchParams.get('word')) || 'hello';
    const started = Date.now();
    const results = [];
    for (const [id, provider] of PROVIDERS) {
      const t0 = Date.now();
      try {
        const info = await provider.lookupWord(word, { timeoutMs: Math.min(config.timeoutMs, 5000) });
        results.push({
          provider: id,
          ok: Array.isArray(info?.meanings) && info.meanings.length > 0,
          ms: Date.now() - t0,
          error: info?.error || '',
          sample: info?.meanings?.[0] || null,
        });
      } catch (error) {
        results.push({ provider: id, ok: false, ms: Date.now() - t0, error: String(error?.message || error) });
      }
    }
    sendJson(res, 200, {
      ok: results.some((r) => r.ok),
      word,
      elapsedMs: Date.now() - started,
      results,
    }, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
    });
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: config.lookupPath,
    handler: handleLookup,
  }), `word-hover: ${config.lookupPath}`);

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: config.settingsPath,
    handler: handleSettings,
  }), `word-hover: ${config.settingsPath}`);

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: config.testPath,
    handler: (req, res) => { void handleTest(req, res); },
  }), `word-hover: ${config.testPath}`);

  if (config.debug) {
    ctx.logger?.info?.(`[word-hover] 已启用：${config.lookupPath}（provider=${config.provider}）`);
  }
}
