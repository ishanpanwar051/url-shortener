FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

COPY prisma ./prisma
RUN npx prisma generate

COPY dist ./dist
COPY package*.json ./

EXPOSE 10000

CMD npx prisma migrate deploy && node dist/index.js