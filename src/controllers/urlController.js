const { pool }                       = require('../db');
const cache                          = require('../utils/cache');
const { generateCode, isValidCode, isValidUrl } = require('../utils/encoder');

const BASE_URL = () => process.env.BASE_URL || 'http://localhost:3000';
const MAX_RETRIES = 5;

// ─── POST /api/shorten ────────────────────────────────────────────────────────
async function shortenUrl(req, res) {
  const { url, customAlias, expiresInDays } = req.body;

  if (!url)             return res.status(400).json({ error: 'url is required' });
  if (!isValidUrl(url)) return res.status(400).json({ error: 'Invalid URL. Must start with http:// or https://' });

  // Custom alias validation
  if (customAlias) {
    if (!isValidCode(customAlias)) {
      return res.status(400).json({ error: 'Custom alias must be 3–20 alphanumeric characters' });
    }
    const existing = await pool.query('SELECT id FROM urls WHERE short_code = $1', [customAlias]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Custom alias already taken' });
    }
  }

  // Generate unique code with collision retry
  let shortCode = customAlias || null;
  if (!shortCode) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const candidate = generateCode();
      const collision = await pool.query('SELECT id FROM urls WHERE short_code = $1', [candidate]);
      if (collision.rows.length === 0) { shortCode = candidate; break; }
    }
    if (!shortCode) return res.status(500).json({ error: 'Could not generate unique code, try again' });
  }

  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 86400 * 1000)
    : null;

  const result = await pool.query(
    `INSERT INTO urls (short_code, long_url, custom_alias, expires_at)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [shortCode, url, !!customAlias, expiresAt]
  );

  const row = result.rows[0];
  cache.set(shortCode, { longUrl: url, expiresAt: row.expires_at, isActive: true });

  return res.status(201).json({
    shortUrl:   `${BASE_URL()}/${shortCode}`,
    shortCode,
    longUrl:    url,
    expiresAt:  row.expires_at,
    createdAt:  row.created_at,
  });
}

// ─── GET /:code (redirect) ────────────────────────────────────────────────────
async function redirectUrl(req, res) {
  const { code } = req.params;

  // 1. Cache lookup (hot path — ~1ms)
  let entry = cache.get(code);

  // 2. DB fallback on cache miss
  if (!entry) {
    const result = await pool.query(
      'SELECT long_url, expires_at, is_active FROM urls WHERE short_code = $1',
      [code]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Short URL not found' });
    const row = result.rows[0];
    entry = { longUrl: row.long_url, expiresAt: row.expires_at, isActive: row.is_active };
    cache.set(code, entry);  // warm the cache
  }

  if (!entry.isActive) return res.status(410).json({ error: 'This link has been deactivated' });

  if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) {
    cache.del(code);
    return res.status(410).json({ error: 'This link has expired' });
  }

  // 3. Fire-and-forget click tracking (async — doesn't delay redirect)
  setImmediate(() => recordClick(code, req));

  // 302 = tracks every click; 301 = browser caches (faster but loses analytics)
  return res.redirect(302, entry.longUrl);
}

// ─── GET /api/urls/:code/stats ────────────────────────────────────────────────
async function getStats(req, res) {
  const { code } = req.params;

  const urlResult = await pool.query(
    'SELECT * FROM urls WHERE short_code = $1',
    [code]
  );
  if (urlResult.rows.length === 0) return res.status(404).json({ error: 'Not found' });

  const clickResult = await pool.query(
    `SELECT
       COUNT(*)                                         AS total_clicks,
       COUNT(DISTINCT ip_address)                       AS unique_visitors,
       MIN(clicked_at)                                  AS first_click,
       MAX(clicked_at)                                  AS last_click
     FROM clicks WHERE short_code = $1`,
    [code]
  );

  const recentClicks = await pool.query(
    `SELECT clicked_at, ip_address, referrer, user_agent
     FROM clicks WHERE short_code = $1
     ORDER BY clicked_at DESC LIMIT 10`,
    [code]
  );

  const url = urlResult.rows[0];
  const stats = clickResult.rows[0];

  return res.json({
    shortUrl:       `${BASE_URL()}/${code}`,
    shortCode:      code,
    longUrl:        url.long_url,
    isActive:       url.is_active,
    createdAt:      url.created_at,
    expiresAt:      url.expires_at,
    totalClicks:    parseInt(stats.total_clicks),
    uniqueVisitors: parseInt(stats.unique_visitors),
    firstClick:     stats.first_click,
    lastClick:      stats.last_click,
    recentClicks:   recentClicks.rows,
  });
}

// ─── GET /api/urls ─────────────────────────────────────────────────────────────
async function listUrls(req, res) {
  const limit  = Math.min(parseInt(req.query.limit)  || 20, 100);
  const offset = parseInt(req.query.offset) || 0;

  const result = await pool.query(
    `SELECT u.short_code, u.long_url, u.created_at, u.expires_at, u.is_active,
            COUNT(c.id) AS click_count
     FROM urls u
     LEFT JOIN clicks c ON c.short_code = u.short_code
     GROUP BY u.id
     ORDER BY u.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  return res.json({
    urls:   result.rows,
    limit,
    offset,
  });
}

// ─── DELETE /api/urls/:code ───────────────────────────────────────────────────
async function deleteUrl(req, res) {
  const { code } = req.params;
  const result = await pool.query(
    'UPDATE urls SET is_active = FALSE WHERE short_code = $1 RETURNING id',
    [code]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
  cache.del(code);
  return res.json({ message: 'Link deactivated', shortCode: code });
}

// ─── Internal: record click ───────────────────────────────────────────────────
async function recordClick(shortCode, req) {
  try {
    const ip       = req.ip || req.connection.remoteAddress;
    const ua       = req.headers['user-agent'] || '';
    const referrer = req.headers['referer'] || req.headers['referrer'] || '';
    await pool.query(
      'INSERT INTO clicks (short_code, ip_address, user_agent, referrer) VALUES ($1, $2, $3, $4)',
      [shortCode, ip, ua, referrer]
    );
  } catch (err) {
    console.error('Click tracking error:', err.message);
  }
}

module.exports = { shortenUrl, redirectUrl, getStats, listUrls, deleteUrl };
