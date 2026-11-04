# FilmShare – una sola app: il server Node risponde alle API, serve la dashboard e manda i download.

FROM node:22-bookworm-slim AS deps
WORKDIR /src
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build -w server && npm run build -w web

FROM node:22-bookworm-slim AS prod-deps
WORKDIR /src
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev -w server --include-workspace-root=false

FROM node:22-bookworm-slim AS app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DB_PATH=/data/db/filmshare.db \
    SHARED_PATH=/data/condivisi \
    UPLOAD_TMP_PATH=/data/condivisi/.upload-in-corso \
    TZ=Europe/Rome
WORKDIR /app
COPY --from=prod-deps /src/node_modules ./node_modules
COPY --from=build /src/server/package.json ./server/package.json
COPY --from=build /src/server/dist ./server/dist
COPY --from=build /src/server/migrations ./server/migrations
COPY --from=build /src/web/dist ./web/dist
RUN mkdir -p /data/db /data/condivisi && chown -R node:node /data
USER node
WORKDIR /app/server
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/salute').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
