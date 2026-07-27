# URL Shortener

A full-stack URL shortener with analytics, built with TypeScript, Express, React, PostgreSQL, Redis, and a C++ native addon for performance-critical operations.

## Architecture

- **Backend:** TypeScript/Express with Prisma ORM (PostgreSQL), Redis caching, C++ native addon
- **Frontend:** React 18 with TypeScript
- **Database:** PostgreSQL (primary), SQLite (tests)
- **Cache:** Redis (caching, distributed locking, click-event buffering)
- **Monitoring:** Prometheus + Grafana
- **Proxy:** Nginx

## Quick Start

### Prerequisites
- Node.js 18+
- Docker & Docker Compose (recommended)
- PostgreSQL 15+ (if running locally)
- Redis 7+ (if running locally)
- C++ build toolchain (CMake, g++/cl) for native addon

### Docker (Recommended)

```bash
# Generate a secure JWT secret
# Linux/macOS: openssl rand -base64 48
# Windows PowerShell: [Convert]::ToBase64String((1..64|%{Get-Random -Max 256}))

# Update JWT_SECRET in backend/.env, then:
docker compose up --build
```

### Local Development

```bash
# Backend
cd backend
cp ../.env.example .env
npm install
npx prisma generate
npx prisma generate
npm run dev

# Frontend (separate terminal)
cd frontend
npm install
npm startherm
```

### Testing

```bash
# Unit tests
cd backend && npm test

# E2E tests (requires backend running on port 3456 with USE_TEST_DB=true)
./run-tests.bat  # Windows
./run-tests.sh   # Unix
``
### Deployment

```bash
# Docker Compose (full stack)
docker compose up --build

# Services: backend, frontend, postgres, redis, prometheus, grafana
```

### Environment Variables

See `.env.example` for all required variables. Generate a secure JWT secret:
- Linux/macOS: `openssl rand -base64 48`
- Windows PowerShell: `[Convert]::ToBase64String((1..64|%{Get-Random -Max 256}))`
