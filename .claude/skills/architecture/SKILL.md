---
name: architecture
description: The big-picture design of MyTube. The core loop (sources, sync, queue, library, revalidation, maintenance), the domain model, backend modules, frontend structure, cross-cutting rules, and settled product decisions. Read before planning a feature or adding a module, table or screen.
---

# Architecture

MyTube is one loop. Everything else hangs off it.

1. **Sources.** A source is something on YouTube the user deliberately chose: a channel, an artist, or a playlist. Each source belongs to the Music or the Video library. A source can be subscribed (checked on a schedule) or not. Subscribing and unsubscribing never touches files.
2. **Sync.** On a schedule, the sync service asks yt-dlp for a source's current item list (metadata only), evaluates the source's rules (one matcher tree) on each entry, records new items as known but not on disk, and enqueues download jobs for the ones the tree matches.
3. **Queue.** One in-process worker pool takes jobs from the `jobs` table, runs yt-dlp with progress parsing, writes the file to its templated path, tags it, saves a sidecar thumbnail, and marks the item on disk. Concurrency is the "Downloads at once" setting.
4. **Library.** The Music and Video screens are read models over items and files. "Missing" means known but not on disk. "Incomplete" is an album or playlist with missing items.
5. **Revalidation.** Every 6 hours per subscribed source, and at once after its rules are saved, the source's items are evaluated again against its current tree. Files it no longer matches are removed (with their sidecars) and each removal is recorded in history. This is the only automatic deletion; it replaces the old "retention" job (keep the last 90 days is the rule `NOT older than 90 days`).
6. **Maintenance.** The yt-dlp manager downloads the binary on first boot, checks GitHub for updates on a schedule, swaps it in, and records an event. Rescan walks the mounts and reconciles on-disk flags. Backups copy the database.

Playback is external (Plex reads the mounts). Preview streams the file with range requests (`GET /api/library/videos/:id/stream`, `GET /api/library/tracks/:id/stream`).

## Settled product decisions

