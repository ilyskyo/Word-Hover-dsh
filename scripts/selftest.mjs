#!/usr/bin/env node
/**
 * 无浏览器的加载自测：
 *   1. 造一个最小的 window/document/HTMLElement 环境；
 *   2. 加载 lib/client.js，确认它通过 __ModuleLoader__.load 注册；
 *   3. 调用 factory()，确认返回 { inject, apply }；
 *   4. 执行 apply(ctx)，确认容器挂载、监听器注册、开关能关掉且不留残留。
 *
 * 这不能替代浏览器里的真实交互测试，但能拦住「语法/引用/时序」这三类
 * 最容易在打包后才暴露的错误。
 *
 * 用法： node scripts/selftest.mjs
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

let failures = 0;
let checks = 0;

function check(label, condition, detail = '') {
  checks += 1;
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

// ── 极简 DOM 桩 ───────────────────────────────────────────────────
class StubClassList {
  constructor() { this.set = new Set(); }
  add(...c) { c.forEach((x) => this.set.add(x)); }
  remove(...c) { c.forEach((x) => this.set.delete(x)); }
  contains(c) { return this.set.has(c); }
}

class StubStyle {
  constructor() { this.props = {}; }
  setProperty(k, v) { this.props[k] = v; }
  getPropertyValue(k) { return this.props[k] ?? ''; }
}

class StubElement {
  constructor(tag, doc) {
    this.tagName = String(tag).toUpperCase();
    this.ownerDocument = doc;
    this.children = [];
    this.childNodes = this.children;
    this.parentElement = null;
    this.style = Object.assign(new StubStyle(), {});
    this.classList = new StubClassList();
    this.dataset = {};
    this.attributes = {};
    this.listeners = new Map();
    this.isConnected = false;
    this.textContent = '';
    this.shadowRoot = null;
  }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k] ?? null; }
  removeAttribute(k) { delete this.attributes[k]; }
  hasAttribute(k) { return k in this.attributes; }
  set cssText(v) { this._cssText = v; }
  get cssText() { return this._cssText || ''; }
  append(...nodes) {
    for (const node of nodes) {
      if (node && node.__fragment) { this.append(...node.children); continue; }
      node.parentElement = this;
      node.isConnected = true;
      this.children.push(node);
    }
  }
  appendChild(node) { this.append(node); return node; }
  insertBefore(node, ref) {
    const index = ref ? this.children.indexOf(ref) : -1;
    node.parentElement = this;
    node.isConnected = true;
    if (index >= 0) this.children.splice(index, 0, node);
    else this.children.push(node);
    return node;
  }
  prepend(...nodes) { this.children.unshift(...nodes); }
  replaceChildren(...nodes) {
    this.children.length = 0;
    if (nodes.length) this.append(...nodes);
  }
  remove() {
    if (!this.parentElement) return;
    const list = this.parentElement.children;
    const index = list.indexOf(this);
    if (index >= 0) list.splice(index, 1);
    this.parentElement = null;
    this.isConnected = false;
  }
  contains(node) {
    if (node === this) return true;
    return this.children.some((child) => child.contains?.(node));
  }
  attachShadow() { this.shadowRoot = new StubElement('#shadow-root', this.ownerDocument); return this.shadowRoot; }
  cloneNode() {
    const copy = new StubElement(this.tagName, this.ownerDocument);
    copy.className = this.className;
    copy.dataset = { ...this.dataset };
    copy.attributes = { ...this.attributes };
    return copy;
  }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }
  removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  matches() { return false; }
  closest() { return null; }
  getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  focus() { this.focused = true; }
}

class StubDocument {
  constructor() {
    this.documentElement = new StubElement('html', this);
    this.body = new StubElement('body', this);
    this.documentElement.append(this.body);
    this.defaultView = null;
    this.listeners = new Map();
    this.caretRangeFromPoint = null;
  }
  createElement(tag) { return new StubElement(tag, this); }
  createElementNS(_ns, tag) { return new StubElement(tag, this); }
  createDocumentFragment() {
    const frag = new StubElement('#fragment', this);
    frag.__fragment = true;
    return frag;
  }
  createRange() {
    return {
      startContainer: null, startOffset: 0, endContainer: null, endOffset: 0,
      setStart(node, offset) { this.startContainer = node; this.startOffset = offset; },
      setEnd(node, offset) { this.endContainer = node; this.endOffset = offset; },
      getClientRects() { return []; },
      collapsed: true,
    };
  }
  createTreeWalker() { return { nextNode: () => null }; }
  querySelector(selector) { return this.__query?.[selector] ?? null; }
  getElementById() { return null; }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }
  removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }
}

/** 造一个可用的运行环境并加载 bundle。 */
async function loadBundle() {
  const doc = new StubDocument();
  const win = {
    innerWidth: 1280,
    innerHeight: 800,
    listeners: new Map(),
    addEventListener(type, handler) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); },
    requestAnimationFrame: (fn) => { setTimeout(fn, 0); return 1; },
    cancelAnimationFrame: () => {},
    localStorage: {
      store: new Map(),
      getItem(k) { return this.store.has(k) ? this.store.get(k) : null; },
      setItem(k, v) { this.store.set(k, String(v)); },
      removeItem(k) { this.store.delete(k); },
      key(i) { return [...this.store.keys()][i] ?? null; },
      get length() { return this.store.size; },
    },
    // debug() 会读计算样式与几何信息，桩环境给出可用但无意义的值
    getComputedStyle: () => ({
      getPropertyValue: () => '',
      pointerEvents: 'none',
      zIndex: '2147483000',
      display: 'none',
    }),
    setTimeout: (...args) => setTimeout(...args),
    clearTimeout: (...args) => clearTimeout(...args),
  };
  win.document = doc;
  doc.defaultView = win;

  const sandbox = {
    window: win,
    document: doc,
    console,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    AbortController,
    AbortSignal,
    Error,
    TypeError,
    Promise,
    Map,
    Set,
    WeakMap,
    Date,
    Math,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Symbol,
    URL,
    Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
    NodeFilter: { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2 },
    Element: StubElement,
    fetch: async () => { throw new Error('offline'); },
    localStorage: win.localStorage,
    indexedDB: undefined,
    location: { origin: 'http://127.0.0.1:19387' },
    Audio: class { play() { return Promise.resolve(); } pause() {} },
    speechSynthesis: {
      cancel() {}, speak() {}, getVoices: () => [], addEventListener() {},
    },
    SpeechSynthesisUtterance: class { constructor(t) { this.text = t; } },
    HTMLElement: StubElement,
    getComputedStyle: win.getComputedStyle,
    requestAnimationFrame: win.requestAnimationFrame,
    cancelAnimationFrame: win.cancelAnimationFrame,
    performance,
  };
  // 注意：不要在这里手动设置 globalThis。
  // vm.createContext(sandbox) 之后，sandbox 本身就是被 contextify 的全局对象代理，
  // 手动加一个 globalThis 属性会遮蔽真正的全局对象，导致 bundle 里的
  // globalThis.xxx = ... 写在错误的地方（这个坑已经踩过一次）。
  win.__DSH_WORD_HOVER_CONFIG__ = {};

  const code = await readFile(join(ROOT, 'lib', 'client.js'), 'utf8');
  const context = vm.createContext(sandbox);

  const registrations = [];
  sandbox.window.__ModuleLoader__ = {
    load(entry) { registrations.push(entry); },
  };

  vm.runInContext(code, context, { filename: 'lib/client.js' });
  return { sandbox, doc, win, registrations, context };
}

