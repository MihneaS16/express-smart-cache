# express-smart-cache

A lightweight, zero-dependency in-memory caching middleware for Express.js. It intercepts outgoing responses and stores them in memory, serving subsequent identical requests directly from cache — no Redis, no external services, no boilerplate.

> **Note:** This package is published as an ES module (`"type": "module"`) and requires Express 5.x.

---

## Features

- **Zero dependencies** — pure Node.js, nothing to install beyond Express itself
- **Drop-in middleware** — one line to add global caching, or mount per-route
- **TTL-based expiration** — entries expire automatically, checked lazily on access
- **Flexible bypass** — skip caching per-request with a boolean or a function
- **Manual invalidation** — purge by URL prefix or wipe the entire cache
- **Response header** — every response gets `X-Cache: HIT` or `X-Cache: MISS`
- **Debug mode** — logs hits, misses, and purges to the console

---

## Requirements

- **Node.js:** Must support ECMAScript modules (ESM)
- **Express:** `^5.0.0` (peer dependency)

---

## Installation

```bash
npm install express-smart-cache
```

To use locally from source:

```bash
git clone <repo-url>
cd express-smart-cache
npm install
```

---

## Quick start

```js
import express from 'express';
import createCache from 'express-smart-cache';

const app = express();
const cache = createCache(); // 60s TTL, max 1000 entries

app.use(cache);

app.get('/api/products', async (req, res) => {
  const products = await db.query('SELECT * FROM products'); // runs at most once per minute
  res.send(products);
});

app.listen(3000);
```

On the first request, `X-Cache: MISS` is returned and the response is stored. Every subsequent request within the TTL window returns `X-Cache: HIT` instantly, without touching the database.

---

## How it works

The middleware uses a JavaScript `Map` as its backing store. Each entry holds the serialized response body, the response headers, and an expiry timestamp.

**On every request:**

1. If the method is not in `options.methods`, or `skip` returns `true`, the request passes through untouched.
2. The full URL (`req.originalUrl`) is used as the cache key.
3. If a non-expired entry exists for that key → headers and body are replayed immediately (`X-Cache: HIT`).
4. If no entry exists, or the entry has expired → `res.send` is monkey-patched to capture the outgoing response before forwarding it to the client. The body and headers are stored with an expiry of `Date.now() + ttl` (`X-Cache: MISS`).

**Eviction and expiry:**

- Entries are not purged on a timer. Expiry is checked lazily when the key is next accessed — stale entries are deleted on the spot and treated as a miss.
- When the cache is full (`cache.size >= maxSize`), the oldest inserted entry is evicted before the new one is written (FIFO, not LRU).

---

## API

### `createCache(options?)`

Creates and returns an Express middleware function with cache management methods attached.

```js
const cache = createCache(options);
app.use(cache);
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ttl` | `number` | `60000` | Time to live in milliseconds. |
| `maxSize` | `number` | `1000` | Maximum number of entries before FIFO eviction kicks in. |
| `methods` | `string[]` | `['GET']` | HTTP methods eligible for caching. |
| `skip` | `boolean \| (req, res) => boolean` | `null` | Return `true` to bypass the cache for a specific request. |
| `debug` | `boolean` | `false` | Log hits, misses, and purges to stdout. |

### Methods

#### `cache.invalidate(pattern: string)`

Deletes every entry whose key starts with `pattern`. Useful for invalidating a resource and all its sub-routes at once.

```js
cache.invalidate('/api/users'); // removes /api/users, /api/users/1, /api/users?page=2, etc.
```

#### `cache.clear()`

Removes all entries immediately.

```js
cache.clear();
```

#### `cache.size` _(read-only)_

Returns the current number of entries in the cache.

```js
console.log(cache.size); // e.g. 42
```

---

## Examples

### Per-route caching

Instead of global `app.use(cache)`, apply the middleware only to specific routes that benefit from caching.

```js
const cache = createCache({ ttl: 10 * 60 * 1000 }); // 10 minutes

app.get('/api/products', cache, async (req, res) => {
  const products = await db.query('SELECT * FROM products');
  res.send(products);
});

app.get('/api/stats', cache, async (req, res) => {
  const stats = await computeExpensiveStats();
  res.send(stats);
});

// This route is never cached
app.get('/api/me', async (req, res) => {
  res.send(await getCurrentUser(req));
});
```

### Skipping cache for authenticated users

Logged-in users often receive personalised responses that must never be served from a shared cache.

```js
app.use(createCache({
  skip: (req) => {
    // Never cache requests with an Authorization header
    if (req.headers.authorization) return true;

    // Allow the client to opt out of the cache explicitly
    if (req.query.fresh === 'true') return true;

    return false;
  }
}));
```

### Invalidating cache after writes

Clear the relevant entries whenever a resource is mutated so the next read reflects the new state.

```js
const cache = createCache();

app.get('/api/articles', cache, async (req, res) => {
  res.send(await Article.findAll());
});

app.get('/api/articles/:id', cache, async (req, res) => {
  res.send(await Article.findById(req.params.id));
});

app.post('/api/articles', async (req, res) => {
  const article = await Article.create(req.body);

  // Invalidates /api/articles, /api/articles/123, /api/articles?page=2, etc.
  cache.invalidate('/api/articles');

  res.status(201).send(article);
});

app.put('/api/articles/:id', async (req, res) => {
  const article = await Article.update(req.params.id, req.body);

  cache.invalidate(`/api/articles/${req.params.id}`); // only the updated resource
  cache.invalidate('/api/articles');                  // plus any list endpoints

  res.send(article);
});

app.delete('/api/articles/:id', async (req, res) => {
  await Article.delete(req.params.id);
  cache.invalidate('/api/articles');
  res.status(204).send();
});
```

### Caching additional HTTP methods

By default only `GET` requests are cached. You can extend this to other safe/idempotent methods.

```js
app.use(createCache({
  methods: ['GET', 'HEAD'],
}));
```

### Monitoring cache usage

Use `debug` mode during development to see what is and isn't being served from cache.

```js
const cache = createCache({ debug: true });

// Console output:
// [CACHE MISS] /api/products
// [CACHE HIT]  /api/products
// [CACHE PURGE] Invalidated key: /api/products
```

Combine with `cache.size` to expose a simple health endpoint:

```js
app.get('/health', (req, res) => {
  res.send({ status: 'ok', cacheEntries: cache.size });
});
```

---

## Running the tests and demos

```bash
# Run the test suite (Node.js built-in assert)
npm test

# Run the included demos
npm run demo1
npm run demo2
```