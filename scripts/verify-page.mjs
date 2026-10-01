#!/usr/bin/env node
/**
 * DSH 真实页面 DOM 探针（通过 Chrome DevTools Protocol）。
 *
 * 为什么需要它：lib/client.js 里的选择器来自对 DSH 包的一手分析，但没有在
 * 真实运行的页面上验证过。这个脚本连到正在运行的 DSH，直接检查选择器是否命中。
 *
 * 用法：
 *   1) 用调试端口启动 DSH（关闭后重新打开）：
 *        & "D:\DeepSeekHarness\DeepSeekHarness.exe" --remote-debugging-port=9222
 *      如果 DSH 已经在跑，需要先完全退出（关窗不等于退出）。
 *   2) 打开一个含有 AI 英文回复的会话。
 *   3) node scripts/verify-page.mjs
 *      或指定端口： node scripts/verify-page.mjs --port 9223
 *
 * 它只读取 DOM，不做任何修改，也不点击任何东西。
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const portArg = process.argv.indexOf('--port');
const PORT = portArg > -1 ? Number(process.argv[portArg + 1]) : 9222;

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) console.log(`  ✓ ${label}`);
  else { failures += 1; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

/** 用 CDP 的 HTTP 端点列出可调试的页面。 */
async function listTargets() {
  const response = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

/** 极简 WebSocket 客户端（Node 内置，无需依赖）。 */
function openSocket(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => reject(new Error('连接超时')), 8000);
    ws.addEventListener('open', () => { clearTimeout(timer); resolve(ws); }, { once: true });
    ws.addEventListener('error', (event) => { clearTimeout(timer); reject(new Error(`WebSocket 错误: ${event?.message || 'unknown'}`)); }, { once: true });
  });
}

/** 在页面里跑一段表达式并取回结果。 */
function evaluate(ws, expression) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e9);
    const onMessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (msg.id !== id) return;
      ws.removeEventListener('message', onMessage);
      if (msg.error) { reject(new Error(msg.error.message)); return; }
      const result = msg.result?.result;
      if (msg.result?.exceptionDetails) {
        reject(new Error(msg.result.exceptionDetails.exception?.description || '页面内抛出异常'));
        return;
      }
      resolve(result?.value);
    };
    ws.addEventListener('message', onMessage);
    ws.send(JSON.stringify({
      id,
      method: 'Runtime.evaluate',
      params: { expression, returnByValue: true, awaitPromise: true },
    }));
    setTimeout(() => { ws.removeEventListener('message', onMessage); reject(new Error('求值超时')); }, 15000);
  });
}

/** 在页面里执行的探针：只读，不改 DOM。 */
const PROBE = `(() => {
  const report = { url: location.href, ready: document.readyState, checks: {} };
  const q = (sel) => { try { return document.querySelectorAll(sel).length; } catch (e) { return -1; } };

  report.checks.region = q('[data-conversation-region="chat"]');
  report.checks.scroll = q('[data-conversation-scroll]');
  report.checks.assistantBlocks = q('[data-chat-flow-kind="assistant-step"]');
  report.checks.userBlocks = q('[data-chat-flow-kind="user"]');
  report.checks.slotWrappers = q('[data-slot="conversation.chat.node"]');
  report.checks.codeBlocks = q('.md-code-block');
  report.checks.tables = q('.md-table-wide');
  report.checks.streaming = q('[data-streaming]');
  report.checks.root = q('#root') + q('#app') + q('[data-dsh-boot]');

  // 采样一个助手回复块，统计可处理的正文元素
  const block = document.querySelector('[data-chat-flow-kind="assistant-step"]');
  if (block) {
    report.blockSample = {
      tag: block.tagName,
      textLength: (block.textContent || '').length,
      paragraphs: block.querySelectorAll('p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th').length,
      hasStreaming: block.hasAttribute('data-streaming'),
    };
    // 找第一个英文单词并测一次 Range 定位（不修改 DOM）
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null);
    let node = walker.nextNode();
    let found = null;
    while (node && !found) {
      const m = /[A-Za-z]{4,}/.exec(node.nodeValue || '');
      if (m) {
        const range = document.createRange();
        range.setStart(node, m.index);
        range.setEnd(node, m.index + m[0].length);
        const rects = range.getClientRects();
        found = { word: m[0], rectCount: rects.length, width: rects[0]?.width ?? 0, height: rects[0]?.height ?? 0 };
      }
      node = walker.nextNode();
    }
    report.rangeProbe = found;
  }

  // 我们的插件容器（如果插件已经启用）
  const host = document.getElementById('dsh-word-hover-root');
  report.plugin = {
    mounted: Boolean(host),
    hasShadow: Boolean(host && host.shadowRoot),
    pointerEvents: host ? getComputedStyle(host).pointerEvents : null,
  };
  report.pluginApi = typeof globalThis.__DSH_WORD_HOVER__ === 'object' && globalThis.__DSH_WORD_HOVER__ !== null;

  // 关键主题 token 是否存在
  const style = getComputedStyle(document.documentElement);
  report.tokens = ['--dsw-alias-label-primary', '--dsw-alias-border-l2', '--dsw-specific-menu', '--dsh-chat-content-width']
    .map((name) => ({ name, value: style.getPropertyValue(name).trim().slice(0, 40) }));

  return report;
})()`;

