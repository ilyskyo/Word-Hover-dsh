/**
 * 插件主体：状态机（悬停 → 高亮 → 查词 → 浮层 → 锁定）+ 与 DSH 的接线。
 *
 * 设计决策（对应验收标准）：
 *  1. 悬停 200–300ms 后触发：hoverDelayMs（默认 240ms），先出高亮+骨架，再填内容。
 *  2. 移出单词与浮层 250ms 后关闭：hideDelayMs；移到浮层上会重置定时器（pointerInTip）。
 *  3. 点击锁定 / ESC 关闭 / 点击外部关闭。
 *  4. 代码块、URL、输入框、用户消息不受影响：命中测试只认
 *     [data-chat-flow-kind="assistant-step"]，且跳过 pre/code/输入类元素。
 *  5. 新消息与流式输出自动生效：**不使用 MutationObserver，也不预扫描文本**。
 *     每次悬停都是「按鼠标坐标即时查询 DOM」，所以新出现的、正在流式的文本
 *     天然就能被命中；同时避免了 1000 词消息的预计算卡顿。
 *  6. **不缓存任何释义内容**：主源条款禁止缓存返回数据，
 *     因此每次查词都真实请求上游，结果只存在于调用栈里。
 *     没有内存词典、没有 IndexedDB、没有 localStorage 词条。
 *  7. API 失败不抛异常：统一返回 error 态，浮层显示中文提示。
 *  8. 关闭开关后完全不处理：enabled=false 时所有监听器直接 return，浮层清空。
 *  9. 不破坏复制的关键：**从不修改宿主 DOM**，高亮是 Shadow DOM 里的覆盖块。
 */

import { buildConfig, SettingsStore, loadUserSettings } from './config.js';
import { DictionaryLookup } from './lookup.js';
import { Overlay, buildSettingsPanel, OVERLAY_EDGE_MARGIN, defaultHintText } from './overlay.js';
import {
  domWordAtPoint,
  domRoots,
  domInvalidateRoots,
  domBuildWordIndex,
  domBlockSignature,
} from './dom.js';
import { speak, stopSpeaking } from './speak.js';

const HOST_ID = 'dsh-word-hover-root';
const APP_ROOT_SELECTORS = ['#root', '#app', '[data-dsh-boot]', '#dsh-root'];
const TOOLTIP_MIN_BOTTOM_CLEARANCE = 72; // 输入框区域，避免浮层压住 composer

/** 诊断/排错代码绝不能因为环境差异而抛异常，统一用它兜住。 */
function safe(fn) {
  try { return fn(); } catch (error) { return `<err: ${error?.message || error}>`; }
}

/** 单调时钟；个别环境里 performance 不可用，退回 Date.now()。 */
function now() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

/** 从宿主 config 与 localStorage 合成初始配置。 */
function initialConfig(hostConfig) {
  let storage = null;
  try { storage = window.localStorage; } catch { storage = null; }
  const saved = loadUserSettings(storage);
  const config = buildConfig(hostConfig, saved);
  return { config, storage };
}

/** 把插件容器插到应用根节点里（不用 document.body 直挂，官方规范要求）。 */
function mountHostElement(doc) {
  const existing = doc.getElementById(HOST_ID);
  if (existing) return existing;

  const host = doc.createElement('div');
  host.id = HOST_ID;
  // 关键：容器本身不能拦截鼠标事件，只有浮层内部才可交互
  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483000;contain:layout style;';
  host.setAttribute('data-dsh-plugin', 'dsh-plugin-word-hover');

  // 优先插到应用根节点内部，保证层级在模态/抽屉之上
  let parent = null;
  for (const selector of APP_ROOT_SELECTORS) {
    parent = doc.querySelector(selector);
    if (parent) break;
  }
  (parent || doc.body).append(host);
  return host;
}

