FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++ cmake openssl

WORKDIR /app

COPY package*.json ./
RUN npm install --no-optional --no-audit --no-fund 2>&1 || npm install --no-optional --no-audit --no-fund 2>&1

COPY prisma ./prisma
RUN ./node_modules/.bin/prisma generate

COPY . .

RUN cd core && (cmake -B build && cmake --build build || echo "C++ native module build skipped (JS fallback will be used)")

RUN npm run build

FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache openssl

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY package*.json ./

EXPOSE 10000

CMD ./node_modules/.bin/prisma migrate deploy && node dist/index.js