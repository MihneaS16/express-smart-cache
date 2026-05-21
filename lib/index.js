const DEFAULTS = Object.freeze({
  ttl: 60 * 1000,           // Time to live: 60 seconds
  maxSize: 1000,            // Maximum number of cached routes
  methods: ['GET'],         // Only cache GET requests by default
  skip: null,               // Function / Boolean to bypass caching
  debug: false              // Print hits/misses to console
});

export default function createCache(userOptions = {}) {
  const options = Object.assign({}, DEFAULTS, userOptions);
  const cache = new Map();

  if (typeof options.ttl !== 'number') {
    throw new TypeError('ttl must be a number');
  }

  if (typeof options.maxSize !== 'number') {
    throw new TypeError('maxSize must be a number');
  }

  if (typeof options.debug !== 'boolean') {
    throw new TypeError('debug must be a boolean');
  }

  const middlewareInstance = function smartCache(req, res, next) {
    // Skip caching
    if (!options.methods.includes(req.method)) {
        return next();
    }

    if ((typeof options.skip === 'function' && options.skip(req, res)) || (typeof options.skip === 'boolean' && options.skip === true)) {
        return next();
    }

    const cacheKey = req.originalUrl || req.url;

    // Cache Hit
    if (cache.has(cacheKey)) {
      const entry = cache.get(cacheKey);
      
      if (Date.now() < entry.expires) {
        if (options.debug) {
            console.log(`[CACHE HIT] ${cacheKey}`);
        }

        res.setHeader('X-Cache', 'HIT');
        for (const [key, value] of Object.entries(entry.headers || {})) {
          res.setHeader(key, value);
        }

        return res.send(entry.body);
      } else {
        cache.delete(cacheKey);
      }
    }

    // Cache Miss
    if (options.debug) {
        console.log(`[CACHE MISS] ${cacheKey}`);
    }
    res.setHeader('X-Cache', 'MISS');

    const originalSend = res.send.bind(res);
    res.send = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        if (options.maxSize && cache.size >= options.maxSize) {
          // The first (oldest) key in the map
          const oldestKey = cache.keys().next().value;
          cache.delete(oldestKey);
        }

        cache.set(cacheKey, {
          body,
          headers: res.getHeaders(),
          expires: Date.now() + options.ttl
        });
      }

      return originalSend(body);
    };

    next();
  };

  middlewareInstance.invalidate = (pattern) => {
    if (typeof pattern !== 'string') {
      throw new TypeError('Pattern must be a string');
    }

    for (const key of cache.keys()) {
      if (key.startsWith(pattern)) {
        cache.delete(key);
        if (options.debug) {
          console.log(`[CACHE PURGE] Invalidated key: ${key}`);
        }
      }
    }
  };

  middlewareInstance.clear = () => {
    cache.clear();
    if (options.debug) {
      console.log('[CACHE PURGE] Entire cache cleared.');
    }
  };

  Object.defineProperty(middlewareInstance, 'size', {
    get: () => cache.size,
    enumerable: true,
    configurable: false
  });

  return middlewareInstance;
}