FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
<<<<<<< Updated upstream
RUN npm ci --ignore-scripts

COPY prisma ./prisma
RUN npx prisma generate
=======
RUN npm install --production --no-optional --no-audit --no-fund

COPY prisma ./prisma
RUN ./node_modules/.bin/prisma generate
>>>>>>> Stashed changes

COPY dist ./dist

EXPOSE 10000

CMD npx prisma migrate deploy && node dist/index.js