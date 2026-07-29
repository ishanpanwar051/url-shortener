FROM node:20-bookworm-slim AS builder

RUN apt-get update -qq && apt-get install -y -qq openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
ENV NODE_OPTIONS="--no-warnings"
RUN npm install --no-optional --no-audit --no-fund 2>&1 || npm install --no-optional --no-audit --no-fund 2>&1

COPY prisma ./prisma
RUN ./node_modules/.bin/prisma generate

COPY . .

RUN npm run build

FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update -qq && apt-get install -y -qq openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY package*.json ./

EXPOSE 10000

CMD ./node_modules/.bin/prisma migrate deploy && node dist/index.js
