/**
 * 覆盖层：高亮块 + 词典浮层 + 设置面板。
 *
 * 全部挂在插件自己的 Shadow DOM 里（attachShadow 的容器由调用方插入）：
 *  - 不修改宿主 DOM（不包 span、不改文本），因此不破坏 Markdown 渲染、React 重渲染、复制；
 *  - 样式天然隔离，不会污染 DSH 的 CSS Module；
 *  - 浮层用 position:fixed，脱离文档流，不产生布局抖动。
 *
 * 卸载时整棵子树一起移除，页面恢复原状（验收标准 8/9）。
 */

import { OVERLAY_CSS } from './styles.js';
import { renderDictionaryBody, renderLoadingBody } from './render.js';
import { HOST_DEFAULTS } from './config.js';

/** 浮层与视口边缘的最小距离。 */
export const OVERLAY_EDGE_MARGIN = 8;
/** 同义别名，方便外部统一引用。 */
export const EDGE_MARGIN = OVERLAY_EDGE_MARGIN;
/** 浮层与单词之间的间距。 */
const ANCHOR_GAP = 6;
/** DSH 顶部标题栏最小避让。 */
const HEADER_CLEARANCE_FALLBACK = 48;
/** 高亮胶囊相对单词矩形的外扩量（左右 / 上下）。上下更小，避免侵到相邻行。 */
const HL_PAD_X = 3;
const HL_PAD_Y = 2;
/**
 * 浮层在一侧至少要有这么高才愿意放在那一侧。
 * 低于这个值就宁可「钳住并允许压住锚点」，因为每次都弹出十几像素的浮层没有意义。
 */
const MIN_READABLE_HEIGHT = 150;

/**
 * 浮层底部提示的默认文案。
 * 只描述**状态**，不再写「点击某个按钮」这类指路文案 ——
 * 之前因为按钮挂载失败，那句提示指向了一个不存在的按钮。
 * 按钮自己带图标和文字，不需要再教用户点哪里。
 */
export function defaultHintText({ locked = false } = {}) {
  return locked ? '已锁定 · Esc 或点击空白处关闭' : 'Esc 关闭 · 点击单词可锁定';
}

/**
 * 浮层定位（纯函数，便于单测）。
 *
 * 规则：
 *  1. 优先放在单词下方；下方空间不足且上方更宽敞时才翻到上方；
 *  2. 上下都放不下时夹进视口，允许浮层内部滚动；
 *  3. 水平以单词中心对齐，再夹到 [8, vw-8] 之间，保证距边缘至少 8px。
 *
 * @param {object} input
 * @param {{left:number,top:number,right:number,bottom:number,width:number,height:number}} input.anchor 单词矩形
 * @param {number} input.tipWidth 浮层宽
 * @param {number} input.tipHeight 浮层高
 * @param {number} input.viewportWidth
 * @param {number} input.viewportHeight
 * @param {number} [input.headerClearance] 顶部避让高度
 * @param {number} [input.minTop] 顶部最小留白；不传则用 headerClearance。
 *   词条很长时浮层会顶到标题栏，此时用更小的留白换取「内容不被裁掉、可以滚动看全」。
 * @param {number} [input.maxHeight] 调用方已把浮层限制到的高度。
 *   传入时会做最后一道防御：即使锚点位置极端，也保证底边不越过视口安全线
 *   （用户遇到的是「滚到底仍有一截在任务栏下方」，根因就是这里缺少收敛）。
 * @returns {{left:number, top:number, placement:'below'|'above'}}
 */