/** 造一个假的 ctx.slots，记录注册行为。 */
function makeSlots() {
  const calls = { inject: [], register: [] };
  return {
    calls,
    inject(key, cb) {
      calls.inject.push(key);
      cb();
      return () => { calls.inject.push(`dispose:${key}`); };
    },
    register(options) {
      calls.register.push(options);
      return () => {};
    },
  };
}

console.log('DSH 悬停词典 — 客户端 bundle 自测\n');

console.log('[1] bundle 注册与 factory');
const { sandbox, doc, registrations, win } = await loadBundle();
check('__ModuleLoader__.load 被调用', registrations.length === 1, `实际 ${registrations.length} 次`);
check('id 等于包名', registrations[0]?.id === 'dsh-plugin-word-hover', String(registrations[0]?.id));
check('factory 是函数', typeof registrations[0]?.factory === 'function');

const plugin = registrations[0].factory();
check('返回对象含 inject', Array.isArray(plugin?.inject), JSON.stringify(plugin?.inject));
check('inject 包含 slots', plugin?.inject?.includes('slots'));
check('返回对象含 apply', typeof plugin?.apply === 'function');

console.log('\n[4] 关键纯函数行为（与运行时状态无关）');
const api = sandbox.__DSH_WORD_HOVER_API__?.api;
check('扁平 API 暴露', Boolean(api) && typeof api.wordAtOffset === 'function');
if (api) {
  check('wordAtOffset 命中单词', api.wordAtOffset('a quick brown fox', 4)?.raw === 'quick', JSON.stringify(api.wordAtOffset('a quick brown fox', 4)));
  check('wordAtOffset 越界返回 null', api.wordAtOffset('hi', 99) === null, String(api.wordAtOffset('hi', 99)));
  check('wordAtOffset 命中行首单词', api.wordAtOffset('hello world', 0)?.raw === 'hello');
  check('wordAtOffset 命中连字符词', api.wordAtOffset('a well-known fact', 4)?.raw === 'well-known', JSON.stringify(api.wordAtOffset('a well-known fact', 4)));
  check('isLookupCandidate 拒绝纯数字', api.isLookupCandidate('123') === false);
  check('isLookupCandidate 接受英文词', api.isLookupCandidate('hello') === true);
  check('isLookupCandidate 拒绝中文', api.isLookupCandidate('你好') === false);
  check('isLookupCandidate 拒绝单字符', api.isLookupCandidate('a') === false);
  check('stripTags 清掉 <b>', api.stripTags('say <b>Hello</b> now') === 'say Hello now', api.stripTags('say <b>Hello</b> now'));
  check('stripTags 清掉中文标记', api.stripTags('<非正式>喂') === '喂', api.stripTags('<非正式>喂'));
  check('translatePos 映射 int. → 感叹词', api.translatePos('int.') === '感叹词', api.translatePos('int.'));
  check('translatePos 映射多词性', api.translatePos('n./v.') === '名词/动词', api.translatePos('n./v.'));
  check('translatePos 映射 n-count', api.translatePos('N-COUNT') === '可数名词', api.translatePos('N-COUNT'));
  // 回归：确认插件**没有**缓存层（主源条款禁止缓存返回数据）
  check('已不存在 WordCache（缓存层整体移除）', typeof api.WordCache === 'undefined', String(typeof api.WordCache));
  check('已不存在 cacheKey', typeof api.cacheKey === 'undefined', String(typeof api.cacheKey));
  check('改为 SessionMemo（只做去重与失败抑制）', typeof api.SessionMemo === 'function', String(typeof api.SessionMemo));

  // SessionMemo 行为：只记"查不到"这一事实，不保存任何释义内容
  const memo = new api.SessionMemo({ negativeTtlMs: 1000 });
  check('初始不认为已知 miss', memo.isKnownMiss('ghost') === false);
  memo.markMiss('ghost');
  check('标记后认为已知 miss', memo.isKnownMiss('ghost') === true);
  const memoTtl0 = new api.SessionMemo({ negativeTtlMs: 0 });
  memoTtl0.markMiss('ghost');
  check('TTL=0 时完全不记录', memoTtl0.isKnownMiss('ghost') === false);
  const memoExpired = new api.SessionMemo({ negativeTtlMs: 1 });
  memoExpired.markMiss('ghost');
  await new Promise((r) => setTimeout(r, 20));
  check('超过 TTL 后重新允许查询', memoExpired.isKnownMiss('ghost') === false);
  check('SessionMemo 只存时间戳（不含释义）', (() => {
    memo.markMiss('x');
    const v = memo.negatives.get('x');
    return typeof v === 'number';
  })());
  check('buildConfig 夹取非法延迟', api.buildConfig({ hoverDelayMs: 99999 }, null).hoverDelayMs === 2000, String(api.buildConfig({ hoverDelayMs: 99999 }, null).hoverDelayMs));
  check('buildConfig 默认 provider', api.buildConfig({}, null).provider === 'youdao');
  check('buildConfig 忽略非法的 trigger', api.buildConfig({ trigger: 'evil' }, null).trigger === 'hover');
}

