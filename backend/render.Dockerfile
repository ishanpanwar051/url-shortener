FROM node:20-slim

RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
COPY dist ./dist

RUN npx prisma generate

EXPOSE 10000

CMD npx prisma migrate deploy && node dist/index.js