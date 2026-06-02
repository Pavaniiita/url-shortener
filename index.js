require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');
const path     = require('path');

const { initDB }          = require('./src/db');
const apiRoutes           = require('./src/routes/api');
const { redirectUrl }     = require('./src/controllers/urlController');
const { redirectLimiter } = require('./src/middleware/rateLimiter');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// // ── Serve frontend ────────────────────────────────────────────────────────────
// app.use(express.static(path.join(__dirname, 'public')));

// // ── API routes ────────────────────────────────────────────────────────────────
// app.use('/api', apiRoutes);

// // ── Health check ──────────────────────────────────────────────────────────────
// app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date() }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date() }));

// // ── Root route ────────────────────────────────────────────────────────────────
// app.get('/', (req, res) => {
//   res.sendFile(path.join(__dirname, 'public', 'index.html'));
// });

// ── Serve frontend ────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api', apiRoutes);

// ── Redirect — must be last (catches /:code) ──────────────────────────────────
app.get('/:code', redirectLimiter, redirectUrl);

// ── 404 fallback ──────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Boot ──────────────────────────────────────────────────────────────────────
async function start() {
  await initDB();
  app.listen(PORT,'0.0.0.0', () => {
    console.log(`\n URL Shortener running on http://localhost:${PORT}`);
    console.log(` Frontend:  http://localhost:${PORT}`);
    console.log(` Health:    GET  /health`);
    console.log(` Shorten:   POST /api/shorten`);
    console.log(` Redirect:  GET  /:code`);
    console.log(` Stats:     GET  /api/urls/:code/stats`);
    console.log(` List all:  GET  /api/urls`);
    console.log(` Delete:    DELETE /api/urls/:code\n`);
  });
}

start().catch(err => {
  console.error('Startup failed:', err);
  process.exit(1);
});
