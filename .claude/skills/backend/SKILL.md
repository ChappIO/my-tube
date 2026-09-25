---
name: backend
description: How the MyTube API (NestJS, packages/api) is structured, how configuration, validation, DTOs and modules work, and the conventions for adding endpoints, services and background jobs. Read before touching packages/api or packages/shared.
---

# Backend

The API is NestJS 12 (ESM) in `packages/api`. Everything is served under the `/api` global prefix. In production it also serves the built web app from `packages/web/dist` with an SPA fallback (`WebModule`, plain Express handlers registered on the adapter, dot-directory safe), so there is one process and one port. See the tooling skill for commands.

## Layout

```
packages/api/src
  main.ts               bootstrap: global prefix, shutdown hooks, listen
  app.module.ts         root module; wires config, database, features, static files
  config/               AppConfig: env-derived paths, port, version (global module)
  database/             SQLite via Drizzle, SQL migrations (see database skill)
  common/               cross-cutting helpers such as ZodValidationPipe
  health/               example feature module (controller only)
  web/                  serves packages/web/dist next to the API with an SPA fallback
  ytdlp/                the yt-dlp runner (the only code that spawns yt-dlp) and the binary manager
  settings/             SettingsService over the settings table, GET/PATCH /api/settings
  activity/             HistoryService (global module) and ActivityController (queue, history, summary)
  logging/              AppLogger (stdout + rotating CONFIG_DIR/logs/mytube.log) and LogLevelSync
  sources/              URL resolution, source CRUD, rules (matcher + options) and the subscribe toggle
  files/                media-files.ts: libraryPath (stay inside a mount), removeMediaFiles (file, sidecars, empty dirs);
                        send-file.ts: sendFile (Express sendFile with ETag, Range, dot-directories allowed)
  system/               GET /api/system/info and /logs, the backup and rescan stubs (see System)
  jobs/                 the jobs queue (JobsService), the worker pool (JobsWorker), the JobRunner seam,
                        per-job logs (JobLogsService) and /api/jobs/:id/{log,cancel,retry}
  sync/                 evaluateItem (live gate + matcher), SyncService (+ MusicSync), RevalidationService,
                        wantedElsewhere (a match wins across sources), SyncScheduler,
                        CheckSourceRunner, RevalidateRunner, the check and rules-preview endpoints
  downloads/            DownloadDispatchRunner (`download` jobs) → DownloadRunner (videos) or
                        TrackDownloadRunner (tracks); the Settings → Video / Music option mapping
  metadata/             the music metadata provider chain: ytdlp-tags.ts (ytdlpTagArgs, the yt-dlp provider),
                        MetadataChain, the MusicBrainz and Discogs providers, TagWriter (ffmpeg),
                        clean-title.ts (cleanTrackTitle)
  library/              LibraryService, MusicLibraryService and /api/library/*: videos, artists, albums,
                        playlists, tracks, Home, summary, stream, Delete file
  artwork/              ArtworkService and /api/artwork/:kind/:id: the artwork cache in CONFIG_DIR/cache/artwork
packages/api/test       end-to-end tests booting the real AppModule
```

Feature modules go in `src/<feature>/` with `<feature>.module.ts`, `<feature>.controller.ts`, `<feature>.service.ts` and their specs next to them.

## Configuration

- `AppConfig` (`src/config/app-config.ts`) parses `process.env` with Zod. It only holds what must be known before the database exists: `HOST`, `PORT`, `CONFIG_DIR`, `MUSIC_DIR`, `VIDEO_DIR`, `WEB_DIST`, `APP_VERSION`.
- Everything a user can change in the Settings screen lives in the database (the `settings` table), never in env.
- Inject it by class: `constructor(private readonly config: AppConfig) {}`.

## DTOs and validation

- Request and response shapes are Zod schemas in `packages/shared/src`, exported from its `index.ts`. Export both the schema and the inferred type under the same name (`export const Thing = z.object(...); export type Thing = z.infer<typeof Thing>`).
- Validate input with `ZodValidationPipe` from `src/common`: `@Body(new ZodValidationPipe(CreateThing)) body: CreateThing`. Invalid input becomes a 400 with the Zod issues.
- Controllers return plain objects typed with the shared response type. The e2e test parses responses with the shared schema so drift fails the build.
- Do not use class-validator or class-transformer.

## Dependency injection notes

- Constructor injection by class works (decorator metadata is emitted by both `nest build` and Vitest).
- Interfaces and types used only as types must be imported with `import type`; classes used for injection must be value imports.
- Non-class providers use a `Symbol` token and `@Inject(TOKEN)`. The database is one: `@Inject(DATABASE) private readonly db: Database`.

## Settings

`src/settings/` owns every user-changeable value. The contract is `Settings` in `packages/shared/src/settings.ts`: groups `general`, `music`, `video`, `ytdlp`, `network`, `data`, each field with a `.default()`, so `DEFAULT_SETTINGS = Settings.parse({})` is a fresh install.

- Storage: one `settings` row per field the user changed, key = dotted path (`general.theme`), value = JSON. No row means the default.
- `SettingsService.get(): Settings` merges the rows over the defaults. A row with an unknown key (a removed setting), invalid JSON or a value that no longer validates is ignored with a one-time warning and its default used; it never throws.
- `SettingsService.patch(patch: SettingsPatch): Settings` validates, upserts only the given fields in one transaction (bumping `updated_at`) and returns the merged settings.
- `GET /api/settings` returns `Settings`. `PATCH /api/settings` takes a `SettingsPatch` (any fields of any groups; unknown keys and empty patches are a 400) and returns `Settings`.
- `video.defaultRules` and `music.defaultRules` are `Matcher` trees (defaults `DEFAULT_VIDEO_MATCHER`, `DEFAULT_MUSIC_MATCHER`) that new sources start from; a tree with playlist-only conditions is refused because it also seeds channels and artists. They replaced `video.keepDays`, `video.skipShorts` and `music.skipLiveRecordings` (converted once, database skill). `music.embedCoverArt` stays: the option new music sources start with.
- Other modules import `SettingsModule` and call `settings.get()` when they need a value (read at use time, so changes apply without a restart). Do not cache settings in a service.

**Adding a setting:** add the field with a `.default()` to its group in `packages/shared/src/settings.ts` (option lists as exported `as const` arrays, so the web select reuses them), extend the defaults test in `settings.spec.ts`, rebuild shared, then add the control to the Settings tab (see the frontend skill). No migration: a field without a row uses its default. Removing or narrowing a field is safe too; stale rows are ignored.

Env (`AppConfig`) stays for what is known before the database exists: mount paths, port, version. Those are shown in Settings read-only and are never settings.

## System

`src/system/` (`SystemModule`) serves instance facts and maintenance actions for Settings → Advanced. The contract is `packages/shared/src/system.ts`.

- `GET /api/system/info` → `SystemInfo`: `version` (`APP_VERSION`), `configDir`, `musicDir`, `videoDir` (the resolved `AppConfig` paths, `/config` and `/media/*` in the image) and `platform` (`<process.platform> <process.arch>`). The Settings Library and Data cards show the paths read-only; they are env, never settings.
- `GET /api/system/logs` → `text/plain` attachment `mytube.log`: the current `CONFIG_DIR/logs/mytube.log` written by `AppLogger` (see Logging), or a short note before the first line is written.
- `POST /api/system/backup` and `POST /api/system/rescan` are **stubs**: `501` with `SystemActionResult` `{ message: 'Not implemented until Stage 7' }`. Stage 7 replaces them with real jobs (the `backup` and `rescan` job types) and should keep answering `SystemActionResult` so the Data card shows the new message without changes. Stage 7 also fills "Last backup" (read-only "never" in the web until then).
- `data.logLevel` is applied to the logger (stdout and file) at boot and on every change (see Logging).

## Logging

`src/logging/`. Two kinds of log, both under `CONFIG_DIR/logs`:

- **Application log.** `AppLogger` extends Nest's `ConsoleLogger`: the usual stdout output plus plain lines in `mytube.log` (`2026-09-25T10:00:00.000Z INFO  [Context] message`, stacks on the following lines, no colours). `RotatingFile` rotates it before it would pass 5 MB, keeping `mytube.log.1` to `.3`; writes are synchronous and a write error is reported once to stderr and never thrown. `LoggingModule` (global) provides the instance; `main.ts` creates the app with `bufferLogs: true` and calls `app.useLogger(app.get(AppLogger))`, so boot lines reach the file. `LogLevelSync` maps `data.logLevel` (`error` → fatal+error, `warn` → +warn, `info` → +log, `debug` → +debug+verbose) at boot and through `SettingsService.onChange(listener)` (called after every successful `patch`; use it only when a value must be pushed, not read at use time). E2e tests pass `logger: false` and never write the file.
- **Job logs.** `JobLogsService` (`src/jobs/job-logs.service.ts`, exported by `JobsModule`): `open(job)` appends `=== <type> job <id> · attempt n of m · <time> · <title>` to `logs/jobs/<job id>.log` and returns a `JobLog` (`line(text)`, `close()`, both plain properties so `log.line` can be passed as a callback; lines over 64 KiB are cut with a note). `prune(keep = 200)` removes all but the newest files by mtime; runners call it after each run. `GET /api/jobs/:id/log` serves the file inline as `text/plain` (404 when none).
- **yt-dlp output.** `runner.metadata()` and `runner.download()` take `log?: YtdlpLogSink`: the runner writes `$ <binary> <args>` first (`describeArgs`: cookies path `<redacted>`, proxy credentials masked), then every stdout and stderr line as it arrives (progress lines and the metadata JSON included), then `exit <code>`. The runner stays the only spawner; runners pass `log.line`.

