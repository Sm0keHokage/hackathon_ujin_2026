FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/admin/package.json ./apps/admin/package.json

RUN npm ci

COPY packages/shared ./packages/shared
COPY apps/admin ./apps/admin

WORKDIR /app/apps/admin

ARG VITE_API_BASE_URL=/
ARG VITE_ADMIN_TOKEN
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_ADMIN_TOKEN=$VITE_ADMIN_TOKEN

RUN npm run build

FROM nginx:stable-alpine

COPY apps/admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/admin/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