console.log('\n[7] 精确命中测试（回归：鼠标在词与词之间不能命中）');
if (api?.pointHitsRects) {
  // 一个 60x20 的单词矩形：垂直收缩 14% / 6% → 有效区间 y ∈ [top+2.8, bottom-1.2]
  const wordRect = { left: 100, top: 200, right: 160, bottom: 220, width: 60, height: 20 };
  const rects = [wordRect];

  check('落在单词正中间 → 命中', api.pointHitsRects(130, 210, rects) === true);
  check('落在单词左边界上 → 命中', api.pointHitsRects(100, 210, rects) === true);
  check('落在单词右边界上 → 命中', api.pointHitsRects(160, 210, rects) === true);
  check('胶囊上边缘附近 → 命中（与高亮外观一致）', api.pointHitsRects(130, 203, rects) === true);
  check('胶囊下边缘附近 → 命中（与高亮外观一致）', api.pointHitsRects(130, 218, rects) === true);
  check('在单词左侧的间隙里 → 不命中', api.pointHitsRects(95, 210, rects) === false);
  check('在单词右侧的间隙里 → 不命中', api.pointHitsRects(165, 210, rects) === false);
  check('在行距上方 → 不命中', api.pointHitsRects(130, 199, rects) === false);
  check('在行距下方 → 不命中', api.pointHitsRects(130, 221, rects) === false);
  check('空矩形数组 → 不命中', api.pointHitsRects(130, 210, []) === false);
  check('零尺寸矩形 → 不命中', api.pointHitsRects(130, 210, [{ left: 100, top: 200, right: 100, bottom: 200, width: 0, height: 0 }]) === false);

  // 跨行单词：两段矩形，任一段命中即可
  const twoLine = [
    { left: 100, top: 200, right: 400, bottom: 220, width: 300, height: 20 },
    { left: 100, top: 224, right: 180, bottom: 244, width: 80, height: 20 },
  ];
  check('跨行单词：第二段命中 → 命中', api.pointHitsRects(140, 234, twoLine) === true);
  check('跨行单词：两段之间 → 不命中', api.pointHitsRects(140, 222, twoLine) === false);
  console.log(`  （垂直收缩比例：上 ${api.HIT_INSET_TOP} / 下 ${api.HIT_INSET_BOTTOM}）`);
} else {
  check('pointHitsRects 已导出', false, '扁平 API 里找不到');
}

