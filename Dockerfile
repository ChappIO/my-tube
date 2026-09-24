# syntax=docker/dockerfile:1

# ---- base: Node LTS + pnpm --------------------------------------------------
FROM node:24.21.0-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install -g pnpm@12.6.0 && npm cache clean --force

# ---- build: install everything and compile all packages ---------------------
FROM base AS build
# better-sqlite3 compiles from source when no prebuilt binary matches.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
COPY packages/web/package.json packages/web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages ./packages
RUN pnpm build

# ---- prod-deps: production node_modules only ---------------------------------
FROM build AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  rm -rf node_modules packages/*/node_modules \
  && pnpm install --frozen-lockfile --prod

# ---- runtime ----------------------------------------------------------------
FROM base AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg gosu tini \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd -g 911 mytube \
  && useradd -u 911 -g mytube -d /config -s /usr/sbin/nologin mytube \
  && mkdir -p /config /media/music /media/video

WORKDIR /app
COPY --from=prod-deps /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/packages/shared/package.json ./packages/shared/
COPY --from=prod-deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=prod-deps /app/packages/shared/dist ./packages/shared/dist
COPY --from=prod-deps /app/packages/api/package.json ./packages/api/
COPY --from=prod-deps /app/packages/api/node_modules ./packages/api/node_modules
COPY --from=prod-deps /app/packages/api/dist ./packages/api/dist
COPY --from=prod-deps /app/packages/web/dist ./packages/web/dist
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ARG APP_VERSION=dev
ENV NODE_ENV=production \
    APP_VERSION=$APP_VERSION \
    PORT=8080 \
    CONFIG_DIR=/config \
    MUSIC_DIR=/media/music \
    VIDEO_DIR=/media/video \
    PUID=1000 \
    PGID=1000

VOLUME ["/config", "/media/music", "/media/video"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://localhost:${PORT}/api/health" || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
CMD ["node", "packages/api/dist/main.js"]
