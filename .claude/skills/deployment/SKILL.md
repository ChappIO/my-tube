---
name: deployment
description: Docker image, container runtime conventions (mounts, PUID/PGID, health check), docker compose for local runs, and the release process for MyTube. Read before changing the Dockerfile, entrypoint, compose file or release workflow.
---

# Deployment

MyTube ships as one Docker image running one Node process: the API, which also serves the web app.

## Image

`Dockerfile` is multi-stage:

1. `base`: `node:24.21.0-bookworm-slim` plus pnpm.
2. `build`: installs all dependencies (with build tools for better-sqlite3) and runs `pnpm build`.
3. `prod-deps`: prunes to production dependencies.
4. `runtime`: slim image with ffmpeg, curl, gosu and tini; copies built `dist` folders and production `node_modules`.

Runtime facts:

| Item    | Value                                                                         |
| ------- | ----------------------------------------------------------------------------- |
| Port    | 8080 (`PORT`)                                                                 |
| Mounts  | `/config` (database, settings, yt-dlp binary), `/media/music`, `/media/video` |
| User    | `mytube`, remapped to `PUID`/`PGID` (default 1000) by `docker/entrypoint.sh`  |
| Health  | `GET /api/health`, also used by the image `HEALTHCHECK`                       |
| Version | `APP_VERSION` build arg, surfaced by `/api/health`                            |

The entrypoint only chowns `/config`. Media mounts are left alone because they can be huge and belong to the host user.

yt-dlp is not in the image. The app downloads it into `/config` on first boot and updates it on a schedule, so the image does not need rebuilding when yt-dlp changes.

## Local run

```bash
docker compose up --build
```

`docker-compose.yml` mounts `./.local/config`, `./.local/music` and `./.local/video` (gitignored). Open http://localhost:8080.

## Release

Push a tag `vX.Y.Z` on `main`. `.github/workflows/release.yml` builds `linux/amd64` and `linux/arm64` and pushes `ghcr.io/<owner>/<repo>:X.Y.Z`, `:X.Y` and `:latest`. CI on every push already builds the image and boots it to check health, so a tag should not fail for image reasons.

## Changing the image

- Keep the runtime stage free of build tools and dev dependencies.
- Anything new the app needs at runtime (system packages) goes in the `runtime` stage's apt line.
- If the workspace layout changes, update the `COPY --from=prod-deps` lines; pnpm's symlinked `node_modules` only work when the relative layout is preserved.
