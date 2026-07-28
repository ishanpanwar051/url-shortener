# URL Shortener

A full-stack, production-ready URL shortener with analytics, QR codes, admin panel, and advanced link controls. Comparable to Bitly/TinyURL in feature scope.

## Architecture

- **Backend:** TypeScript/Express + Prisma ORM (PostgreSQL) + Redis caching + C++ native addon (JS fallback included)
- **Frontend:** React 18 + TypeScript (Create React App)
- **Database:** PostgreSQL (primary), SQLite (tests)
- **Cache:** Redis (multi-layer: LRU in-process → Redis → DB, with Bloom filter & stampede protection)
- **Monitoring:** Prometheus metrics at `/metrics`, Swagger/OpenAPI docs at `/api/docs`

## Features

- **URL Shortening:** Custom aliases, random short codes (Base62 + Snowflake ID), collision retry
- **Advanced Link Controls:** Password protection, one-time links, max click limits, expiry, tags, title
- **Redirect System:** 302 redirects, expired/disabled/maxed-out links handled gracefully
- **QR Codes:** Server-side PNG generation, customizable color and size
- **Analytics:** Click tracking with device, browser, OS, referrer, UTM breakdown; bar & pie charts
- **User Dashboard:** Search, filter, sort, export CSV, toggle active, edit title/tags
- **Admin Panel:** System stats, user management (ban/promote), URL moderation
- **Auth:** JWT in HttpOnly cookie, token blacklisting on logout, rate limiting
- **Security:** CSRF protection, Helmet headers, SSRF validation, bcrypt passwords, input validation (Zod)
- **API Docs:** OpenAPI 3.0 spec at `/api/docs.json`, Swagger UI at `/api/docs`

## Running on Replit

### How to Run
Click **Run** — the `Start application` workflow runs `bash start.sh` which:
1. Starts Redis (port 6379, daemonized)
2. Installs backend dependencies & runs Prisma migrations
3. Starts the Express backend (port 3001, ts-node-dev)
4. Starts the React frontend (port 3000, CRA dev server — this is the webview)

The frontend proxies `/api/*` requests to the backend on port 3001.

### Environment (Replit-managed)
- `DATABASE_URL` — injected automatically by Replit (PostgreSQL)
- `JWT_SECRET` — set as a Replit Secret
- `REDIS_URL` — set to `redis://localhost:6379`
- `NODE_ENV` — set to `development`
- `CORS_ORIGIN` — set to `*`

### After Schema Changes
```bash
cd backend && npx prisma migrate deploy
```

### Running Locally (Docker — Recommended)
```bash
cp .env.example .env   # fill in JWT_SECRET (openssl rand -base64 48)
docker compose up --build
# App at http://localhost:8080
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | — | Register user |
| POST | `/api/auth/login` | — | Login |
| POST | `/api/auth/logout` | ✓ | Logout (blacklists JWT) |
| GET | `/api/auth/me` | ✓ | Get current user |
| POST | `/api/shorten` | opt | Create short URL |
| GET | `/api/urls` | ✓ | List user's URLs (search/filter/sort/page) |
| GET | `/api/urls/export` | ✓ | Export CSV |
| PATCH | `/api/urls/:id` | ✓ | Update URL |
| DELETE | `/api/urls/:id` | ✓ | Delete URL |
| GET | `/api/analytics/:code` | ✓ | URL analytics |
| GET | `/api/qr/:code` | — | Generate QR PNG |
| GET | `/api/admin/stats` | ADMIN | System stats |
| GET | `/api/admin/users` | ADMIN | List users |
| PATCH | `/api/admin/users/:id` | ADMIN | Update user role/status |
| DELETE | `/api/admin/users/:id` | ADMIN | Delete user |
| GET | `/api/admin/urls` | ADMIN | List all URLs |
| DELETE | `/api/admin/urls/:id` | ADMIN | Delete any URL |
| GET | `/:shortCode` | — | Redirect (shows password form if protected) |
| POST | `/:shortCode/verify` | — | Submit password for protected link |
| GET | `/health` | — | Health check |
| GET | `/api/docs` | — | Swagger UI |

## User Preferences
- Keep existing project structure and stack
- Prefer TypeScript strict mode
- Preserve all existing functionality when adding features