export function computePosition({
  anchor, tipWidth, tipHeight,
  viewportWidth, viewportHeight,
  headerClearance = HEADER_CLEARANCE_FALLBACK,
  minTop,
  maxHeight,
}) {
  const m = OVERLAY_EDGE_MARGIN;
  const lowerBound = minTop === undefined ? headerClearance : minTop;

  // 最后一道防御：把参与定位的高度收敛到「视口内放得下」的范围
  let height = tipHeight;
  if (typeof maxHeight === 'number' && maxHeight > 0) {
    height = Math.min(height, maxHeight);
  }
  const hardMax = viewportHeight - m * 2;
  const overflowGuard = height > hardMax;
  if (overflowGuard) height = hardMax;

  // ── 垂直 ──────────────────────────────────────────────────────
  const spaceBelow = viewportHeight - anchor.bottom;
  const spaceAbove = anchor.top - headerClearance;
  const needed = height + ANCHOR_GAP + m;

  let top;
  let placement;
  if (spaceBelow >= needed || spaceBelow >= spaceAbove) {
    top = anchor.bottom + ANCHOR_GAP;
    placement = 'below';
  } else {
    top = anchor.top - height - ANCHOR_GAP;
    placement = 'above';
  }
  const maxTop = Math.max(m, viewportHeight - height - m);
  const minTopClamped = Math.min(lowerBound, maxTop);
  top = Math.min(maxTop, Math.max(minTopClamped, top));

  // ── 水平 ──────────────────────────────────────────────────────
  const centered = anchor.left + anchor.width / 2 - tipWidth / 2;
  const maxLeft = Math.max(m, viewportWidth - tipWidth - m);
  const left = Math.min(maxLeft, Math.max(m, centered));

  return { left: Math.round(left), top: Math.round(top), placement, height: Math.round(height) };
}

export class Overlay {
  /**
   * @param {HTMLElement} host 插件自己创建并插入页面的宿主元素
   */
  constructor(host) {
    this.host = host;
    this.shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
    this.shadow.replaceChildren();

    const doc = host.ownerDocument;
    const style = doc.createElement('style');
    style.textContent = OVERLAY_CSS;
    this.shadow.append(style);

    // 高亮块其实只有一个：把单词的第一段矩形画出来即可
    this.highlight = doc.createElement('div');
    this.highlight.className = 'dsh-wh-hl';
    this.highlight.setAttribute('aria-hidden', 'true');
    this.highlight.style.display = 'none';

    // 浮层
    this.tip = doc.createElement('div');
    this.tip.className = 'dsh-wh-tip';
    this.tip.setAttribute('role', 'tooltip');
    this.tip.setAttribute('aria-hidden', 'true');
    this.tip.dataset.visible = 'false';

    this.body = doc.createElement('div');
    this.tip.append(this.body);

    this.shadow.append(this.highlight, this.tip);

    // 跨行单词需要多段高亮：以第一个为模板克隆，避免每个词都新建样式对象
    this.highlightTemplate = this.highlight;
    this.highlightNodes = [this.highlight];

    this.hideTimer = null;
    this.currentRect = null;
    this.currentRects = [];
    this.requestVersion = 0;
  }

  // ── 高亮 ────────────────────────────────────────────────────────
  /**
   * 在单词矩形处画高亮（浅灰圆角胶囊 + 细描边）。
   *
   * 向外扩张 HL_PAD_X / HL_PAD_Y：截图里的效果是胶囊比单词略微大一圈，
   * 完全贴合字身会显得局促，也会把描边压在字形上。
   * 上下扩得比左右少 —— 行高通常比字身高不少，扩太多会侵到相邻行。
   *
   * 跨行单词（rects 多段）每一段都画一个，而不是只画第一段。
   */
  showHighlight(rects, { locked = false } = {}) {
    if (!rects || rects.length === 0) { this.clearHighlight(); return; }
    this.currentRects = rects;
    this.currentRect = rects[0];

    // 按需增删高亮段
    while (this.highlightNodes.length < rects.length) {
      const extra = this.highlightTemplate.cloneNode(false);
      this.shadow.insertBefore(extra, this.tip);
      this.highlightNodes.push(extra);
    }
    while (this.highlightNodes.length > rects.length) {
      const removed = this.highlightNodes.pop();
      if (removed !== this.highlightTemplate) removed.remove();
    }

    const lockedFlag = locked ? 'true' : 'false';
    for (let i = 0; i < rects.length; i += 1) {
      const rect = rects[i];
      const node = this.highlightNodes[i];
      Object.assign(node.style, {
        display: 'block',
        left: `${Math.round(rect.left - HL_PAD_X)}px`,
        top: `${Math.round(rect.top - HL_PAD_Y)}px`,
        width: `${Math.round(rect.width + HL_PAD_X * 2)}px`,
        height: `${Math.round(rect.height + HL_PAD_Y * 2)}px`,
      });
      node.dataset.locked = lockedFlag;
    }
  }

  clearHighlight() {
    this.currentRects = [];
    this.currentRect = null;
    for (const node of this.highlightNodes) {
      node.style.display = 'none';
      node.dataset.locked = 'false';
    }
  }