## Folder structure templates

`packages/shared/src/path-templates.ts` defines the only tags `music.pathTemplate` and `video.pathTemplate` may use. The path templating of the download job (Stage 4) and the library read models (Stages 5 and 6) must consume `MUSIC_PATH_TAGS` / `VIDEO_PATH_TAGS` and fill exactly these; no other tags exist. Adding a tag means adding it there first (with its description, which the Settings chips show).

| Library | Tag          | Value                                                    |
| ------- | ------------ | -------------------------------------------------------- |
| Music   | `{artist}`   | album artist, else the track artist                      |
| Music   | `{album}`    | album title                                              |
| Music   | `{title}`    | track title                                              |
| Music   | `{track}`    | track number on the album (numeric)                      |
| Music   | `{disc}`     | disc number, 1 for single-disc albums (numeric)          |
| Music   | `{year}`     | release year (numeric)                                   |
| Music   | `{id}`       | YouTube video id of the track                            |
| Video   | `{channel}`  | channel name                                             |
| Video   | `{title}`    | video title                                              |
| Video   | `{date}`     | upload date, `YYYY-MM-DD`                                |
| Video   | `{year}`     | upload year (numeric)                                    |
| Video   | `{id}`       | YouTube video id                                         |
| Video   | `{playlist}` | playlist name; empty when not downloaded from a playlist |

- **Modifier:** `:02` is the only one. It zero-pads a numeric tag to 2 digits (`{track:02}` → `07`) and is an error on text tags.
- `/` separates folders; the template is relative to the library mount.
- `renderPathTemplate(template, values)` (pure, shared) fills a template: `{tag}` → value, `{tag:02}` pads a number, unknown tags and null values → ''. Each folder or file name is sanitised on its own after substitution (`sanitizePathSegment`: NFC, whitespace runs → one space, `/ \ : * ? " < > |` and control characters removed, leading and trailing dots and spaces trimmed, cut to 200 UTF-8 bytes without splitting a character), empty names are dropped (`{playlist}` outside a playlist) and an empty result is `untitled`. A value can never add a folder or climb out of the library (`../../etc` → `etc`). The extension is not part of the template. The download job adds a second guard (`insideLibrary`) before writing.
- `validatePathTemplate(template, tags)` (pure) returns `{ unknownTags, errors }`: unknown tags or modifiers (`{bogus}`, `{track:3}`), `:02` on a text tag, unmatched braces, `..` folders and absolute paths (`/…`, `\…`, `C:…`). The settings schema runs it in a `superRefine`, so `PATCH /api/settings` answers 400 with the message (`Unknown tag {bogus}.`; the Settings chips list the supported ones) and a stored row that no longer validates falls back to the default.

## Matchers

A source's rules are one expression tree. The contract is `packages/shared/src/matchers.ts` (settled decisions in the architecture skill).

- **Schema.** `Matcher` is a recursive Zod discriminated union on `type`. Gates: `{ type: 'and' | 'or', items: Matcher[] }`, `{ type: 'not', item: Matcher }`. Leaves: `title_contains { text }` (case-insensitive substring), `title_matches { pattern }` (case-insensitive JS regex; `regexError` validates), `is_short`, `published_before { date }` (strictly before the UTC day), `published_after { date }` (on or after), `older_than_days { days }` (1–3650; before the UTC day `days` ago, the boundary day is not older), `duration_under { seconds }` / `duration_over { seconds }` (strict), `live_status { status }` (`LIVE_STATUSES`: yt-dlp's `not_live`, `is_live`, `was_live`, `is_upcoming`, `post_live`; a missing status is `not_live`), `channel_is { channel }` (uploader id exactly or name case-insensitively) and `in_playlist_position_under { position }` (≥ 2). Texts are trimmed, 1–200 characters. Objects are strict (unknown fields are a 400). At most `MATCHER_MAX_DEPTH` 8 levels (a raw, non-recursive depth check runs first so a hostile body cannot blow the stack) and `MATCHER_MAX_NODES` 100 nodes. `PLAYLIST_ONLY_LEAVES`: `channel_is`, `in_playlist_position_under`.
- **Example** (the Stage 3b acceptance rule):

  ```json
  {
    "type": "and",
    "items": [
      { "type": "not", "item": { "type": "is_short" } },
      {
        "type": "or",
        "items": [
          { "type": "title_contains", "text": "Artemis" },
          { "type": "title_contains", "text": "Orion" }
        ]
      },
      { "type": "not", "item": { "type": "older_than_days", "days": 90 } }
    ]
  }
  ```

- **Evaluation.** `evaluateMatcher(matcher, ctx)` is pure. `MatcherContext`: `title`, `isShort`, `publishedAt` (`YYYY-MM-DD` or ISO; the UTC day counts), `durationSeconds`, `liveStatus`, `channelName`, `channelId`, `playlistPosition`, `now`. Returns `{ matches }` or `{ matches: false, failing }` where `failing` are chip-style labels of the conditions that decided the miss, with their negation (`no shorts`, `not older than 90 days`, `only "Artemis"`), used in history details and the preview. Empty `and` is true, empty `or` false. Missing data (date, duration, position, uploader) makes a leaf unknown; three-valued logic, and unknown at the root matches.
- **Chips.** `describeMatcher(matcher)`: one chip per item of the root `and` (nested `and`s flattened), otherwise one chip; an `or` is one chip (`only "Artemis" or "Orion"` when all its items are titles, else items joined with `or`, deeper groups parenthesised; a negated group reads `none of (a, b)` / `not all of (a, b)`, titles `no "A" or "B"`); `describeLeaf(leaf, negated)` for single labels. The empty root `and` gives no chips.
- **Defaults and builders.** `DEFAULT_VIDEO_MATCHER` = `and(not(is_short), not(older_than_days 90))`, `DEFAULT_MUSIC_MATCHER` = `and()`. `and(...)`, `or(...)`, `not(x)` build trees; `matcherDepth`, `matcherSize`, `matcherLeaves`, `childrenOf`, `daysAgo`, `formatDuration`.

## Sources and rules

The contract is `packages/shared/src/rules.ts`; the tables are in the database skill ("Sources and catalog").

- `Library` (`video`, `music`) and `SourceKind` (`channel`, `artist`, `playlist`).
- `SourceOptions`: `embedCoverArt` (true; music only, ignored for video) and `syncOrder` (false; playlists only). `DEFAULT_SOURCE_OPTIONS`. `describeOptions(options, library)` gives `sync order` and `cover art` chips; `describeSource(source)` = rule chips then option chips (what the Channels row and channel page show).
- `Source` is the DTO for one `sources` row: `id`, `library`, `kind`, `youtubeId`, `url`, `name`, `avatarUrl`, `subscribed`, `matcher`, `options`, `lastCheckedAt`, `itemCount`, `sizeBytes`, `createdAt`, `updatedAt` (`lastRevalidatedAt` stays internal). A Drizzle row parses directly (`avatarUrl` is an `ImageUrl`: a cache path or an absolute URL), but the API maps `avatarUrl` to the artwork cache path of the source's catalog row first (`/api/artwork/channel|artist|playlist/<catalog id>`, see "Artwork cache"); the row keeps the remote URL.
- `sourceIssues({ library, kind, matcher?, options? })` lists invalid combinations: an artist outside Music, `syncOrder` or a playlist-only condition on anything but a playlist. `Source` applies it; create, update and the preview reuse it.
- **Legacy rules.** `LegacyRules` (the Stage 3 flat `rules` JSON) and `convertLegacyRules(old)` → `{ matcher, options }` exist only for the one-time conversion (database skill "Matcher rules conversion"): each rule that was on becomes one item of a root `and`: `skipShorts` → `not(is_short)`, `keepDays` → `not(older_than_days)`, `publishedAfter` → `published_after`, `titleFilter` → `title_contains`, `skipLiveRecordings` → `not(title_matches \blive\b)` (`LIVE_WORD_PATTERN`); `syncOrder` and `embedCoverArt` become options.

### Sources API

`src/sources/` (`SourcesService`, `SourcesController`); the DTOs are in `packages/shared/src/sources.ts`.

| Endpoint                              | Body / query                                                 | Response                                                                            |
| ------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `POST /api/sources/resolve`           | `ResolveRequest` `{ url }`                                   | 200 `ResolvedSource`; 400 unsupported link; 502 yt-dlp error                        |
| `GET /api/sources`                    | `?library=video\|music` (optional)                           | `Source[]`, newest first                                                            |
| `GET /api/sources/:id`                |                                                              | `Source`; 404                                                                       |
| `POST /api/sources`                   | `CreateSource` `{ url, library, kind?, matcher?, options? }` | 201 `Source`; 400; 409 `SourceConflict` `{ sourceId }`                              |
| `PATCH /api/sources/:id`              | `UpdateSource` `{ matcher?, options?, subscribed?, name? }`  | `Source`; 400; 404                                                                  |
| `POST /api/sources/:id/rules/preview` | `RulesPreviewRequest` `{ matcher }`                          | 200 `RulesPreview` `{ wouldRemove: [{ id, title, failing }], wouldKeep }`; 400; 404 |
| `PATCH /api/sources/:id/subscribed`   | `SetSubscribed` `{ subscribed }` (the bell)                  | `Source`; 404                                                                       |
| `DELETE /api/sources/:id`             |                                                              | 204; 404                                                                            |

- **Links.** `parseYoutubeUrl(input)` (shared, pure, also for the web's pre-validation) returns `{ kind: channel|artist|playlist|video, id, url (canonical), music }` or null. It accepts `@handle` (bare or in a URL), `/channel/UC…`, `/c/…`, `/user/…`, `/playlist?list=…`, `watch?v=…&list=…` (the playlist), `watch?v=…`, `youtu.be/…`, `/shorts/…`, `/live/…`, and on `music.youtube.com` `/channel/UC…` (an artist) and `/playlist?list=…`. Mixes (`RD…`, except YouTube Music's curated `RDCLAK…`), liked and watch-later lists are rejected. `guessLibrary(parsed)` is Music for `music.youtube.com`, else Video.
- **Resolve.** Parse (400 with a clear message when null), then `runner.metadata(canonicalUrl, { limit: 30, network })` with the Settings network options. A video resolves to its channel with a second call (`resolvedFrom: 'video'`). `ResolvedSource`: `kind` (a channel in the guessed Music library is an `artist`), `library` (guess), `youtubeId` (channel id or playlist id), `url` (id-based: `/channel/UC…`, artists on `music.youtube.com`, `/playlist?list=…`), `name`, `avatarUrl` (absolute; YouTube's original-size `=s0` avatars are requested at `=s256`), `itemCount` (playlists only; YouTube's flat channel listing has no total, so null for channels and artists), `uploadsPerWeek` and `latestItemAt` (from the newest 30 dated uploads across the channel tabs; null with fewer than two), `alreadyAdded` (`{ sourceId, library }`, preferring the guessed library). yt-dlp failures are 502 `{ message, reason }` with the runner's `reason`. Nothing is cached.
- **Create.** Re-resolves the URL. `kind` defaults to the resolved kind mapped to the chosen library (`kindForLibrary`: channel ↔ artist; a playlist stays a playlist; a playlist link cannot become a channel or the reverse). `initialRules`: the client's `matcher`, else the library's default tree from Settings (`video.defaultRules` / `music.defaultRules`); options are `DEFAULT_SOURCE_OPTIONS` (music: `embedCoverArt` from `music.embedCoverArt`) overlaid with the client's `options`. Then `sourceIssues`. Inserts subscribed, and in the same transaction upserts the `channels`, `artists` or `playlists` row (by kind) and links it when it is not linked yet. 409 with `sourceId` when `(library, youtubeId)` exists.
- **Update.** `matcher` replaces the tree as a whole; `SourceOptionsInput` (partial, no defaults, unknown fields rejected) overlays the current options (`mergeOptions`). A changed tree calls `SourcesService.onRulesChanged(listener)`; `SyncScheduler` uses it to enqueue a revalidation at once.
- **Preview** (`SyncController`, answered by `RevalidationService.preview`): evaluates the candidate tree against the source's items on disk without touching anything; 400 for a tree the source cannot have (`sourceIssues`), 404 for an unknown source.
- **Removing never deletes media.** `DELETE` removes the `sources` row only (revalidation is the only automatic deletion). The migration's `ON DELETE SET NULL` unlinks the catalog row (relinked to the same YouTube id's source in the other library when one exists); files and items are never touched. Unsubscribing only flips `subscribed`. The links to the sync are `SourcesService.onCreated(listener)` (check a new subscribed source at once) and `onRulesChanged(listener)` (revalidate it), both used by `SyncScheduler`.
- **Tests.** `sources.e2e.spec.ts` sets `YTDLP_PATH` to the fake binary, so `@NASA`, `/channel/UC…` and `music.youtube.com/channel/…` get `channel.json`, `list=` links `playlist.json` and `watch?v=`/`youtu.be` links `video.json` (then `channel.json` for its channel); `FAKE_YTDLP_FAIL=1` drives the 502. Pure helpers (`resolve.ts`: cadence, kind mapping, canonical URLs, `initialRules`, `mergeOptions`) and `parseYoutubeUrl` have unit tests.

