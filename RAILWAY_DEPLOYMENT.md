# Railway Deployment Guide

## Prerequisites
- Railway account (https://railway.app)
- Railway CLI installed (optional but recommended)
- Git repository with this project

## Deployment Steps

### 1. Push to GitHub
```bash
git add .
git commit -m "Add Railway configuration"
git push
```

### 2. Create Railway Project
1. Go to https://railway.app
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository
4. Railway will auto-detect the Docker configuration

### 3. Add Services

#### Backend Service
1. Click "New Service" → "Dockerfile"
2. Select `backend/Dockerfile`
3. Set root directory to `backend`
4. Add environment variables (see below)

#### Frontend Service  
1. Click "New Service" → "Dockerfile"
2. Select `frontend/Dockerfile`
3. Set root directory to `frontend`
4. Add environment variables (see below)

#### Database Services
1. Click "New Service" → "Database" → "PostgreSQL"
2. Click "New Service" → "Database" → "Redis"

### 4. Configure Environment Variables

#### Backend Environment Variables
```
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
JWT_SECRET=<generate-secure-random-key>
JWT_EXPIRES_IN=7d
NODE_ENV=production
PORT=3000
MACHINE_ID=1
CORS_ORIGIN=https://<your-frontend-domain>.railway.app
PUBLIC_BASE_URL=https://<your-frontend-domain>.railway.app
BLOOM_FILTER_EXPECTED=1000000
BLOOM_FILTER_FPR=0.01
LRU_CACHE_CAPACITY=10000
RATE_LIMIT_PER_MINUTE=60
SHORT_CODE_LENGTH=7
DEFAULT_URL_EXPIRY_DAYS=365
```

#### Frontend Environment Variables
```
REACT_APP_API_URL=https://<your-backend-domain>.railway.app
```

### 5. Generate JWT Secret
```bash
# Windows PowerShell
[Convert]::ToBase64String((1..64|%{Get-Random -Max 256}))
```

### 6. Connect Services
1. Go to Backend service settings
2. Add variable `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
3. Add variable `REDIS_URL` = `${{Redis.REDIS_URL}}`

### 7. Deploy
1. Click "Deploy" on each service
2. Wait for build to complete
3. Railway will provide public URLs

### 8. Update CORS and Public URL
After deployment:
1. Get your frontend Railway URL (e.g., `https://frontend.railway.app`)
2. Update backend `CORS_ORIGIN` and `PUBLIC_BASE_URL` with this URL
3. Redeploy backend

## Access URLs
After deployment, Railway will provide:
- Frontend: `https://<frontend-service>.railway.app`
- Backend: `https://<backend-service>.railway.app`
- PostgreSQL: Available via Railway variables
- Redis: Available via Railway variables

## Troubleshooting
- Check logs in Railway dashboard
- Ensure all environment variables are set
- Verify database migrations ran successfully
- Check CORS settings match frontend URL