  // ── 浮层内容 ────────────────────────────────────────────────────
  showLoading(word) {
    this.requestVersion += 1;
    this.body.replaceChildren(renderLoadingBody(this.host.ownerDocument, word));
    this.tip.setAttribute('aria-hidden', 'false');
  }

  /**
   * 渲染词典结果。
   * @param {object} info 规范化后的 WordInfo
   * @param {{options?:object, locked?:boolean}} flags
   */
  showInfo(info, flags = {}) {
    const doc = this.host.ownerDocument;
    const { options = HOST_DEFAULTS, locked = false } = flags;
    this.requestVersion += 1;

    const frag = doc.createDocumentFragment();
    frag.append(renderDictionaryBody(doc, info, options));
    frag.append(this.buildHint({ locked }));
    this.body.replaceChildren(frag);
    this.tip.setAttribute('aria-hidden', 'false');
  }

  /** 底部操作区：状态的可见反馈（默认文案由 defaultHintText 统一给出）。 */
  buildHint({ locked = false } = {}) {
    const doc = this.host.ownerDocument;
    const hint = doc.createElement('div');
    hint.className = 'dsh-wh-hint';
    hint.setAttribute('role', 'status');
    hint.setAttribute('aria-live', 'polite');
    hint.textContent = defaultHintText({ locked });
    return hint;
  }