## Background work

- Subscription checks and downloads run in-process. Use `@nestjs/schedule` for timers and a database-backed queue table for work items. No Redis, no external workers.
- yt-dlp is a binary the app downloads into `CONFIG_DIR` itself on first boot and updates periodically. It is not part of the image.
- `ScheduleModule.forRoot()` is in `AppModule`. Use `@Interval(ms)` / `@Cron` without a name (named intervals collide when tests boot several apps in one process). For a user-configurable interval, run a fixed short tick that re-reads settings and decides whether it is time (see the yt-dlp manager), instead of re-registering timers.
- Record outcomes with the global `HistoryService` (`src/activity`): `record({ kind: 'video' | 'music' | 'system', title, result, details?, jobId? })` and `recent(limit)` (newest first, shared `HistoryEntry`). Rows written by jobs carry `jobId` so the Activity screen can link the job log.

## yt-dlp

`src/ytdlp` is the only code that spawns yt-dlp. Everything else (sources, sync, jobs, maintenance) injects `YtdlpRunner`.

- `runner.version()`: `yt-dlp --version`.
- `runner.metadata(url, { limit?, approximateDates?, format?, network?, signal?, log? })`: `--dump-single-json --flat-playlist` (plus `youtubetab:approximate_date` so flat channel listings carry dates). Returns a normalised `SourceMetadata` (`metadata.ts`): `kind` (`channel`, `playlist`, `video`), ids, names, URLs, `thumbnailUrl` (avatar for channels), `playlistCount`, and flattened `entries` with `duration`, `uploadDate`, `timestamp`, `liveStatus`, `isShort`, the channel `tab` they came from, and `channelId` / `channel` when the listing names the uploader (playlists, single videos; flat channel listings do not). A channel root's tabs (Videos, Live, Shorts) are merged; a single video is its own only entry, with `expectedStreams` (the streams `format`, `-f`, selects, yt-dlp's default when omitted: `requested_formats` in download order, or the single file; each `{ formatId, bytes }` from `filesize`, else `filesize_approx`, else `tbr` × duration, which HLS formats need) and `expectedBytes` (their sum, null when any is unknown). Flat entries have neither. The Zod schemas ignore unknown fields and drop individual invalid entries (`skippedEntries`).
- `runner.download(url, { output, format?, mergeOutputFormat?, extraArgs?, network?, signal?, log? }, onProgress)`: resolves with `{ filePath }` (the path after merging and moving). `onProgress` gets `{ status, percent, downloadedBytes, totalBytes, speedBytesPerSec, etaSeconds }` with status `downloading`, `finished` (once per stream, so percent restarts for separate video and audio) or `postprocessing` (with `postprocessor`, the name yt-dlp's hook reports: `Merger`, `VideoRemuxer`, `MoveFiles`, …). Download lines carry `formatId` (null for a side file such as a subtitle track) and `estimated` when the total is yt-dlp's guess; `percent` follows bytes against an exact size, else fragments, else the estimate. Aborting the signal kills the process group (ffmpeg included); a `.part` file may remain for the caller to clean up.
- Failures reject with `YtdlpError`: `kind` (`spawn`, `exit`, `aborted`, `output`), `exitCode`, `stderrTail` (last 20 lines) and `reason` (the last `ERROR:` line).
- `NetworkOptions` (`rateLimit`, `proxy`, `cookiesFile`, all optional) are passed by the caller on each call; the runner never reads settings. The caller maps the Settings Network card to it.
- Arguments are built by the pure `buildArgs()` in `args.ts` and passed to `spawn` as an array, never through a shell. URLs always follow `--`. `extraArgs` may not contain flags the runner owns (`RESERVED_FLAGS`: output, print, progress, cookies, proxy, rate limit, exec, config). Every call uses `--ignore-config`. The command is logged at debug level with the cookies path and proxy credentials masked.
- Binary location is a seam: the `YTDLP_BINARY` token provides a `YtdlpBinaryLocator` (`{ path(): string }`), asked on every spawn. `YtdlpModule` binds it to `YtdlpBinaryService` (`useExisting`): `YTDLP_PATH` if set, else `CONFIG_DIR/bin/yt-dlp`.

### Binary manager

`YtdlpBinaryService` (`ytdlp-binary.service.ts`) owns the binary. Pure helpers are in `release.ts`, GitHub access in `github-releases.ts`.

- **Boot** (`onApplicationBootstrap`, not awaited, so `listen` is never held up): if the binary exists, read `--version`; otherwise install the latest release. Then run a due update check. Failures are logged and stored; the app keeps serving.
- **Install / update**: `GET https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest` (`User-Agent: MyTube`, `GITHUB_TOKEN` as a bearer token when set, to avoid the anonymous rate limit). The asset comes from `assetNameFor(process.platform, process.arch)`: linux x64 `yt-dlp_linux`, linux arm64 `yt-dlp_linux_aarch64`, darwin `yt-dlp_macos` (glibc builds, the image is Debian; Windows and other platforms get `UnsupportedPlatformError`, shown as the status error; use `YTDLP_PATH` there). The binary is downloaded to `bin/.yt-dlp-<random>.download`, checked against the release's `SHA2-256SUMS` (a mismatch fails; a missing file or line only warns), `chmod 755`, run with `--version` through a runner pointed at the temp file, and only then renamed over `bin/yt-dlp`. The temp file is always removed. A binary that does not run never replaces a working one.
- **Scheduling**: `@Interval` every 15 minutes (`TICK_MS`). While nothing is installed each tick retries the install; otherwise, when `ytdlp.autoUpdate` is on and `ytdlp.updateIntervalHours` has passed since `last_checked_at` (`isCheckDue`), it runs `update()`. Settings are re-read each tick, so changes apply without a restart.
- **Concurrency**: `check`, `update` and installs run one at a time through a promise chain; a second request waits and then usually finds nothing to do.
- **History**: `system` rows `yt-dlp <v> installed` (result `installed`), `yt-dlp <old> → <new>` (`updated`), and failures (`failed`, message in `details`) such as `yt-dlp install failed`. A failure is recorded only when its message differs from the stored last error, so a retry every tick while offline does not flood history. Plain `check` failures are not recorded, only stored.
- **State**: the single `ytdlp_state` row (see the database skill). `status()` derives `state`: `installing`/`updating` while busy, `error` when `last_error` is set, `not_installed`, `update_available` when the latest tag is newer (`compareVersions`, numeric segments), else `up_to_date`.
- **`YTDLP_PATH`** (dev, tests, unsupported platforms): the binary is used as is and its version read on boot; no install, no scheduled checks, `update` is a 409.
- **Endpoints** (`ytdlp.controller.ts`): `GET /api/ytdlp/status` → `YtdlpStatus` (`packages/shared/src/ytdlp.ts`); `POST /api/ytdlp/check` → looks up the latest release, installs nothing; `POST /api/ytdlp/update[?force=true]` → checks and installs when newer (`force` reinstalls). Both POSTs return 200 with the status; a failed lookup or install is reported in it (`state: 'error'`, `error`), not as a 5xx.
- On shutdown the manager aborts in-flight downloads and spawns.

### Testing with the fake binary

The API test suite has no network: `test/setup.ts` (a Vitest setup file) replaces `fetch` with one that rejects, so booting `AppModule` in an e2e test starts an install that fails at once. Tests that need GitHub stub `fetch` with `vi.stubGlobal` (see `ytdlp-binary.service.spec.ts`, which serves a fake release whose asset is a tiny shell script printing a version, and `test/ytdlp.e2e.spec.ts`, whose fetch never answers).

`packages/api/test/fixtures/fake-yt-dlp` is a Node script that stands in for yt-dlp without network access. Construct the runner with `new YtdlpRunner({ path: () => FAKE })`, set `YTDLP_PATH` to it, or override `YTDLP_BINARY` in a testing module. It serves the trimmed real JSON in `test/fixtures/ytdlp` (`channel.json` for channel URLs, `playlist.json` for `list=` URLs, `video.json` for `watch?v=` URLs) and the music fixtures in `test/fixtures/ytdlp/music` (`releases.json` for `/releases`, `uploads.json` for `/channel/<id>/videos`, `list-<id>.json` for a `list=` URL when that file exists, `track.json` for `music.youtube.com/watch?v=`), prints real-shaped progress lines for downloads and writes the output file (`.<--audio-format>` with `-x`, else `.mp4`). Env switches: `FAKE_YTDLP_FAIL`, `FAKE_YTDLP_EXIT`, `FAKE_YTDLP_DELAY_MS`, `FAKE_YTDLP_STDOUT`, `FAKE_YTDLP_FIXTURE`, `FAKE_YTDLP_ARGS_FILE` (records argv), `FAKE_YTDLP_VERSION`, `FAKE_YTDLP_NO_RELEASES` (a `/releases` URL fails like a channel without that tab). Never call the real binary from the test suite.

## Jobs

`src/jobs/` owns the `jobs` table (see the database skill) and runs it. `JobsModule.forRoot({ imports?, runners? })` is registered once in `AppModule` and is global, so any module can inject `JobsService`.

- **Enqueue**: `jobs.enqueue({ type, payload, key?, priority?, maxAttempts? })` → `{ job, created }`. `payload` is JSON with a `title` (the queue row title), optional `subtitle` (channel or artist) and `historyKind` (`video`/`music`/`system`, used for a final failure's history row), plus whatever the runner needs (`{ videoId }`, `{ sourceId }`). `key` de-duplicates: while a job with the same `type` and `key` is queued or running, the existing job is returned (`created: false`). Use `video:<youtube id>`, `track:<youtube id>`, `source:<id>`. Higher `priority` runs first, then the oldest id.
- **Queue view**: `listQueue(): Job[]` (shared `Job` DTO: running first, then queued, each in pick order), `queueView()` (the Activity queue: `listQueue()` plus jobs that failed for good in the last 24 h and were not retried, dismissed or superseded by a newer job with the same key), `summary()` (`{ activeDownloads: download jobs queued or running, queued: jobs of any type queued }`), `activeCount()`, and `latestForKey(type, key)`. The `Job` DTO carries `totalBytes` (column `total_bytes`) and `detail` (`payload.detail`, e.g. the quality) for the queue meta line.
- **Control**: `cancel(id)` marks a queued or running job `cancelled` and aborts its runner, and dismisses a `failed` one the same way; `retry(id)` puts a `failed` or `cancelled` job back as a fresh job (attempts, error and timestamps reset), or returns the active job with the same key instead; `updateProgress(id, { progress, speedBytesPerSec, etaSeconds, totalBytes, stage })` (running jobs only; `stage` is the yt-dlp post-processor while post-processing, cleared on complete, fail, requeue, cancel and claim). **Progress model** for downloads (`DownloadProgressTracker`): 0 to 0.9 while fetching bytes, weighted by the stream sizes the metadata call resolved with the download's format selector (a stream's exact size replaces its expected one once it starts; the bar never moves back when every size is known; otherwise it follows yt-dlp's per-stream totals and may step back once when the audio reveals its size rather than stand still), 0.9 to 0.99 in one step per distinct post-processor with `stage` set, and 1 when the job completes. `complete`, `fail`, `claimNext`, `requeue` and `recoverInterrupted` are the worker's.
- **Retries**: `attempts` counts failed attempts. A failure below `max_attempts` (default 3) requeues the job with `run_after` 1, 5, then 25 minutes later (`retryDelayMs`) and keeps the error on the row; the last failure marks it `failed` and records a `failed` history row with the error as details. A runner throws `PermanentJobError` when a retry cannot help (fails at once). yt-dlp errors are recorded by their `reason` (the last `ERROR:` line).
- **Worker** (`JobsWorker`): starts on `onApplicationBootstrap`, first moving jobs left `running` by a crash back to `queued` (attempts unchanged). Polls every 2 s and at once after an enqueue or a finished job. Runs up to `general.downloadsAtOnce` `download` jobs at once (read from settings on every poll, so a change applies without a restart; lowering it lets running jobs finish) and at most one job of each other type. Claims are one `UPDATE … WHERE id IN (SELECT … LIMIT 1) AND status = 'queued' RETURNING` (SQLite is single-writer). Success marks the job `done` and records the runner's outcome in history. On shutdown it aborts running jobs and requeues them. Jobs of a type without a runner stay queued.
- **Adding a runner**: implement `JobRunner` (`src/jobs/job-runner.ts`):

  ```ts
  @Injectable()
  export class DownloadRunner implements JobRunner {
    readonly type = 'download';
    async run(job: JobRow, { signal, progress }: JobContext): Promise<JobOutcome> {
      // pass `signal` to runner.download(); call progress({ progress, speedBytesPerSec, etaSeconds })
      return { kind: 'video', title: job.payload.title, result: 'done', details: null };
    }
  }
  ```

  and list it in `AppModule`: `JobsModule.forRoot({ imports: [YtdlpModule, SyncModule], runners: [CheckSourceRunner, RevalidateRunner, DownloadDispatchRunner], providers: [DownloadRunner, TrackDownloadRunner] })` (the current registration; `providers` are classes the runners inject that are not runners themselves). `run` may resolve `null` to record no history row (a routine check); outcomes and final failures are recorded with the job's id. Open a job log with `JobLogsService.open(job)`, pass `log.line` to the runner calls, close it and `prune()` in `finally`. `JobContext.progress` is a plain property, so it can be destructured. Runner classes become providers of `JobsModule` (so they can inject `JobsService` to enqueue follow-up work) and are collected into the `JOB_RUNNERS` array the worker reads; one runner per type. Honour `signal`: a cancel or shutdown aborts it, and the worker ignores the run's result afterwards. Progress writes are throttled to one per 500 ms, except a changed `stage` and `progress: 1`, which are written at once.

- **Tests**: `jobs.service.spec.ts` and `jobs.worker.spec.ts` use `test/jobs-harness.ts` (in-memory database, real `JobsService`/`SettingsService`/`HistoryService`, a hand-moved clock via the `JOBS_CLOCK` seam) and fake runners whose runs the test resolves or rejects.

## Sync rules

`src/sync/rules.ts` holds `evaluateItem(entry, matcher, ctx)`: pure, over one `SourceMetadata` entry, the source's tree and an `EntryContext` (`now`; `channelName` / `channelId` for entries that name no uploader, which is a channel's own flat listing; `playlistPosition`, the 1-based index in a playlist source's listing). It returns `{ accept: true }` or `{ accept: false, reason, transient, failing }`:

| Check                    | Reason                 | Rejects                                                                 |
| ------------------------ | ---------------------- | ----------------------------------------------------------------------- |
| always, before the rules | `upcoming` (transient) | `liveStatus` `is_upcoming`                                              |
| always, before the rules | `live` (transient)     | `liveStatus` `is_live` or `post_live`: never download an ongoing stream |
| the source's matcher     | `no_match`             | `evaluateMatcher` does not match; `failing` names the conditions        |

`entryContext(entry, ctx)` maps an entry to the `MatcherContext` (the upload date, else the timestamp's UTC day; duration rounded). Entries without a date or duration are unknown to those leaves and so are not dropped for it (flat listings omit dates now and then and date them approximately). The sync stores non-transient rejections as `skipped` / `no_match` and leaves transient ones for the next check.

## Sync

`src/sync/` (`SyncModule`). `SyncService`:

- `checkSource(sourceId, { signal?, log? })`: for a video source, `runner.metadata(source.url, { limit, network, signal, log })` with `limit` 200 on the first check (`last_checked_at` null) and 60 after. `applyListing(source, metadata, now)` (one transaction, testable without yt-dlp): a `channels` row for every uploader (playlist entries carry theirs; flat channel listings use the source's channel; the playlist owner is the fallback; `source_id` stays null for channels that are not sources), then per entry `evaluateItem`: accepted → `wanted`, rejected → `skipped` with the reason, transient → not stored. Known items move by `nextStatus`: `on_disk`, `downloading`, `missing` and `skipped/unavailable` never change; `wanted` and rules-`skipped` (`no_match`, `no_longer_matches`) follow the verdict (so a rules change can bring skipped items back). The sync never removes files; revalidation does. Existing rows keep their `published_at` (the download stores the exact one) and `source_id`. Playlists also get `playlist_items` positions 1..n for the fetched range and `playlists.item_count`. Then `enqueueDownloads`: one `download` job per `wanted` video (`key: video:<youtube id>`, `priority` = days since epoch of `published_at` so the newest runs first, payload `{ title, subtitle: channel name, historyKind: 'video', videoId, detail: video.quality, playlist? }`), except when its latest download job failed for good or was cancelled (those wait for Retry). Finally `last_checked_at` and `item_count` (`wanted` + `downloading` + `on_disk` videos, or tracks, of the source). A music source goes through `MusicSync` (see "Music sync"). A removed source throws `SourceGoneError`. Nothing goes to history unless the check fails.
- `enqueueCheck(id)` (`check_source`, key `source:<id>`, payload `{ sourceId, title: name, subtitle: 'checking for new content', historyKind: library }`), `enqueueAll()` (subscribed sources), `dueSources(now)` (subscribed, never checked or `last_checked_at` older than `general.checkIntervalHours`, and no check that failed for good within the interval).
- `CheckSourceRunner` (`check_source`) runs `checkSource` with a job log; `PermanentJobError` when the source is gone; resolves `null` (no history).
- `SyncScheduler`: `@Interval` every 5 minutes (and once at boot) enqueues a check for every due source and a revalidation for every source `RevalidationService.dueSources` returns; `SourcesService.onCreated` enqueues a check of a new subscribed source at once and `onRulesChanged` a revalidation.
- `SyncController`: `POST /api/sources/:id/check` → 202 `Job` (404 unknown; works for unsubscribed sources too), `POST /api/sync/check-all` → 202 `Job[]`, `POST /api/sources/:id/rules/preview` (see Sources API).

## Music sync

`src/sync/music-sync.ts` (`MusicSync`, created by `SyncService` as `sync.music`). `checkSource` of a Music source calls `music.check(source, network, limit, ctx)`, then `music.enqueueDownloads`, then marks the source checked (tracks counted). Same limits as videos (200 on the first check, 60 after).

- **Artist.** `runner.metadata(releasesUrl(id))` (`https://www.youtube.com/channel/<id>/releases`, flat) lists the releases, albums and singles alike, as album playlists (`OLAK5uy_…`). Every release not fetched before (no `albums` row with that playlist id and a `track_count`) is listed with `runner.metadata(albumUrl(id), { limit: 200 })` (`music.youtube.com/playlist?list=…`; yt-dlp redirects it to the YouTube playlist) and recorded by `applyAlbum` (one transaction): the `albums` row (upsert by `youtube_id`: title, `cover_url` = `albumCover`, the largest **signed** thumbnail, because the unsigned 1200 px `maxresdefault.jpg` answers 404; `track_count` = the playlist count) and a track per entry with `album_id` and `track_number` = its position. Flat album listings carry no year: the track download fills it. A release that fails to list is logged and tried again next check; if all fail the check fails. A track on a single and on its album keeps the album it was filed under first (the releases are newest first); the single's `albums` row then has no tracks and is not listed. Wanted ids are de-duplicated.
- **Fallback.** When the Releases tab errors (`YtdlpError` kind `exit`) or is empty, the uploads (`/channel/<id>/videos`) are recorded by `applyUploads`, grouped by yt-dlp's `album` field (`groupByAlbum`; albums found by artist and title, created without a playlist id). Flat uploads have no album, so these tracks keep `album_id` null until the download reads one.
- **Playlist.** `runner.metadata(source.url, { limit })`; `applyPlaylist` files each entry under the artist of its uploader (`artistOf`: by channel id, else by name case-insensitively, else a new `artists` row; `<Artist> - Topic` becomes `<Artist>`; the playlist owner as the fallback), stores `playlist_items` positions 1..n with `track_id`, and `playlists.item_count`.
- **Per track** (`applyTracks`): shorts are not music and are never recorded. The title is cleaned first (`cleanTrackTitle`, see "Metadata"), so the rules and the library see `Telescope`, not `Hiatus Kaiyote - 'Telescope' (Official Audio)`. `evaluateItem` decides (the artist as uploader; the playlist position for playlists; streams and premieres are transient) and `nextStatus` moves known tracks, as for videos.
- **Downloads** (`enqueueDownloads`): one `download` job per wanted track, in listing order, key `track:<youtube id>`, priority by `published_at` (today when unknown), payload `{ title, subtitle: artist name, historyKind: 'music', trackId, detail: music.container, position? }`; `position` (the playlist position) only for a playlist source with `syncOrder`. Failed-for-good and cancelled keys wait for Retry.

### A match wins across sources

Settled decision (architecture skill), for both libraries; the code is `src/sync/claims.ts`.

One video or track can be listed by several sources (an artist and a playlist of its songs, a channel and one of its playlists); it has one row, owned by the first source (`source_id`). `wantedElsewhere(db, table, itemId, exceptSourceId, ctx)` (`src/sync/claims.ts`) answers whether another source wants it: the owner or a playlist source listing it (with its position there) whose current tree matches. The sync (`applyListing`, `applyTracks`) keeps a `wanted` item wanted when its own verdict rejects it but another source wants it, and revalidation neither removes nor unwants it (it counts as kept). So a playlist's rules can download a track its artist's rules skip, and neither source's revalidation deletes a file the other still wants.

## Revalidation

`src/sync/revalidation.service.ts` (`RevalidationService`) and `revalidate.runner.ts` (`RevalidateRunner`, job type `revalidate`). The only automatic deletion; it replaces the old retention job.

- `revalidate(sourceId, { jobId?, log?, signal? })` evaluates the source's **current** tree on each of its items (`videos` or `tracks` with `source_id` = the source; items another source listed first are never touched). The context comes from the row (title, is_short, published_at, duration, live_status; tracks are never shorts or live), the uploader from `channels` (tracks: the artist) and, for playlist sources, the position from `playlist_items` (`video_id` or `track_id`). An item another source still wants (`wantedElsewhere`) is kept.
  - `on_disk` and not matching → `removeMediaFiles(VIDEO_DIR or MUSIC_DIR, file_path)` deletes the media file, its sidecars (`<name>.jpg|png|webp`, `<name>[.<lang>].vtt|srt|ass|lrc`; nothing else with the same stem) and every folder left empty up to (not including) the mount; then the item becomes `skipped` / `no_longer_matches` with `file_path` and `file_size_bytes` cleared, `sources.size_bytes` drops by its size (never below 0), and history gets `{ kind: video|music, title, result: 'removed', details: 'no longer matches: <failing conditions>', jobId }`. A path outside the mount or a delete error is a `failed` history row and the item stays on disk.
  - `wanted` and not matching → `skipped` / `no_match` (its queued download becomes a no-op).
  - `skipped` / `no_match` or `no_longer_matches` and matching again → `wanted`, and `SyncService.enqueueDownloads` (videos) or `sync.music.enqueueDownloads` (tracks) queues it.
  - `downloading`, `missing` and `unavailable` items are left alone. Finally `last_revalidated_at` and `item_count` are updated. Returns `{ removed, kept, unwanted, rewanted, failed }`.
- `preview(sourceId, matcher)` runs the same evaluation on the `on_disk` items against a candidate tree and changes nothing: `RulesPreview` `{ wouldRemove: [{ id, title, failing }], wouldKeep }`.
- `enqueue(sourceId)`: `revalidate` job, key `source:<id>`, payload `{ sourceId, title: name, subtitle: 'checking files against the rules', historyKind }`. `dueSources(now)`: subscribed sources never revalidated or last revalidated `REVALIDATE_INTERVAL_MS` (6 h) or more ago, unless a revalidation failed for good within the interval. Unsubscribed sources are paused (saving their rules still revalidates once).
- `RevalidateRunner` opens a job log (each removal is logged with the files it deleted), resolves `null` (the per-file history rows are the record) and turns `SourceGoneError` into `PermanentJobError`.

## Downloads

`src/downloads/`. `DownloadRunner` (`download`, payload `{ videoId, … }`): loads the video and channel; returns `null` when it is `on_disk`, `missing` or rules-`skipped` (only a retry of `skipped/unavailable` runs); marks it `downloading`; reads the video's own metadata (exact upload date and title; the flat listing date is approximate) and stores it; renders `video.pathTemplate` (`{channel}` = channel row name, `{title}`, `{date}`, `{year}`, `{id}`, `{playlist}` = `payload.playlist`) under `VIDEO_DIR`; runs `runner.download` with `-o <path with % escaped>.%(ext)s` and the options below, feeding `DownloadProgressTracker` into `ctx.progress` (one monotonic 0..0.99 bar across the video and audio streams, with `totalBytes`); on success stats the file and sets `on_disk`, `file_path` (relative, `/` separators), `file_size_bytes`, `downloaded_at`, adds the size to `sources.size_bytes`, and returns `{ title, result: 'done', kind: 'video', details: file path }`.

- Failures: back to `wanted` and rethrow (the worker retries). `isUnavailableReason(reason)` (removed, private, members-only, copyright; not bot checks or HTTP errors) → `skipped/unavailable` and `PermanentJobError`. A cancel (signal reason not `shutdown`) removes `<name>.*.part`, `.ytdl`, `.fNNN.*` and `.temp.*` files, and the name's sidecars when no finished media file exists, then the folder if empty; a shutdown keeps partials so the next run resumes.
- Options (`video-options.ts`, pure): `videoFormat(quality, container)`: `bestvideo[height<=1080]+bestaudio/best[height<=1080]` (`best` drops the cap; `mp4` and `webm` first try streams of that type). `videoExtraArgs(video)`: `--remux-video <container>` (not webm), subtitles `--embed-subs --sub-langs en,nl` when embedded or `--write-subs --sub-langs …` for sidecars (`--write-subs` together with `--embed-subs` would keep the files), thumbnails `--write-thumbnail --convert-thumbnails jpg` (the Plex sidecar `<name>.jpg`). `mergeOutputFormat` = container; network from `networkOptions`.

### Track downloads

`download` jobs go to `DownloadDispatchRunner` (the one runner of the type): a payload with `trackId` runs `TrackDownloadRunner` (`src/downloads/track-download.runner.ts`), anything else `DownloadRunner`. The track runner mirrors the video one:

- Returns `null` for a track on disk, missing or rules-skipped (only a retry of `unavailable` runs); marks it `downloading`.
- Reads the track's own metadata at `trackUrl(id)` (`https://music.youtube.com/watch?v=<id>`, with the download's `format`), whose YouTube Music fields (`MusicTags` on the entry: `track`, `artist`, `album`, `album_artist`, `release_year`, `release_date`, `track_number`, `disc_number`) fill in: the title (`track`, else the cleaned upload title), `published_at` (release date, else upload date), the duration, the album of a track without one (found or created by artist and title), and the album's year when unknown (release year, else the year of the release or upload date).
- Renders `music.pathTemplate` under `MUSIC_DIR`: `{artist}` the album's artist (else the track's), `{album}`, `{title}`, `{track}` (the job's `position` for a sync-ordered playlist, else the album position), `{disc}` (1 when unknown), `{year}` (album year, else the release year), `{id}`.
- Runs yt-dlp with `audioFormat(container, loudnessNormalization)` and `musicExtraArgs(music)` (`music-options.ts`): `-x --audio-format <container>`, `--audio-quality 0` (best) or the bitrate (none for flac), and with normalization `--postprocessor-args "ExtractAudio+ffmpeg_o:-af loudnorm=I=-14:TP=-1:LRA=11 -ar 48000"`. yt-dlp skips the extraction (and so the filter) when the codec already matches, so with normalization the format prefers the other stream (Opus for m4a, AAC for opus); without it the matching one (no re-encode). Then `ytdlpTagArgs(tags, { embedCoverArt })` with the source's option (Settings → Music's default without a source).
- After the download, when the source embeds tags and a metadata provider is enabled (`MetadataChain.active(settings.music)` is not empty), `chain.enrich(file, { youtubeId, tags, durationSeconds }, { settings, signal, log })` runs in the same job (see "Metadata"); it never fails the download. The size is read after it, since the rewrite changes it slightly. The database keeps what yt-dlp said: providers change the file's tags only.
- On success: `on_disk`, `file_path` (relative, `/`), size, `downloaded_at`, the source's `size_bytes`; outcome `{ kind: 'music', result: 'done', details: path }`. Failures, `unavailable`, cancels (`removePartials` in `partials.ts`, with only the container as a finished extension, so an extraction's source stream goes too) and shutdowns as for videos. Progress as for videos: the metadata call uses the download's format selector, so `new DownloadProgressTracker(entry.expectedStreams)` knows the size up front (`progress(tracker.start())`), and the extraction, metadata and cover embedding show as post-processing stages.

## Metadata

`src/metadata/` (`MetadataModule`) is the music metadata provider chain (architecture skill, settled decisions). Order: **yt-dlp** (always on, embeds while downloading), then **MusicBrainz**, then **Discogs** (both off by default, enriched after the download).

- `ytdlpTagArgs(tags: TrackTags, { embedCoverArt })` is the **yt-dlp provider**: nothing when the source's "Embed cover art and tags" is off; else `--embed-metadata --embed-thumbnail --convert-thumbnails png --postprocessor-args "ThumbnailsConvertor+ffmpeg_o:-vf crop=…"` (the 16:9 thumbnail cropped to its centre square; png so the converter, and the crop, always run) and one `--parse-metadata` per known value that sets yt-dlp's `meta_<tag>` override (`title`, `artist`, `album`, `album_artist`, `track`, `disc`, `date` = year). `setMetadata(tag, value)` builds `pre_process:#<value>#:(?s)^#(?P<meta_<tag>>.*)#$`, with `%` doubled and `:` escaped. Its `TrackTags` are the chain's **baseline**.
- **Interface** (`provider.ts`): `MetadataProvider` `{ name, label, enabled(musicSettings), lookup(track: TrackLookup, ctx: LookupContext) → Promise<ProviderResult> }`. `TrackLookup` `{ youtubeId, tags (the baseline), durationSeconds, uploadTitle, featuredArtists }`: for an upload (no YouTube Music `track`) the runner passes `parseTrackTitle`'s `plain` as `uploadTitle` (when it differs from the cleaned title) and its `featuredArtists`. `LookupContext` `{ settings (Settings → Music), signal?, log }`. `ProviderResult` `{ match: ProviderMatch | null, tried: string[], alsoSearched? }`; `ProviderMatch` `{ tags: Partial<…>, confidence (0–1), fieldConfidence?, summary }`; a rejection is a network or HTTP failure. **Lookup titles**: `searchTitles(track, search, alsoSearched?)` runs the provider's search for each of `lookupTitles(track)` (the cleaned title, then the upload title) until one answers confidently, and records every title tried. Providers enrich only the release fields (`ENRICHED_FIELDS`: `album`, `albumArtist`, `trackNumber`, `discNumber`, `year`); title and artist stay yt-dlp's, which the library, the file name and the rules use.
- **Chain** (`metadata-chain.ts`, `MetadataChain(providers, writer)`, built in `MetadataModule` as `[MusicBrainzProvider, DiscogsProvider]`): `active(settings)` lists the enabled ones; `enrich(file, track, ctx)` asks them in order, one job log line per result naming the search it sent (`describeSearch`: `MusicBrainz: album "Mood Valiant", album artist "Hiatus Kaiyote", track 9, disc 1, year 2021 for "Red Room" by Hiatus Kaiyote (confidence 0.95; recording …, release …)`, `…: no confident match for … (<why>)`, `MusicBrainz: no match for "Password" by MDK with t+pazolite (also tried "MDK x t+pazolite - Password")`, `…: lookup failed (<message>); no enrichment`), merges with `mergeTags` (per field the **first confident** value wins, `CONFIDENT` = 0.8; otherwise the baseline stays) and, when a field changed, writes all merged release fields (`metadata: wrote …`; `metadata: tags unchanged` otherwise). A failed lookup or write is logged and skipped; a cancel stops quietly. Enrichment never fails a download and nothing goes to history.
- **Tag writer** (`tag-writer.ts`, `TagWriter`): `ffmpeg -i <file> -map 0 -c copy -metadata album=… -metadata album_artist=… -metadata track=… -metadata disc=… -metadata date=… <dir>/.<name>.tagging.<ext>`, then renamed over the file. No re-encode; every stream (the embedded cover too) and every other tag is copied. On failure the temp file goes and the original stays. ffmpeg is the one on the PATH (yt-dlp's), `FFMPEG_PATH` overrides it; 120 s timeout. Verified with the real ffmpeg on an m4a: the cover stays.
- **MusicBrainz** (`musicbrainz.provider.ts`): `GET https://musicbrainz.org/ws/2/recording?query=recording:"<title>" AND artist:"<artist>" artist:"<featured>"…&fmt=json&limit=10` (Lucene phrases, `"` and `\` escaped; the featured artists are optional clauses, `+a +b c`, which raise a collaboration's score and exclude nothing), `User-Agent: MyTube/<version> ( https://github.com/ChappIO/my-tube )` as their policy asks, **one request per second** (`RateLimiter`, shared by concurrent downloads), 10 s timeout. `pickRecordingMatch` (pure): recordings with search score ≥ 90, the same title and artist (`sameName`: accents, case and punctuation aside; bracketed words count, so a remix is another recording) and a length within 10 s. With yt-dlp's album known, only releases of that title count (confidence 0.95; year = the earliest of them); none → not confident. Without an album, the best release (official, no secondary types, album over EP over single, earliest; 0.85). Track number = the medium's `track-offset` + 1, disc = the medium's position, album artist = the release credit, else the recording's.
- **Discogs** (`discogs.provider.ts`): `enabled` needs the toggle **and** a token. `GET https://api.discogs.com/database/search?type=release&artist=…&track=…&per_page=10`, then `GET /releases/<id>`; `Authorization: Discogs token=<token>` (never in a URL, a log line or an error message), `User-Agent: MyTube/<version> +https://github.com/ChappIO/my-tube`, one request per second (their 60 per minute for authenticated calls), 10 s timeout. `pickDiscogsResult`: results whose credit names our artist, alone or in a collaboration (`MDK & t+pazolite`; namesake `(2)` and `*` dropped), with the album's title when known (0.9) else the first (0.8), CD and digital before vinyl; `findDiscogsTrack`: the tracklist entry with our title (headings skipped), positions `9` → track 9 disc 1, `2-5` → disc 2 track 5, `A1`/`B2` → counted in order without a disc.
- **Settings**: `music.metadataProviders` (shared `MetadataProviders`: `{ musicbrainz: { enabled }, discogs: { enabled, token } }`, default both off and no token), stored as one row, so a PATCH sends the whole value. `GET /api/settings` returns the token (single-user app; the web masks it).
- **Adding a provider**: implement `MetadataProvider` with a `RateLimiter` and `fetchJson` (timeout, the job's signal, `ProviderHttpError`), add its settings to `MetadataProviders` (off by default) and a toggle to `MetadataProvidersCard`, provide it in `MetadataModule` and put it in the chain's array where it belongs in the order. Test the request building and parsing against trimmed real responses in `test/fixtures/metadata` with `fetch` stubbed (`vi.stubGlobal`); the suite has no network.
- Re-tagging files already on disk when a provider is enabled later is not done: the chain runs on new downloads only.
- `parseTrackTitle(title, artist)` → `{ title, featuredArtists, plain }` and `cleanTrackTitle(title, artist)` (its `title`) (`src/metadata/clean-title.ts`; settled decision in the architecture skill): drops symbols framing the title (`♪ … ♪`, `★`, `|`, `~`, emoji; only at the ends), upload decoration (`(Official Audio)`, `[Official Music Video]`, `(Lyric Video)`, `(Visualizer)`, `(Audio)`), a label's release tag or giveaway note (`[CHOMPO RELEASE]`, `[FREE DOWNLOAD]`), an `<artist> - ` prefix, also when the artist is one of several credited before the dash (`MDK x t+pazolite - Password`, `Hyper Potions x MDK - Nocturne`, `MDK feat. X - …`; separators `x`, `&`, `+`, `and`, `feat.`, `ft.`, `with`, `vs.`, `,`), and wrapping quotes. The other credited artists become `featuredArtists`; credits that do not name the artist stay (`DanTDM - Spacedog (MDK Remix)`). `plain` is the upload title with only the framing symbols removed. Used for tracks without a YouTube Music `track` field, at sync and download; titles already stored change on the next sync or download.
- Verified against the real binary: an m4a gets `title`, `artist`, `album`, `album_artist`, `track`, `date` and a 720 × 720 png cover (`ffprobe`).

## Library

`src/library/` (`LibraryModule`, `LibraryService`, `LibraryController`). The contract is `packages/shared/src/library.ts`; the music read models are under "Music" below.

| Endpoint                              | Query / body                                                                                   | Response                                                                                                                              |
| ------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/library/videos`             | `VideoListQuery`: `channelId?`, `sourceId?`, `status` (`on_disk`), `sort`, `limit`, `cursor?`  | `VideoPage` `{ items: VideoListItem[], nextCursor }`; 400 bad query/cursor                                                            |
| `GET /api/library/videos/:id`         |                                                                                                | `VideoListItem`; 404                                                                                                                  |
| `GET /api/library/videos/:id/stream`  | `Range` header                                                                                 | the file, 200 or 206; 404 not on disk or file gone; 403 outside VIDEO_DIR                                                             |
| `DELETE /api/library/videos/:id/file` |                                                                                                | 204; 404 unknown; 409 not on disk; 403 outside VIDEO_DIR                                                                              |
| `GET /api/library/home`               | `HomeQuery`: `days` (14, 1–365), `tz?` (IANA zone, validated)                                  | `HomeFeed` `{ stats, groups: [{ day, items: HomeItem[] }] }`                                                                          |
| `GET /api/library/summary`            |                                                                                                | `LibrarySummary` `{ videos: { channels, playlists, videos, sizeBytes }, music: { artists, albums, playlists, artistSubscriptions } }` |
| `GET /api/library/artists`            |                                                                                                | `ArtistListItem[]`                                                                                                                    |
| `GET /api/library/albums`             | `AlbumListQuery`: `artistId?`                                                                  | `AlbumListItem[]`; 400 bad query                                                                                                      |
| `GET /api/library/playlists`          | `PlaylistListQuery`: `library` (`music`, the default and only value)                           | `PlaylistListItem[]`; 400 for another library                                                                                         |
| `GET /api/library/tracks`             | `TrackListQuery`: `q?`, `filter` (`all`), `sort` (`added`), `dir` (`desc`), `limit`, `cursor?` | `TrackPage` `{ items: TrackListItem[], total, libraryTotal, nextCursor }`; 400 bad query/cursor                                       |
| `GET /api/library/tracks/:id`         |                                                                                                | `TrackListItem`; 404                                                                                                                  |
| `GET /api/library/tracks/:id/stream`  | `Range` header                                                                                 | the audio, 200 or 206; 404 not on disk or file gone; 403 outside MUSIC_DIR                                                            |
| `DELETE /api/library/tracks/:id/file` |                                                                                                | 204; 404 unknown; 409 not on disk; 403 outside MUSIC_DIR                                                                              |

- **`VideoListItem`** = the `Video` DTO plus `channel` (`{ id, name, avatarUrl, sourceId }`: the `channels` row, `sourceId` = the channel page's id or null), `thumbnailUrl` (`/api/artwork/video/<id>`, null without any art), `mimeType` (by extension, `videoMimeType`: mkv `video/x-matroska`, mp4 `video/mp4`, webm `video/webm`; null when not on disk). `toListItem(video, channel)` builds it.
- **List.** `status` defaults to `on_disk` (`all` drops the filter); `sort` `published` (default) or `downloaded`, newest first, rows without the value last, ties by id. Keyset pagination: `nextCursor` is base64url JSON `[sortValue, id]` of the page's last row (limit 1–200, default 60). `sourceId` means "this source's videos": listed by it first (`videos.source_id`) or of its channel (`channels.source_id`), so a channel page shows every video of the channel.
- **Home.** On-disk videos and tracks with `downloaded_at` in the last `days` days, newest first, at most `HOME_ITEM_LIMIT` (200), grouped by the local day of `downloaded_at` in `tz` (the web sends the browser's zone; the server's zone otherwise). `HomeItem` is a discriminated union on `kind` (`video`, `music`). `stats`: `activeDownloads` (`JobsService.summary()`), `downloadedAllTime` (history rows with result `done` and kind `video`/`music`), `librarySizeBytes` (sum of `file_size_bytes` of on-disk videos and tracks).
- **Summary.** Channel and playlist sources of the Video library, on-disk videos and their bytes (the header sub).
- **Stream.** `sendFile` (`files/send-file.ts`) wraps Express 5's `res.sendFile`: Range (206, `Accept-Ranges: bytes`, `Content-Range`), ETag, Last-Modified, `dotfiles: 'allow'` (worktrees live under `.claude/`); the content type is set from `videoMimeType`. The path goes through `libraryPath`, so a `file_path` that climbs out of `VIDEO_DIR` is a 403.
- **Delete file** (the explicit deletion, next to revalidation): `removeMediaFiles(VIDEO_DIR, file_path)` (file, sidecars, empty folders), then the video becomes `skipped` / `deleted_by_user` with `file_path` and `file_size_bytes` cleared, its source loses the size (never below 0) and gets its `item_count` recounted, and history records `{ kind: 'video', title, result: 'removed', details: 'deleted by user' }`. The sync (`nextStatus`) and revalidation never move `deleted_by_user` items, so nothing downloads the file again on its own.
- **Music** (`MusicLibraryService`, `MusicLibraryController`; contract in `packages/shared/src/library.ts`). A track is **in the library** when its status is `wanted`, `downloading`, `on_disk` or `missing` (`LIBRARY_TRACK_STATUSES`): what the rules want or what is (was) on disk; skipped tracks (rules, deleted, unavailable) never count.
  - `ArtistListItem` `{ id, name, avatarUrl (/api/artwork/artist/<id>), subscribed (its source's bell), sourceId, albumCount, trackCount }`: every artist with a track in the library or added as a source, by name. `albumCount` = its albums on the Albums tab, `trackCount` = its tracks in the library.
  - `AlbumListItem` `{ id, title, year, coverUrl (/api/artwork/album/<id>), artist { id, name }, trackCount, onDiskCount, firstTrackId }`: albums with a track in the library, by artist, newest year first, then title. `trackCount` counts its tracks in the library, `onDiskCount` those on disk (fewer is incomplete: `12/14 tracks` in red); `firstTrackId` is the first on disk by disc and number (the tile opens Preview on it), else null.
  - `PlaylistListItem` `{ id, name, sourceId, trackCount, onDiskCount, durationSeconds, covers, firstTrackId }`: the Music library's `playlists` with a source or with something on disk, by name. Counts and the summed duration over the tracks in the library at its positions; `covers` are the first four **distinct** covers on disk in playlist order (the stack); `firstTrackId` the first on disk.
  - `TrackListItem` = the `Track` DTO plus `coverUrl` (the album's cover when it has one, else the track's own `/api/artwork/track/<id>`), `artist` (`TrackArtist`), `album` (`TrackAlbum` `{ id, title, year, coverUrl }` or null) and `mimeType` (`audioMimeType`: m4a `audio/mp4`, mp3 `audio/mpeg`, opus `audio/ogg; codecs=opus`, flac `audio/flac`). `toTrackItem(track, artist, album)` builds it.
  - **Tracks tab** (`listTracks`, `GET /api/library/tracks`): tracks in the library. `filter`: `all`, `missing` (not on disk: `wanted`, `downloading`, `missing`), `recent` (`downloaded_at` within `RECENT_TRACK_DAYS` = 30). `q` (trimmed, ≤ 200) is a substring of the title, the artist name or the album title, compared folded: `mytube_fold(text)`, a SQL function every connection registers in `openDatabase` (`foldText`: NFKD, marks dropped, lower case), so `emilie` finds `Émilie` (SQLite's `lower`/`LIKE` fold ASCII only). `sort` `title`, `artist`, `album` (folded text), `length` (`duration_seconds`) or `added` (`downloaded_at`), `dir` `asc`/`desc`, default `added desc`. Rows without the value (no album, no length, never downloaded) come last in both directions; ties by id in the sort's direction. Keyset pagination: `nextCursor` is base64url JSON `[missing flag, sort value, id]` of the page's last row (limit 1–200, default 60). `total` counts the matches of the filter and `q`, `libraryTotal` the whole library (the toolbar's `17 of 42 tracks`).
  - Home merges `recentTracks(since, limit)` into the feed as `HomeMusicItem` (`TrackListItem` + `kind: 'music'`), both lists newest `downloaded_at` first, at most `HOME_ITEM_LIMIT` together. The Music summary counts the three tabs' lists and the subscribed artist sources.
  - Stream and Delete file mirror the video ones under `MUSIC_DIR`: the track becomes `skipped` / `deleted_by_user`, its source loses the size and gets its count, history `{ kind: 'music', result: 'removed', details: 'deleted by user' }`. `removeMediaFiles` removes an audio file's sidecars (`.jpg`, `.lrc`, …) the same way.
- **Tests.** `test/tracks.e2e.spec.ts` covers the Tracks list (filters, `q` over the three fields with accents, every sort both ways, cursor pages without gaps, totals, bad queries). `test/music-library.e2e.spec.ts` covers the music endpoints (list shapes, counts, incomplete albums, playlist covers and duration, summary, Home, album and track artwork, stream range and path escape, delete). `test/library.e2e.spec.ts` seeds rows and files in a temp library: list, filters, pagination, Home grouping and stats, summary, the artwork cache (hit, miss, sidecar, 503, 404, prune; `fetch` stubbed), stream ranges and path escape, delete.

## Artwork cache

`src/artwork/` (`ArtworkModule`, `ArtworkService`, `ArtworkController`). The web never loads Google's image hosts (they rate-limit bursts with 429); every avatar and thumbnail in a DTO the screens render is `/api/artwork/<kind>/<id>` (shared `artworkPath`, `ArtworkPath`, `ARTWORK_KINDS`).

| Kind       | Row         | Remote URL                                          | Used by                                                                                       |
| ---------- | ----------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `channel`  | `channels`  | `avatar_url`                                        | `Source.avatarUrl` of channel sources, `VideoListItem.channel`                                |
| `artist`   | `artists`   | `avatar_url`                                        | `Source.avatarUrl` of artist sources                                                          |
| `playlist` | `playlists` | `thumbnail_url`                                     | `Source.avatarUrl` of playlist sources                                                        |
| `video`    | `videos`    | `thumbnail_url`                                     | `VideoListItem.thumbnailUrl` (the sidecar `.jpg` when on disk)                                |
| `album`    | `albums`    | `cover_url`, else the first track's `thumbnail_url` | `AlbumListItem.coverUrl`, `TrackListItem.coverUrl`, playlist `covers`                         |
| `track`    | `tracks`    | `thumbnail_url`                                     | `TrackListItem.coverUrl` of a track without an album cover (a sidecar next to the file first) |

`ResolvedSource.avatarUrl` (the Add modal card) stays the remote URL: the source is not saved, so there is no row to cache for.

- `GET /api/artwork/:kind/:id` (400 for another kind or a non-numeric id, 404 for an unknown row or a row without art). A video or track on disk is served from its sidecar thumbnail (`<name>.jpg|webp|png` next to the file, under `VIDEO_DIR` or `MUSIC_DIR`) when there is one. Otherwise the cached file `CONFIG_DIR/cache/artwork/<kind>/<id>.<ext>` when `artwork_cache` says it came from the row's current remote URL; else it is downloaded with `fetch` (`User-Agent: MyTube/<version> …`, 10 s timeout, at most 4 downloads at once, concurrent requests for one image share a download, images up to 10 MB, the type from `Content-Type`), written through a temp file and recorded.
- Responses: `sendFile` with `Cache-Control: public, max-age=86400`, ETag and Last-Modified (304 on a matching `If-None-Match`). A 429, 5xx, timeout or network error is a **503 with `Retry-After: 5`** (the web retries after 2 s and 8 s); any other failure a 404. Failures are remembered in memory for 30 s (`ARTWORK_NEGATIVE_TTL_MS`) and never written to disk.
- Bookkeeping: the `artwork_cache` table (database skill). `used_at` is refreshed at most hourly per image. After each download `prune()` removes the least recently used files until the cache is at most 500 MB (`ARTWORK_CACHE_MAX_BYTES`).

## Activity API

`ActivityController` (`src/activity/activity.controller.ts`, registered by `JobsModule` because it reads the queue) and `JobsController`:

| Endpoint                           | Response                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------ |
| `GET /api/activity/queue`          | `Job[]`: `JobsService.queueView()`                                       |
| `GET /api/activity/history?limit=` | `HistoryEntry[]` (shared `activity.ts`), newest first, limit 1–500 (100) |
| `GET /api/activity/summary`        | `ActivitySummary` `{ activeDownloads, queued }` (the badge)              |
| `GET /api/jobs/:id/log`            | the job log, `text/plain` inline; 404                                    |
| `POST /api/jobs/:id/cancel`        | 204; 404. Cancels queued/running, dismisses failed                       |
| `POST /api/jobs/:id/retry`         | `Job`; 404; 409 unless failed or cancelled                               |

## Testing

- Unit test services and pure functions with Vitest next to the file.
- End-to-end tests in `packages/api/test` boot `AppModule` with `CONFIG_DIR` pointed at a temp dir (see `app.e2e.spec.ts`) and use supertest.
