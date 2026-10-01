/**
 * 单词规范化与语言判断。中英文混排时这一步决定了「什么不该查」。
 */

/**
 * 单个英文单词。
 *  - 首字符必须是字母（避免把 12345 这种数字串当单词查）
 *  - 后续允许字母、数字、内部撇号、内部连字符
 *    （技术文本里 utf8 / gpt4 / sha256 很常见，早期版本把数字排除掉会导致
 *      这些词在客户端被识别、到宿主端却因校验失败报「只支持单个英文单词」）
 */
const WORD_RE = /[A-Za-z\u00C0-\u024F]+(?:[0-9'\u2019-]?[A-Za-z\u00C0-\u024F0-9]+)*/g;

/** 一个可查询的单词最长长度，超过视为噪声（base64、hash、长标识符）。 */
export const MAX_WORD_LENGTH = 32;

/** 需要整块跳过的标签：脚本、样式、输入、代码、公式。 */
export const SKIP_TAGS = Object.freeze([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION',
  'CODE', 'PRE', 'KBD', 'SAMP', 'VAR', 'TT', 'SVG', 'MATH', 'CANVAS',
]);

/** 需要跳过的祖先类名（DSH 全局类名，跨构建稳定）。 */
export const SKIP_CLASS_SELECTOR = [
  '.md-code-block', // 代码块
  '.katex', // 数学公式
  '.katex-display',
  '[data-code-block-content]',
  '[data-code-block-banner]',
  '.dsh-wh-layer', // 本插件自己的浮层
].join(',');

/** 把原始文本规范化：小写、去掉首尾符号。 */
export function normalizeWord(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/^[\s'"“”‘’(\[{<]+/, '')
    .replace(/[\s'"“”‘’)\]}>.,;:!?]+$/, '')
    .toLowerCase();
}

/** 是否值得为一个词发起查询。 */
export function isLookupCandidate(word) {
  if (!word || word.length < 2 || word.length > MAX_WORD_LENGTH) return false;
  if (!/[a-z\u00C0-\u024F]/.test(word)) return false; // 必须含字母
  if (/^\d+$/.test(word)) return false;
  // 与宿主端校验规则保持一致，避免「客户端能识别、服务端拒绝」的不一致
  if (!/^[a-z\u00C0-\u024F][a-z0-9\u00C0-\u024F'\u2019-]*$/.test(word)) return false;
  return true;
}

/** 只保留最长的一段；caretRangeFromPoint 偶尔会返回跨行的巨大 range，这里兜底。 */
export function trimToSingleWord(text) {
  if (typeof text !== 'string' || text.length > 512) return '';
  const matches = text.match(WORD_RE);
  if (!matches || matches.length === 0) return '';
  return matches.length === 1 ? matches[0] : matches[0];
}

/** 从一段文本节点内容里，找出覆盖 [offset] 位置的那个单词及其起止下标。 */
export function wordAtOffset(text, offset) {
  if (typeof text !== 'string' || text.length === 0) return null;
  const index = Number(offset);
  // 越界一律返回 null：调用方（caretRangeFromPoint）偶尔会给出落在文本外的偏移，
  // 若在这里 clamp 就会错误地把首/尾单词当成命中目标。
  if (!Number.isInteger(index) || index < 0 || index >= text.length) return null;
  WORD_RE.lastIndex = 0;
  let match;
  while ((match = WORD_RE.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (index >= start && index < end) {
      return { raw: match[0], start, end };
    }
    if (start > index) break;
    if (match[0].length === 0) WORD_RE.lastIndex += 1; // 防御空匹配死循环
  }
  return null;
}

/** 遍历一段文本里所有单词（用于构建键盘导航索引）。 */
export function allWordsIn(text) {
  const out = [];
  if (typeof text !== 'string' || text.length === 0) return out;
  WORD_RE.lastIndex = 0;
  let match;
  while ((match = WORD_RE.exec(text)) !== null) {
    if (match[0].length === 0) { WORD_RE.lastIndex += 1; continue; }
    out.push({ raw: match[0], start: match.index, end: match.index + match[0].length });
  }
  return out;
}

/**
 * 垂直方向的命中收缩比例。
 *
 * 收缩的目的是排除「行框矩形比字身高出来的那部分」——鼠标走在行距里不该命中。
 * 但不能收缩太多：高亮胶囊是围绕字身画的，如果命中区比胶囊小，
 * 用户碰到胶囊边缘却不出释义，就会觉得「明明碰到了却不响应」。
 * 所以这里的取值要与 overlay.js 的 HL_PAD_Y 大致对齐。
 */
export const HIT_INSET_TOP = 0.14;
export const HIT_INSET_BOTTOM = 0.06;

/**
 * 精确命中测试：点是否真的落在单词的可见矩形内。
 *
 * 为什么必须做：`caretRangeFromPoint` 在光标落在字符之间的空隙、行首缩进、
 * 甚至完全空白处时，都会「吸附」到最近的字符。只用它判断会出现
 * 「鼠标还在词与词之间，释义就弹出来了」；扫过一行英文时更是频繁误触发。
 *
 * @param {number} x 视口坐标
 * @param {number} y 视口坐标
 * @param {Array<{left:number,top:number,right:number,bottom:number,width:number,height:number}>} rects
 * @returns {boolean}
 */
export function pointHitsRects(x, y, rects) {
  if (!Array.isArray(rects) || rects.length === 0) return false;
  for (const rect of rects) {
    if (!rect || rect.width <= 0 || rect.height <= 0) continue;
    const top = rect.top + rect.height * HIT_INSET_TOP;
    const bottom = rect.bottom - rect.height * HIT_INSET_BOTTOM;
    if (x >= rect.left && x <= rect.right && y >= top && y <= bottom) return true;
  }
  return false;
}
