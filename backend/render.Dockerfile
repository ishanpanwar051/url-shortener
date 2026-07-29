FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY prisma ./prisma
RUN ./node_modules/.bin/prisma generate

COPY dist ./dist

EXPOSE 10000

CMD ./node_modules/.bin/prisma migrate deploy && node dist/index.js