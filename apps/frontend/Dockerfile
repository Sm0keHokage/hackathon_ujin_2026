FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared ./packages/shared
COPY apps/frontend/package.json ./apps/frontend/
RUN npm ci
COPY apps/frontend ./apps/frontend
WORKDIR /app/apps/frontend
RUN npm run build
FROM nginx:stable-alpine
COPY --from=build /app/apps/frontend/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]