/**
 * 一个极小的 LRU：内存缓存用它，避免长会话里无限增长。
 * 依赖 Map 的插入顺序做「最近使用」排序。
 */
export class LruMap {
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