console.log('\n[5] 浮层定位（computePosition 纯函数）');
if (api?.computePosition) {
  const VW = 1280;
  const VH = 800;
  const anchor = (left, top, width = 60, height = 18) => ({
    left, top, right: left + width, bottom: top + height, width, height,
  });
  const base = { tipWidth: 320, tipHeight: 180, viewportWidth: VW, viewportHeight: VH, headerClearance: 48 };

  const below = api.computePosition({ ...base, anchor: anchor(400, 300) });
  check('空间充足时显示在下方', below.placement === 'below', below.placement);
  check('下方定位紧贴单词下缘 + 间距', below.top === 300 + 18 + 6, String(below.top));

  const flip = api.computePosition({ ...base, anchor: anchor(400, 700) });
  check('底部空间不足时翻到上方', flip.placement === 'above', flip.placement);
  check('上方定位紧贴单词上缘之上', flip.top === 700 - 180 - 6, String(flip.top));

  const leftEdge = api.computePosition({ ...base, anchor: anchor(4, 300) });
  check('左边缘不越界（≥8px）', leftEdge.left === 8, String(leftEdge.left));

  const rightEdge = api.computePosition({ ...base, anchor: anchor(VW - 10, 300) });
  check('右边缘不越界（≤vw-8-w）', rightEdge.left === VW - 8 - 320, String(rightEdge.left));

  const huge = api.computePosition({ ...base, tipHeight: 2000, anchor: anchor(400, 700) });
  check('浮层比视口还高时仍夹在视口内', huge.top >= 8 && huge.top <= VH - 8, String(huge.top));

  const topClamp = api.computePosition({ ...base, anchor: anchor(400, 50) });
  check('顶部不超过标题栏避让线', topClamp.top >= Math.min(48, VH - 180 - 8), String(topClamp.top));

  const centered = api.computePosition({ ...base, anchor: anchor(600, 300) });
  check('水平以单词中心对齐', Math.abs(centered.left - (600 + 30 - 160)) <= 1, String(centered.left));

  // 回归：浮层绝不能溢出视口。
  // 用户遇到的问题是「滚到底还是有一部分在任务栏下方」——根因是调用方在测量后把
  // maxHeight 清空，实际渲染高度大于参与定位的高度，底边就溢出到视口外。
  // 这里按真实调用方式穷举锚点位置 × 词条长度，保证底边始终留出 8px 安全线。
  const MIN_READABLE = 150;
  const anchors = [
    anchor(400, 60), anchor(400, 300), anchor(400, 700), anchor(400, VH - 20),
    anchor(4, VH - 20), anchor(VW - 10, VH - 20), anchor(400, 0),
  ];
  const tipSizes = [[320, 180], [320, 520], [320, 900], [200, 40], [320, 797]];
  let overflow = 0;
  let overflowDetail = '';
  for (const a of anchors) {
    for (const [w, h] of tipSizes) {
      // 模拟真实调用：调用方会先把高度收进可用空间，再交给 computePosition
      const usable = Math.max(MIN_READABLE, Math.max(VH - a.bottom - 6 - 8, a.top - 48 - 6));
      const maxHeight = Math.min(usable, VH - 16);
      const pos = api.computePosition({
        ...base, tipWidth: w, tipHeight: h, anchor: a, maxHeight, minTop: 8,
      });
      // 用返回的 height 判定，因为调用方会把它写进 maxHeight
      const rendered = pos.height ?? h;
      const bottomEdge = pos.top + rendered;
      const rightEdge = pos.left + w;
      if (bottomEdge > VH - 8 + 0.5 || pos.top < -0.5 || rightEdge > VW - 8 + 0.5 || pos.left < -0.5) {
        overflow += 1;
        overflowDetail = `anchor(${a.left},${a.top}) tip(${w}x${h}) maxH=${Math.round(maxHeight)} → top=${pos.top} bottom=${bottomEdge} left=${pos.left} right=${rightEdge}`;
      }
    }
  }
  check('任意锚点 × 任意词条长度都完整落在视口内', overflow === 0, overflowDetail);
} else {
  check('computePosition 已导出', false, '扁平 API 里找不到');
}