  /** 顶部操作按钮（发音、锁定）。由外层在 showInfo 后调用以注入交互。 */
  mountHeaderActions({ onSpeak, onToggleLock, locked, canSpeak }) {
    const doc = this.host.ownerDocument;
    const head = this.body.querySelector('.dsh-wh-head');
    if (!head) return;

    // 清掉旧的按钮组，避免重复注入
    head.querySelector('.dsh-wh-header-actions')?.remove();

    const actions = doc.createElement('div');
    actions.className = 'dsh-wh-header-actions';

    if (canSpeak) {
      const speakBtn = doc.createElement('button');
      speakBtn.type = 'button';
      speakBtn.className = 'dsh-wh-btn';
      speakBtn.textContent = '🔊 朗读';
      speakBtn.setAttribute('aria-label', '朗读这个单词');
      speakBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        onSpeak?.();
      });
      actions.append(speakBtn);
    }

    if (onToggleLock) {
      const lockBtn = doc.createElement('button');
      lockBtn.type = 'button';
      lockBtn.className = 'dsh-wh-btn';
      lockBtn.textContent = locked ? '🔒 已锁定' : '🔓 锁定';
      lockBtn.setAttribute('aria-pressed', locked ? 'true' : 'false');
      lockBtn.setAttribute('aria-label', locked ? '取消锁定浮层' : '锁定浮层');
      lockBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggleLock();
      });
      actions.append(lockBtn);
    }

    if (actions.childElementCount > 0) head.append(actions);
  }

  // ── 定位 ────────────────────────────────────────────────────────
  /**
   * 定位浮层：优先单词下方，空间不足翻到上方；水平方向避让视口边缘（≥8px）。
   * @param {DOMRect} anchorRect 单词矩形
   */
  position(anchorRect) {
    const rect = anchorRect || this.currentRect;
    if (!rect) return;
    const view = this.host.ownerDocument.defaultView || window;
    const viewportWidth = view.innerWidth;
    const viewportHeight = view.innerHeight;

    const headerClearance = Math.max(
      HEADER_CLEARANCE_FALLBACK,
      Number.parseFloat(
        view.getComputedStyle(this.host.ownerDocument.documentElement)
          .getPropertyValue('--dsh-frame-top-clearance'),
      ) || 0,
    );

    const anchor = {
      left: rect.left,
      top: rect.top,
      right: rect.right ?? rect.left + rect.width,
      bottom: rect.bottom ?? rect.top + rect.height,
      width: rect.width,
      height: rect.height,
    };

    const usableBelow = viewportHeight - anchor.bottom - ANCHOR_GAP - OVERLAY_EDGE_MARGIN;
    const usableAbove = anchor.top - headerClearance - ANCHOR_GAP;
    const fitsBelow = usableBelow >= MIN_READABLE_HEIGHT;
    const fitsAbove = usableAbove >= MIN_READABLE_HEIGHT;
    const side = fitsBelow ? 'below' : (fitsAbove ? 'above' : 'clamp');
    const available = side === 'above' ? usableAbove : usableBelow;

    // 高度策略：先按可用空间收窄，再兜一层视口上限。
    // 这样浮层**永远不会溢出视口**（也就不会被系统任务栏或屏幕边缘吃掉），
    // 超出的内容靠浮层内部滚动看全。
    const maxTipHeight = side === 'clamp'
      ? Math.max(MIN_READABLE_HEIGHT, viewportHeight - OVERLAY_EDGE_MARGIN * 2)
      : Math.min(available, viewportHeight - OVERLAY_EDGE_MARGIN * 2);

    // 测量阶段：需要参与布局才量得到尺寸，但此时**不可见也不可交互**。
    // 注意：绝不能在这里直接打开可见态——量尺寸的瞬间若已可交互，
    // 元素会在鼠标下方形成命中区域，这是「页面卡死」类问题的经典成因。
    const wasMeasuring = this.tip.dataset.measuring === 'true';
    this.tip.dataset.measuring = 'true';
    this.tip.style.maxHeight = `${Math.round(maxTipHeight)}px`;

    // 量到的偏移高度已经包含 maxHeight 的约束，直接用它参与定位即可
    const tipWidth = this.tip.offsetWidth;
    const tipHeight = this.tip.offsetHeight;

    if (!wasMeasuring) delete this.tip.dataset.measuring;

    // 定位规则集中在 computePosition（纯函数，已被单测覆盖）。
    // 关键：把 maxTipHeight 也传进去，让它返回**收敛后的高度**，
    // 再用同一个值设置 maxHeight —— 保证「参与定位的高度」与「实际渲染的高度」
    // 完全一致。之前两者不一致（测量后清空了 maxHeight），浮层就会撑到自然高度，
    // 底边溢出到视口外，表现就是「滚到底仍有一截在任务栏下方」。
    const { left, top, placement, height } = computePosition({
      anchor,
      tipWidth,
      tipHeight,
      viewportWidth,
      viewportHeight,
      headerClearance,
      minTop: OVERLAY_EDGE_MARGIN,
      maxHeight: maxTipHeight,
    });

    this.tip.style.maxHeight = `${height}px`;
    this.tip.style.left = `${left}px`;
    this.tip.style.top = `${top}px`;
    this.tip.dataset.placement = placement;
    this.tip.dataset.side = side;
    // 定位完成 → 打开可见态（此时才允许交互）
    this.tip.dataset.visible = 'true';
    this.tip.setAttribute('aria-hidden', 'false');
  }

  /** 窗口尺寸变化或滚动时重新定位。 */
  reposition() {
    if (this.currentRect && this.tip.dataset.visible === 'true') this.position(this.currentRect);
  }

  // ── 状态 ────────────────────────────────────────────────────────
  isTipVisible() {
    return this.tip.dataset.visible === 'true';
  }

  containsTip(target) {
    return target instanceof Node && this.tip.contains(target);
  }

  containsHighlight(target) {
    return target instanceof Node && this.highlight.contains(target);
  }

  hide() {
    this.tip.dataset.visible = 'false';
    this.tip.setAttribute('aria-hidden', 'true');
    this.clearHighlight();
  }

  destroy() {
    this.requestVersion += 1;
    this.hide();
    this.shadow.replaceChildren();
  }
}

/**
 * 构建设置面板的 DOM。抽成独立函数，方便在没有 DSH 的环境里单测。
 * @param {Document} doc
 * @param {object} config
 * @param {object} handlers { onChange(patch), onClose() }
 * @returns {HTMLElement} backdrop 元素
 */
