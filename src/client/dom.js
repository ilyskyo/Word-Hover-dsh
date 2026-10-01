/**
 * DSH 消息 DOM 的「只读」访问层。
 *
 * 选择器依据（来自对 DSH 0.2.0-rc.2 asar 的一手分析，见 dsh-dom-slots-findings.md）：
 *  - 消息区：[data-conversation-region="chat"] [data-conversation-scroll]
 *  - 助手回复块：[data-chat-flow-kind="assistant-step"]（user 块是 "user"）
 *  - 槽位包装：[data-slot="conversation.chat.node"]
 *  - 流式标记：[data-streaming]（存在=仍在流式输出）
 *  - 代码块：全局类名 .md-code-block（非 CSS Module，跨构建稳定）
 *  - 宽表：.md-table-wide
 *
 * ⚠️ 本模块**只读 DOM，绝不修改**。高亮由一个独立的 Shadow DOM 覆盖层绘制，
 *    因此不会破坏 Markdown 渲染、React 重渲染、文本复制。
 *
 * ⚠️ 若 DSH 升级后助手回复不再出现，请先运行 scripts/verify-dom.js 打印真实结构，
 *    然后只需改本文件顶部的常量即可。
 */

import {
  SKIP_TAGS,
  SKIP_CLASS_SELECTOR,
  isLookupCandidate,
  wordAtOffset,
  allWordsIn,
  pointHitsRects,
} from './word.js';

/** 助手回复块的标记属性（构造上稳定，不随 CSS 哈希变化）。 */
export const FLOW_KIND_ATTR = 'data-chat-flow-kind';
export const ASSISTANT_KIND = 'assistant-step';
/** 可承载正文的元素：只在叶子级做定位。 */
const PROSE_SELECTOR = 'p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,dt,dd,figcaption';

/** 根节点缓存，避免每次 mousemove 都跑 querySelector。 */
let rootsCache = { /* 保存两个根 */ };

/**
 * 取得「消息滚动容器」与「整个消息区」两个根。
 * 用滚动容器做 contains 判断可以把侧栏、设置面板排除在外。
 */
export function getRoots(doc = document) {
  if (rootsCache.doc === doc && rootsCache.scroll?.isConnected) return rootsCache;

  const region = doc.querySelector('[data-conversation-region="chat"]') ?? doc.body;
  // 优先用带 data 标记的滚动容器；退而求其次找会话区的可滚动祖先
  let scroll = region.querySelector('[data-conversation-scroll]');
  if (!scroll) {
    scroll = region;
    for (const el of region.querySelectorAll('div')) {
      if (el.scrollHeight > el.clientHeight + 4) { scroll = el; break; }
    }
  }
  rootsCache = { doc, region, scroll };
  return rootsCache;
}

/** 强制丢弃根缓存（DOM 结构变化后调用）。 */
export function invalidateRoots() {
  rootsCache = {};
}

/** 打包（把多个模块压平到同一个闭包）后使用的别名，避免与其它模块的同名顶层声明冲突。 */
export const domRoots = getRoots;
export const domInvalidateRoots = invalidateRoots;
export const domWordAtPoint = wordAtPoint;
export const domBlockSignature = blockSignature;
export const domBuildWordIndex = buildWordIndex;
export const domIsExcluded = isExcluded;
export const domVisibleAssistantBlocks = visibleAssistantBlocks;

/** 某节点是否位于助手回复块内（供外部快速判断）。 */
export function domIsInsideAssistant(node) {
  return blockOf(node) !== null;
}

/** 元素是否在我们负责的区域里（助手回复块）。 */
export function isAssistantBlock(el) {
  if (!(el instanceof Element)) return false;
  return el.getAttribute(FLOW_KIND_ATTR) === ASSISTANT_KIND;
}

/** 向上找到最近的助手回复块。 */
export function blockOf(node) {
  let el = node instanceof Element ? node : node?.parentElement;
  while (el) {
    if (isAssistantBlock(el)) return el;
    el = el.parentElement;
  }
  return null;
}

/** 该节点是否位于某个被排除的祖先里（代码块、公式、输入框等）。 */
export function isExcluded(node, extraSelectors) {
  const el = node instanceof Element ? node : node?.parentElement;
  if (!el) return true;

  // 1) 标签级排除
  for (let cur = el; cur; cur = cur.parentElement) {
    if (SKIP_TAGS.includes(cur.tagName)) return true;
    if (cur.isContentEditable) return true;
    // 2) DSH 全局类名与自定义排除选择器
    try {
      if (cur.matches?.(SKIP_CLASS_SELECTOR)) return true;
      if (extraSelectors && extraSelectors.length > 0) {
        for (const sel of extraSelectors) {
          try { if (cur.matches?.(sel)) return true; } catch { /* 用户写的选择器非法则忽略 */ }
        }
      }
    } catch { /* matches 在极老浏览器可能缺失 */ }
    if (cur === document.body) break;
  }
  return false;
}

/** 点是否落在窗口内。 */
function inViewport(x, y) {
  return x >= 0 && y >= 0 && x <= window.innerWidth && y <= window.innerHeight;
}

/**
 * 在 (x,y) 处取「光标下的字符」对应的 range。
 * 优先用非标准的 caretRangeFromPoint（Chrome/Electron 有，性能最好）。
 */
