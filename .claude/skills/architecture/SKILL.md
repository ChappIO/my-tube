---
name: architecture
description: The big-picture design of MyTube. The core loop (sources, sync, queue, library, retention, maintenance), the domain model, backend modules, frontend structure, cross-cutting rules, settled product decisions and the delivery order. Read before planning a feature or adding a module, table or screen.
---

# Architecture

MyTube is one loop. Everything else hangs off it.

1. **Sources.** A source is something on YouTube the user deliberately chose: a channel, an artist, or a playlist. Each source belongs to the Music or the Video library. A source can be subscribed (checked on a schedule) or not. Subscribing and unsubscribing never touches files.
2. **Sync.** On a schedule, the sync service asks yt-dlp for a source's current item list (metadata only), applies the source's rules, records new items as known but not on disk, and enqueues download jobs for the ones the rules accept.
3. **Queue.** One in-process worker pool takes jobs from the `jobs` table, runs yt-dlp with progress parsing, writes the file to its templated path, tags it, saves a sidecar thumbnail, and marks the item on disk. Concurrency is the "Downloads at once" setting.
4. **Library.** The Music and Video screens are read models over items and files. "Missing" means known but not on disk. "Incomplete" is an album or playlist with missing items.
5. **Retention.** A scheduled job deletes files older than a source's keep window and records each deletion in history. This is the only automatic deletion.
6. **Maintenance.** The yt-dlp manager downloads the binary on first boot, checks GitHub for updates on a schedule, swaps it in, and records an event. Rescan walks the mounts and reconciles on-disk flags. Backups copy the database.

Playback is external (Plex reads the mounts). Preview streams the file with range requests.

## Settled product decisions

- **No playlists are built in MyTube.** A playlist is a source kind that is synced from YouTube. There is no "Yours" playlist concept.
- **No Plex integration.** "Open in Plex" in the handoff is a design artifact and is not built. Plex compatibility means file layout, tags and sidecar thumbnails only.
- **Polling, not push.** The Activity screen polls the queue and history endpoints while open (a few seconds). The sidebar badge polls a count endpoint less often. There is no SSE or WebSocket endpoint. Activity on this app is rare; it is configured once and then works in the background.
- **Music metadata is a provider chain.** yt-dlp's own metadata (YouTube Music extractor) is the default and always on. MusicBrainz and Discogs are additional providers behind a common interface, disabled by default and enabled per provider in Settings (Discogs needs a token). Providers enrich tags after download in configured order; the first confident match wins per field.
- **No authentication.** The app is for the owner and friends on a home network or behind a reverse proxy. Say so in user-facing docs.
- **Nothing deletes media** except retention and the explicit Delete button in Preview.

## Domain model

SQLite, one migration per change (see the database skill).

| Table | Purpose |
|---|---|
| `sources` | library (music/video), kind (channel/artist/playlist), youtube id, url, name, avatar, subscribed, rules (JSON), last checked, cached counts and size |
| `channels`, `videos` | video library. A video belongs to a channel and optionally to playlists |
| `artists`, `albums`, `tracks` | music library. A track belongs to an album and an artist |
| `playlists`, `playlist_items` | synced playlists for both libraries, with an ordered position |
| `jobs` | queue: type, payload (JSON), status, progress, speed, attempts, error, timestamps |
| `history` | audit trail: time, kind (video/music/system), title, result, details |
| `settings` | key-value store for everything a user changes in Settings |

Every item row (video, track) carries: youtube id, title, duration, published date, thumbnail, file path, file size, status. Status is one of `wanted`, `downloading`, `on_disk`, `missing`, `skipped`.

Job types: `download`, `check_source`, `retention`, `update_ytdlp`, `rescan`, `backup`.

## Backend modules

One folder per module under `packages/api/src` (see the backend skill for conventions).

- `ytdlp`: binary lifecycle (locate, download from GitHub, verify, update) and a runner wrapping spawn: `metadata(url)` returns parsed JSON, `download(item, options)` reports progress. Nothing else spawns yt-dlp.
- `sources`: URL resolution (paste a link, get kind, name, avatar, counts), source records, rules, the subscribe toggle.
- `sync`: the scheduler and the diff. Which items a rule set accepts is a pure function, unit-tested without yt-dlp.
- `jobs`: queue table, worker loop, concurrency, retries, progress, cancellation. Writes history rows for outcomes.
- `library`: music and video read models, filters, sorting, missing detection.
- `files`: mount access, path templates, rescan, delete, range streaming for preview.
- `metadata`: the provider interface and the yt-dlp, MusicBrainz and Discogs providers. Tag writing and cover embedding.
- `activity`: queue view and history view.
- `settings`: typed keys with defaults, and the shapes the Settings screen needs.
- `maintenance`: yt-dlp update schedule, backups, log download.

Scheduling uses `@nestjs/schedule` inside the API process. No Redis, no external workers.

## Frontend structure

See the frontend skill for conventions.

- A layout route renders the sidebar (wide) or top bar plus bottom tabs (narrow), the Add modal and the Preview modal. Modal state is global.
- Routes: `/`, `/music/$tab`, `/video/$tab`, `/video/channel/$id`, `/activity`, `/settings/$tab`.
- One hooks file per resource wraps API calls with the shared Zod schemas. The bell toggle mutates optimistically because the design demands an immediate flip.
- Polling is React Query `refetchInterval` on the Activity queries and the badge count query.
- A component library implements the design system: tokens as Tailwind theme variables, the logo in SVG, tiles, playlist stack, tab pill, bell toggle, buttons, inputs, tables that collapse below 760px.

## Cross-cutting rules

- Shared Zod schemas in `packages/shared` are the contract. The API validates input with them, the web validates responses with them.
- Env holds paths, port and version. The database holds every user-changeable setting.
- File paths come from templates in settings, with the handoff defaults: `Artist / Album / ## Title` for music and `Channel / Title (Date)` for video.
- yt-dlp is never in the image. It lives in `CONFIG_DIR` and is managed by the app.

## Delivery order

Each step ends in something you can run and click.

1. **Shell and design system.** Tokens, fonts, logo, sidebar, bottom bar, routes with plain empty states, theme switch.
2. **yt-dlp manager and Settings.** First-boot download, update check, the Advanced settings card, the sidebar footer, the settings store and General tab.
3. **Sources and the Add flow.** URL resolution, the Add modal, rules, the Channels tab, the channel page, the bell.
4. **Sync, queue and Activity.** Scheduler, download worker, progress, queue and history views, the badge.
5. **Video library.** Videos tab, Home groups, tiles with real thumbnails, Preview.
6. **Music library.** Artists, albums, tracks with filters and sorting, playlists with stack art, tagging, cover embedding, the metadata provider chain.
7. **Retention and maintenance.** Keep-N-days deletion, rescan, backups, logs, missing counts.
