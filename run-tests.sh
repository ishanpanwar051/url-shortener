#!/bin/bash
set -e

echo "=== URL Shortener E2E Tests ==="

# Set environment variables for testing
export PORT=3456
export TEST_DATABASE_URL="file:./backend/prisma/test.db"
export DATABASE_URL="$TEST_DATABASE_URL"
export JWT_SECRET="test-secret-key-for-e2e-tests"
export REDIS_URL=""
export USE_TEST_DB="true"
export MACHINE_ID=1
export BLOOM_FILTER_EXPECTED=100000
export LRU_CACHE_CAPACITY=1000
export RATE_LIMIT_PER_MINUTE=1000

# Create fresh test database
rm -f backend/prisma/test.db

# Generate Prisma client and push schema
cd backend
npx prisma generate --schema=prisma/schema.test.prisma --quiet 2>/dev/null
npx prisma db push --schema=prisma/schema.test.prisma --accept-data-loss --quiet 2>/dev/null
cd ..

# Start the backend server in the background
echo "Starting backend server on port $PORT..."
cd backend
DATABASE_URL="file:./prisma/test.db" \
TEST_DATABASE_URL="file:./prisma/test.db" \
JWT_SECRET="test-secret-key-for-e2e-tests" \
REDIS_URL="" \
USE_TEST_DB="true" \
PORT=3456 \
MACHINE_ID=1 \
BLOOM_FILTER_EXPECTED=100000 \
LRU_CACHE_CAPACITY=1000 \
RATE_LIMIT_PER_MINUTE=1000 \
npx ts-node src/index.ts &
SERVER_PID=$!
cd ..

# Wait for server to be ready
echo "Waiting for server to start..."
for i in $(seq 1 30); do
  if curl -s http://localhost:3456/health > /dev/null 2>&1; then
    echo "Server is ready!"
    break
  fi
  sleep 1
done

# Run Playwright tests
echo "Running Playwright E2E tests..."
cd tests
npx playwright test --config=playwright.config.ts
TEST_EXIT_CODE=$?
cd ..

# Cleanup
echo "Stopping server..."
kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true

exit $TEST_EXIT_CODE