export function buildSettingsPanel(doc, config, handlers) {
  const backdrop = doc.createElement('div');
  backdrop.className = 'dsh-wh-panel-backdrop dsh-wh-panel';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', '英文悬停词典设置');

  const panel = doc.createElement('div');
  panel.className = 'dsh-wh-panel';
  backdrop.append(panel);

  const title = doc.createElement('h2');
  title.textContent = '英文悬停词典 · 设置';
  panel.append(title);

  const emit = (patch) => handlers.onChange?.(patch);

  const row = (labelText, descText, control) => {
    const wrap = doc.createElement('div');
    wrap.className = 'dsh-wh-row';
    const left = doc.createElement('div');
    const label = doc.createElement('label');
    label.textContent = labelText;
    left.append(label);
    if (descText) {
      const desc = doc.createElement('span');
      desc.className = 'dsh-wh-desc';
      desc.textContent = descText;
      left.append(desc);
    }
    wrap.append(left, control);
    return wrap;
  };

  const switchControl = (key, value, label) => {
    const input = doc.createElement('input');
    input.type = 'checkbox';
    input.checked = Boolean(value);
    input.setAttribute('role', 'switch');
    input.setAttribute('aria-checked', String(Boolean(value)));
    input.setAttribute('aria-label', label);
    input.addEventListener('change', () => {
      input.setAttribute('aria-checked', String(input.checked));
      emit({ [key]: input.checked });
    });
    return input;
  };

  const numberControl = (key, value, label, min, max, step = 10) => {
    const input = doc.createElement('input');
    input.type = 'number';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.setAttribute('aria-label', label);
    input.addEventListener('change', () => emit({ [key]: Number(input.value) }));
    return input;
  };

  const selectControl = (key, value, label, choices) => {
    const select = doc.createElement('select');
    select.setAttribute('aria-label', label);
    for (const [val, text] of choices) {
      const option = doc.createElement('option');
      option.value = val;
      option.textContent = text;
      if (val === value) option.selected = true;
      select.append(option);
    }
    select.addEventListener('change', () => emit({ [key]: select.value }));
    return select;
  };

  // 面板必须覆盖这些设置项，缺一个就说明面板与配置定义失配了（早失败优于静默漏项）
  const REQUIRED_KEYS = ['enabled', 'trigger', 'hoverDelayMs', 'hideDelayMs', 'lockOnClick', 'speakEnabled', 'provider'];
  const missingKeys = REQUIRED_KEYS.filter((key) => !(key in config));
  if (missingKeys.length > 0) {
    throw new Error(`设置面板缺少配置字段: ${missingKeys.join(', ')}`);
  }

  panel.append(row('启用插件', '关闭后完全不处理页面文本', switchControl('enabled', config.enabled, '启用插件')));
  panel.append(row('触发方式', 'hover=悬停 240ms；click=点击单词', selectControl('trigger', config.trigger, '触发方式', [
    ['hover', '悬停查询'],
    ['click', '点击查询'],
  ])));
  panel.append(row('悬停延迟', '毫秒，建议 200–300', numberControl('hoverDelayMs', config.hoverDelayMs, '悬停延迟', 0, 2000, 10)));
  panel.append(row('关闭延迟', '毫秒，鼠标移开后多久消失', numberControl('hideDelayMs', config.hideDelayMs, '关闭延迟', 0, 5000, 10)));
  panel.append(row('点击锁定浮层', '点击单词后浮层保持打开', switchControl('lockOnClick', config.lockOnClick, '点击锁定浮层')));
  panel.append(row('发音按钮', '使用系统语音合成，离线可用', switchControl('speakEnabled', config.speakEnabled, '发音按钮')));
  panel.append(row('翻译源', '主词库；失败时自动降级', selectControl('provider', config.provider, '翻译源', [
    ['youdao', '有道词典（含中文释义与例句）'],
    ['freedict', 'Free Dictionary（仅英文释义）'],
    ['suggest', '有道简版（最快、字段少）'],
    ['custom', '自定义后端'],
  ])));
  panel.append(row('显示音标', '', switchControl('showPhonetic', config.showPhonetic, '显示音标')));
  panel.append(row('显示词性', '', switchControl('showPartOfSpeech', config.showPartOfSpeech, '显示词性')));
  panel.append(row('显示英文释义', '', switchControl('showDefinition', config.showDefinition, '显示英文释义')));
  panel.append(row('显示例句', '', switchControl('showExample', config.showExample, '显示例句')));
  panel.append(row('显示来源标识', '', switchControl('showSource', config.showSource, '显示来源标识')));

  const notice = doc.createElement('div');
  notice.className = 'dsh-wh-notice';
  notice.textContent = '主词库为公开词典接口，返回数据版权归原词典所有，仅供个人学习使用；请勿批量抓取或再分发。若需商用，请在 cordis.patch.yml 里把 provider 改为 custom 并指向你自有的合规后端。';
  panel.append(notice);

  const actions = doc.createElement('div');
  actions.className = 'dsh-wh-panel-actions';

  const closeBtn = doc.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'dsh-wh-btn dsh-wh-btn-primary';
  closeBtn.textContent = '完成';
  closeBtn.addEventListener('click', () => handlers.onClose?.());
  actions.append(closeBtn);

  panel.append(actions);
  return backdrop;
}