function caretRangeAt(x, y) {
  if (typeof document.caretRangeFromPoint === 'function') {
    try { return document.caretRangeFromPoint(x, y); } catch { return null; }
  }
  if (typeof document.caretPositionFromPoint === 'function') {
    const pos = document.caretPositionFromPoint(x, y);
    if (!pos) return null;
    try {
      const range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.setEnd(pos.offsetNode, pos.offset);
      return range;
    } catch { return null; }
  }
  return null;
}

/**
 * 命中测试：给定视口坐标，返回该处的英文单词信息。
 *
 * 关键点：
 *  1. **只有命中助手回复块才返回结果**，所以用户消息、代码块、输入框、侧栏天然不会被处理；
 *  2. **必须做精确命中测试**（pointHitsRects）——`caretRangeFromPoint` 在字符间隙、
 *     行首缩进和空白处都会吸附到最近的字符，只用它会导致「没碰到单词就弹释义」，
 *     以及鼠标扫过一行英文时频繁误触发。
 *
 * @returns {null | {word:string, raw:string, block:Element, rects:DOMRect[], first:DOMRect, last:DOMRect, range:Range}}
 */
export function wordAtPoint(x, y, extraExcludeSelectors) {
  if (!inViewport(x, y)) return null;
  const range = caretRangeAt(x, y);
  if (!range) return null;

  const node = range.startContainer;
  if (!node || node.nodeType !== Node.TEXT_NODE) return null;
  const text = node.nodeValue;
  if (typeof text !== 'string' || text.length === 0) return null;

  const hit = wordAtOffset(text, range.startOffset);
  if (!hit) return null;

  const normalized = hit.raw.toLowerCase();
  if (!isLookupCandidate(normalized)) return null;
  if (isExcluded(node, extraExcludeSelectors)) return null;

  const block = blockOf(node);
  if (!block) return null; // 不在助手回复里，直接放弃

  const wordRange = document.createRange();
  try {
    wordRange.setStart(node, hit.start);
    wordRange.setEnd(node, hit.end);
  } catch {
    return null;
  }

  const rects = measureRange(wordRange);
  if (rects.length === 0) return null;
  const first = rects[0];
  const last = rects[rects.length - 1];
  if (first.width <= 0 || first.height <= 0) return null;

  // ★ 精确命中：光标必须真的落在单词矩形内，否则一律不算命中
  if (!pointHitsRects(x, y, rects)) return null;

  return { word: normalized, raw: hit.raw, block, rects, first, last, range: wordRange };
}

/** 取一个 range 的可见矩形（过滤掉零尺寸的换行残片）。 */
function measureRange(range) {
  let raw;
  try { raw = range.getClientRects(); } catch { return []; }
  const out = [];
  for (let i = 0; i < raw.length; i += 1) {
    const r = raw[i];
    if (r.width > 0 && r.height > 0) out.push(r);
    if (out.length >= 3) break; // 单词跨行最多取 3 段，足够画高亮与定位
  }
  return out;
}

/** 块的廉价指纹：文本长度。用来判断流式输出后缓存是否过期。 */
export function blockSignature(block) {
  return block ? block.textContent.length : -1;
}

/**
 * 构建一个块的「单词索引」，供键盘 Tab 导航使用。
 * 只在用户真的用键盘时才调用（普通鼠标悬停不需要它，避免长消息卡顿）。
 */
export function buildWordIndex(block, extraExcludeSelectors) {
  if (!block) return [];
  const doc = block.ownerDocument;
  const walker = doc.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || node.nodeValue.length === 0) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      // 只要正文叶子级元素里的文本
      if (!parent.closest(PROSE_SELECTOR) && parent.tagName !== 'A') return NodeFilter.FILTER_REJECT;
      if (parent.children.length > 0 && !parent.closest('a')) return NodeFilter.FILTER_REJECT;
      if (isExcluded(parent, extraExcludeSelectors)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const index = [];
  let node = walker.nextNode();
  while (node) {
    const text = node.nodeValue;
    for (const hit of allWordsIn(text)) {
      const word = hit.raw.toLowerCase();
      if (!isLookupCandidate(word)) continue;
      const range = doc.createRange();
      try {
        range.setStart(node, hit.start);
        range.setEnd(node, hit.end);
      } catch { continue; }
      const rects = measureRange(range);
      if (rects.length === 0) continue;
      index.push({ word, raw: hit.raw, node, rects, range });
    }
    node = walker.nextNode();
  }
  // 按阅读顺序排序（文档顺序 + 行内先后）
  index.sort((a, b) => {
    const ra = a.rects[0];
    const rb = b.rects[0];
    if (Math.abs(ra.top - rb.top) > 4) return ra.top - rb.top;
    return ra.left - rb.left;
  });
  return index;
}

/** 收集当前所有可见的助手回复块。 */
export function visibleAssistantBlocks(doc = document) {
  const { scroll } = getRoots(doc);
  const base = scroll?.isConnected ? scroll : doc;
  return [...base.querySelectorAll(`[${FLOW_KIND_ATTR}="${ASSISTANT_KIND}"]`)].filter((block) => {
    const rect = block.getBoundingClientRect();
    return rect.height > 0;
  });
}
