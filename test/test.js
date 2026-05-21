import assert from "assert";
import createCache from "../lib/index.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL ${name}`);
    console.error(`    ${err.stack || err.message}`);
    failed++;
  }
}

console.log('\nexpress-smart-cache tests');

function makeMockRes(overrides = {}) {
  let headers = {};
  return {
    statusCode: 200,
    setHeader: (k, v) => { headers[k] = v; },
    getHeader: (k) => headers[k],
    getHeaders: () => {
      const h = { ...headers };
      delete h['X-Cache'];
      return h;
    },
    send: function(data) { 
      this.sentData = data; 
      return this; 
    },
    ...overrides,
  };
}

test('throws error if ttl is not a number', () => {
  assert.throws(() => createCache({ ttl: '100' }), TypeError);
});

test('throws error if maxSize is not a number', () => {
  assert.throws(() => createCache({ maxSize: '1000' }), TypeError);
});

test('throws error if debug is not a boolean', () => {
  assert.throws(() => createCache({ debug: 'true' }), TypeError);
});

test('skips caching for non-configured methods', () => {
  const middleware = createCache();
  const req = { method: 'POST', url: '/api/data' };
  const res = makeMockRes();
  
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });
  
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(middleware.size, 0);
});

test('skip function bypasses cache', () => {
  const middleware = createCache({ skip: (req) => req.url.includes('bypass') });
  const req = { method: 'GET', url: '/api/bypass' };
  const res = makeMockRes();
  
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });
  
  assert.strictEqual(nextCalled, true);
});

test('skip boolean bypasses cache', () => {
  const middleware = createCache({ skip: true });
  const req = { method: 'GET', url: '/api/test' };
  const res = makeMockRes();
  
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });
  
  assert.strictEqual(nextCalled, true);
});

test('does not cache responses with non-2xx status codes', () => {
  const middleware = createCache();
  const req = { method: 'GET', url: '/api/error' };
  const res = makeMockRes({ statusCode: 500 });
  
  middleware(req, res, () => {});
  res.send({ error: 'Server Crash' });
  
  assert.strictEqual(middleware.size, 0);
});

test('caches a 2xx response and serves it on the second call', () => {
  const middleware = createCache({ ttl: 5000 });
  
  const req1 = { method: 'GET', url: '/api/data' };
  const res1 = makeMockRes();
  res1.setHeader('Content-Type', 'application/json');
  
  middleware(req1, res1, () => {});
  res1.send(JSON.stringify({ hello: 'world' }));
  
  assert.strictEqual(res1.getHeader('X-Cache'), 'MISS');
  assert.strictEqual(middleware.size, 1);

  const req2 = { method: 'GET', url: '/api/data' };
  const res2 = makeMockRes();
  let nextCalled = false;
  
  middleware(req2, res2, () => { nextCalled = true; });
  
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res2.getHeader('X-Cache'), 'HIT');
  assert.strictEqual(res2.getHeader('Content-Type'), 'application/json');
  assert.strictEqual(res2.sentData, JSON.stringify({ hello: 'world' }));
});

test('cache expires items based on TTL', () => {
  const middleware = createCache({ ttl: 100 });
  const req = { method: 'GET', url: '/api/temp' };
  
  const res1 = makeMockRes();
  middleware(req, res1, () => {});
  res1.send('temporary data');
  
  const originalDateNow = Date.now;
  Date.now = () => originalDateNow() + 200;

  try {
    const res2 = makeMockRes();
    let nextCalled = false;
    
    middleware(req, res2, () => { nextCalled = true; });
    
    assert.strictEqual(nextCalled, true);
    assert.strictEqual(res2.getHeader('X-Cache'), 'MISS');
    assert.strictEqual(middleware.size, 0);
  } finally {
    Date.now = originalDateNow;
  }
});

test('respects maxSize by evicting the oldest item', () => {
  const middleware = createCache({ maxSize: 2 });
  
  const insertCache = (url) => {
    const req = { method: 'GET', url };
    const res = makeMockRes();
    middleware(req, res, () => {});
    res.send(`Data for ${url}`);
  };

  insertCache('/1');
  insertCache('/2');
  insertCache('/3');

  assert.strictEqual(middleware.size, 2);

  const resCheck1 = makeMockRes();
  middleware({ method: 'GET', url: '/1' }, resCheck1, () => {});
  assert.strictEqual(resCheck1.getHeader('X-Cache'), 'MISS');

  const resCheck3 = makeMockRes();
  let nextCalled = false;
  middleware({ method: 'GET', url: '/3' }, resCheck3, () => { nextCalled = true; });
  assert.strictEqual(resCheck3.getHeader('X-Cache'), 'HIT');
});

test('invalidate throws if pattern is not a string', () => {
  const middleware = createCache();
  assert.throws(() => middleware.invalidate(/regex/), TypeError);
});

test('invalidate removes keys matching pattern', () => {
  const middleware = createCache();
  
  const req1 = { method: 'GET', url: '/users/1' };
  const res1 = makeMockRes();
  middleware(req1, res1, () => {});
  res1.send('user 1');

  const req2 = { method: 'GET', url: '/users/2' };
  const res2 = makeMockRes();
  middleware(req2, res2, () => {});
  res2.send('user 2');

  const req3 = { method: 'GET', url: '/posts/1' };
  const res3 = makeMockRes();
  middleware(req3, res3, () => {});
  res3.send('post 1');

  assert.strictEqual(middleware.size, 3);

  middleware.invalidate('/users');

  assert.strictEqual(middleware.size, 1);
  
  const resCheck = makeMockRes();
  middleware(req3, resCheck, () => {});
  assert.strictEqual(resCheck.getHeader('X-Cache'), 'HIT');
});

test('clear empties the entire cache', () => {
  const middleware = createCache();
  
  const req = { method: 'GET', url: '/api/data' };
  const res = makeMockRes();
  middleware(req, res, () => {});
  res.send('data');

  assert.strictEqual(middleware.size, 1);
  middleware.clear();
  assert.strictEqual(middleware.size, 0);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);