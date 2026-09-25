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

What lives in `/config` (user docs: `README.md`, "Where things are"):

| Path                         | What                                                                                                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/config/mytube.db`          | the database, settings included (WAL mode: `-wal` and `-shm` next to it)                                                                                              |
| `/config/backups/`           | `mytube-<UTC time>.sqlite`, nightly at 04:00 container time, newest 7 kept                                                                                            |
| `/config/logs/mytube.log`    | the app log (also stdout), rotated at 5 MB with `.1` to `.3`                                                                                                          |
| `/config/logs/jobs/<id>.log` | yt-dlp output per job, newest 200                                                                                                                                     |
| `/config/bin/yt-dlp`         | the managed yt-dlp binary                                                                                                                                             |
| `/config/cache/artwork/`     | the artwork cache (500 MB, disposable)                                                                                                                                |
| `/config/cookies.txt`        | the managed yt-dlp cookies file (Settings → Advanced → Network → Cookies: Upload or Paste), mode 0600, **not in backups** (the backup is the database only); optional |

`TZ` sets the container's time zone, which the nightly backup (04:00) and rescan (04:30) follow; without it they run in UTC. `README.md` at the repository root is the user-facing install guide (compose example, mounts, PUID/PGID, no-authentication note, restore, update); keep it in step with this skill.

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
