/**
 * Sliding window rate limiter.
 * Tracks request timestamps per IP in a rolling time window.
 *
 * Interview talking point: "Token bucket is simpler to implement but sliding
 * window is more accurate — it prevents bursting at window boundaries.
 * In production this state would live in Redis so all app server instances
 * share the same counters."
 */

const WINDOW_MS  = 60 * 1000;  // 1 minute
const MAX_CREATE = 20;          // max POST /shorten per window per IP
const MAX_READ   = 200;         // max GET /{code} per window per IP

const store = new Map();

function getCount(ip, route) {
  const key = `${ip}:${route}`;
  const now = Date.now();
  const timestamps = (store.get(key) || []).filter(t => now - t < WINDOW_MS);
  store.set(key, timestamps);
  return timestamps;
}

function rateLimiter(limit) {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const key = `${ip}:${req.path}`;
    const now = Date.now();
    const timestamps = getCount(ip, req.path);

    if (timestamps.length >= limit) {
      const retryAfter = Math.ceil((timestamps[0] + WINDOW_MS - now) / 1000);
      return res.status(429).json({
        error: 'Too many requests',
        retryAfterSeconds: retryAfter,
      });
    }

    timestamps.push(now);
    store.set(key, timestamps);
    next();
  };
}

module.exports = {
  createLimiter:   rateLimiter(MAX_CREATE),
  redirectLimiter: rateLimiter(MAX_READ),
};