console.log('\n[6] 覆盖层不变量（回归：浮层不能占住页面命中区域）');
if (api?.Overlay) {
  // 直接构造一个覆盖层，检查它的可见态开关时序
  const rect = { left: 100, top: 200, width: 60, height: 18, right: 160, bottom: 218 };
  const hostEl = doc.createElement('div');
  hostEl.ownerDocument = doc;
  doc.body.append(hostEl);
  const ov = new api.Overlay(hostEl);

  check('初始不可见', ov.isTipVisible() === false, String(ov.isTipVisible()));
  check('初始 data-visible 不为 true', ov.tip.dataset.visible !== 'true', String(ov.tip.dataset.visible));

  ov.showLoading('hello');
  check('showLoading 后仍未标记可见（避免测量前就占据命中区）', ov.tip.dataset.visible !== 'true', String(ov.tip.dataset.visible));

  ov.position(rect);
  check('position 后进入可见态', ov.tip.dataset.visible === 'true', String(ov.tip.dataset.visible));
  check('position 结束后不残留测量态', ov.tip.dataset.measuring === undefined, String(ov.tip.dataset.measuring));
  check('可见态有定位坐标', typeof ov.tip.style.left === 'string' && ov.tip.style.left.endsWith('px'), String(ov.tip.style.left));

  ov.hide();
  check('hide 后回到不可见态', ov.tip.dataset.visible === 'false', String(ov.tip.dataset.visible));
  check('hide 后清除高亮', ov.highlight.style.display === 'none', String(ov.highlight.style.display));
  check('hide 后 aria-hidden 为 true', ov.tip.getAttribute('aria-hidden') === 'true', String(ov.tip.getAttribute('aria-hidden')));

  // 高亮胶囊：外扩 3px/2px，且跨行单词每一段都要画
  const twoRects = [
    { left: 100, top: 200, right: 400, bottom: 220, width: 300, height: 20 },
    { left: 100, top: 224, right: 160, bottom: 244, width: 60, height: 20 },
  ];
  ov.showHighlight(twoRects, { locked: false });
  check('跨行单词画两段高亮', ov.highlightNodes.length === 2, String(ov.highlightNodes.length));
  check('第一段高亮可见', ov.highlightNodes[0].style.display === 'block', String(ov.highlightNodes[0].style.display));
  check('第二段高亮可见', ov.highlightNodes[1].style.display === 'block', String(ov.highlightNodes[1].style.display));
  check('高亮相对单词左右各外扩', ov.highlightNodes[0].style.left === '97px' && ov.highlightNodes[0].style.width === '306px',
    `${ov.highlightNodes[0].style.left} / ${ov.highlightNodes[0].style.width}`);
  check('高亮相对单词上下各外扩', ov.highlightNodes[0].style.top === '198px' && ov.highlightNodes[0].style.height === '24px',
    `${ov.highlightNodes[0].style.top} / ${ov.highlightNodes[0].style.height}`);
  ov.showHighlight([twoRects[0]], { locked: false });
  check('单词回到单段时收回多余高亮节点', ov.highlightNodes.length === 1, String(ov.highlightNodes.length));
  check('收回后不可见的那段不残留命中区域', ov.highlightNodes[0].style.display === 'block');

  const css = api.OVERLAY_CSS;
  check('CSS：隐藏态用 display:none（彻底移出命中测试）', /\.dsh-wh-tip\s*\{[^}]*display:\s*none/.test(css), '未找到 .dsh-wh-tip{display:none}');
  check('CSS：只有可见态才打开 pointer-events', /\.dsh-wh-tip\[data-visible="true"\][^}]*pointer-events:\s*auto/.test(css), '未找到可见态 pointer-events:auto');
  check('CSS：容器不可拦截事件（pointer-events:none）', /:host\s*\{[^}]*pointer-events:\s*none/.test(css), '未找到 :host{pointer-events:none}');

  // 回归①：高亮块不能遮挡文字。
  // 高亮是覆盖在文字上面的一层，**底色**的不透明度必须足够低，否则视觉上「把单词挖掉」。
  // 注意只看 background：内描边（box-shadow inset）本来就该比较实，那才是「网格线」。
  const hlBlock = css.match(/\.dsh-wh-hl\s*\{([\s\S]*?)\}/)?.[1] ?? '';
  const bgAlphas = [...hlBlock.matchAll(/background\s*:[^;]*?rgba\([^)]*?,\s*(0?\.\d+|1|0)\)/g)]
    .map((m) => Number(m[1]));
  const maxBgAlpha = bgAlphas.length > 0 ? Math.max(...bgAlphas) : 1;
  check('CSS：高亮底色不透明度 ≤ 0.2（不遮挡文字）', maxBgAlpha <= 0.2, `实测最大 ${maxBgAlpha}`);
  check('CSS：高亮用 inset 描边而非实心填充', /box-shadow[\s\S]*inset/.test(hlBlock), hlBlock.slice(0, 80));

  // 回归②：长词条必须能滚动看全，而不是被裁掉。
  const tipBlock = css.match(/\.dsh-wh-tip\s*\{([\s\S]*?)\}/)?.[1] ?? '';
  check('CSS：浮层整体限高', /max-height\s*:/.test(tipBlock), tipBlock.slice(0, 60));
  check('CSS：浮层可滚动', /overflow-y\s*:\s*auto/.test(tipBlock), '未找到 overflow-y:auto');
  check('CSS：释义区不再单独限高（避免显示不全）', !/\.dsh-wh-meanings\s*\{[^}]*max-height/.test(css), '仍存在 .dsh-wh-meanings max-height');
} else {
  check('Overlay 已导出', false, '扁平 API 里找不到');
}

