/**
 * 配置默认值、清洗与持久化偏好存储。
 *
 * 设计要点：
 *  - 宿主端 config（cordis.patch.yml）提供「初始化默认值」；
 *  - 用户在设置面板里的改动存 localStorage，下次启动覆盖宿主端默认值；
 *  - 只允许改「用户可见」的字段，代理限流/缓存容量等宿主端字段不允许被前端篡改。
 */

/**
 * 宿主端 Cordis 配置的默认值（与 cordis.patch.yml 保持一致）。
 *
 * ⚠️ 这里**没有任何缓存时长配置**，这是有意为之：
 *    主源（有道公开网页接口）的权利人条款明确写着返回数据「严禁缓存、再利用与转卖」。
 *    因此插件默认不保存任何释义内容，每次查词都真实请求上游。
 */
export const HOST_DEFAULTS = Object.freeze({
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
   * 会话内「否定结果抑制」时长：上游答复"查不到"的词，在这段时间内不再重复请求。
   * 只记布尔事实，不保存任何释义内容；设为 0 则完全不记。
   */
  sessionTtlMs: 300000,
  proxy: true,
  proxyRateLimitPerMinute: 120,
  showPartOfSpeech: true,
  showPhonetic: true,
  showDefinition: true,
  showExample: true,
  showSource: true,
  excludeSelectors: [],
});

/**
 * 允许前端设置面板修改并持久化的字段。
 * 注意 enabled 也在其中：它是「运行时可覆盖」的总开关，
 * 用户在设置面板关掉后必须能在刷新后保持关闭。
 */
export const USER_EDITABLE_KEYS = Object.freeze([
  'enabled',
  'trigger',
  'hoverDelayMs',
  'hideDelayMs',
  'lockOnClick',
  'speakEnabled',
  'provider',
  'showPartOfSpeech',
  'showPhonetic',
  'showDefinition',
  'showExample',
  'showSource',
]);

const STORAGE_KEY = 'dsh-plugin-word-hover:settings:v1';

const TRIGGERS = new Set(['hover', 'click']);
const PROVIDERS = new Set(['youdao', 'freedict', 'suggest', 'custom', 'auto']);

/** 把任意输入夹到合法区间。 */
export function clampNumber(value, min, max, fallback) {
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
export function buildConfig(hostConfig, saved) {
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
    sessionTtlMs: clampNumber(merged.sessionTtlMs, 0, 3600000, HOST_DEFAULTS.sessionTtlMs),
    proxy: asBool(merged.proxy, HOST_DEFAULTS.proxy),
    proxyRateLimitPerMinute: clampNumber(
      merged.proxyRateLimitPerMinute, 10, 6000, HOST_DEFAULTS.proxyRateLimitPerMinute,
    ),
    showPartOfSpeech: asBool(merged.showPartOfSpeech, HOST_DEFAULTS.showPartOfSpeech),
    showPhonetic: asBool(merged.showPhonetic, HOST_DEFAULTS.showPhonetic),
    showDefinition: asBool(merged.showDefinition, HOST_DEFAULTS.showDefinition),
    showExample: asBool(merged.showExample, HOST_DEFAULTS.showExample),
    showSource: asBool(merged.showSource, HOST_DEFAULTS.showSource),
    excludeSelectors,
  });
}

/** 从 localStorage 读用户偏好；读不到或损坏都返回 null。 */
export function loadUserSettings(storage) {
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
export function pickUserSettings(config) {
  const out = {};
  for (const key of USER_EDITABLE_KEYS) out[key] = config[key];
  return out;
}

export function saveUserSettings(storage, config) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(pickUserSettings(config)));
    return true;
  } catch {
    return false; // 隐私模式 / 配额满：不影响功能，只是不持久化
  }
}

export const SETTINGS_STORAGE_KEY = STORAGE_KEY;

/** 订阅式配置存储：设置面板改一次，所有消费者立刻拿到新值。 */
export class SettingsStore {
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
