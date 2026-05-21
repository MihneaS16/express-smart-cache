import express from 'express';
import createCache from '../lib/index.js'; 

const app = express();
app.use(express.json());


// instance A: short TTL for highly dynamic data (allows manual bypass via query string)
const fastCache = createCache({
  ttl: 5 * 1000, // 5 seconds
  debug: true,
  skip: (req) => req.query.bypass === 'true'
});

// instance B: long TTL for static/rarely changing data
const longCache = createCache({
  ttl: 60 * 60 * 1000, // 1 hour
  debug: true,
});

// instance C: dedicated raw HTML strings cache
const htmlCache = createCache({
  ttl: 10 * 1000, // 10 seconds
  debug: true
});



// uncached route
app.get('/', (req, res) => {
  res.json({
    message: 'Routes available in this demo:',
    routes: [
      '/api/trending (5s cache)',
      '/api/transactions (1h cache)',
      '/page/about (HTML, 10s cache)',
      '/admin/clear-cache (POST)'
    ]
  });
});

// fast cached route
app.get('/api/trending', fastCache, async (req, res) => {
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  res.json({
    data: ['AI Agents', 'JavaScript Latest', 'Express Performance'],
    generatedAt: new Date().toISOString()
  });
});

// long cached route
app.get('/api/transactions', longCache, async (req, res) => {
  await new Promise(resolve => setTimeout(resolve, 3000));
  res.json([{ id: 1, amount: 100 }, { id: 2, amount: 50 }, { id: 3, amount: 75 }, { id: 4, amount: 200 }]);
});

// mutation route, invalidates all /api/transactions cache entries on new transaction
app.post('/api/transactions', (req, res) => {
  longCache.invalidate('/api/transactions');
  
  res.status(201).json({
    message: `Successfully added new item. Cache invalidated!`,
  });
});

// html cached route
app.get('/page/about', htmlCache, async (req, res) => {
  await new Promise(resolve => setTimeout(resolve, 1000));
  res.setHeader('Content-Type', 'text/html');
  res.send(`
    <html>
      <body style="font-family: sans-serif; padding: 2rem;">
        <h1>About Us</h1>
        <p>This HTML was generated at: <b>${new Date().toLocaleTimeString()}</b></p>
        <p>Refresh the page to see the time freeze for 10 seconds (Cache Hit).</p>
      </body>
    </html>
  `);
});

// clear cache route
app.post('/admin/clear-cache', (req, res) => {
  const fastSize = fastCache.size;
  const longSize = longCache.size;
  
  fastCache.clear();
  longCache.clear();
  htmlCache.clear();

  res.json({
    message: 'Global cache purge executed successfully.',
    itemsRemoved: fastSize + longSize
  });
});

// server setup
const PORT = 3030;
app.listen(PORT, () => {
  console.log(`\nCache Demo running at http://localhost:${PORT}\n`);
  
  console.log(`TEST SCRIPT:`);
  console.log(`1. GET  http://localhost:${PORT}/api/trending       (5s cache, 2s delay)`);
  console.log(`2. GET  http://localhost:${PORT}/api/trending?bypass=true (Forces 2s delay)`);
  console.log(`3. GET  http://localhost:${PORT}/api/transactions     (1h cache, 3s delay)`);
  console.log(`4. GET  http://localhost:${PORT}/page/about         (10s cache, Caches raw HTML)`);
  console.log(`\nADVANCED ADMIN COMMANDS:`);
  console.log(`curl -X POST http://localhost:${PORT}/api/transactions`);
  console.log(`curl -X POST http://localhost:${PORT}/admin/clear-cache\n`);
});