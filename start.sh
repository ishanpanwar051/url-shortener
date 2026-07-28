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

echo "=== Starting backend on port 3001 ==="
PORT=3001 npm run dev &
cd ..

echo "=== Waiting for backend to be ready ==="
for i in $(seq 1 60); do
  if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
    echo "Backend ready after ${i}s"
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "ERROR: Backend did not start in time"
    exit 1
  fi
  sleep 1
done

echo "=== Installing frontend dependencies ==="
cd frontend
if [ ! -d node_modules ]; then
  npm install --legacy-peer-deps
fi

echo "=== Starting frontend on port 3000 ==="
PORT=3000 BROWSER=none npm start