console.log('\n[2] apply(ctx) 挂载与清理');
const slots = makeSlots();
const effects = [];
const ctx = {
  slots,
  effect(fn) { const dispose = fn(); if (typeof dispose === 'function') effects.push(dispose); return () => {}; },
  on() { return () => {}; },
  provide() {},
  get() { return null; },
  logger: { info() {}, warn() {} },
};

let applyError = null;
try { plugin.apply(ctx); } catch (error) { applyError = error; }
check('apply 未抛异常', applyError === null, applyError?.stack || '');
check('插件容器已挂到 DOM', Boolean(sandbox.document.getElementById?.('dsh-word-hover-root')) || findHost(doc) !== null);
check('注册到插槽', slots.calls.inject.length > 0, JSON.stringify(slots.calls.inject));
check('全局调试 API 可用', typeof win.__DSH_WORD_HOVER__ === 'object' && win.__DSH_WORD_HOVER__ !== null);
check('debug() 可调用', typeof win.__DSH_WORD_HOVER__?.debug === 'function');
const debugInfo = win.__DSH_WORD_HOVER__?.debug?.();
check('debug() 返回配置', debugInfo && typeof debugInfo.config === 'object', JSON.stringify(debugInfo));

console.log('\n[3] 关闭开关后彻底回收');
let toggleError = null;
try {
  win.__DSH_WORD_HOVER__.setConfig({ enabled: false });
} catch (error) { toggleError = error; }
check('setConfig 未抛异常', toggleError === null, toggleError?.stack || '');
check('容器已从 DOM 移除', findHost(doc) === null);
check('全局 API 已清除', win.__DSH_WORD_HOVER__ === undefined);

console.log(`\n结果：${checks - failures}/${checks} 通过`);
if (failures > 0) {
  console.log(`失败 ${failures} 项`);
  process.exitCode = 1;
} else {
  console.log('全部通过 ✓');
}

/** 在 DOM 树里找插件容器（桩环境没有 getElementById 实现）。 */
function findHost(doc) {
  const stack = [doc.documentElement];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if (node.attributes?.['data-dsh-plugin'] === 'dsh-plugin-word-hover') return node;
    if (Array.isArray(node.children)) stack.push(...node.children);
  }
  return null;
}
