FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++ cmake openssl

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npm run prisma:generate

COPY . .

# Build C++ native module (optional — falls back to JS implementation)
RUN cd core && cmake -B build && cmake --build build || echo "C++ native module build skipped (JS fallback will be used)"

# Build TypeScript
RUN npm run build

FROM node:20-alpine

WORKDIR /app

# Prisma needs OpenSSL on Alpine
RUN apk add --no-cache openssl

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/core/build ./core/build
COPY --from=builder /app/prisma ./prisma
COPY package*.json ./

EXPOSE 3000

COPY --from=builder /app/prisma/migrations ./prisma/migrations

# Run migrations then start the app
CMD npm run prisma:migrate:deploy && node dist/index.js
