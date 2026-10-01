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

import { SessionMemo } from './sessionmemo.js';
import { normalizeWordInfo } from './render.js';
import { isLookupCandidate } from './word.js';

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

export class DictionaryLookup {
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
