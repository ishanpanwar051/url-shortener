#!/bin/bash

echo "=== Starting Redis ==="
redis-server --daemonize yes --logfile /tmp/redis.log --port 6379
sleep 1
if redis-cli ping 2>/dev/null | grep -q PONG; then
  echo "Redis is ready"
else
  echo "WARNING: Redis may not be ready yet, continuing..."
fi

echo "=== Installing backend dependencies ==="
cd backend
npm install --legacy-peer-deps 2>&1 | tail -3

echo "=== Generating Prisma client ==="
npx prisma generate 2>&1 | tail -3

echo "=== Running Prisma migrations ==="
npx prisma migrate deploy 2>&1

echo "=== Starting backend on port 3001 ==="
PORT=3001 npm run dev &
BACKEND_PID=$!
cd ..

echo "=== Waiting for backend to be ready ==="
for i in $(seq 1 60); do
  if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
    echo "Backend ready after ${i}s"
    break
  fi
  sleep 1
done

echo "=== Starting frontend on port 3000 ==="
cd frontend
PORT=3000 BROWSER=none npm start
