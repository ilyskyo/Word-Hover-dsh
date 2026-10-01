/**
 * dsh-plugin-word-hover —— 客户端 bundle（由 tools/build.mjs 生成，请勿手改）
 *
 * 生成时间：2026-10-01T15:17:31.691Z
 * 源文件：src/client/{config,word,lru,styles,render,dom,cache,speak,lookup,overlay,index}.js
 *
 * 契约：id 必须等于 npm 包名；factory 惰性执行；返回 { inject, apply(ctx) }。
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-word-hover',
  factory: function () {
    'use strict';

  // ══ config.js ═══════════════════════════════════════════════════
  const __Config = (() => {
    /**
     * 配置默认值、清洗与持久化偏好存储。
     *
     * 设计要点：
     *  - 宿主端 config（cordis.patch.yml）提供「初始化默认值」；
     *  - 用户在设置面板里的改动存 localStorage，下次启动覆盖宿主端默认值；
     *  - 只允许改「用户可见」的字段；代理限流等宿主端字段不允许被前端篡改。
     */

    /**
     * 宿主端 Cordis 配置的默认值（与 cordis.patch.yml 保持一致）。
     *
     * 配置里没有存储类选项：释义只在本次调用链路里流转，不写入任何地方。
     */
    const HOST_DEFAULTS = Object.freeze({
      enabled: true,
      targetLang: 'zh-CN',
      trigger: 'hover',
      hoverDelayMs: 240,
      hideDelayMs: 250,
      lockOnClick: true,
      speakEnabled: true,
      provider: 'youdao',
      fallbackProviders: ['suggest', 'freedict'],
      timeoutMs: 8000,
      concurrency: 4,
      lookupPath: '/word-hover/dict',
      allowDirectFallback: false,
      /**
       * 失败抑制时长：上游答复「查不到」的词，在这段时间内不再重复请求。
       * 设为 0 表示从不抑制，每个词都重新请求。
       */
      missSuppressMs: 300000,
      proxy: true,
      proxyRateLimitPerMinute: 120,
      /** 发音口音：'us' 美音（默认）| 'uk' 英音。也决定朗读用哪个音标对应的录音。 */
      accent: 'us',
      /** 音标显示：'no' 不显示 | 'us' 只显示美音 | 'uk' 只显示英音 | 'both' 英美都显示 */
      phoneticDisplay: 'us',
      showPartOfSpeech: true,
      showDefinition: true,
      showExample: true,
      /** 话题 · 标签：单独成行显示 */
      showTags: true,
      showSource: true,
      excludeSelectors: [],
    });

    /**
     * 允许前端设置面板修改并持久化的字段。
     * 注意 enabled 也在其中：它是「运行时可覆盖」的总开关，
     * 用户在设置面板关掉后必须能在刷新后保持关闭。
     * overflow 菜单里的选项也走这里，这样用户改了就能记住。
     */
    const USER_EDITABLE_KEYS = Object.freeze([
      'enabled',
      'trigger',
      'hoverDelayMs',
      'hideDelayMs',
      'lockOnClick',
      'speakEnabled',
      'provider',
      'accent',
      'phoneticDisplay',
      'showPartOfSpeech',
      'showDefinition',
      'showExample',
      'showTags',
      'showSource',
    ]);

    const STORAGE_KEY = 'dsh-plugin-word-hover:settings:v1';

    const TRIGGERS = new Set(['hover', 'click']);
    const PROVIDERS = new Set(['youdao', 'freedict', 'suggest', 'custom', 'auto']);
    const ACCENTS = new Set(['us', 'uk']);
    const PHONETIC_DISPLAY = new Set(['no', 'us', 'uk', 'both']);

    /** 把任意输入夹到合法区间。 */
    function clampNumber(value, min, max, fallback) {
      const n = Number(value);
      if (!Number.isFinite(n)) return fallback;
      return Math.min(max, Math.max(min, n));
    }

    /** 清洗布尔值：非布尔一律退回默认值（避免字符串 "false" 被当成真）。 */
    function asBool(value, fallback) {
      return typeof value === 'boolean' ? value : fallback;
    }

    function asEnum(value, allowed, fallback) {
      return typeof value === 'string' && allowed.has(value) ? value : fallback;
    }

    /**
     * 把宿主端 config 与用户偏好合并成一份可信配置。
     * @param {unknown} hostConfig 来自 ctx.config（可能是任意形状）
     * @param {unknown} saved 来自 localStorage 的用户偏好
     * @returns 完整、已校验的配置对象
     */
    function buildConfig(hostConfig, saved) {
      const host = hostConfig && typeof hostConfig === 'object' ? hostConfig : {};
      const user = saved && typeof saved === 'object' ? saved : {};
      const merged = { ...host, ...user };

      const fallbackProviders = Array.isArray(merged.fallbackProviders)
        ? merged.fallbackProviders.filter((p) => typeof p === 'string' && p.length > 0).slice(0, 6)
        : HOST_DEFAULTS.fallbackProviders.slice();

      const excludeSelectors = Array.isArray(merged.excludeSelectors)
        ? merged.excludeSelectors.filter((s) => typeof s === 'string' && s.trim().length > 0).slice(0, 32)
        : [];

      return Object.freeze({
        enabled: asBool(merged.enabled, HOST_DEFAULTS.enabled),
        targetLang: typeof merged.targetLang === 'string' && merged.targetLang ? merged.targetLang : HOST_DEFAULTS.targetLang,
        trigger: asEnum(merged.trigger, TRIGGERS, HOST_DEFAULTS.trigger),
        hoverDelayMs: clampNumber(merged.hoverDelayMs, 0, 2000, HOST_DEFAULTS.hoverDelayMs),
        hideDelayMs: clampNumber(merged.hideDelayMs, 0, 5000, HOST_DEFAULTS.hideDelayMs),
        lockOnClick: asBool(merged.lockOnClick, HOST_DEFAULTS.lockOnClick),
        speakEnabled: asBool(merged.speakEnabled, HOST_DEFAULTS.speakEnabled),
        provider: asEnum(merged.provider, PROVIDERS, HOST_DEFAULTS.provider),
        fallbackProviders,
        timeoutMs: clampNumber(merged.timeoutMs, 1000, 30000, HOST_DEFAULTS.timeoutMs),
        concurrency: clampNumber(merged.concurrency, 1, 8, HOST_DEFAULTS.concurrency),
        lookupPath: typeof merged.lookupPath === 'string' && merged.lookupPath ? merged.lookupPath : HOST_DEFAULTS.lookupPath,
        allowDirectFallback: asBool(merged.allowDirectFallback, HOST_DEFAULTS.allowDirectFallback),
        missSuppressMs: clampNumber(merged.missSuppressMs, 0, 3600000, HOST_DEFAULTS.missSuppressMs),
        proxy: asBool(merged.proxy, HOST_DEFAULTS.proxy),
        proxyRateLimitPerMinute: clampNumber(
          merged.proxyRateLimitPerMinute, 10, 6000, HOST_DEFAULTS.proxyRateLimitPerMinute,
        ),
        showPartOfSpeech: asBool(merged.showPartOfSpeech, HOST_DEFAULTS.showPartOfSpeech),
        showDefinition: asBool(merged.showDefinition, HOST_DEFAULTS.showDefinition),
        showExample: asBool(merged.showExample, HOST_DEFAULTS.showExample),
        showTags: asBool(merged.showTags, HOST_DEFAULTS.showTags),
        showSource: asBool(merged.showSource, HOST_DEFAULTS.showSource),
        accent: asEnum(merged.accent, ACCENTS, HOST_DEFAULTS.accent),
        phoneticDisplay: asEnum(merged.phoneticDisplay, PHONETIC_DISPLAY, HOST_DEFAULTS.phoneticDisplay),
        excludeSelectors,
      });
    }

    /** 从 localStorage 读用户偏好；读不到或损坏都返回 null。 */
    function loadUserSettings(storage) {
      try {
        const raw = storage?.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
      } catch {
        return null; // 存储被禁用或 JSON 损坏，都退回默认值
      }
    }

    /** 只抽出允许用户改的字段再落盘，防止把宿主端字段写进浏览器存储。 */
    function pickUserSettings(config) {
      const out = {};
      for (const key of USER_EDITABLE_KEYS) out[key] = config[key];
      return out;
    }

    function saveUserSettings(storage, config) {
      try {
        storage?.setItem(STORAGE_KEY, JSON.stringify(pickUserSettings(config)));
        return true;
      } catch {
        return false; // 隐私模式 / 配额满：不影响功能，只是不持久化
      }
    }

    const SETTINGS_STORAGE_KEY = STORAGE_KEY;

    /** 订阅式配置存储：设置面板改一次，所有消费者立刻拿到新值。 */
    class SettingsStore {
      constructor(config, storage) {
        this.storage = storage;
        this.config = config;
        this.listeners = new Set();
      }

      get() {
        return this.config;
      }

      /** 局部更新：只接受 USER_EDITABLE_KEYS 里的键。 */
      patch(partial) {
        const clean = {};
        for (const key of USER_EDITABLE_KEYS) {
          if (partial && Object.prototype.hasOwnProperty.call(partial, key)) clean[key] = partial[key];
        }
        if (Object.keys(clean).length === 0) return this.config;
        this.config = buildConfig({ ...this.config, ...clean }, null);
        saveUserSettings(this.storage, this.config);
        for (const fn of this.listeners) {
          try { fn(this.config); } catch { /* 单个订阅者出错不影响其它订阅者 */ }
        }
        return this.config;
      }

      subscribe(fn) {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
      }
    }

  return { HOST_DEFAULTS, USER_EDITABLE_KEYS, buildConfig, loadUserSettings, pickUserSettings, saveUserSettings, SettingsStore, SETTINGS_STORAGE_KEY, clampNumber };
  })();

  // ══ word.js ═════════════════════════════════════════════════════
  const __Word = (() => {
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
    const MAX_WORD_LENGTH = 32;

    /** 需要整块跳过的标签：脚本、样式、输入、代码、公式。 */
    const SKIP_TAGS = Object.freeze([
      'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION',
      'CODE', 'PRE', 'KBD', 'SAMP', 'VAR', 'TT', 'SVG', 'MATH', 'CANVAS',
    ]);

    /** 需要跳过的祖先类名（DSH 全局类名，跨构建稳定）。 */
    const SKIP_CLASS_SELECTOR = [
      '.md-code-block', // 代码块
      '.katex', // 数学公式
      '.katex-display',
      '[data-code-block-content]',
      '[data-code-block-banner]',
      '.dsh-wh-layer', // 本插件自己的浮层
    ].join(',');

    /** 把原始文本规范化：小写、去掉首尾符号。 */
    function normalizeWord(raw) {
      if (typeof raw !== 'string') return '';
      return raw
        .replace(/^[\s'"“”‘’(\[{<]+/, '')
        .replace(/[\s'"“”‘’)\]}>.,;:!?]+$/, '')
        .toLowerCase();
    }

    /** 是否值得为一个词发起查询。 */
    function isLookupCandidate(word) {
      if (!word || word.length < 2 || word.length > MAX_WORD_LENGTH) return false;
      if (!/[a-z\u00C0-\u024F]/.test(word)) return false; // 必须含字母
      if (/^\d+$/.test(word)) return false;
      // 与宿主端校验规则保持一致，避免「客户端能识别、服务端拒绝」的不一致
      if (!/^[a-z\u00C0-\u024F][a-z0-9\u00C0-\u024F'\u2019-]*$/.test(word)) return false;
      return true;
    }

    /** 只保留最长的一段；caretRangeFromPoint 偶尔会返回跨行的巨大 range，这里兜底。 */
    function trimToSingleWord(text) {
      if (typeof text !== 'string' || text.length > 512) return '';
      const matches = text.match(WORD_RE);
      if (!matches || matches.length === 0) return '';
      return matches.length === 1 ? matches[0] : matches[0];
    }

    /** 从一段文本节点内容里，找出覆盖 [offset] 位置的那个单词及其起止下标。 */
    function wordAtOffset(text, offset) {
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
    function allWordsIn(text) {
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
    const HIT_INSET_TOP = 0.14;
    const HIT_INSET_BOTTOM = 0.06;

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
    function pointHitsRects(x, y, rects) {
      if (!Array.isArray(rects) || rects.length === 0) return false;
      for (const rect of rects) {
        if (!rect || rect.width <= 0 || rect.height <= 0) continue;
        const top = rect.top + rect.height * HIT_INSET_TOP;
        const bottom = rect.bottom - rect.height * HIT_INSET_BOTTOM;
        if (x >= rect.left && x <= rect.right && y >= top && y <= bottom) return true;
      }
      return false;
    }

  return { MAX_WORD_LENGTH, SKIP_TAGS, SKIP_CLASS_SELECTOR, normalizeWord, isLookupCandidate, trimToSingleWord, wordAtOffset, allWordsIn, pointHitsRects, HIT_INSET_TOP, HIT_INSET_BOTTOM };
  })();

  // ══ lru.js ══════════════════════════════════════════════════════
  const __Lru = (() => {
    /**
     * 一个极小的 LRU：给容量有限的内存表用，避免长会话里无限增长。
     * 依赖 Map 的插入顺序做「最近使用」排序。
     */
    class LruMap {
      constructor(limit = 500) {
        this.limit = Math.max(1, limit | 0);
        this.map = new Map();
      }

      has(key) {
        return this.map.has(key);
      }

      get(key) {
        if (!this.map.has(key)) return undefined;
        const value = this.map.get(key);
        this.map.delete(key); // 重新插入 = 标记为最近使用
        this.map.set(key, value);
        return value;
      }

      set(key, value) {
        if (this.map.has(key)) this.map.delete(key);
        this.map.set(key, value);
        while (this.map.size > this.limit) {
          const oldest = this.map.keys().next();
          if (oldest.done) break;
          this.map.delete(oldest.value);
        }
        return value;
      }

      delete(key) {
        return this.map.delete(key);
      }

      clear() {
        this.map.clear();
      }

      get size() {
        return this.map.size;
      }

      keys() {
        return this.map.keys();
      }
    }

  return { LruMap };
  })();

  // ══ styles.js ═══════════════════════════════════════════════════
  const __Styles = (() => {
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
    const OVERLAY_CSS = `
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

    /* ── 话题 · 标签（单独成行） ───────────────────────────────────── */
    .dsh-wh-tags {
      display: flex;
      align-items: baseline;
      gap: 6px;
      margin: 0 0 8px;
      padding: 4px 7px;
      border-radius: var(--dsw-radius-sm, 6px);
      background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.04));
      font-size: 11px;
      line-height: 1.5;
    }
    .dsh-wh-tags-label {
      flex: 0 0 auto;
      color: var(--dsw-alias-label-tertiary, #81858c);
      white-space: nowrap;
    }
    .dsh-wh-tags-list {
      color: var(--dsw-alias-label-secondary, #61666b);
      word-break: break-word;
    }

    /* 英美音标同时显示时，用淡色区分标记 */
    .dsh-wh-phonetic[data-accent]::before {
      content: attr(data-accent);
      font-size: 9px;
      text-transform: uppercase;
      opacity: 0.55;
      margin-right: 2px;
      font-family: var(--dsw-font-family, sans-serif);
    }

    /* ── 纵向溢出菜单（竖三点） ────────────────────────────────────── */
    .dsh-wh-btn-icon {
      /* 图标按钮：等宽正方形，避免竖向省略号把行高撑开 */
      padding: 4px 5px;
      font-size: 14px;
      line-height: 1;
      min-width: 24px;
      text-align: center;
    }
    .dsh-wh-menu {
      position: fixed;
      z-index: 2147483001;
      min-width: 200px;
      max-width: min(300px, calc(100vw - 16px));
      max-height: calc(100vh - 16px);
      overflow-y: auto;
      padding: 4px;
      pointer-events: auto;
      border-radius: var(--dsw-radius-lg, 10px);
      border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12));
      background: var(--dsw-specific-menu, var(--dsw-menu-surface-fill, #ffffff));
      -webkit-backdrop-filter: var(--dsw-menu-backdrop-filter, none);
      backdrop-filter: var(--dsw-menu-backdrop-filter, none);
      box-shadow: var(--dsw-shadow-lv3, 0 8px 28px rgba(0, 0, 0, 0.18));
      font-size: 12px;
    }
    @media (prefers-color-scheme: dark) {
      .dsh-wh-menu { background: var(--dsw-specific-menu, #2a2b2d); }
    }
    .dsh-wh-menu-group {
      padding: 6px 8px 3px;
      font-size: 10px;
      color: var(--dsw-alias-label-tertiary, #81858c);
      text-transform: none;
    }
    .dsh-wh-menu-item {
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
      padding: 6px 8px;
      border: none;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: left;
      border-radius: var(--dsw-radius-sm, 6px);
      cursor: pointer;
    }
    .dsh-wh-menu-item:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06)); }
    .dsh-wh-menu-item:focus-visible {
      outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, #4d6bfe);
      outline-offset: -1px;
    }
    .dsh-wh-menu-check {
      flex: 0 0 12px;
      width: 12px;
      color: var(--dsw-alias-brand-primary, #4d6bfe);
      font-size: 11px;
    }
    .dsh-wh-menu-text { flex: 1 1 auto; }

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

  return { OVERLAY_CSS };
  })();

  // ══ menu.js ═════════════════════════════════════════════════════
  const __Menu = (() => {
    /**
     * 浮层里的纵向溢出菜单（竖三点 → 下拉选项）。
     *
     * 用途：把「不常用但想改」的设置项收进来，避免浮层头部堆满按钮。
     * 目前里面有发音口音选择与几个显示开关，后续加设置项只需往 items 里加一条。
     *
     * 设计要点：
     *  - 菜单与浮层同在一个 Shadow DOM 里，样式天然隔离；
     *  - 用 position: fixed 定位在触发器旁边，超出视口会自动翻转/夹取；
     *  - 支持键盘：Enter/Space 打开、Esc 关闭、上下键移动、右键收起；
     *  - 点外部关闭；选择后保持打开（用户常连续改多项）。
     */

    /** 单个菜单项的描述。 */
    // {
    //   id: string,
    //   type: 'group' | 'radio' | 'checkbox',
    //   label: string,
    //   options?: Array<{ value: string, label: string }>,  // radio 用
    //   value?: string | boolean,                            // 当前值
    //   disabled?: boolean,
    // }

    /** 菜单与触发器之间的间距。 */
    const MENU_GAP = 4;
    /** 菜单与视口边缘的最小距离。 */
    const MENU_EDGE = 8;

    class OverflowMenu {
      /**
       * @param {HTMLElement} shadowRoot 浮层所在的 shadow root（菜单挂在这里）
       * @param {Document} doc
       */
      constructor(shadowRoot, doc) {
        this.shadow = shadowRoot;
        this.doc = doc;
        this.el = null;
        this.trigger = null;
        this.onSelect = null;
        this.items = [];
        this.open = false;

        this.handleDocPointerDown = (event) => {
          if (!this.open) return;
          const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
          if (path.includes(this.el) || path.includes(this.trigger)) return;
          this.close();
        };
        this.handleKeydown = (event) => {
          if (!this.open) return;
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            this.close(true);
            return;
          }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            this.moveFocus(event.key === 'ArrowDown' ? 1 : -1);
          }
        };
        this.handleReposition = () => {
          if (this.open) this.position();
        };
      }

      /**
       * 刷新菜单配置。触发器点击时会用这里存下的最新配置渲染。
       * 这样调用方可以反复更新选项，而不需要重建菜单实例。
       */
      setItems(items = [], onSelect = null) {
        this.items = Array.isArray(items) ? items : [];
        this.onSelect = onSelect;
      }

      /** 创建触发器按钮（竖三点）。 */
      createTrigger(title = '更多设置') {
        const btn = this.doc.createElement('button');
        btn.type = 'button';
        btn.className = 'dsh-wh-btn dsh-wh-btn-icon';
        btn.textContent = '⋮';
        btn.setAttribute('aria-label', title);
        btn.setAttribute('aria-haspopup', 'menu');
        btn.setAttribute('aria-expanded', 'false');
        btn.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (this.open) this.close(true);
          else this.show(btn);
        });
        this.trigger = btn;
        return btn;
      }

      /** 打开菜单（使用 setItems 存下的配置）。 */
      show(trigger) {
        this.close();
        this.trigger = trigger || this.trigger;
        if (!this.trigger || this.items.length === 0) return;

        const doc = this.doc;
        const menu = doc.createElement('div');
        menu.className = 'dsh-wh-menu';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', '更多设置');

        for (const item of this.items) {
          if (item.type === 'group') {
            const group = doc.createElement('div');
            group.className = 'dsh-wh-menu-group';
            group.textContent = item.label;
            menu.append(group);
            continue;
          }

          if (item.type === 'radio') {
            for (const option of item.options || []) {
              const row = doc.createElement('button');
              row.type = 'button';
              row.className = 'dsh-wh-menu-item';
              row.setAttribute('role', 'menuitemradio');
              row.setAttribute('aria-checked', String(option.value === item.value));
              row.dataset.value = option.value;
              row.dataset.itemId = item.id;
              const check = doc.createElement('span');
              check.className = 'dsh-wh-menu-check';
              check.textContent = option.value === item.value ? '✓' : '';
              const text = doc.createElement('span');
              text.className = 'dsh-wh-menu-text';
              text.textContent = option.label;
              row.append(check, text);
              row.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.onSelect?.(item.id, option.value);
                this.refreshItem(item.id, option.value);
              });
              menu.append(row);
            }
            continue;
          }

          // checkbox
          const row = doc.createElement('button');
          row.type = 'button';
          row.className = 'dsh-wh-menu-item';
          row.setAttribute('role', 'menuitemcheckbox');
          row.setAttribute('aria-checked', String(Boolean(item.value)));
          row.dataset.value = String(Boolean(item.value));
          row.dataset.itemId = item.id;
          const check = doc.createElement('span');
          check.className = 'dsh-wh-menu-check';
          check.textContent = item.value ? '✓' : '';
          const text = doc.createElement('span');
          text.className = 'dsh-wh-menu-text';
          text.textContent = item.label;
          row.append(check, text);
          row.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const next = !(row.dataset.value === 'true');
            this.onSelect?.(item.id, next);
            this.refreshItem(item.id, next);
          });
          menu.append(row);
        }

        this.shadow.append(menu);
        this.el = menu;
        this.open = true;
        this.trigger.setAttribute('aria-expanded', 'true');
        this.position();

        this.doc.addEventListener('pointerdown', this.handleDocPointerDown, true);
        this.doc.addEventListener('keydown', this.handleKeydown, true);
        this.doc.defaultView?.addEventListener('scroll', this.handleReposition, true);
        this.doc.defaultView?.addEventListener('resize', this.handleReposition);
      }

      /** 就地更新某一项的选中态，不重建整个菜单（保持焦点）。 */
      refreshItem(itemId, value) {
        if (!this.el) return;
        for (const row of this.el.querySelectorAll('.dsh-wh-menu-item')) {
          if (row.dataset.itemId !== itemId) continue;
          const isRadio = row.getAttribute('role') === 'menuitemradio';
          const checked = isRadio ? row.dataset.value === String(value) : String(Boolean(value)) === 'true';
          row.setAttribute('aria-checked', String(checked));
          row.dataset.value = isRadio ? row.dataset.value : String(Boolean(value));
          const check = row.querySelector('.dsh-wh-menu-check');
          if (check) check.textContent = checked ? '✓' : '';
        }
      }

      /** 定位：优先在触发器下方，空间不足翻上方；水平夹进视口。 */
      position() {
        if (!this.el || !this.trigger) return;
        // defaultView 在非浏览器环境可能为空，退回全局 window，再退回空对象
        const view = this.doc.defaultView || globalThis.window || {};
        const rect = this.trigger.getBoundingClientRect?.();
        const width = this.el.offsetWidth;
        const height = this.el.offsetHeight;
        const vw = view.innerWidth ?? 0;
        const vh = view.innerHeight ?? 0;
        // 量不到视口尺寸（测试桩）时直接定位到触发器下方，不做夹取
        if (!rect || !vw || !vh) {
          if (rect) {
            this.el.style.left = `${Math.round(rect.left)}px`;
            this.el.style.top = `${Math.round(rect.bottom + MENU_GAP)}px`;
          }
          return;
        }

        // 右对齐到触发按钮（三点通常在右上角），再夹进视口
        let left = rect.right - width;
        left = Math.min(Math.max(MENU_EDGE, left), Math.max(MENU_EDGE, vw - width - MENU_EDGE));

        let top = rect.bottom + MENU_GAP;
        if (top + height > vh - MENU_EDGE) {
          const above = rect.top - height - MENU_GAP;
          top = above >= MENU_EDGE ? above : Math.max(MENU_EDGE, vh - height - MENU_EDGE);
        }

        this.el.style.left = `${Math.round(left)}px`;
        this.el.style.top = `${Math.round(top)}px`;
      }

      /** 键盘上下键在菜单项之间移动焦点。 */
      moveFocus(delta) {
        if (!this.el) return;
        const rows = [...this.el.querySelectorAll('.dsh-wh-menu-item')];
        if (rows.length === 0) return;
        const current = rows.indexOf(this.doc.activeElement);
        const next = current < 0
          ? (delta > 0 ? 0 : rows.length - 1)
          : (current + delta + rows.length) % rows.length;
        rows[next]?.focus?.();
      }

      /**
       * 关闭菜单。
       * @param {boolean} restoreFocus 是否把焦点还给触发按钮（键盘关闭时为 true）
       */
      close(restoreFocus = false) {
        if (!this.open) return;
        this.open = false;
        this.doc.removeEventListener('pointerdown', this.handleDocPointerDown, true);
        this.doc.removeEventListener('keydown', this.handleKeydown, true);
        this.doc.defaultView?.removeEventListener('scroll', this.handleReposition, true);
        this.doc.defaultView?.removeEventListener('resize', this.handleReposition);
        this.el?.remove();
        this.el = null;
        this.trigger?.setAttribute('aria-expanded', 'false');
        if (restoreFocus) this.trigger?.focus?.();
      }

      get isOpen() {
        return this.open;
      }

      destroy() {
        this.close();
        this.trigger = null;
        this.onSelect = null;
        this.items = [];
      }
    }

  return { OverflowMenu };
  })();

  // ══ render.js ═══════════════════════════════════════════════════
  const __Render = (() => {
    /**
     * 显示层的纯函数：把统一的 WordInfo 渲染成 DOM 节点。
     * 抽出来是为了让 scripts/verify.mjs 能在没有浏览器的 Node 里断言渲染结果。
     *
     * ⚠️ 本文件**不得**引用 document/window；只用调用方传入的 doc 来创建节点。
     */

    /** 词性缩写 → 中文。DSH 的消息正文是英文，所以这里覆盖常见缩写。 */
    const POS_ZH = Object.freeze({
      n: '名词', noun: '名词', v: '动词', verb: '动词', vi: '不及物动词', vt: '及物动词',
      adj: '形容词', adjective: '形容词', adv: '副词', adverb: '副词', prep: '介词',
      preposition: '介词', conj: '连词', conjunction: '连词', pron: '代词', pronoun: '代词',
      num: '数词', art: '冠词', article: '冠词', int: '感叹词', interj: '感叹词',
      interjection: '感叹词', aux: '助动词', modal: '情态动词', det: '限定词',
      determiner: '限定词', abbr: '缩写', phrase: '短语', idiom: '习语',
      convention: '习惯表达', exclamation: '感叹词', linker: '连接词',
      'n-count': '可数名词', 'n-uncount': '不可数名词', 'n-var': '可变名词',
      'n-sing': '单数名词', 'n-plural': '复数名词', 'n-proper': '专有名词',
      'adj-graded': '形容词（分级）', 'adj-classif': '形容词（分类）',
      'adj-compar': '形容词比较级', 'adv-graded': '副词（分级）',
      'phrasal-verb': '动词短语', 'phr-v': '动词短语', 'modal-verb': '情态动词',
      'ordinal-number': '序数词', 'cardinal-number': '基数词', concordance: '索引词',
      // 柯林斯的及物/不及物标记（"V-T"、"V-T/V-I" 这类会出现在词性栏）
      'v-t': '及物动词', 'v-i': '不及物动词',
      'aux-v': '助动词', 'linking-v': '系动词',
    });

    /**
     * 把词性字符串翻译成中文。
     * 支持 "int."、"/n./v."、"n-count"、多词性混合（"n./v."、多行）。
     *
     * ⚠️ 分隔符**不能**包含连字符：柯林斯的 "V-T"（及物动词）、"n-count"（可数名词）
     *    都是连字符复合标记，按连字符切会把它们切碎，导致词性显示为空或显示成
     *    「动词/未知」。早期版本就在这里踩过坑（用户看到的 V-T 被错误处理）。
     *
     * 返回空串表示无法识别（调用方会显示原始值）。
     */
    function translatePos(raw) {
      if (typeof raw !== 'string' || !raw.trim()) return '';
      const parts = raw
        .split(/[/\uFF0F,;|\n]+/)
        .map((s) => s.trim().replace(/^\.+|\.+$/g, '').toLowerCase())
        .filter(Boolean);
      const out = [];
      for (const part of parts) {
        const key = part.replace(/\s+/g, '-');
        const zh = POS_ZH[part] || POS_ZH[key];
        if (zh && !out.includes(zh)) out.push(zh);
      }
      return out.join('/');
    }

    /** 把释义里的 <b>xxx</b> 等标签去掉（有道返回里含 <b>、<非正式> 这类标记）。 */
    function stripTags(text) {
      if (typeof text !== 'string') return '';
      return text
        .replace(/<[^>]{0,40}>/g, '')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, '\'')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    /** 逐条清洗释义字段。 */
    function normalizeWordInfo(info) {
      if (!info || typeof info !== 'object') return null;
      const word = typeof info.word === 'string' ? info.word.trim() : '';
      if (!word) return null;
      const meanings = Array.isArray(info.meanings)
        ? info.meanings
          .map((m) => (m && typeof m === 'object' ? {
            partOfSpeech: stripTags(String(m.partOfSpeech ?? '')),
            translation: stripTags(String(m.translation ?? '')),
            definition: stripTags(String(m.definition ?? '')),
            example: stripTags(String(m.example ?? '')),
          } : null))
          .filter((m) => m && (m.translation || m.definition))
          .slice(0, 8)
        : [];

      // 音频：新格式是 { us, uk }；兼容老格式的单个字符串
      let audioUs = '';
      let audioUk = '';
      if (typeof info.audio === 'string') {
        audioUs = info.audio;
      } else if (info.audio && typeof info.audio === 'object') {
        audioUs = typeof info.audio.us === 'string' ? info.audio.us : '';
        audioUk = typeof info.audio.uk === 'string' ? info.audio.uk : '';
      }

      const usPhonetic = stripTags(String(info.usPhonetic ?? ''));
      const ukPhonetic = stripTags(String(info.ukPhonetic ?? ''));
      const phonetic = stripTags(String(info.phonetic ?? '')) || usPhonetic || ukPhonetic;

      const tags = Array.isArray(info.tags)
        ? info.tags.map((t) => stripTags(String(t ?? ''))).filter(Boolean).slice(0, 8)
        : [];

      return {
        word,
        phonetic,
        usPhonetic,
        ukPhonetic,
        tags,
        meanings,
        source: typeof info.source === 'string' ? info.source : 'unknown',
        audio: { us: audioUs, uk: audioUk },
        error: typeof info.error === 'string' ? info.error : '',
      };
    }

    /** 把音标包成 /.../ 形式（已经带斜杠或方括号的不动）。 */
    function wrapPhonetic(text) {
      if (!text) return '';
      return /^[/[ˈˌ]/.test(text) ? text : `/${text}/`;
    }

    /**
     * 按配置挑出要显示的音标。
     * @param {object} info 已规范化的 WordInfo
     * @param {'no'|'us'|'uk'|'both'|boolean} mode
     *        'no'/false 不显示；'us' 美音（默认）；'uk' 英音；'both' 两个都显示
     * @returns {Array<{text:string,label:string}>}
     */
    function phoneticEntries(info, mode = 'us') {
      if (mode === false || mode === 'no' || mode == null) return [];
      const us = wrapPhonetic(info?.usPhonetic || '');
      const uk = wrapPhonetic(info?.ukPhonetic || '');
      const fallback = wrapPhonetic(info?.phonetic || '');

      // 只有一个来源时，任何模式都显示它
      if (!us && !uk) return fallback ? [{ text: fallback, label: '' }] : [];

      if (mode === 'both') {
        const out = [];
        if (us) out.push({ text: us, label: 'us' });
        if (uk && uk !== us) out.push({ text: uk, label: 'uk' });
        return out;
      }
      if (mode === 'uk') return [{ text: uk || fallback, label: uk ? 'uk' : '' }];
      return [{ text: us || fallback, label: us ? 'us' : '' }];
    }

    /**
     * 渲染释义区。
     * @param {Document} doc
     * @param {object} info         已规范化的 WordInfo
     * @param {object} options
     *        showPartOfSpeech, showPhonetic ('no'|'us'|'uk'|'both'), showDefinition,
     *        showExample, showTags, showSource
     * @returns {DocumentFragment}
     */
    function renderDictionaryBody(doc, info, options = {}) {
      const frag = doc.createDocumentFragment();
      const opt = {
        showPartOfSpeech: true,
        showPhonetic: 'us',
        showDefinition: true,
        showExample: true,
        showTags: true,
        showSource: true,
        ...options,
      };

      // ── 头部：单词 + 音标 ────────────────────────────────────────────
      const head = doc.createElement('div');
      head.className = 'dsh-wh-head';

      const title = doc.createElement('span');
      title.className = 'dsh-wh-word';
      title.textContent = info.word;
      head.append(title);

      for (const phon of phoneticEntries(info, opt.showPhonetic)) {
        const span = doc.createElement('span');
        span.className = 'dsh-wh-phonetic';
        span.textContent = phon.text;
        if (phon.label) span.dataset.accent = phon.label;
        head.append(span);
      }
      frag.append(head);

      // 防御：外部传入的 info 可能没有 tags（自定义后端、旧数据），
      // 直接读 .length 会抛 TypeError 把整个浮层渲染打断。
      const tagList = Array.isArray(info.tags) ? info.tags.filter(Boolean) : [];

      // ── 话题 · 标签：单独成行 ───────────────────────────────────────
      if (opt.showTags && tagList.length > 0) {
        const row = doc.createElement('div');
        row.className = 'dsh-wh-tags';
        const label = doc.createElement('span');
        label.className = 'dsh-wh-tags-label';
        label.textContent = '话题 · 标签';
        row.append(label);
        const list = doc.createElement('span');
        list.className = 'dsh-wh-tags-list';
        list.textContent = tagList.join(' · ');
        row.append(list);
        frag.append(row);
      }

      // ── 错误态 ─────────────────────────────────────────────────────
      if (info.error || info.meanings.length === 0) {
        const err = doc.createElement('div');
        err.className = 'dsh-wh-error';
        err.textContent = info.error || '暂无释义';
        frag.append(err);
        if (opt.showSource && info.source) frag.append(renderFooter(doc, info, opt));
        return frag;
      }

      // ── 释义列表 ───────────────────────────────────────────────────
      const list = doc.createElement('div');
      list.className = 'dsh-wh-meanings';

      for (const meaning of info.meanings) {
        const item = doc.createElement('div');
        item.className = 'dsh-wh-meaning';

        if (opt.showPartOfSpeech && meaning.partOfSpeech) {
          const pos = doc.createElement('span');
          pos.className = 'dsh-wh-pos';
          const zh = translatePos(meaning.partOfSpeech);
          pos.textContent = zh || meaning.partOfSpeech;
          if (zh && zh !== meaning.partOfSpeech) pos.title = meaning.partOfSpeech;
          item.append(pos);
        }

        const textWrap = doc.createElement('div');
        textWrap.className = 'dsh-wh-texts';

        if (meaning.translation) {
          const tr = doc.createElement('div');
          tr.className = 'dsh-wh-translation';
          tr.textContent = meaning.translation;
          textWrap.append(tr);
        }
        if (opt.showDefinition && meaning.definition) {
          const de = doc.createElement('div');
          de.className = 'dsh-wh-definition';
          de.textContent = meaning.definition;
          textWrap.append(de);
        }
        if (opt.showExample && meaning.example) {
          const ex = doc.createElement('div');
          ex.className = 'dsh-wh-example';
          ex.textContent = meaning.example;
          textWrap.append(ex);
        }
        item.append(textWrap);
        list.append(item);
      }
      frag.append(list);

      if (opt.showSource && info.source) frag.append(renderFooter(doc, info, opt));
      return frag;
    }

    /** 底部：来源标识。 */
    function renderFooter(doc, info, opt) {
      const foot = doc.createElement('div');
      foot.className = 'dsh-wh-foot';

      if (opt.showSource) {
        const src = doc.createElement('span');
        src.className = 'dsh-wh-source';
        src.textContent = SOURCE_LABELS[info.source] || info.source;
        foot.append(src);
      }
      return foot;
    }

    /** 来源标识的中文名。 */
    const SOURCE_LABELS = Object.freeze({
      youdao: '有道词典',
      'youdao-suggest': '有道（简版）',
      freedict: 'Free Dictionary',
      custom: '自定义后端',
      error: '暂无',
      unknown: '未知来源',
      'direct-fallback': '直连降级',
    });

    /** 构造一个「加载中…」占位体。 */
    function renderLoadingBody(doc, word) {
      const frag = doc.createDocumentFragment();
      const head = doc.createElement('div');
      head.className = 'dsh-wh-head';
      const title = doc.createElement('span');
      title.className = 'dsh-wh-word';
      title.textContent = word;
      head.append(title);
      frag.append(head);

      const box = doc.createElement('div');
      box.className = 'dsh-wh-loading';
      box.setAttribute('aria-live', 'polite');
      for (let i = 0; i < 2; i += 1) {
        const bar = doc.createElement('span');
        bar.className = 'dsh-wh-skeleton';
        box.append(bar);
      }
      frag.append(box);
      return frag;
    }

  return { translatePos, stripTags, normalizeWordInfo, renderDictionaryBody, renderLoadingBody, SOURCE_LABELS };
  })();

  // ══ dom.js ══════════════════════════════════════════════════════
  const __Dom = (() => {
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

    const { SKIP_TAGS, SKIP_CLASS_SELECTOR, isLookupCandidate, wordAtOffset, allWordsIn, pointHitsRects } = __Word;

    /** 助手回复块的标记属性（构造上稳定，不随 CSS 哈希变化）。 */
    const FLOW_KIND_ATTR = 'data-chat-flow-kind';
    const ASSISTANT_KIND = 'assistant-step';
    /** 可承载正文的元素：只在叶子级做定位。 */
    const PROSE_SELECTOR = 'p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,dt,dd,figcaption';

    /** 根节点缓存，避免每次 mousemove 都跑 querySelector。 */
    let rootsCache = { /* 保存两个根 */ };

    /**
     * 取得「消息滚动容器」与「整个消息区」两个根。
     * 用滚动容器做 contains 判断可以把侧栏、设置面板排除在外。
     */
    function getRoots(doc = document) {
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
    function invalidateRoots() {
      rootsCache = {};
    }

    /** 打包（把多个模块压平到同一个闭包）后使用的别名，避免与其它模块的同名顶层声明冲突。 */
    const domRoots = getRoots;
    const domInvalidateRoots = invalidateRoots;
    const domWordAtPoint = wordAtPoint;
    const domBlockSignature = blockSignature;
    const domBuildWordIndex = buildWordIndex;
    const domIsExcluded = isExcluded;
    const domVisibleAssistantBlocks = visibleAssistantBlocks;

    /** 某节点是否位于助手回复块内（供外部快速判断）。 */
    function domIsInsideAssistant(node) {
      return blockOf(node) !== null;
    }

    /** 元素是否在我们负责的区域里（助手回复块）。 */
    function isAssistantBlock(el) {
      if (!(el instanceof Element)) return false;
      return el.getAttribute(FLOW_KIND_ATTR) === ASSISTANT_KIND;
    }

    /** 向上找到最近的助手回复块。 */
    function blockOf(node) {
      let el = node instanceof Element ? node : node?.parentElement;
      while (el) {
        if (isAssistantBlock(el)) return el;
        el = el.parentElement;
      }
      return null;
    }

    /** 该节点是否位于某个被排除的祖先里（代码块、公式、输入框等）。 */
    function isExcluded(node, extraSelectors) {
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
    function wordAtPoint(x, y, extraExcludeSelectors) {
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
    function blockSignature(block) {
      return block ? block.textContent.length : -1;
    }

    /**
     * 构建一个块的「单词索引」，供键盘 Tab 导航使用。
     * 只在用户真的用键盘时才调用（普通鼠标悬停不需要它，避免长消息卡顿）。
     */
    function buildWordIndex(block, extraExcludeSelectors) {
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
    function visibleAssistantBlocks(doc = document) {
      const { scroll } = getRoots(doc);
      const base = scroll?.isConnected ? scroll : doc;
      return [...base.querySelectorAll(`[${FLOW_KIND_ATTR}="${ASSISTANT_KIND}"]`)].filter((block) => {
        const rect = block.getBoundingClientRect();
        return rect.height > 0;
      });
    }

  return { FLOW_KIND_ATTR, ASSISTANT_KIND, domRoots, domInvalidateRoots, domWordAtPoint, domBlockSignature, domBuildWordIndex, domIsExcluded, domIsInsideAssistant, domVisibleAssistantBlocks };
  })();

  // ══ sessionmemo.js ══════════════════════════════════════════════
  const __SessionMemo = (() => {
    /**
     * 会话内的两个小工具，都只为「少打扰上游」而存在：
     *
     *   1. **在途请求折叠**：同一个词在同一瞬间被请求多次时合并成一次真实请求。
     *   2. **失败抑制**：上游已明确答复「查不到」的词，短时间内不再重复请求。
     *      只记布尔事实与时间戳，随页面刷新消失。
     *
     * 释义结果不经过这里：它只存在于调用方的 Promise → 渲染链路里。
     */

    const { LruMap } = __Lru;

    /** 失败标记的默认存活时长（毫秒）。 */
    const DEFAULT_MISS_SUPPRESS_MS = 5 * 60 * 1000;

    /** 失败标记的最大条数。 */
    const MAX_MISS_ENTRIES = 200;

    class SessionMemo {
      /**
       * @param {{missSuppressMs?:number}} [options]
       */
      constructor({ missSuppressMs = DEFAULT_MISS_SUPPRESS_MS } = {}) {
        /** word -> 上游答复「查不到」的时间戳。只有时间，没有任何释义内容。 */
        this.misses = new LruMap(MAX_MISS_ENTRIES);
        this.missSuppressMs = Math.max(0, missSuppressMs);
        /** word -> Promise，用于折叠同一瞬间的重复请求。 */
        this.inflight = new Map();
      }

      setMissSuppressMs(ms) {
        this.missSuppressMs = Math.max(0, ms);
      }

      /** 这个词最近是否被上游明确答复「查不到」。 */
      isKnownMiss(word) {
        if (this.missSuppressMs <= 0) return false;
        const at = this.misses.get(word);
        if (typeof at !== 'number') return false;
        if (Date.now() - at > this.missSuppressMs) {
          this.misses.delete(word);
          return false;
        }
        return true;
      }

      /** 记录一次「上游查不到」。只存时间戳。 */
      markMiss(word) {
        if (this.missSuppressMs <= 0) return;
        this.misses.set(word, Date.now());
      }

      /**
       * 折叠同一瞬间的重复请求。
       * @param {string} word
       * @param {() => Promise<any>} factory
       */
      dedupe(word, factory) {
        const existing = this.inflight.get(word);
        if (existing) return existing;
        const task = factory().finally(() => {
          // 请求结束立刻从表里删除
          this.inflight.delete(word);
        });
        this.inflight.set(word, task);
        return task;
      }

      /** 当前在途请求数（测试与诊断用）。 */
      get inflightCount() {
        return this.inflight.size;
      }

      /** 清空会话内的临时状态（在途请求由调用方 abort）。 */
      clear() {
        this.misses.clear();
        this.inflight.clear();
      }
    }

  return { SessionMemo, DEFAULT_MISS_SUPPRESS_MS };
  })();

  // ══ speak.js ════════════════════════════════════════════════════
  const __Speak = (() => {
    /**
     * 发音。
     *
     * 优先用 Web Speech API（speechSynthesis）：离线、零网络请求、不泄露任何数据。
     * 失败时回落到词典提供的 mp3；两条路都不行就明确告诉用户，而不是静默无声。
     *
     * ⚠️ 这里踩过四个真实的坑（Electron/Chromium 下都成立）：
     *
     *   1. `speechSynthesis.cancel()` 紧接 `speak()` 时，Chromium 可能把刚排队的
     *      utterance 一并丢弃 → 必须先创建 utterance、再 cancel、最后 speak。
     *
     *   2. `getVoices()` 首次调用常返回空数组（语音列表异步加载）。此时**绝不能**
     *      给 utterance 赋 `voice = undefined`，某些构建会因此静默失败 ——
     *      应当直接不设 voice，让引擎用默认英语嗓音。
     *
     *   3. **「读两下」的根因**：语音合成没有 onstart/onerror 回调时，需要用超时
     *      兜底去回落 mp3；但部分平台上 `onstart` 根本不触发，而声音其实已经出来了。
     *      这样超时一到就又播一遍 mp3，听感就是「一次读两下」。
     *      → 现在改用**音频活动检测**：只要在这一轮里观察到任何 Web Speech 活动
     *        （onstart / onboundary / onend），就认为语音已经出声，超时不再回落。
     *        同时超时延长到 1000ms，给慢启动留余量。
     *
     *   4. 连点两次时 `cancel()` 是异步生效的，两次朗读会叠在一起。
     *      → 加了「最小调用间隔」去抖：太近的重复调用直接忽略。
     */

    /** 语音启动的最长等待时间；超时且**全程没有任何音频活动**才回落 mp3。 */
    const TTS_START_TIMEOUT_MS = 1000;
    /** 两次发音之间的最小间隔；期间内的重复调用被忽略（防止连点导致叠加朗读）。 */
    const MIN_GAP_MS = 400;

    let cachedVoice = null;
    let voicesWarmed = false;
    let lastSpeakAt = 0;

    function getVoices() {
      try {
        return speechSynthesis?.getVoices?.() || [];
      } catch {
        return [];
      }
    }

    /**
     * 挑一个英语嗓音。
     * @param {'us'|'uk'} accent
     * @returns {SpeechSynthesisVoice|null} null 表示「不指定，用引擎默认」
     */
    function pickEnglishVoice(accent = 'us') {
      const voices = getVoices();
      if (voices.length === 0) return null;

      const want = accent === 'uk' ? /^en[-_]GB/i : /^en[-_]US/i;
      const other = accent === 'uk' ? /^en[-_]US/i : /^en[-_]GB/i;

      if (cachedVoice && want.test(cachedVoice.lang || '')) return cachedVoice;

      const found = voices.find((v) => want.test(v.lang || ''))
        || voices.find((v) => other.test(v.lang || '')) // 没有目标口音就退而求其次
        || voices.find((v) => /^en/i.test(v.lang || ''))
        || null;
      cachedVoice = found;
      return found;
    }

    /** 语音列表是异步加载的，提前订阅一次，加载完就清掉选择重新挑。 */
    function warmUpVoices() {
      if (voicesWarmed) return;
      voicesWarmed = true;
      if (typeof speechSynthesis === 'undefined') return;
      try {
        getVoices();
        speechSynthesis.addEventListener?.('voiceschanged', () => {
          cachedVoice = null;
          pickEnglishVoice();
        }, { once: true });
      } catch { /* 不支持就算了 */ }
    }

    let audioEl = null;
    /** 最近一次播放的音频上下文，用于互斥与状态判定。 */
    let audioToken = 0;
    /** Web Speech 发声成功后记录时间，用于抑制紧随其后的音频回落。 */
    let lastTtsAudioAt = 0;
    /** 判定「TTS 已经出过声」的窗口。 */
    const TTS_AUDIO_WINDOW_MS = 2500;

    function isTtsAudioRecent() {
      return Date.now() - lastTtsAudioAt < TTS_AUDIO_WINDOW_MS;
    }

    /** 播放 mp3 兜底。成功返回 true。 */
    function playUrl(url, onFail) {
      if (!url) { onFail?.('no-url'); return false; }
      try {
        if (!audioEl) {
          audioEl = new Audio();
          audioEl.preload = 'auto';
        }
        audioToken += 1;
        const token = audioToken;
        audioEl.pause();
        audioEl.src = url;
        audioEl.currentTime = 0;
        const promise = audioEl.play();
        if (promise && typeof promise.catch === 'function') {
          promise.catch((error) => {
            if (token !== audioToken) return; // 已被后续调用取代，不再报告
            onFail?.(error?.name || 'play-rejected');
          });
        }
        return true;
      } catch (error) {
        onFail?.(error?.name || 'play-threw');
        return false;
      }
    }

    /** 允许注入以便单测（默认用真实实现）。 */
    let audioOverride = null;
    function __setSpeakImplForTest(impl) {
      audioOverride = impl?.audio ?? null;
    }
    /** 单测用：重置模块内部的时间状态。 */
    function __resetSpeakStateForTest() {
      lastSpeakAt = 0;
      cachedVoice = null;
      voicesWarmed = false;
      audioToken += 1;
    }

    /**
     * 朗读一个单词。
     *
     * @param {string} word
     * @param {{audio?: {us?:string, uk?:string}, accent?: 'us'|'uk',
     *          onStatus?:(status:string)=>void}} [options]
     *        audio  词典返回的音频地址（按口音区分，可只给一个）
     *        accent 'us' 美音（默认）| 'uk' 英音
     *        onStatus 收到 'speaking' | 'audio' | 'failed'，供 UI 反馈
     * @returns {boolean} 是否已尝试发声（成功与否看 onStatus）
     */
    function speak(word, options = {}) {
      const onStatus = typeof options.onStatus === 'function' ? options.onStatus : () => {};
      if (typeof word !== 'string' || !word.trim()) { onStatus('failed'); return false; }

      const accent = options.accent === 'uk' ? 'uk' : 'us';
      const audioUrl = options.audio?.[accent] || options.audio?.us || options.audio?.uk || '';

      if (audioOverride) { audioOverride(word, audioUrl, onStatus, accent); return true; }

      // 去抖：太近的重复调用直接忽略，避免 cancel() 未生效时两次朗读叠加
      const now = Date.now();
      if (now - lastSpeakAt < MIN_GAP_MS) return true;
      lastSpeakAt = now;

      warmUpVoices();
      const canTts = typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance === 'function';

      /** 语音失败 → 回落音频；音频也失败 → 报告 failed。 */
      const fallbackToAudio = (reason) => {
        // 关键：如果这一轮已经听到过语音，就不要再放 mp3 —— 那正是「读两下」的来源
        if (isTtsAudioRecent()) { onStatus('speaking'); return; }
        if (!audioUrl) { onStatus('failed'); return; }
        if (!playUrl(audioUrl, () => onStatus('failed'))) onStatus('failed');
        else onStatus('audio');
        void reason;
      };

      if (canTts) {
        try {
          const utterance = new SpeechSynthesisUtterance(word);
          utterance.lang = accent === 'uk' ? 'en-GB' : 'en-US';
          utterance.rate = 0.95;
          // 列表为空时不要赋 voice，交给引擎选默认英语嗓音
          const voice = pickEnglishVoice(accent);
          if (voice) utterance.voice = voice;

          let settled = false;

          /**
           * 观测到「确实出声」的唯一入口。
           *
           * onstart / onboundary / onend 三者中任意一个触发都算出声 ——
           * 部分平台不触发 onstart 但会触发 onboundary（逐词边界事件）。
           * 同时把状态推进到 speaking，避免底部提示一直停在「点击朗读」。
           */
          const markHeard = () => {
            lastTtsAudioAt = Date.now();
            if (settled) return;
            settled = true;
            onStatus('speaking');
          };

          utterance.onstart = markHeard;
          utterance.onboundary = markHeard;
          utterance.onend = markHeard;
          utterance.onerror = () => {
            if (settled) return;
            settled = true;
            fallbackToAudio('tts-error');
          };

          // 兜底：等待 TTS_START_TIMEOUT_MS，只有「全程没有任何音频活动」才回落音频。
          // 这是修复「读两下」的关键 —— 以前只看 onstart，而它在部分平台不触发。
          const timer = setTimeout(() => {
            clearTimeout(timer);
            if (settled) return;
            settled = true;
            fallbackToAudio('tts-silent');
          }, TTS_START_TIMEOUT_MS);

          // 顺序不能颠倒：先建 utterance，再 cancel 上一次，最后 speak
          try { speechSynthesis.cancel(); } catch { /* 忽略 */ }
          speechSynthesis.speak(utterance);
          return true;
        } catch { /* 直接落到音频兜底 */ }
      }

      fallbackToAudio('tts-unavailable');
      return true;
    }

    /** 停止当前朗读（关闭浮层时调用）。 */
    function stopSpeaking() {
      try { speechSynthesis?.cancel?.(); } catch { /* 忽略 */ }
      try { audioEl?.pause?.(); } catch { /* 忽略 */ }
    }

  return { speak, stopSpeaking, warmUpVoices, __setSpeakImplForTest };
  })();

  // ══ lookup.js ═══════════════════════════════════════════════════
  const __Lookup = (() => {
    /**
     * 查词编排层。
     *
     * 满足的硬性要求：
     *  - 只在悬停/点击时才请求（调用方驱动，本模块不主动预取）
     *  - 请求折叠：同一瞬间对同一个词的重复请求合并成一次
     *  - 并发上限 4（可配置，1–8）
     *  - 超时 8s（可配置）
     *  - AbortController 取消：关闭插件、切换配置时全部中止
     *  - 任何失败都不抛异常，统一返回带 error 字段的 WordInfo
     */

    const { SessionMemo } = __SessionMemo;
    const { normalizeWordInfo } = __Render;
    const { isLookupCandidate } = __Word;

    /** 计数信号量：限制同时进行的请求数。 */
    class Semaphore {
      constructor(limit) {
        this.limit = Math.max(1, limit | 0);
        this.active = 0;
        this.queue = [];
      }

      async acquire() {
        if (this.active < this.limit) {
          this.active += 1;
          return;
        }
        await new Promise((resolve) => this.queue.push(resolve));
        this.active += 1;
      }

      release() {
        this.active = Math.max(0, this.active - 1);
        const next = this.queue.shift();
        if (next) next();
      }

      setLimit(limit) {
        this.limit = Math.max(1, limit | 0);
        while (this.queue.length > 0 && this.active < this.limit) {
          const next = this.queue.shift();
          next();
        }
      }
    }

    /** 把多个 AbortSignal 合成一个（AbortSignal.any 在旧版 Electron 里可能缺失）。 */
    function anySignal(signals) {
      const list = signals.filter(Boolean);
      if (list.length === 0) return null;
      if (list.length === 1) return list[0];
      if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
        return AbortSignal.any(list);
      }
      const controller = new AbortController();
      const onAbort = (event) => {
        controller.abort(event?.target?.reason);
        for (const s of list) s.removeEventListener('abort', onAbort);
      };
      for (const s of list) {
        if (s.aborted) { controller.abort(s.reason); break; }
        s.addEventListener('abort', onAbort, { once: true });
      }
      return controller.signal;
    }

    /** 从 Error 里提取一个给用户看的中文提示。 */
    function describeError(error) {
      if (!error) return '查询失败';
      const name = error.name || '';
      if (name === 'AbortError' || name === 'TimeoutError') return '已取消 / 超时';
      const msg = String(error.message || error);
      if (/Failed to fetch|NetworkError|ERR_|load failed/i.test(msg)) return '网络错误，无法连接词库';
      return '暂无释义';
    }

    /**
     * 判断一个错误是否属于「上游明确答复查不到」以外的临时故障。
     * 只有确定性的"查不到"才值得标记为 miss；网络抖动、限流、超时都不该标记，
     * 否则网络恢复后用户仍然看不到释义。
     */
    function isTransientError(message) {
      if (typeof message !== 'string') return true;
      return /网络|超时|取消|频繁|解析|HTTP\s*5/i.test(message);
    }

    class DictionaryLookup {
      /**
       * @param {object} options
       * @param {import('./config.js').SettingsStore} options.settings
       * @param {string} options.hostUrl  宿主端 base url（用于把相对路径拼成绝对地址）
       */
      constructor({ settings, hostUrl = '' }) {
        this.settings = settings;
        this.hostUrl = hostUrl;
        const config = settings.get();

        this.semaphore = new Semaphore(config.concurrency);
        this.memo = new SessionMemo({ negativeTtlMs: config.missSuppressMs });
        this.controller = new AbortController(); // 生命周期级取消
        this.disposed = false;
        this.settleWaiters = [];

        this.unsubscribe = settings.subscribe((next) => {
          this.semaphore.setLimit(next.concurrency);
          this.memo.setNegativeTtl(next.missSuppressMs);
        });
      }

      /**
       * 查询一个单词。
       * 结果只存在于返回的 Promise 里。
       *
       * @param {string} rawWord 界面上的原始词形
       * @param {{signal?:AbortSignal, force?:boolean}} [options] force=true 时忽略失败抑制
       * @returns {Promise<object>} WordInfo（永不 reject）
       */
      async lookup(rawWord, options = {}) {
        const word = String(rawWord || '').toLowerCase().trim();
        if (!isLookupCandidate(word)) {
          return { word, phonetic: '', meanings: [], source: 'error', error: '不是可查询的英文单词' };
        }

        // 上游刚说过「查不到」的词，短时间内不再重复打扰它（只记布尔事实，不记内容）
        if (!options.force && this.memo.isKnownMiss(word)) {
          return { word, phonetic: '', meanings: [], source: 'error', error: '暂无释义' };
        }

        // 折叠同一瞬间的重复请求；请求结束立即丢弃结果
        return this.memo.dedupe(word, () => this.runLookup(word, options));
      }

      async runLookup(word, { signal } = {}) {
        const config = this.settings.get();
        await this.semaphore.acquire();

        const timeoutSignal = typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(config.timeoutMs)
          : null;
        const combined = anySignal([signal, this.controller.signal, timeoutSignal]);

        try {
          if (this.disposed) return this.failure(word, '插件已关闭');

          const info = await this.fetchFromHost(word, config, combined);
          const normalized = normalizeWordInfo({ ...info, word })
            || this.failure(word, '暂无释义');

          if (normalized.error && !isTransientError(normalized.error)) this.memo.markMiss(word);
          return normalized;
        } catch (error) {
          // 直连降级：只有在宿主端明确不可用时才尝试（默认关闭）
          if (config.allowDirectFallback && !this.disposed) {
            try {
              const info = await this.fetchDirect(word, combined);
              const normalized = normalizeWordInfo({ ...info, word });
              if (normalized && normalized.meanings.length > 0) return normalized;
            } catch { /* 降级也失败，走下面的统一失败返回 */ }
          }
          const message = describeError(error);
          if (!isTransientError(message)) this.memo.markMiss(word);
          return this.failure(word, message);
        } finally {
          this.semaphore.release();
          this.drainSettleWaiters();
        }
      }

      /** 主路径：走宿主端同源代理（无 CORS、无 Key 泄露、有服务端限流）。 */
      async fetchFromHost(word, config, signal) {
        const url = this.resolveUrl(config.lookupPath, word, config);
        const response = await fetch(url, {
          method: 'GET',
          headers: { accept: 'application/json' },
          signal,
          credentials: 'same-origin',
        });
        if (!response.ok) {
          // 4xx 是「这个词查不到」，不是网络故障，直接按错误态展示，不触发直连降级
          if (response.status >= 400 && response.status < 500) {
            return {
              word,
              phonetic: '',
              meanings: [],
              source: 'error',
              error: response.status === 429 ? '请求过于频繁，请稍后再试' : '暂无释义',
            };
          }
          const error = new Error(`HTTP ${response.status}`);
          error.status = response.status;
          throw error;
        }
        const data = await response.json();
        if (!data || typeof data !== 'object') return this.failure(word, '词库返回了无法解析的数据');
        if (data.error && (!Array.isArray(data.meanings) || data.meanings.length === 0)) {
          return {
            word,
            phonetic: data.phonetic || '',
            meanings: [],
            source: data.source || 'error',
            error: data.error,
            audio: data.audio || '',
          };
        }
        return data;
      }

      /**
       * 直连降级：绕过宿主端直接打公网接口。
       * 默认关闭（allowDirectFallback=false），因为需要浏览器 CORS 放行，且有合规风险。
       */
      async fetchDirect(word, signal) {
        const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
        const response = await fetch(url, { signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        const entry = Array.isArray(payload)
          ? payload.find((item) => String(item?.word || '').toLowerCase() === word) ?? payload[0]
          : null;
        if (!entry) throw new Error('empty');

        const phonetic = (entry.phonetics || []).map((p) => p?.text).find(Boolean) || '';
        const audio = (entry.phonetics || []).map((p) => p?.audio).find(Boolean) || '';
        const meanings = [];
        for (const meaning of entry.meanings || []) {
          const example = (meaning.definitions || []).map((d) => d?.example).find(Boolean) || '';
          for (const definition of (meaning.definitions || []).slice(0, 2)) {
            if (!definition?.definition) continue;
            meanings.push({
              partOfSpeech: meaning.partOfSpeech || '',
              definition: definition.definition,
              example: definition.example || example,
            });
          }
        }
        return { word, phonetic, meanings, source: 'direct-fallback', audio };
      }

      /** 相对路径 → 绝对 URL；已是绝对 URL 则原样返回（支持指向自建后端）。 */
      resolveUrl(lookupPath, word, config) {
        const path = String(lookupPath || '').trim();
        const base = /^https?:\/\//i.test(path)
          ? path
          : (this.hostUrl || '') + (path.startsWith('/') ? path : `/${path}`);
        const url = new URL(base, this.hostUrl || (typeof location !== 'undefined' ? location.origin : 'http://localhost'));
        url.searchParams.set('word', word);
        url.searchParams.set('lang', config.targetLang);
        url.searchParams.set('provider', config.provider);
        if (config.fallbackProviders?.length) {
          url.searchParams.set('fallback', config.fallbackProviders.join(','));
        }
        return url.toString();
      }

      failure(word, message) {
        return {
          word, phonetic: '', meanings: [], source: 'error', error: message || '暂无释义',
        };
      }

      /**
       * 中止全部在途请求并清空会话内的临时状态。
       */
      abortAll() {
        this.controller.abort('abort-all');
        this.controller = new AbortController();
        this.memo.clear();
      }

      /** 等待当前所有在途请求结束（关闭插件时用）。 */
      async settle() {
        if (this.memo.inflightCount === 0) return;
        await new Promise((resolve) => {
          this.settleWaiters.push(resolve);
          setTimeout(() => this.drainSettleWaiters(), 1500);
        });
      }

      drainSettleWaiters() {
        if (this.memo.inflightCount > 0) return;
        const waiters = this.settleWaiters.splice(0);
        for (const resolve of waiters) resolve();
      }

      dispose() {
        this.disposed = true;
        this.controller.abort('dispose');
        this.unsubscribe?.();
        this.memo.clear();
        this.drainSettleWaiters();
      }
    }

  return { DictionaryLookup };
  })();

  // ══ overlay.js ══════════════════════════════════════════════════
  const __Overlay = (() => {
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

    const { OVERLAY_CSS } = __Styles;
    const { renderDictionaryBody, renderLoadingBody } = __Render;
    const { HOST_DEFAULTS } = __Config;
    const { OverflowMenu } = __Menu;

    /** 浮层与视口边缘的最小距离。 */
    const OVERLAY_EDGE_MARGIN = 8;
    /** 同义别名，方便外部统一引用。 */
    const EDGE_MARGIN = OVERLAY_EDGE_MARGIN;
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
    function defaultHintText({ locked = false } = {}) {
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
    function computePosition({
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

    class Overlay {
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
        /** 纵向溢出菜单（懒创建：只有需要时才建） */
        this.menu = null;
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

      /**
       * 顶部操作按钮：朗读、锁定、纵向溢出菜单。
       *
       * 三点的位置固定在锁定键右侧 —— 这样「锁定」永远是最后一个主操作，
       * 新增的设置项都收进菜单里，不会让头部越来越挤。
       *
       * @param {object} options
       *   onSpeak, onToggleLock, locked, canSpeak            与之前一致
       *   menuItems?: Array<object>                          菜单项（见 menu.js）
       *   accent?: 'us'|'uk'                                 当前口音，用于按钮提示
       *   onMenuSelect?: (id, value) => void
       */
      mountHeaderActions({ onSpeak, onToggleLock, locked, canSpeak, menuItems = [], accent = 'us', onMenuSelect } = {}) {
        const doc = this.host.ownerDocument;
        const head = this.body.querySelector('.dsh-wh-head');
        if (!head) return;

        // 清掉旧的按钮组与已打开的菜单，避免重复注入
        head.querySelector('.dsh-wh-header-actions')?.remove();
        this.menu?.close();

        const actions = doc.createElement('div');
        actions.className = 'dsh-wh-header-actions';

        if (canSpeak) {
          const speakBtn = doc.createElement('button');
          speakBtn.type = 'button';
          speakBtn.className = 'dsh-wh-btn';
          speakBtn.textContent = '🔊 朗读';
          speakBtn.setAttribute('aria-label', `朗读这个单词（${accent === 'uk' ? '英音' : '美音'}）`);
          speakBtn.title = accent === 'uk' ? '朗读（英音）' : '朗读（美音）';
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

        // 竖三点：锁定键右侧
        if (menuItems.length > 0) {
          if (!this.menu) this.menu = new OverflowMenu(this.shadow, doc);
          // 每次都刷新菜单配置，让触发器直接读最新值（不做函数包装，避免层层叠加）
          this.menu.setItems(menuItems, onMenuSelect);
          const trigger = this.menu.createTrigger('更多设置');
          trigger.addEventListener('click', (event) => {
            // 阻止冒泡到文档，否则会被判定为「点击外部」而关掉浮层
            event.stopPropagation();
          });
          actions.append(trigger);
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
        this.menu?.destroy();
        this.menu = null;
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
    function buildSettingsPanel(doc, config, handlers) {
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
      panel.append(row('发音口音', '朗读与默认音标用哪种口音', selectControl('accent', config.accent, '发音口音', [
        ['us', '美音（默认）'],
        ['uk', '英音'],
      ])));
      panel.append(row('音标显示', '浮层顶部展示哪个音标', selectControl('phoneticDisplay', config.phoneticDisplay, '音标显示', [
        ['us', '只显示美音'],
        ['uk', '只显示英音'],
        ['both', '英美都显示'],
        ['no', '不显示'],
      ])));
      panel.append(row('显示词性', '', switchControl('showPartOfSpeech', config.showPartOfSpeech, '显示词性')));
      panel.append(row('显示英文释义', '', switchControl('showDefinition', config.showDefinition, '显示英文释义')));
      panel.append(row('显示例句', '', switchControl('showExample', config.showExample, '显示例句')));
      panel.append(row('显示话题 · 标签', '单独成行显示考试/话题标签', switchControl('showTags', config.showTags, '显示话题 · 标签')));
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

  return { Overlay, buildSettingsPanel, OVERLAY_EDGE_MARGIN, EDGE_MARGIN, computePosition, defaultHintText };
  })();

  // ══ index.js ════════════════════════════════════════════════════
  const __Main = (() => {
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
     *  6. 查词结果不写入任何持久容器：只在本次调用链路里流转，渲染进浮层后即随关闭丢弃。
     *  7. API 失败不抛异常：统一返回 error 态，浮层显示中文提示。
     *  8. 关闭开关后完全不处理：enabled=false 时所有监听器直接 return，浮层清空。
     *  9. 不破坏复制的关键：**从不修改宿主 DOM**，高亮是 Shadow DOM 里的覆盖块。
     */

    const { buildConfig, SettingsStore, loadUserSettings } = __Config;
    const { DictionaryLookup } = __Lookup;
    const { Overlay, buildSettingsPanel, OVERLAY_EDGE_MARGIN, defaultHintText } = __Overlay;
    const { domWordAtPoint, domRoots, domInvalidateRoots, domBuildWordIndex, domBlockSignature } = __Dom;
    const { speak, stopSpeaking } = __Speak;

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

    function createWordHover({ config: hostConfig } = {}) {
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
        /** 最近一次渲染的词典数据；菜单改动显示项时用它原地重绘，无需重新请求 */
        lastInfo: null,
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
          /** 中止在途请求并清空会话内临时状态 */
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
        state.lastInfo = null;
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

        // 查词：先出骨架，拿到结果再填充
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
        state.lastInfo = info;
        const config = settings.get();
        overlay.showInfo(info, {
          options: config,
          locked: state.mode === 'locked',
        });
        overlay.position(hit.rects[0]);
        overlay.mountHeaderActions({
          canSpeak: config.speakEnabled && Boolean(info.word),
          locked: state.mode === 'locked',
          accent: config.accent,
          onSpeak: () => speakWord(info),
          onToggleLock: () => toggleLock(),
          menuItems: buildMenuItems(config),
          onMenuSelect: (id, value) => handleMenuSelect(id, value),
        });
      }

      /**
       * 纵向三点菜单的内容。
       *
       * 这里只放「不常用但想改」的项：发音口音与几个显示开关。
       * 后续要加设置项，往这个数组里加一条即可，头部按钮不会再变挤。
       */
      function buildMenuItems(config) {
        return [
          { type: 'group', label: '发音' },
          {
            id: 'accent',
            type: 'radio',
            label: '默认发音',
            value: config.accent,
            options: [
              { value: 'us', label: '美音（默认）' },
              { value: 'uk', label: '英音' },
            ],
          },
          {
            id: 'phoneticDisplay',
            type: 'radio',
            label: '音标显示',
            value: config.phoneticDisplay,
            options: [
              { value: 'us', label: '只显示美音' },
              { value: 'uk', label: '只显示英音' },
              { value: 'both', label: '英美都显示' },
              { value: 'no', label: '不显示' },
            ],
          },
          { type: 'group', label: '显示内容' },
          { id: 'showExample', type: 'checkbox', label: '显示例句', value: config.showExample },
          { id: 'showTags', type: 'checkbox', label: '显示话题 · 标签', value: config.showTags },
          { id: 'showPartOfSpeech', type: 'checkbox', label: '显示词性', value: config.showPartOfSpeech },
          { id: 'showDefinition', type: 'checkbox', label: '显示英文释义', value: config.showDefinition },
          { id: 'showSource', type: 'checkbox', label: '显示来源标识', value: config.showSource },
        ];
      }

      /** 菜单选择：写回设置并立刻重绘当前浮层。 */
      function handleMenuSelect(id, value) {
        settings.patch({ [id]: value });
        // 立刻用新配置重绘，不需要等下一次悬停
        const info = state.lastInfo;
        const hit = state.activeWord;
        if (info && hit) {
          overlay?.showInfo(info, { options: settings.get(), locked: state.mode === 'locked' });
          overlay?.position(hit.rects[0]);
          overlay?.mountHeaderActions({
            canSpeak: settings.get().speakEnabled && Boolean(info.word),
            locked: state.mode === 'locked',
            accent: settings.get().accent,
            onSpeak: () => speakWord(info),
            onToggleLock: () => toggleLock(),
            menuItems: buildMenuItems(settings.get()),
            onMenuSelect: (itemId, itemValue) => handleMenuSelect(itemId, itemValue),
          });
        }
      }

      /**
       * 朗读并给出可见反馈。
       *
       * 以前这里只是 `speak(...)` 一把梭：语音合成静默失败时用户完全不知道发生了什么
       * （「点了没反应」）。现在把状态写回浮层底部，失败时明确提示。
       */
      function speakWord(info) {
        const word = info.word;
        const accent = settings.get().accent;
        speak(word, {
          audio: info.audio,
          accent,
          onStatus(status) {
            const hint = overlay?.body.querySelector('.dsh-wh-hint');
            if (!hint) return;
            const accentLabel = accent === 'uk' ? '英音' : '美音';
            if (status === 'speaking') hint.textContent = `正在朗读「${word}」（${accentLabel}）…`;
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
    const EDGE_MARGIN = OVERLAY_EDGE_MARGIN;
    const SIDE_CLEARANCE = TOOLTIP_MIN_BOTTOM_CLEARANCE;

  return { createWordHover, EDGE_MARGIN, SIDE_CLEARANCE };
  })();

    // 对外暴露一份扁平 API，便于排错与无 DSH 环境下的自测
    const api = Object.assign(
      {},
      __Config, __Word, __Lru, __Styles, __Menu, __Render, __Dom,
      __SessionMemo, __Speak, __Lookup, __Overlay, __Main,
    );
    globalThis.__DSH_WORD_HOVER_API__ = { controller: null, api };

    return {
      inject: ['slots'],
      apply(ctx) {
        const controller = __Main.createWordHover({
          config: (globalThis.__DSH_WORD_HOVER_CONFIG__ && typeof globalThis.__DSH_WORD_HOVER_CONFIG__ === 'object')
            ? globalThis.__DSH_WORD_HOVER_CONFIG__
            : {},
        });
        // 便于在开发者控制台里检查
        globalThis.__DSH_WORD_HOVER_API__.controller = controller;
        return controller.apply(ctx);
      },
    };
  },
});
