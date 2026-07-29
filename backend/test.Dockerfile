FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install && echo "STEP1_OK"

COPY prisma ./prisma
RUN ./node_modules/.bin/prisma generate && echo "STEP2_OK"

COPY dist ./dist

RUN echo "BUILD_OK"
CMD echo "STARTING" && node dist/index.js