- **No playlists are built in MyTube.** A playlist is a source kind that is synced from YouTube. There is no "Yours" playlist concept.
- **No Plex integration.** There is no "Open in Plex" button. Plex compatibility means file layout, tags and sidecar thumbnails only.
- **Polling, not push.** The Activity screen polls the queue every 2 s and the history every 5 s while open. The sidebar badge polls `GET /api/activity/summary` every 30 s, every 5 s while downloads are active. There is no SSE or WebSocket endpoint. Activity on this app is rare; it is configured once and then works in the background.
- **Logs are files in `CONFIG_DIR/logs`.** The app logger writes stdout and `mytube.log` (rotated at 5 MB, 3 older files, level from `data.logLevel`); `GET /api/system/logs` downloads it. Every yt-dlp run a job makes is written in full to `logs/jobs/<job id>.log` (newest 200 kept), linked from the Activity queue and history, so a failed download can be troubleshot without shell access.
- **A match wins across sources** (decided 2026-09-26; both libraries). Any source keeps, we keep. One video or track listed by several sources (a channel and one of its playlists, an artist and a playlist of its songs) keeps one row, owned by the first source, but every source's rules count: it is wanted while any of them matches, and no sync or revalidation of one source unwants it or removes its file while another source still wants it (`wantedElsewhere` in `sync/claims.ts`; backend skill "A match wins across sources").
- **An artist is its releases.** An artist source syncs the Releases tab: each album or single is a YouTube Music album playlist, listed once, its tracks numbered by position; a track on both a single and its album stays with the album. Channels without releases fall back to their uploads.
- **Upload titles are cleaned** (decided 2026-09-26). A track yt-dlp names no `track` for (official audio and video uploads, playlist entries) is titled from its upload title without the decoration (`(Official Audio)`, `[Official Music Video]`, `(Visualizer)`, …), the `<artist> - ` prefix and wrapping quotes: `Hiatus Kaiyote - 'Telescope' (Official Audio)` becomes `Telescope`. Framing symbols, label release tags and collaboration prefixes naming the artist go too: `♪ MDK x t+pazolite - Password ♪` becomes `Password` (with t+pazolite as a featured artist the metadata providers search with; the tags stay title and artist). The rules, the library, the file name and the tags all see the cleaned title (`cleanTrackTitle` in `metadata/clean-title.ts`).
- **Incomplete counts only wanted tracks** (decided 2026-09-26). A track is in the library while the rules want it or it is (was) on disk (`wanted`, `downloading`, `on_disk`, `missing`); tracks skipped by the rules, deleted by the user or unavailable never count. An album or playlist is incomplete (`12/14 tracks` in red) only when fewer of those are on disk, so a rule that leaves out part of an album does not make it red.
- **Music metadata is a provider chain.** yt-dlp's own metadata (YouTube Music extractor) is the default and always on. MusicBrainz and Discogs are additional providers behind a common interface, disabled by default and enabled per provider in Settings (Discogs needs a token). Providers enrich tags after download in configured order; the first confident match wins per field.
- **Artwork goes through the API's cache.** The web never hotlinks Google's image hosts, which answer bursts with 429: every avatar and thumbnail in a DTO is `/api/artwork/<kind>/<id>`, downloaded once into `CONFIG_DIR/cache/artwork` (bookkept in `artwork_cache`, pruned to 500 MB, least recently used first), and a video on disk uses its sidecar thumbnail. Only the Add modal's unsaved `ResolvedSource` shows a remote avatar.
- **Preview plays what the browser can.** Browsers play mp4 and webm; most cannot play mkv (the default container). Preview asks `canPlayType` and listens for decode errors; when the file cannot play it shows the poster and "This container cannot play in the browser. Plex plays it." Delete file stays available. Choose `mp4` in Settings → Video to preview in the browser.
- **No authentication.** The app is for the owner and friends on a home network or behind a reverse proxy. Say so in user-facing docs.
- **Only deliberate sources.** A source is a channel, artist or playlist the user pasted. A single video link resolves to its channel. Mixes (`RD…` lists), liked videos and watch later are not addable: they are generated by the recommendation engine or need an account. A channel and an artist are the same YouTube channel id; the library decides which it is.
- **No album-only rule.** An artist source downloads all of the artist's releases, albums and singles alike; there is no album-only rule, no "Download full albums" rule and no such Settings → Music toggle.
- **Rescan reconciles, never imports.** The nightly rescan (and Rescan libraries) only moves known items between `on_disk` and `missing` and recounts sizes; files it does not know are counted in its history row and left alone. Backups are the database file only (settings included), nightly with the newest 7 kept; restore is a manual file copy.
- **Nothing deletes media** except revalidation (a file the source's current rules no longer match) and the explicit Delete button in Preview (the video becomes `skipped` / `deleted_by_user` and is never downloaded again on its own).
- **Rules are one matcher tree per source** (decided 2026-09-25). Gates `and`, `or`, `not` over predicate leaves: title contains (case-insensitive substring), title matches (case-insensitive regex, validated), is a short, published before / on or after a date, older than N days, duration under / over N seconds, live status (a yt-dlp status), channel is (name or id) and playlist position under N (both playlist-only). At most 8 levels and 100 nodes. The shared `Matcher` schema and `evaluateMatcher` are the contract (backend skill "Matchers").
- **The tree decides both directions.** At sync an entry the tree matches is downloaded and one it does not is skipped (`no_match`). Revalidation removes a file on disk the current tree no longer matches (`skipped` / `no_longer_matches`, file and sidecars deleted, a `removed` history row naming the failing condition) and brings rule-skipped items back when the tree matches them again. There is no separate retention setting: `keepDays` is gone from rules and settings.
- **Empty gates:** `and` with no items matches everything, `or` with no items matches nothing. The Music default is the empty `and`. The builder only allows an empty group at the root, as AND.
- **Unknown data counts as a match.** A leaf that needs a value the item lacks (no upload date, no duration, no playlist position) is unknown; gates use three-valued logic and an unknown result matches, so nothing is skipped or deleted for lack of a date. A missing title is not unknown: it contains nothing.
- **Saving rules previews removals.** The Edit rules modal asks `POST /api/sources/:id/rules/preview` and shows "This will remove N files" with the titles before Save, which then reads "Save and remove N files".
- **Options that are not predicates** stay plain per-source options (`SourceOptions`): `embedCoverArt` (music) and `syncOrder` (playlists). Subtitles and thumbnails stay global settings.
- **Builder only, seeded from per-library defaults.** Rules are edited with the rule builder (no checkbox mode) in the Add and Edit modals and in Settings → Video / Music, which hold the default trees (`video.defaultRules`, `music.defaultRules`) new sources start from. The Edit modal offers "Reset to library default".
- **Unsubscribing pauses a source.** The bell stops both scheduled checks and scheduled revalidation, so nothing is downloaded or removed for it on a schedule. Saving its rules still revalidates it once.
- **The theme is a setting.** `general.theme` (`system`, `light`, `dark`) lives in the settings table like every other user choice, so it follows the user across browsers. The browser keeps a copy in localStorage (`mytube.theme`) only so the pre-paint script in `index.html` can apply it before the first frame; once settings load, the stored value wins. Settings → General offers Light, Dark and System, so the user can return to following the device.

## Domain model

SQLite, one migration per change (see the database skill).

| Table                         | Purpose                                                                                                                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sources`                     | library (music/video), kind (channel/artist/playlist), youtube id, url, name, avatar, subscribed, matcher and options (JSON), last checked and last revalidated, cached counts and size |
| `channels`, `videos`          | video library. Every known channel has a row (linked to its source if added). A video belongs to a channel and optionally to playlists                                                  |
| `artists`, `albums`, `tracks` | music library. A track belongs to an album and an artist                                                                                                                                |
| `playlists`, `playlist_items` | synced playlists for both libraries, with an ordered position                                                                                                                           |
| `jobs`                        | queue: type, payload (JSON), status, progress, speed, attempts, error, timestamps                                                                                                       |
| `history`                     | audit trail: time, kind (video/music/system), title, result (`done`, `removed`, `failed`, …), details                                                                                   |
| `settings`                    | key-value store for everything a user changes in Settings                                                                                                                               |
| `ytdlp_state`                 | single row: installed and latest yt-dlp version, last check, last update, last error (binary manager state, not a setting)                                                              |

Every item row (video, track) carries: youtube id, title, duration, published date, thumbnail, file path, file size, status. Status is one of `wanted`, `downloading`, `on_disk`, `missing`, `skipped`.

Job types: `download`, `check_source`, `revalidate`, `rescan`, `backup`.

Job statuses: `queued`, `running`, `done`, `failed`, `cancelled`. Retries back off 1, 5 and 25 minutes; the worker runs up to "Downloads at once" downloads and one job of each other type at a time (backend skill "Jobs").

**One tree, both directions.** Because the same tree decides what is downloaded and what stays, `NOT older than 90 days` downloads only the last 90 days of a new channel and removes each file once it turns 91 days old. Ongoing and upcoming streams are never downloaded in either library, whatever the tree says; they are evaluated again on the next check.

## Backend modules

One folder per module under `packages/api/src` (see the backend skill for conventions).

- `ytdlp`: binary lifecycle (locate, download from GitHub, verify, update) and a runner wrapping spawn: `metadata(url)` returns parsed JSON, `download(item, options)` reports progress. Nothing else spawns yt-dlp.
- `sources`: URL resolution (paste a link, get kind, name, avatar, counts), source records, rules, the subscribe toggle.
- `sync`: the scheduler, the diff and revalidation. Which items a tree matches is a pure function in shared (`evaluateMatcher`), unit-tested without yt-dlp.
- `jobs`: queue table, worker loop, concurrency, retries, progress, cancellation. Writes history rows for outcomes.
- `library`: music and video read models, filters, sorting, missing detection; Preview's stream and Delete file.
- `artwork`: the artwork cache (`/api/artwork/:kind/:id`).
- `files`: mount access, path templates, rescan, delete (`removeMediaFiles`: a file, its sidecars and empty folders), range streaming for preview.
- `metadata`: the provider interface and the yt-dlp, MusicBrainz and Discogs providers, the chain that merges them, tag writing (ffmpeg, no re-encode) and cover embedding, and `cleanTrackTitle` (backend skill "Metadata").
- `activity`: queue view and history view.
- `settings`: typed keys with defaults (the `Settings` schema in shared), `GET` and `PATCH /api/settings`. Other modules inject `SettingsService` and call `get()`.
- `maintenance`: backups, log download, rescan. The yt-dlp update schedule lives in `ytdlp` with the binary manager (its own 15-minute tick that reads the settings interval), not in a job row.

Scheduling uses `@nestjs/schedule` inside the API process. No Redis, no external workers.

## Frontend structure

See the frontend skill for conventions.

- A layout route renders the sidebar (wide) or top bar plus bottom tabs (narrow), the Add modal and the Preview modal. Modal state is global.
- Routes: `/`, `/music/$tab`, `/video/$tab`, `/video/channel/$id`, `/activity`, `/settings/$tab`.
- One hooks file per resource wraps API calls with the shared Zod schemas. The bell toggle mutates optimistically because the design demands an immediate flip.
- Polling is React Query `refetchInterval` on the Activity queries and the badge count query.
- A component library implements the design system (the frontend skill is the design reference): tokens as Tailwind theme variables, the logo in SVG, tiles, playlist stack, tab pill, bell toggle, buttons, inputs, tables that collapse below 760px.

## Cross-cutting rules

- Shared Zod schemas in `packages/shared` are the contract. The API validates input with them, the web validates responses with them.
- Env holds paths, port and version. The database holds every user-changeable setting.
- File paths come from templates in settings, with the defaults `Artist / Album / ## Title` for music and `Channel / Title (Date)` for video.
- yt-dlp is never in the image. It lives in `CONFIG_DIR` and is managed by the app.
