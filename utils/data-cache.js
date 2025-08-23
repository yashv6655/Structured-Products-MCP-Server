// Simple in-memory cache with TTL (Time To Live)
class DataCache {
  constructor() {
    this.cache = new Map();
    this.ttls = new Map();
    this.hitCount = 0;
    this.missCount = 0;
    this.lastHitTime = null;
    this.lastMissTime = null;
    
    // Enhanced configuration
    this.maxEntries = parseInt(process.env.CACHE_MAX_ENTRIES) || 1000;
    this.defaultTTL = parseInt(process.env.CACHE_DEFAULT_TTL) || 300000; // 5 minutes
    this.cleanupInterval = parseInt(process.env.CACHE_CLEANUP_INTERVAL) || 600000; // 10 minutes
    
    // Automatic cleanup timer
    this.startAutoCleanup();
  }

  /**
   * Set cache entry with TTL and LRU eviction
   */
  set(key, value, ttl = this.defaultTTL) {
    // Check if we need to evict entries (LRU)
    if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
      this.evictLRU();
    }
    
    const expirationTime = Date.now() + ttl;
    
    this.cache.set(key, {
      value: value,
      lastAccessed: Date.now(),
      createdAt: Date.now()
    });
    this.ttls.set(key, expirationTime);
  }

  /**
   * Get cache entry if not expired
   */
  get(key) {
    if (!this.cache.has(key)) {
      this.missCount++;
      this.lastMissTime = new Date();
      return null;
    }
    
    const expirationTime = this.ttls.get(key);
    if (Date.now() > expirationTime) {
      this.delete(key);
      this.missCount++;
      this.lastMissTime = new Date();
      return null;
    }
    
    // Update last accessed time for LRU
    const entry = this.cache.get(key);
    entry.lastAccessed = Date.now();
    this.cache.set(key, entry);
    
    this.hitCount++;
    this.lastHitTime = new Date();
    return entry.value;
  }

  /**
   * Check if key exists and is not expired
   */
  has(key) {
    return this.get(key) !== null;
  }

  /**
   * Delete cache entry
   */
  delete(key) {
    this.cache.delete(key);
    this.ttls.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.cache.clear();
    this.ttls.clear();
    this.hitCount = 0;
    this.missCount = 0;
    this.lastHitTime = null;
    this.lastMissTime = null;
  }
  
  /**
   * Evict least recently used entry
   */
  evictLRU() {
    let lruKey = null;
    let lruTime = Date.now();
    
    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < lruTime) {
        lruTime = entry.lastAccessed;
        lruKey = key;
      }
    }
    
    if (lruKey) {
      this.delete(lruKey);
    }
  }
  
  /**
   * Start automatic cleanup timer
   */
  startAutoCleanup() {
    setInterval(() => {
      const cleaned = this.cleanup();
      if (cleaned > 0) {
        // Auto-cleanup: removed expired cache entries
      }
    }, this.cleanupInterval);
  }
  
  /**
   * Get memory usage in human readable format
   */
  getMemoryUsage() {
    const stats = this.getStats();
    const bytes = stats.memoryUsageBytes;
    
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${Math.round(bytes / 1024 * 10) / 10} KB`;
    return `${Math.round(bytes / 1048576 * 10) / 10} MB`;
  }

  /**
   * Get comprehensive cache statistics
   */
  getStats() {
    const now = Date.now();
    let expiredCount = 0;
    let totalMemoryBytes = 0;
    let oldestEntry = now;
    let newestEntry = 0;
    
    for (const [key, expirationTime] of this.ttls) {
      if (now > expirationTime) {
        expiredCount++;
      }
      
      const entry = this.cache.get(key);
      if (entry) {
        totalMemoryBytes += JSON.stringify(entry.value).length;
        oldestEntry = Math.min(oldestEntry, entry.createdAt);
        newestEntry = Math.max(newestEntry, entry.createdAt);
      }
    }
    
    return {
      totalEntries: this.cache.size,
      activeEntries: this.cache.size - expiredCount,
      expiredEntries: expiredCount,
      hitCount: this.hitCount || 0,
      missCount: this.missCount || 0,
      hitRatio: this.hitCount && this.missCount ? (this.hitCount / (this.hitCount + this.missCount) * 100).toFixed(1) : 0,
      memoryUsageBytes: totalMemoryBytes,
      memoryUsageKB: Math.round(totalMemoryBytes / 1024 * 100) / 100,
      maxEntries: this.maxEntries,
      utilizationPercent: Math.round((this.cache.size / this.maxEntries) * 100),
      oldestEntryAge: oldestEntry === now ? 0 : Math.round((now - oldestEntry) / 1000),
      newestEntryAge: newestEntry === 0 ? 0 : Math.round((now - newestEntry) / 1000)
    };
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    const keysToDelete = [];
    
    for (const [key, expirationTime] of this.ttls) {
      if (now > expirationTime) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.delete(key));
    return keysToDelete.length;
  }

  /**
   * Generate cache key for market data
   */
  static marketDataKey(symbol, dataType, params = {}) {
    const paramStr = Object.keys(params)
      .sort()
      .map(key => `${key}:${params[key]}`)
      .join('|');
    
    return `market:${symbol}:${dataType}:${paramStr}`;
  }

  /**
   * Generate cache key for calculated data
   */
  static calculationKey(symbol, calculationType, params = {}) {
    const paramStr = Object.keys(params)
      .sort()
      .map(key => `${key}:${params[key]}`)
      .join('|');
    
    return `calc:${symbol}:${calculationType}:${paramStr}`;
  }
  
  /**
   * Get optimal TTL for different data types
   */
  static getOptimalTTL(dataType) {
    const ttlMap = {
      'quote': 300000,        // 5 minutes - live prices
      'daily': 3600000,       // 1 hour - historical daily data
      'overview': 86400000,   // 24 hours - company fundamentals
      'treasury': 86400000,   // 24 hours - treasury rates
      'volatility': 1800000,  // 30 minutes - calculated volatility
      'correlation': 3600000, // 1 hour - correlation calculations
      'default': 300000       // 5 minutes - default
    };
    
    return ttlMap[dataType] || ttlMap.default;
  }
}

// Export singleton instance
const cacheInstance = new DataCache();

// Add graceful shutdown cleanup
process.on('SIGINT', () => {
  // Cleaning up cache before shutdown
  const cleaned = cacheInstance.cleanup();
  // Cache cleanup completed
  process.exit(0);
});

export default cacheInstance;