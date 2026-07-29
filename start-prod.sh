#!/bin/bash
set -euo pipefail

echo "=== Starting Redis ==="
redis-server --daemonize yes --logfile /tmp/redis.log --port 6379 --bind 127.0.0.1
sleep 1
redis-cli ping
echo "Redis is ready"

echo "=== Installing backend dependencies ==="
cd backend
npm install --legacy-peer-deps

echo "=== Generating Prisma client ==="
npx prisma generate

echo "=== Running Prisma migrations ==="
npx prisma migrate deploy

echo "=== Building backend ==="
npm run build

echo "=== Starting backend on port 3000 ==="
PORT=3000 node dist/index.js
