/**
 * Simple in-memory LRU cache (simulates Redis for local dev without Redis).
 * In production, swap this out for a Redis client using the same get/set/del API.
 *
 * Interview talking point: "I abstracted the cache behind a simple interface so
 * swapping in Redis for production is a one-file change."
 */

const MAX_SIZE = 1000;          // max entries in memory
const DEFAULT_TTL = 60 * 60;   // 1 hour in seconds

class LRUCache {
  constructor(maxSize = MAX_SIZE) {
    this.maxSize = maxSize;
    this.cache = new Map();  // Map preserves insertion order — easy LRU
  }

  get(key) {
    if (!this.cache.has(key)) return null;
    const entry = this.cache.get(key);
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key, value, ttlSeconds = DEFAULT_TTL) {
    if (this.cache.has(key)) this.cache.delete(key);
    if (this.cache.size >= this.maxSize) {
      // Evict the least recently used (first entry)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  del(key) {
    this.cache.delete(key);
  }

  size() {
    return this.cache.size;
  }
}

module.exports = new LRUCache();
