# URL Shortener

A production-grade URL shortener built with **Node.js + Express + PostgreSQL**.  
Covers every major system design interview topic: caching, rate limiting, collision handling, analytics, and horizontal scalability.

---

## Features

| Feature | Details |
|---|---|
| URL shortening | Base62 codes, 7 chars, 3.5 trillion possible URLs |
| Custom aliases | `/api/shorten` with `customAlias` field |
| Link expiry | `expiresInDays` param, auto-checked on redirect |
| Click analytics | Per-link: total clicks, unique visitors, recent clicks |
| Rate limiting | Sliding window — 20 creates/min, 200 redirects/min per IP |
| LRU cache | In-memory cache (swap for Redis in production) |
| Soft delete | Deactivate links without deleting data |
| 302 redirects | Tracks every click; upgrade to 301 for performance |

---

## Setup

### 1. PostgreSQL

```sql
CREATE DATABASE url_shortener;
```

### 2. Environment

```bash
cp .env.example .env
# Edit .env with your DB credentials
```

### 3. Run

```bash
npm install
npm run dev      # development with auto-reload
npm start        # production
```

The server starts on `http://localhost:3000` and creates all tables automatically.

---

## API Reference

### POST `/api/shorten` — create a short URL

```bash
curl -X POST http://localhost:3000/api/shorten \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/very/long/path"}'
```

With custom alias and expiry:
```bash
curl -X POST http://localhost:3000/api/shorten \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "customAlias": "my-link", "expiresInDays": 7}'
```

Response:
```json
{
  "shortUrl": "http://localhost:3000/aX3kP92",
  "shortCode": "aX3kP92",
  "longUrl": "https://example.com/very/long/path",
  "expiresAt": null,
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### GET `/:code` — redirect

```bash
curl -L http://localhost:3000/aX3kP92
# → 302 redirect to the original URL
```

### GET `/api/urls/:code/stats` — click analytics

```bash
curl http://localhost:3000/api/urls/aX3kP92/stats
```

Response:
```json
{
  "shortCode": "aX3kP92",
  "longUrl": "https://example.com",
  "totalClicks": 42,
  "uniqueVisitors": 31,
  "firstClick": "2024-01-01T10:00:00Z",
  "lastClick": "2024-01-02T15:30:00Z",
  "recentClicks": [...]
}
```

### GET `/api/urls` — list all URLs

```bash
curl "http://localhost:3000/api/urls?limit=10&offset=0"
```

### DELETE `/api/urls/:code` — deactivate a link

```bash
curl -X DELETE http://localhost:3000/api/urls/aX3kP92
```

---

## Architecture

```
Client
  │
  ▼
Rate Limiter (sliding window, per IP)
  │
  ▼
Express Router
  ├── POST /api/shorten  →  generate code → write DB → warm cache
  └── GET /:code         →  check cache → DB fallback → 302 redirect
                                                   └── async: record click
```

### Cache strategy: Cache-Aside

1. On redirect: check in-memory LRU cache first
2. Cache miss: query PostgreSQL, store result in cache
3. On create: write to DB, then immediately warm cache
4. On delete: remove from DB and invalidate cache entry

**To upgrade to Redis:** replace `src/utils/cache.js` with a Redis client
using the same `get(key)` / `set(key, value, ttl)` / `del(key)` interface.

---


