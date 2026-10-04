# Build context: repository root (see compose.yaml).
FROM node:24-alpine AS build
WORKDIR /app
# Tests are not run in the image; skip the in-memory MongoDB binary download.
ENV MONGOMS_DISABLE_POSTINSTALL=1
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci -w @elay/shared -w @elay/api
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @elay/shared && npm run build -w @elay/api

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev -w @elay/shared -w @elay/api && npm cache clean --force
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/seed-assets apps/api/seed-assets
RUN mkdir -p /data/media && chown node:node /data/media
USER node
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/server.js"]
