FROM node:20-alpine AS builder

ARG REACT_APP_API_URL=https://url-shortener-api-e4hz.onrender.com
ENV REACT_APP_API_URL=$REACT_APP_API_URL

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine

COPY --from=builder /app/build /usr/share/nginx/html

COPY nginx.prod.conf.template /etc/nginx/templates/default.conf.template
ENV NGINX_ENVSUBST_TEMPLATES=$PORT

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