export function createWordHover({ config: hostConfig } = {}) {
  const { config, storage } = initialConfig(hostConfig);
  const settings = new SettingsStore(config, storage);

  let host = null;
  let overlay = null;
  let lookup = null;
  let panel = null;
  let controllers = [];
  let disposed = false;

  const state = {
    // 状态机：idle | hover | locked
    mode: 'idle',
    activeWord: null, // { word, raw, rects, block, signature }
    hoverTimer: 0,
    hideTimer: 0,
    /**
     * 兜底定时器：浮层连续可见超过这个时长就强制关闭。
     * 存在的意义是「任何未预料的路径都不能让浮层永久停留在鼠标下方」——
     * 可见的浮层是有命中区域的，卡住不消失就会挡住整页的滚动与点击。
     */
    maxVisibleTimer: 0,
    /** 最近一次「真实移动」的时间戳；只有停下 200ms 以上才允许查词 */
    lastMoveAt: 0,
    lastMovePoint: null,
    /** 已经为哪个词启动了延迟计时器，避免同一目标反复重置 */
    armedKey: '',
    pointerInTip: false,
    pointerOverActive: false,
    settingsOpen: false,
    wordIndexCache: new WeakMap(), // block -> { signature, index }
  };

  /** 浮层最长连续停留时间（毫秒）。锁定态不受此限制。 */
  const MAX_VISIBLE_MS = 20000;
  /** 小于这个位移视为「没动」（手抖 / 亚像素抖动）。 */
  const MOVE_EPSILON_PX = 3;
  /** 指针必须先停稳这么久，才允许开始查词计时（防止滑过时误触发）。 */
  const STILL_BEFORE_ARM_MS = 200;

  // ── 生命周期 ─────────────────────────────────────────────────────
  /** 最近一次拿到的插槽 API（apply(ctx) 时注入）。 */
  let slotsRef = null;

  /**
   * 启动运行时。slots 由 apply(ctx) 传入：只有 DSH 环境里才有插槽 API。
   * @param {object} [slotApi] ctx.slots
   */
  function apply(slotApi) {
    if (disposed) return;
    const current = settings.get();
    if (!current.enabled) { teardownRuntime(); return; }
    if (host?.isConnected) return; // 已经启用
    startRuntime(current, slotApi || slotsRef);
  }

  function startRuntime(current, slotApi) {
    slotsRef = slotApi || null;
    const doc = document;
    host = mountHostElement(doc);
    overlay = new Overlay(host);
    window.__DSH_WORD_HOVER__ = {
      openSettings,
      closeSettings,
      /** 中止在途请求并清空会话内临时状态（没有缓存可清） */
      abortAllRequests: () => lookup?.abortAll(),
      getConfig: () => settings.get(),
      setConfig: (patch) => settings.patch(patch),
      /** 紧急关闭：怀疑插件干扰页面时用这一行命令彻底停下它 */
      panic,
      /** 排错：返回插件运行态 + 覆盖层实际命中区域，用于定位「页面被挡住」的问题 */
      debug: () => ({
        roots: safe(() => ({ region: Boolean(domRoots(doc).region), scroll: Boolean(domRoots(doc).scroll) })),
        config: safe(() => settings.get()),
        activeWord: state.activeWord?.word ?? null,
        mode: state.mode,
        tipVisible: safe(() => overlay?.isTipVisible() ?? false),
        host: safe(() => {
          const el = doc.getElementById(HOST_ID);
          if (!el) return null;
          const cs = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return {
            pointerEvents: cs.pointerEvents,
            zIndex: cs.zIndex,
            rect: { w: Math.round(rect.width), h: Math.round(rect.height) },
          };
        }),
        tip: safe(() => {
          const el = overlay?.tip;
          if (!el) return null;
          const cs = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return {
            display: cs.display,
            pointerEvents: cs.pointerEvents,
            visible: el.dataset.visible || 'false',
            measuring: el.dataset.measuring || 'false',
            rect: {
              w: Math.round(rect.width), h: Math.round(rect.height),
              l: Math.round(rect.left), t: Math.round(rect.top),
            },
          };
        }),
        /** 屏幕中心点下方到底是谁——判断有没有东西挡在页面上 */
        elementAtCenter: safe(() => {
          const vw = doc.defaultView?.innerWidth ?? 0;
          const vh = doc.defaultView?.innerHeight ?? 0;
          if (!vw || !vh || typeof doc.elementFromPoint !== 'function') return null;
          const el = doc.elementFromPoint(Math.round(vw / 2), Math.round(vh / 2));
          if (!el) return null;
          const cls = typeof el.className === 'string' && el.className
            ? '.' + el.className.split(' ').slice(0, 2).join('.')
            : '';
          return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls}`;
        }),
        /**
         * 在指定视口坐标上做一次命中测试（只读）。
         * 用来验证「必须真的碰到单词才查词」：
         *   __DSH_WORD_HOVER__.debug().hitTest(100, 300)
         */
        hitTest: (x, y) => safe(() => {
          const config = settings.get();
          const hit = domWordAtPoint(Number(x), Number(y), config.excludeSelectors);
          if (!hit) return { hit: false };
          return {
            hit: true,
            word: hit.word,
            rect: {
              l: Math.round(hit.first.left), t: Math.round(hit.first.top),
              w: Math.round(hit.first.width), h: Math.round(hit.first.height),
            },
          };
        }),
      }),
    };

    lookup = new DictionaryLookup({ settings, hostUrl: location.origin });

    // 事件绑定：全部集中在 bindings 数组里，便于一次性解绑
    const bindings = [];
    const on = (target, type, handler, options) => {
      target.addEventListener(type, handler, options);
      bindings.push(() => target.removeEventListener(type, handler, options));
    };

    let rafId = 0;
    let lastPoint = null;
    on(doc, 'mousemove', (event) => {
      if (!settings.get().enabled) return;
      // 记录「最近一次真实移动」的时间：只有停下来才会触发查词。
      // 3px 的容差是为了忽略手抖与亚像素抖动，避免静止时被无限重置。
      const prev = state.lastMovePoint;
      if (!prev || Math.abs(event.clientX - prev.x) > MOVE_EPSILON_PX || Math.abs(event.clientY - prev.y) > MOVE_EPSILON_PX) {
        state.lastMoveAt = now();
        state.lastMovePoint = { x: event.clientX, y: event.clientY };
      }
      lastPoint = { x: event.clientX, y: event.clientY };
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        if (lastPoint) handlePointerMove(lastPoint.x, lastPoint.y);
      });
    }, { passive: true });

    on(doc, 'click', (event) => handleDocumentClick(event), true);
    on(doc, 'keydown', (event) => handleKeydown(event), true);
    on(window, 'scroll', () => reposition(), true);
    on(window, 'resize', () => reposition());

    // 浮层自身：进入浮层不关闭；在浮层上滚动时保持打开
    on(overlay.tip, 'mouseenter', () => {
      state.pointerInTip = true;
      state.pointerOverActive = false;
      cancelHide();
    });
    on(overlay.tip, 'mouseleave', () => {
      state.pointerInTip = false;
      scheduleHide();
    });

    // 设置变更：立即反映到运行时（DictionaryLookup 自己订阅了并发与失败抑制时长）
    const unsubscribe = settings.subscribe((next) => {
      if (!next.enabled) teardownRuntime();
      else if (!host?.isConnected) apply();
    });

    controllers.push({
      dispose() {
        unsubscribe();
        for (const off of bindings.splice(0)) off();
        if (rafId) window.cancelAnimationFrame(rafId);
      },
    });

    // 注册设置入口（挂进 composer 底栏的不可见标记；同时提供全局 API）
    if (slotApi) registerSlotEntry(slotApi);
  }

  function teardownRuntime() {
    cancelHover();
    cancelHide();
    cancelMaxVisible();
    state.mode = 'idle';
    state.activeWord = null;
    state.pointerInTip = false;
    state.pointerOverActive = false;
    closeSettings();
    for (const controller of controllers.splice(0)) controller.dispose();
    try { lookup?.dispose(); } catch { /* 忽略 */ }
    lookup = null;
    try { overlay?.destroy(); } catch { /* 忽略 */ }
    overlay = null;
    host?.remove();
    host = null;
    delete window.__DSH_WORD_HOVER__;
  }

  /**
   * 紧急关闭：一次性卸载运行时，并记住用户偏好。
   * 暴露给控制台，在怀疑插件干扰页面时可以用一行命令彻底停下它。
   */
  function panic() {
    try { settings.patch({ enabled: false }); } catch { /* 存储不可用也要继续卸载 */ }
    teardownRuntime();
    return 'dsh-plugin-word-hover 已停止运行（可在设置里重新开启）';
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    teardownRuntime();
  }

  // ── 指针处理 ─────────────────────────────────────────────────────
  let nodeIdSeq = 0;

  /** 为一个命中结果生成稳定标识，用于判断「指针是否还停在同一个词上」。 */
  function hitKey(hit) {
    const sc = hit.range?.startContainer;
    const nodeId = sc && typeof sc === 'object'
      ? (sc.__dshWhId ?? (sc.__dshWhId = ++nodeIdSeq))
      : 0;
    return `${hit.word}:${nodeId}:${hit.range?.startOffset ?? -1}`;
  }

  /** 浮层是否处在「钳制态」（连最矮的可读高度都放不下，只能压住锚点显示）。 */
  function isClamped() {
    return overlay?.tip?.dataset?.side === 'clamp';
  }

  function handlePointerMove(x, y) {
    const current = settings.get();
    if (!current.enabled || state.settingsOpen) return;

    const hit = domWordAtPoint(x, y, current.excludeSelectors);

    // 没命中（含「在词与词之间」「在行距里」「不在助手回复里」）：
    // 立刻取消待触发的计时器，这样鼠标扫过一行英文时不会累积出误触发。
    if (!hit) {
      state.pointerOverActive = false;
      state.armedKey = '';
      cancelHover();
      // 钳制态下浮层压住了锚点单词，鼠标几乎立刻"脱离"命中区。
      // 此时不能自动关闭，否则用户根本读不完 —— 改为只能 Esc / 点外部关闭。
      if (state.mode === 'hover' && !isClamped()) scheduleHide();
      return;
    }
    state.pointerOverActive = true;

    // 已锁定时不切换词条，除非又点了一次（点击由 click 处理）
    if (state.mode === 'locked') return;

    const key = hitKey(hit);

    // 正在显示的就是这个词：什么都不用做
    const showingThisWord = state.activeWord
      && state.activeWord.word === hit.word
      && state.activeWord.block === hit.block
      && state.activeWord.range?.startContainer === hit.range.startContainer
      && state.activeWord.range?.startOffset === hit.range.startOffset;
    if (showingThisWord) {
      state.armedKey = key;
      cancelHide();
      return;
    }

    // 指针还停在同一个词上且已经在等待：不要反复重置
    if (state.armedKey === key) {
      cancelHide();
      return;
    }

    if (current.trigger === 'click') {
      // 点击模式：只更新待点击目标，不自动弹层
      state.pendingHit = hit;
      state.armedKey = key;
      return;
    }

    // ★ 只有「指针停下来」才启动查词计时。
    //   鼠标持续滑动时 lastMoveAt 一直被刷新，pollStill 会一直重排，
    //   永远不会触发 —— 所以慢慢滑过一行英文也不会弹释义，必须真的停下。
    state.armedKey = key;
    pollStill(key, hit);
  }

  /**
   * 轮询等待指针停稳。
   *
   * 用轮询而不是一次性 setTimeout，是因为「停稳」是相对当前时刻判断的：
   * 定时器每轮重新读 lastMoveAt，只要还在移动就继续等，直到真的停下
   * STILL_BEFORE_ARM_MS 之后才交给 armHover 去做 hoverDelayMs 延迟。
   */
  function pollStill(key, hit) {
    if (state.armedKey !== key) return; // 已经移到别处
    cancelHover();
    state.hoverTimer = window.setTimeout(() => {
      state.hoverTimer = 0;
      if (state.armedKey !== key || state.mode === 'locked' || state.settingsOpen) return;
      if (!settings.get().enabled) return;
      const stillMs = now() - state.lastMoveAt;
      if (stillMs < STILL_BEFORE_ARM_MS) { pollStill(key, hit); return; }
      armHover(hit);
    }, STILL_BEFORE_ARM_MS);
  }

  function armHover(hit) {
    cancelHover();
    const delay = settings.get().hoverDelayMs;
    state.hoverTimer = window.setTimeout(() => {
      state.hoverTimer = 0;
      // 计时期间指针必须仍然停在这个词上（状态机每一层都做一次校验）
      if (state.armedKey !== hitKey(hit)) return;
      if (state.mode === 'locked' || state.settingsOpen) return;
      if (!settings.get().enabled) return;
      state.armedKey = '';
      activate(hit);
    }, delay);
  }

  function cancelHover() {
    if (state.hoverTimer) { window.clearTimeout(state.hoverTimer); state.hoverTimer = 0; }
  }

  function cancelHide() {
    if (state.hideTimer) { window.clearTimeout(state.hideTimer); state.hideTimer = 0; }
  }

  /** 启动/刷新兜底定时器：浮层可见期间不会永久卡住。 */
  function armMaxVisible() {
    cancelMaxVisible();
    state.maxVisibleTimer = window.setTimeout(() => {
      state.maxVisibleTimer = 0;
      if (state.mode === 'locked') return; // 锁定态是用户显式要求保持的
      if (overlay?.isTipVisible()) deactivate();
    }, MAX_VISIBLE_MS);
  }

  function cancelMaxVisible() {
    if (state.maxVisibleTimer) { window.clearTimeout(state.maxVisibleTimer); state.maxVisibleTimer = 0; }
  }

  function scheduleHide() {
    cancelHide();
    // 钳制态 / 锁定态只能显式关闭（Esc、点外部、点锁定按钮）
    if (state.mode === 'locked' || isClamped()) return;
    const delay = settings.get().hideDelayMs;
    state.hideTimer = window.setTimeout(() => {
      state.hideTimer = 0;
      // 鼠标可能在延迟期间回到了单词或浮层上
      if (state.pointerInTip || state.pointerOverActive) return;
      if (state.mode === 'locked') return;
      deactivate();
    }, delay);
  }

  function deactivate() {
    cancelHover();
    cancelHide();
    cancelMaxVisible();
    state.mode = 'idle';
    state.activeWord = null;
    state.pendingHit = null;
    overlay?.hide();
    stopSpeaking();
  }

  /** 激活一个词：先画高亮 + 骨架，再异步取释义。 */
  async function activate(hit) {
    if (!overlay || !lookup) return;
    state.mode = 'hover';
    state.activeWord = {
      word: hit.word,
      raw: hit.raw,
      block: hit.block,
      range: hit.range,
      rects: hit.rects,
      signature: domBlockSignature(hit.block),
    };
    // 无论后面走哪条分支、无论异步是否返回，浮层都不会永久停在鼠标下方
    armMaxVisible();

    overlay.showHighlight(hit.rects, { locked: false });

    // 每次查词都真实请求上游：不读缓存、不写缓存。
    // 主源的权利人条款禁止缓存返回数据，因此这里连"先显示旧结果"的路径都没有。
    overlay.showLoading(hit.word);
    overlay.position(hit.rects[0]);
    const info = await lookup.lookup(hit.word);
    // 期间可能已经切词/关闭，校验后再渲染
    if (state.mode === 'idle' || state.activeWord?.word !== hit.word) return;
    if (state.activeWord.block !== hit.block) return;
    renderInfo(hit, info);
  }

  function renderInfo(hit, info) {
    if (!overlay) return;
    const config = settings.get();
    overlay.showInfo(info, {
      options: config,
      speak: config.speakEnabled,
      locked: state.mode === 'locked',
      stale: false,
    });
    overlay.position(hit.rects[0]);
    overlay.mountHeaderActions({
      canSpeak: config.speakEnabled && Boolean(info.word),
      locked: state.mode === 'locked',
      onSpeak: () => speakWord(info),
      onToggleLock: () => toggleLock(),
    });
  }

  /**
   * 朗读并给出可见反馈。
   *
   * 以前这里只是 `speak(...)` 一把梭：语音合成静默失败时用户完全不知道发生了什么
   * （「点了没反应」）。现在把状态写回浮层底部，失败时明确提示。
   */
  function speakWord(info) {
    const word = info.word;
    speak(word, info.audio, {
      onStatus(status) {
        const hint = overlay?.body.querySelector('.dsh-wh-hint');
        if (!hint) return;
        if (status === 'speaking') hint.textContent = `正在朗读「${word}」…`;
        else if (status === 'audio') hint.textContent = `正在播放「${word}」的录音…`;
        else hint.textContent = `无法朗读「${word}」：系统没有可用的英语语音，且没有可用的音频`;
        // 几秒后回到常规提示
        window.setTimeout(() => {
          const current = overlay?.body.querySelector('.dsh-wh-hint');
          if (current && current.textContent.startsWith('正在')) {
            current.textContent = defaultHintText({ locked: state.mode === 'locked' });
          }
        }, 2600);
      },
    });
  }

  // ── 锁定与关闭 ───────────────────────────────────────────────────
  function lock() {
    if (!state.activeWord || !overlay) return;
    // 锁定时把浮层往上提一点，避免压住输入区
    const rects = state.activeWord.rects;
    state.mode = 'locked';
    overlay.showHighlight(rects, { locked: true });
    overlay.position(rects[0]);
    const hint = overlay.body.querySelector('.dsh-wh-hint');
    if (hint) hint.textContent = defaultHintText({ locked: true });
    const lockBtn = overlay.body.querySelector('.dsh-wh-header-actions .dsh-wh-btn[aria-pressed]');
    if (lockBtn) {
      lockBtn.textContent = '🔒 已锁定';
      lockBtn.setAttribute('aria-pressed', 'true');
      lockBtn.setAttribute('aria-label', '取消锁定浮层');
    }
  }

  function toggleLock() {
    if (state.mode === 'locked') {
      state.mode = 'hover';
      if (overlay) {
        overlay.showHighlight(state.activeWord?.rects ?? [], { locked: false });
        const hint = overlay.body.querySelector('.dsh-wh-hint');
        if (hint) hint.textContent = defaultHintText({ locked: false });
        const lockBtn = overlay.body.querySelector('.dsh-wh-header-actions .dsh-wh-btn[aria-pressed]');
        if (lockBtn) {
          lockBtn.textContent = '🔓 锁定';
          lockBtn.setAttribute('aria-pressed', 'false');
          lockBtn.setAttribute('aria-label', '锁定浮层');
        }
      }
      scheduleHide();
    } else {
      lock();
    }
  }

  /**
   * 点击事件是否来自本插件自己的 UI（浮层 / 高亮 / 设置面板）。
   *
   * ⚠️ 必须用 composedPath() 而不是 event.target：Shadow DOM 会把事件从内部
   *    重定向到宿主元素，target 在浮层内部时只会指向 #dsh-word-hover-root，
   *    只看 target 无法区分「点了浮层里的按钮」和「点了别的空白处」。
   */
  function isOwnUiClick(event) {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    if (overlay?.host && path.includes(overlay.host)) return true;
    if (panel && path.includes(panel)) return true;
    const target = event.target;
    if (target instanceof Element) {
      if (overlay && (overlay.containsTip(target) || overlay.containsHighlight(target))) return true;
      if (target.closest?.('.dsh-wh-panel')) return true;
    }
    return false;
  }

  function handleDocumentClick(event) {
    const config = settings.get();
    if (!config.enabled) return;

    // 点击落在插件自己的 UI 内部：不关闭浮层，也不做任何命中测试
    if (isOwnUiClick(event)) return;

    const hit = domWordAtPoint(event.clientX, event.clientY, config.excludeSelectors);
    if (hit) {
      // 点同一个词：切换锁定；点新词：锁定到新词
      if (state.mode === 'locked' && state.activeWord?.word === hit.word) {
        toggleLock();
        return;
      }
      if (config.lockOnClick) {
        cancelHover();
        void activate(hit).then(() => lock());
        return;
      }
      armHover(hit);
      return;
    }

    // 点击外部空白：关闭
    if (state.mode !== 'idle') {
      if (state.mode === 'locked') state.mode = 'hover';
      deactivate();
    }
  }

  function handleKeydown(event) {
    const config = settings.get();
    if (!config.enabled) return;

    if (event.key === 'Escape' && overlay?.isTipVisible()) {
      if (state.mode === 'locked') { toggleLock(); return; }
      deactivate();
      return;
    }

    // 键盘路径：Tab 聚焦到回复里的单词
    if (event.key === 'Tab' && overlay?.isTipVisible()) {
      const direction = event.shiftKey ? -1 : 1;
      if (focusAdjacentWord(direction)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
  }

  /** 键盘导航：在同一回复块内前进/后退一个单词。 */
  function focusAdjacentWord(direction) {
    if (!state.activeWord) return false;
    const block = state.activeWord.block;
    const config = settings.get();
    let cached = state.wordIndexCache.get(block);
    const signature = domBlockSignature(block);
    if (!cached || cached.signature !== signature) {
      cached = { signature, index: domBuildWordIndex(block, config.excludeSelectors) };
      state.wordIndexCache.set(block, cached);
    }
    const index = cached.index;
    if (index.length === 0) return false;

    const currentKey = state.activeWord.range.startContainer;
    let at = index.findIndex(
      (item) => item.node === currentKey
        && item.range.startOffset === state.activeWord.range.startOffset,
    );
    void currentKey;
    if (at < 0) {
      // 找不到就按纵向位置就近取一个
      const top = state.activeWord.rects[0]?.top ?? 0;
      at = index.findIndex((item) => item.rects[0].top >= top);
      if (at < 0) at = 0;
    }
    const next = index[Math.max(0, Math.min(index.length - 1, at + direction))];
    if (!next) return false;

    const hit = {
      word: next.word,
      raw: next.raw,
      block,
      range: next.range,
      rects: next.rects,
    };
    state.mode = 'hover';
    void activate(hit).then(() => {
      // 键盘路径要能看见并操作，所以聚焦到浮层里的第一个按钮
      overlay?.body.querySelector('.dsh-wh-header-actions .dsh-wh-btn')?.focus?.();
    });
    return true;
  }

  function reposition() {
    if (!state.activeWord || !overlay) return;
    // 滚动会让单词矩形失效，重新测一次
    const rects = measureSavedRange(state.activeWord.range);
    if (rects.length > 0) {
      state.activeWord.rects = rects;
      overlay.showHighlight(rects, { locked: state.mode === 'locked' });
      overlay.position(rects[0]);
    } else if (state.mode !== 'locked') {
      deactivate();
    }
  }

  function measureSavedRange(range) {
    try {
      const raw = range.getClientRects();
      const out = [];
      for (let i = 0; i < raw.length; i += 1) {
        if (raw[i].width > 0 && raw[i].height > 0) out.push(raw[i]);
        if (out.length >= 3) break;
      }
      return out;
    } catch { return []; }
  }

  // ── 设置面板 ─────────────────────────────────────────────────────
  function openSettings() {
    if (!overlay || state.settingsOpen) return;
    state.settingsOpen = true;
    deactivate();
    const doc = document;
    panel = buildSettingsPanel(doc, settings.get(), {
      onChange: (patch) => settings.patch(patch),
      onClose: closeSettings,
    });

    panel.style.pointerEvents = 'auto';
    overlay.shadow.append(panel);

    // Esc 与点击遮罩关闭
    panel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.stopPropagation(); closeSettings(); }
    });
    panel.addEventListener('click', (event) => {
      if (event.target === panel) closeSettings();
    });
    panel.querySelector('button')?.focus?.();
  }

  function closeSettings() {
    state.settingsOpen = false;
    if (panel) {
      panel.remove();
      panel = null;
    }
    if (overlay) invalidateRootsIfNeeded();
  }

  function invalidateRootsIfNeeded() {
    // 设置面板关闭后 DOM 结构没变，这里只做一次廉价校验
    if (!document.querySelector('[data-conversation-region="chat"]')) domInvalidateRoots();
  }

  // ── DSH 插槽接线 ─────────────────────────────────────────────────
  /**
   * 注册一个不可见的插槽条目，用来确认客户端插件已被 DSH 加载，
   * 并持有 openSettings 的引用。DSH 客户端插件没有公开的「注册设置项」API，
   * 所以设置入口同时通过 window.__DSH_WORD_HOVER__.openSettings() 暴露。
   */
  function registerSlotEntry(slotApi) {
    const tryKeys = ['conversation.composer.dock', 'conversation.input.dock', 'shell.overlay'];
    for (const key of tryKeys) {
      try {
        const dispose = slotApi.inject(key, () => slotApi.register({
          name: key,
          id: 'dsh-word-hover-marker',
          order: 999,
        }, () => null));
        if (typeof dispose === 'function') controllers.push({ dispose });
        return;
      } catch { /* 该插槽在这个 DSH 版本里不存在，试下一个 */ }
    }
  }

  return {
    inject: ['slots'],
    apply(ctx) {
      const slotApi = ctx?.slots ?? null;
      applyRuntime(slotApi);
      slotsRef = slotApi;
      // 交给 Cordis 管理生命周期：插件卸载/禁用时自动回收
      try {
        return ctx?.effect?.(() => () => dispose(), 'dsh-word-hover');
      } catch {
        return undefined;
      }
    },
    /** 供测试与非 DSH 环境直接驱动 */
    start: (slotApi) => applyRuntime(slotApi),
    stop: dispose,
    /** 紧急关闭（同时会把 enabled 记成 false） */
    panic,
    settings,
    getState: () => state,
  };

  /** 与上一层的 apply 区分名字，避免混淆 */
  function applyRuntime(slotApi) {
    apply(slotApi);
  }
}

// 供测试脚本与排错使用的再导出（打包后由 tools/build.mjs 汇总）
export const EDGE_MARGIN = OVERLAY_EDGE_MARGIN;
export const SIDE_CLEARANCE = TOOLTIP_MIN_BOTTOM_CLEARANCE;