console.log(`DSH 页面 DOM 探针（CDP 端口 ${PORT}）\n`);

let targets;
try {
  targets = await listTargets();
} catch (error) {
  console.error(`✗ 连不上 CDP（http://127.0.0.1:${PORT}/json/list）：${error.message}\n`);
  console.error('请先用调试端口启动 DSH：');
  console.error('  & "D:\\DeepSeekHarness\\DeepSeekHarness.exe" --remote-debugging-port=9222\n');
  console.error('如果 DSH 已在运行，需要先完全退出（关闭窗口不等于退出进程）。');
  process.exitCode = 2;
  process.exit();
}

const pages = targets.filter((t) => t.type === 'page' && /^https?:|^file:/.test(t.url || ''));
console.log(`发现 ${targets.length} 个目标，其中页面 ${pages.length} 个：`);
for (const p of pages) console.log(`  · ${p.title || '(无标题)'} — ${p.url}`);
if (pages.length === 0) {
  console.error('\n✗ 没有可调试的页面目标。');
  process.exitCode = 2;
  process.exit();
}

// 优先选 DSH 的界面页（含 19387 端口或标题里带 DSH）
const page = pages.find((p) => /19387|dsh/i.test(`${p.url} ${p.title}`)) || pages[0];
console.log(`\n使用目标：${page.title || page.url}\n`);

const ws = await openSocket(page.webSocketDebuggerUrl);
const report = await evaluate(ws, PROBE);
ws.close();

console.log('[页面信息]');
console.log(`  URL: ${report.url}`);
console.log(`  readyState: ${report.ready}\n`);

console.log('[选择器命中]');
check('会话区 [data-conversation-region="chat"]', report.checks.region > 0, `命中 ${report.checks.region}`);
check('滚动容器 [data-conversation-scroll]', report.checks.scroll > 0, `命中 ${report.checks.scroll}`);
check('助手回复块 [data-chat-flow-kind="assistant-step"]', report.checks.assistantBlocks > 0, `命中 ${report.checks.assistantBlocks}`);
check('用户消息块（应存在但插件不处理）', report.checks.userBlocks >= 0, `命中 ${report.checks.userBlocks}`);
check('插槽包装 [data-slot="conversation.chat.node"]', report.checks.slotWrappers > 0, `命中 ${report.checks.slotWrappers}`);
check('代码块 .md-code-block（应被跳过）', report.checks.codeBlocks >= 0, `命中 ${report.checks.codeBlocks}`);

console.log('\n[正文采样]');
if (report.blockSample) {
  console.log(`  块文本长度: ${report.blockSample.textLength}`);
  console.log(`  可处理段落数: ${report.blockSample.paragraphs}`);
  console.log(`  正在流式: ${report.blockSample.hasStreaming}`);
  if (report.rangeProbe) {
    check('Range.getClientRects 能测到单词矩形', report.rangeProbe.rectCount > 0 && report.rangeProbe.width > 0,
      JSON.stringify(report.rangeProbe));
    console.log(`  采样单词: "${report.rangeProbe.word}" 宽 ${report.rangeProbe.width.toFixed(1)}px 高 ${report.rangeProbe.height.toFixed(1)}px`);
  } else {
    check('能在回复里找到英文单词', false, '未找到 4 字母以上的英文词');
  }
} else {
  check('存在助手回复块', false, '当前会话里没有 AI 回复，请先让 AI 回答一段英文');
}

console.log('\n[插件挂载状态]');
console.log(`  容器已挂载: ${report.plugin.mounted}`);
console.log(`  Shadow DOM: ${report.plugin.hasShadow}`);
console.log(`  容器 pointer-events: ${report.plugin.pointerEvents}（应为 none）`);
console.log(`  全局 API: ${report.pluginApi}`);
if (!report.plugin.mounted) {
  console.log('  ⚠️ 插件未挂载。若你刚安装完 bundle，请完全退出 DSH 再重新打开。');
}

console.log('\n[主题 token]');
for (const token of report.tokens) {
  console.log(`  ${token.value ? '✓' : '✗'} ${token.name} = ${token.value || '(空)'}`);
}
const missingTokens = report.tokens.filter((t) => !t.value).length;
if (missingTokens > 0) console.log(`  ⚠️ ${missingTokens} 个 token 为空，浮层会使用兜底颜色（不影响功能）。`);

console.log('');
if (failures > 0) {
  console.log(`探针发现 ${failures} 个问题。`);
  console.log('如果助手回复块选择器没命中，说明 DSH 版本变了：');
  console.log('  请在开发者控制台执行下面这行，把结果告诉我，我改 src/client/dom.js 顶部的常量：');
  console.log('  [...document.querySelectorAll("[data-chat-flow-kind]")].map(e => e.getAttribute("data-chat-flow-kind"))');
  process.exitCode = 1;
} else {
  console.log('页面探针全部通过 ✓ 选择器与真实页面一致。');
}
