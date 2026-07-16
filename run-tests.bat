@echo off
setlocal enabledelayedexpansion

echo === URL Shortener E2E Tests ===

set PORT=3456
set TEST_DATABASE_URL=file:./backend/prisma/test.db
set DATABASE_URL=file:./backend/prisma/test.db
set JWT_SECRET=test-secret-key-for-e2e-tests
set REDIS_URL=
set USE_TEST_DB=true
set MACHINE_ID=1
set BLOOM_FILTER_EXPECTED=100000
set LRU_CACHE_CAPACITY=1000
set RATE_LIMIT_PER_MINUTE=1000

:: Clean test database
del /f /q backend\prisma\test.db 2>nul

:: Generate Prisma client
cd backend
npx prisma generate --schema=prisma/schema.test.prisma --quiet 2>nul
npx prisma db push --schema=prisma/schema.test.prisma --accept-data-loss --quiet 2>nul
cd ..

:: Start server in background
echo Starting server...
start "url-shortener-server" cmd /c "cd /d backend && set DATABASE_URL=file:./prisma/test.db && set TEST_DATABASE_URL=file:./prisma/test.db && set JWT_SECRET=test-secret-key-for-e2e-tests && set REDIS_URL= && set USE_TEST_DB=true && set PORT=3456 && set MACHINE_ID=1 && set BLOOM_FILTER_EXPECTED=100000 && set LRU_CACHE_CAPACITY=1000 && set RATE_LIMIT_PER_MINUTE=1000 && npx ts-node src/index.ts"

:: Wait for server
echo Waiting for server...
:waitloop
timeout /t 2 /nobreak >nul
curl -s http://localhost:3456/health >nul 2>&1
if errorlevel 1 goto waitloop

echo Server ready!

:: Run tests
cd tests
npx playwright test --config=playwright.config.ts
set TEST_EXIT_CODE=%errorlevel%
cd ..

:: Cleanup
echo Done. Exit code: %TEST_EXIT_CODE%

exit /b %TEST_EXIT_CODE%
