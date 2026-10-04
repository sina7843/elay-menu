# Build context: repository root (see compose.yaml).
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci -w @elay/shared -w @elay/web
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @elay/shared && npm run build -w @elay/web

# Unprivileged nginx (runs as non-root, listens on 8080): static app + same-origin /api proxy.
FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
