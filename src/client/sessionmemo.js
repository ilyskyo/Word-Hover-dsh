/**
 * 会话内「否定结果抑制」——**不是缓存**。
 *
 * 为什么不存释义：主源（有道公开网页接口）的权利人条款明确写着返回数据
 * 「严禁缓存、再利用与转卖」。因此本插件**默认不保存任何释义内容**，
 * 不落盘、不跨请求复用，每次查词都真实请求上游。
 *
 * 那这个模块做什么？只做两件不涉及「保存释义数据」的事：
 *
 *   1. **在途去重**：同一个词在同一个瞬间被请求多次时合并成一次真实请求。
 *      这是把重复请求折叠掉，而不是把结果留下来复用。
 *   2. **失败抑制**：对「上游明确答复查不到」的词（404 / 无释义）记一个短时标记，
 *      避免同一个不存在的词被反复请求。**只记布尔事实，不记任何释义内容**，
 *      且随页面刷新即消失。
 *
 * 释义结果只存在于调用栈里（Promise → 渲染 → 丢弃），从不写入任何长期容器。
 *
 * ⚠️ 历史：这里曾经是 `WordCache`（内存 LRU + IndexedDB，TTL 7 天）。
 *    为满足「不许缓存」的要求已整体移除；连 `cache.js` 这个文件名都一并改掉，
 *    以免后来者误以为仍有缓存层。
 */

import { LruMap } from './lru.js';

/** 失败标记的默认存活时长（毫秒）。只影响「是否再次尝试」，不涉及任何内容。 */
export const DEFAULT_NEGATIVE_TTL_MS = 5 * 60 * 1000;

/** 失败标记的最大条数。 */
const MAX_NEGATIVE_ENTRIES = 200;

export class SessionMemo {
  /**
   * @param {{negativeTtlMs?:number}} [options]
   */
  constructor({ negativeTtlMs = DEFAULT_NEGATIVE_TTL_MS } = {}) {
    /** word -> 失败时间戳。只有时间，没有内容。 */
    this.negatives = new LruMap(MAX_NEGATIVE_ENTRIES);
    this.negativeTtlMs = Math.max(0, negativeTtlMs);
    /** word -> Promise，用于折叠同一瞬间的重复请求。 */
    this.inflight = new Map();
  }

  setNegativeTtl(ms) {
    this.negativeTtlMs = Math.max(0, ms);
  }

  /** 这个词最近是否被上游明确答复"查不到"。 */
  isKnownMiss(word) {
    if (this.negativeTtlMs <= 0) return false;
    const at = this.negatives.get(word);
    if (typeof at !== 'number') return false;
    if (Date.now() - at > this.negativeTtlMs) {
      this.negatives.delete(word);
      return false;
    }
    return true;
  }

  /** 记录一次"上游查不到"。只存时间戳。 */
  markMiss(word) {
    if (this.negativeTtlMs <= 0) return;
    this.negatives.set(word, Date.now());
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
      // 请求结束立刻丢弃，绝不保留结果
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
    this.negatives.clear();
    this.inflight.clear();
  }
}
