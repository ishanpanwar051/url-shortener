---
name: URL Shortener Replit setup
description: Durable lessons from getting this TypeScript/Express/React/PostgreSQL/Redis project running on Replit.
---

# URL Shortener — Replit Run Notes

## How it runs
`bash start.sh` → Redis (127.0.0.1:6379, internal only) → backend (port 3001) → frontend (port 3000, webview). Frontend proxies `/api/*` to backend via CRA `"proxy"` field.

## Key gotchas

### @types/csurf causes duplicate express-serve-static-core
`csurf` pulls in its own copy of `@types/express-serve-static-core`, causing TS2742/TS2769 errors on `app` and `router` declarations. Fixes: use `as unknown as express.RequestHandler` for the middleware cast, and annotate `const router: IRouter = Router()` explicitly in all route files.

**Why:** Two separate copies of the same @types package in node_modules produce structurally-incompatible types even though they're identical at runtime.

### node-gyp pulls in blocked tar
`tar@6.2.1` is blocked by Replit's package firewall (critical CVE). `node-gyp` (C++ addon build tool) is the culprit. Since `backend/src/utils/core.ts` provides a full JS fallback for the native addon, `node-gyp` and `node-addon-api` can be removed from devDependencies. Add `"overrides": { "tar": "^7.0.0" }` to catch any remaining transitive dependency.

**Why:** The C++ addon is a performance optimization only — JS fallback is fully featured.

### Redis must bind to 127.0.0.1
Start Redis with `--bind 127.0.0.1` to prevent it from being reachable externally. Do not add a `[[ports]]` entry for port 6379 in `.replit`.

### start.sh reliability
Use `set -euo pipefail`. Do not pipe build steps through `tail` — it swallows exit codes. Check for `frontend/node_modules` existence before installing (on first run it's missing; on restarts it exists).
