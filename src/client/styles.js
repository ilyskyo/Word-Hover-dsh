/**
 * 覆盖层样式。全部走 DSH 主题 token，并给出兜底值，因此亮色/暗色都能自动适配。
 * 只在这个字符串里用 var(--dsw-*) —— 不 import DSH 任何客户端包（官方规范要求）。
 *
 * ⚠️ 类名必须与 render.js / overlay.js 生成的完全一致（一律带 `dsh-wh-` 前缀）。
 *    历史事故：CSS 用无前缀类名（`.head` / `.word`…），而渲染出的却是 `.dsh-wh-head`，
 *    结果**整套样式从未生效**，`querySelector('.head')` 也永远找不到节点，
 *    导致发音/锁定按钮根本没被创建 —— 底部却还在提示「点击 🔊 朗读」。
 *    tests 里有一条断言专门守住「样式选择器必须带前缀」。
 */
export const OVERLAY_CSS = `
:host {
  all: initial;
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  pointer-events: none;
  font-family: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif);
  color: var(--dsw-alias-label-primary, #0f1115);
}
@media (prefers-color-scheme: dark) {
  :host { color: var(--dsw-alias-label-primary, #f9fafb); }
}
* { box-sizing: border-box; }

/* ── 高亮块：视觉上等价于「单词被选中」，但绝不遮挡文字 ─────────────
 *
 * 样式目标：浅灰圆角胶囊 + 一圈细描边，像 macOS 的选中效果。
 * 关键约束：高亮块是覆盖在文字**上面**的一层，所以底色必须足够淡、
 * 描边必须足够细，否则会把单词「挖掉」——早期版本就是这个问题。
 */
.dsh-wh-hl {
  position: fixed;
  pointer-events: none;
  border-radius: min(6px, 50%);
  background: var(--dsw-alias-interactive-bg-hover, rgba(38, 49, 72, 0.08));
  box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.16));
  transition: opacity 120ms ease;
}
@media (prefers-color-scheme: dark) {
  .dsh-wh-hl {
    background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.1));
    box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.2));
  }
}
.dsh-wh-hl[data-locked="true"] {
  background: var(--dsw-alias-interactive-bg-active, rgba(38, 49, 72, 0.14));
  box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l4, rgba(0, 0, 0, 0.3));
}
@media (prefers-color-scheme: dark) {
  .dsh-wh-hl[data-locked="true"] {
    background: var(--dsw-alias-interactive-bg-active, rgba(255, 255, 255, 0.16));
    box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l4, rgba(255, 255, 255, 0.32));
  }
}

/* ── 浮层 ──────────────────────────────────────────────────────── */
/*
 * ⚠️ 关键不变量：浮层「不可见时必须完全无命中区域」。
 *    只靠 opacity:0 隐藏时，元素仍占据 position:fixed 的命中区域；
 *    一旦有任何路径让它保持可见，就会拦截整页的滚动与点击（表现为页面卡死）。
 *    因此用 display:none 把它彻底移出命中测试，只有可见态才参与布局，
 *    并且 pointer-events 只在可见态打开。
 */
.dsh-wh-tip {
  display: none;
  position: fixed;
  pointer-events: none;
  max-width: min(420px, calc(100vw - 16px));
  min-width: 220px;
  /* 整体限高并内部滚动：词条很长时（如 exit/unavailable）靠滚动看全，
     而不是被视口裁掉。定位算法会把这个高度进一步压到可用空间以内。 */
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 10px 12px;
  border-radius: var(--dsw-radius-lg, 10px);
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12));
  background: var(--dsw-specific-menu, var(--dsw-menu-surface-fill, #ffffff));
  -webkit-backdrop-filter: var(--dsw-menu-backdrop-filter, none);
  backdrop-filter: var(--dsw-menu-backdrop-filter, none);
  box-shadow: var(--dsw-shadow-lv3, 0 8px 28px rgba(0, 0, 0, 0.18));
  font-size: 13px;
  line-height: 1.55;
  opacity: 0;
  transform: translateY(-2px);
  transition: opacity 120ms ease, transform 120ms ease;
}
@media (prefers-color-scheme: dark) {
  .dsh-wh-tip { background: var(--dsw-specific-menu, #2a2b2d); }
}
.dsh-wh-tip[data-visible="true"] {
  display: flex;
  flex-direction: column;
  pointer-events: auto;
  opacity: 1;
  transform: translateY(0);
}
/* 测量尺寸的阶段：需要参与布局，但既不可见也不可交互 */
.dsh-wh-tip[data-measuring="true"] {
  display: flex;
  flex-direction: column;
  pointer-events: none;
  visibility: hidden;
}

/* ── 词头：单词 + 音标 + 操作按钮 ──────────────────────────────── */
.dsh-wh-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}
.dsh-wh-word { font-size: 15px; font-weight: 600; }
.dsh-wh-phonetic {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #61666b);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.dsh-wh-header-actions {
  margin-left: auto;
  display: flex;
  gap: 4px;
  align-items: center;
  /* 按钮比文字高，用 center 而不是 baseline，避免被基线顶偏 */
  align-self: center;
}

/* ── 按钮 ──────────────────────────────────────────────────────── */
.dsh-wh-btn {
  appearance: none;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12));
  background: transparent;
  color: inherit;
  border-radius: var(--dsw-radius-sm, 6px);
  font-size: 12px;
  line-height: 1;
  padding: 4px 7px;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
}
.dsh-wh-btn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06)); }
.dsh-wh-btn:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, #4d6bfe);
  outline-offset: 1px;
}
.dsh-wh-btn[disabled] { opacity: 0.45; cursor: default; }
.dsh-wh-btn[aria-pressed="true"] {
  background: var(--dsw-alias-interactive-bg-active, rgba(0, 0, 0, 0.1));
}

/* ── 释义区 ────────────────────────────────────────────────────── */
.dsh-wh-meanings { display: flex; flex-direction: column; gap: 8px; }
.dsh-wh-meaning { display: flex; gap: 8px; align-items: flex-start; }
.dsh-wh-pos {
  flex: 0 0 auto;
  font-size: 11px;
  padding: 1px 5px;
  border-radius: var(--dsw-radius-xs, 3px);
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06));
  color: var(--dsw-alias-label-secondary, #61666b);
  white-space: nowrap;
  margin-top: 1px;
}
.dsh-wh-texts { min-width: 0; }
.dsh-wh-translation { color: var(--dsw-alias-label-primary, inherit); }
.dsh-wh-definition { color: var(--dsw-alias-label-secondary, #61666b); font-size: 12px; }
.dsh-wh-example {
  color: var(--dsw-alias-label-tertiary, #81858c);
  font-size: 12px;
  font-style: italic;
  border-left: 2px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12));
  padding-left: 6px;
  margin-top: 2px;
}
.dsh-wh-foot {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.06));
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #81858c);
}
.dsh-wh-source { white-space: nowrap; }

/* 滚动条：用 DSH 的滚动条 token，避免出现系统默认的白色粗条 */
.dsh-wh-tip::-webkit-scrollbar { width: 8px; }
.dsh-wh-tip::-webkit-scrollbar-track { background: transparent; }
.dsh-wh-tip::-webkit-scrollbar-thumb {
  background: var(--dsw-alias-scrollbar-bg-l2, rgba(0, 0, 0, 0.18));
  border-radius: 4px;
}
.dsh-wh-tip::-webkit-scrollbar-thumb:hover {
  background: var(--dsw-alias-scrollbar-hover-l2, rgba(0, 0, 0, 0.3));
}
.dsh-wh-error { color: var(--dsw-alias-state-error-primary, #d64545); font-size: 12px; }
.dsh-wh-hint {
  font-size: 11px;
  color: var(--dsw-alias-label-dimmed, #9aa0a6);
  margin-top: 6px;
  user-select: none;
}

/* ── 加载态 ────────────────────────────────────────────────────── */
.dsh-wh-loading { display: flex; flex-direction: column; gap: 6px; padding: 2px 0; }
.dsh-wh-skeleton {
  display: block;
  height: 10px;
  border-radius: 5px;
  background: linear-gradient(90deg, var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,0.06)) 25%, var(--dsw-alias-interactive-bg-active, rgba(0,0,0,0.1)) 37%, var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,0.06)) 63%);
  background-size: 400% 100%;
  animation: dsh-wh-shimmer 1.2s ease-in-out infinite;
}
.dsh-wh-skeleton:last-child { width: 62%; }
@keyframes dsh-wh-shimmer {
  0% { background-position: 100% 50%; }
  100% { background-position: 0 50%; }
}
@media (prefers-reduced-motion: reduce) {
  .dsh-wh-tip, .dsh-wh-hl { transition: none; }
  .dsh-wh-skeleton { animation: none; }
}

/* ── 设置面板（挂在同一个 shadow root 里，天然隔离样式） ───────────── */
.dsh-wh-panel-backdrop {
  position: fixed;
  inset: 0;
  background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.32));
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.dsh-wh-panel {
  width: min(420px, calc(100vw - 32px));
  max-height: min(78vh, 640px);
  overflow: auto;
  background: var(--dsw-alias-bg-layer-1, #fff);
  color: var(--dsw-alias-label-primary, #0f1115);
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12));
  border-radius: var(--dsw-radius-panel, 12px);
  box-shadow: var(--dsw-shadow-lv3, 0 10px 40px rgba(0, 0, 0, 0.24));
  padding: 14px 16px 16px;
}
@media (prefers-color-scheme: dark) {
  .dsh-wh-panel { background: var(--dsw-alias-bg-layer-1, #26272a); }
}
.dsh-wh-panel h2 { margin: 0 0 10px; font-size: 15px; font-weight: 600; }
.dsh-wh-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 0;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.06));
  font-size: 13px;
}
.dsh-wh-row:last-of-type { border-bottom: none; }
.dsh-wh-row label { color: var(--dsw-alias-label-primary, inherit); }
.dsh-wh-row .dsh-wh-desc {
  display: block;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #81858c);
  margin-top: 2px;
}
.dsh-wh-panel select,
.dsh-wh-panel input[type="number"] {
  font: inherit;
  font-size: 12px;
  padding: 3px 6px;
  border-radius: var(--dsw-radius-sm, 6px);
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12));
  background: var(--dsw-specific-input-major, transparent);
  color: inherit;
  max-width: 55%;
}
.dsh-wh-panel input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--dsw-alias-brand-primary, #4d6bfe);
}
.dsh-wh-panel-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 12px;
}
.dsh-wh-btn-primary {
  background: var(--dsw-alias-button-primary-fill, #4d6bfe);
  color: var(--dsw-alias-label-primary-foreground, #fff);
  border-color: transparent;
}
.dsh-wh-notice {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #81858c);
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.04));
  border-radius: var(--dsw-radius-sm, 6px);
  padding: 7px 9px;
  margin-top: 10px;
  line-height: 1.5;
}
`;
