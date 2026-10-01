/**
 * 会话内的两个小工具，都只为「少打扰上游」而存在：
 *
 *   1. **在途请求折叠**：同一个词在同一瞬间被请求多次时合并成一次真实请求。
 *   2. **失败抑制**：上游已明确答复「查不到」的词，短时间内不再重复请求。
 *      只记布尔事实与时间戳，随页面刷新消失。
 *
 * 释义结果不经过这里：它只存在于调用方的 Promise → 渲染链路里。
 */

import { LruMap } from './lru.js';

/** 失败标记的默认存活时长（毫秒）。 */
export const DEFAULT_MISS_SUPPRESS_MS = 5 * 60 * 1000;

/** 失败标记的最大条数。 */
const MAX_MISS_ENTRIES = 200;

export class SessionMemo {
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
