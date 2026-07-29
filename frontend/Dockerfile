FROM node:20-alpine AS builder

ARG REACT_APP_API_URL=https://url-shortener-backend-2zi2.onrender.com
ENV REACT_APP_API_URL=$REACT_APP_API_URL

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine

COPY --from=builder /app/build /usr/share/nginx/html

# Use template so BACKEND_URL env var is substituted at container start
COPY nginx.prod.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 80

# nginx docker image auto-runs envsubst on /etc/nginx/templates/*.template
CMD ["nginx", "-g", "daemon off;"]
