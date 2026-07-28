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

## Running Locally

### Prerequisites
- Node.js 18+
- PostgreSQL 15+
- Redis 7+

### Quick Start (Docker — Recommended)
```bash
# Copy env and fill in JWT_SECRET (generate with: openssl rand -base64 48)
cp .env.example .env
# Edit .env to set JWT_SECRET

docker compose up --build
# App available at http://localhost:8080
```

### Without Docker
```bash
# Backend
cd backend
cp ../.env.example .env   # fill in DATABASE_URL, REDIS_URL, JWT_SECRET
npm install
npx prisma migrate deploy
npm run dev               # runs on PORT=3000

# Frontend (separate terminal)
cd frontend
npm install
npm start                 # runs on PORT=3000 (proxied to backend)
```

### Environment Variables
See `.env.example` for all options. Required:
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — min 32 chars random string (`openssl rand -base64 48`)
- `REDIS_URL` — Redis connection string

### After Schema Changes
```bash
cd backend
npx prisma migrate deploy   # applies all pending migrations
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
