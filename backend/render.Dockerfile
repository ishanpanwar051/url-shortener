FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
COPY dist ./dist

RUN npm install --ignore-scripts 2>&1 | tail -5

RUN ./node_modules/.bin/prisma generate 2>&1 | tail -5

EXPOSE 10000

CMD ./node_modules/.bin/prisma migrate deploy && node dist/index.js