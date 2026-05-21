import express from 'express';
import createCache from '../lib/index.js'; 

const app = express();
app.use(express.json());

// global instance: automatically caches all GET requests
const globalCache = createCache({
  ttl: 15 * 1000,
  maxEntries: 500,
  debug: true,
  methods: ['GET'],
  skip: (req) => req.query.bypass === 'true' || req.path === '/'
});

// apply the cache to the entire express application
app.use(globalCache);


app.get('/', (req, res) => {
  res.json({
    message: 'Routes available in this demo:',
    routes: [
      '/api/trending (15s cache, 2s delay)',
      '/api/transactions (15s cache, 3s delay)',
      '/page/about (HTML, 15s cache)',
      '/admin/clear-cache (POST)'
    ]
  });
});

app.get('/api/trending', async (req, res) => {
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  res.json({
    data: ['AI Agents', 'JavaScript Latest', 'Express Performance'],
    generatedAt: new Date().toISOString()
  });
});

app.get('/api/transactions', async (req, res) => {
  await new Promise(resolve => setTimeout(resolve, 3000));
  res.json([{ id: 1, amount: 100 }, { id: 2, amount: 50 }, { id: 3, amount: 75 }, { id: 4, amount: 200 }]);
});

// mutation route, invalidates all /api/transactions cache entries on new transaction
app.post('/api/transactions', (req, res) => {
  globalCache.invalidate('/api/transactions');
  
  res.status(201).json({
    message: `Successfully added new item. Cache invalidated!`,
  });
});

app.get('/page/about', async (req, res) => {
  await new Promise(resolve => setTimeout(resolve, 1000));
  res.setHeader('Content-Type', 'text/html');
  res.send(`
    <html>
      <body style="font-family: sans-serif; padding: 2rem;">
        <h1>About Us</h1>
        <p>This HTML was generated at: <b>${new Date().toLocaleTimeString()}</b></p>
        <p>Refresh the page to see the time freeze for 15 seconds (Cache Hit).</p>
      </body>
    </html>
  `);
});

// clear cache route
app.post('/admin/clear-cache', (req, res) => {
  const cacheSize = globalCache.size;
  
  globalCache.clear();

  res.json({
    message: 'Global cache purge executed successfully.',
    itemsRemoved: cacheSize
  });
});

// server setup
const PORT = 3030;
app.listen(PORT, () => {
  console.log(`\nCache Demo running at http://localhost:${PORT}\n`);
  
  console.log(`TEST SCRIPT:`);
  console.log(`1. GET  http://localhost:${PORT}/api/trending       (15s cache, 2s delay)`);
  console.log(`2. GET  http://localhost:${PORT}/api/trending?bypass=true (Forces 2s delay)`);
  console.log(`3. GET  http://localhost:${PORT}/api/transactions     (15s cache, 3s delay)`);
  console.log(`4. GET  http://localhost:${PORT}/page/about         (15s cache, Caches raw HTML)`);
  console.log(`\nADVANCED ADMIN COMMANDS:`);
  console.log(`curl -X POST http://localhost:${PORT}/api/transactions`);
  console.log(`curl -X POST http://localhost:${PORT}/admin/clear-cache\n`);
});