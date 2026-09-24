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
  files/                media-files.ts: libraryPath (stay inside a mount), removeMediaFiles (file, sidecars, empty dirs)
  system/               GET /api/system/info and /logs, the backup and rescan stubs (see System)
  jobs/                 the jobs queue (JobsService), the worker pool (JobsWorker), the JobRunner seam,
                        per-job logs (JobLogsService) and /api/jobs/:id/{log,cancel,retry}
  sync/                 evaluateItem (live gate + matcher), SyncService, RevalidationService, SyncScheduler,
                        CheckSourceRunner, RevalidateRunner, the check and rules-preview endpoints
  downloads/            DownloadRunner and the Settings → Video to yt-dlp option mapping
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
- **Chips.** `describeMatcher(matcher)`: one chip per item of the root `and` (nested `and`s flattened), otherwise one chip; an `or` is one chip (`only "Artemis" or "Orion"` when all its items are titles, else items joined with `or`, deeper groups parenthesised); `describeLeaf(leaf, negated)` for single labels. The empty root `and` gives no chips.
- **Defaults and builders.** `DEFAULT_VIDEO_MATCHER` = `and(not(is_short), not(older_than_days 90))`, `DEFAULT_MUSIC_MATCHER` = `and()`. `and(...)`, `or(...)`, `not(x)` build trees; `matcherDepth`, `matcherSize`, `matcherLeaves`, `childrenOf`, `daysAgo`, `formatDuration`.

## Sources and rules

The contract is `packages/shared/src/rules.ts`; the tables are in the database skill ("Sources and catalog").

- `Library` (`video`, `music`) and `SourceKind` (`channel`, `artist`, `playlist`).
- `SourceOptions`: `embedCoverArt` (true; music only, ignored for video) and `syncOrder` (false; playlists only). `DEFAULT_SOURCE_OPTIONS`. `describeOptions(options, library)` gives `sync order` and `cover art` chips; `describeSource(source)` = rule chips then option chips (what the Channels row and channel page show).
- `Source` is the DTO for one `sources` row: `id`, `library`, `kind`, `youtubeId`, `url`, `name`, `avatarUrl`, `subscribed`, `matcher`, `options`, `lastCheckedAt`, `itemCount`, `sizeBytes`, `createdAt`, `updatedAt` (`lastRevalidatedAt` stays internal). A Drizzle row parses directly.
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
- `runner.metadata(url, { limit?, approximateDates?, network?, signal?, log? })`: `--dump-single-json --flat-playlist` (plus `youtubetab:approximate_date` so flat channel listings carry dates). Returns a normalised `SourceMetadata` (`metadata.ts`): `kind` (`channel`, `playlist`, `video`), ids, names, URLs, `thumbnailUrl` (avatar for channels), `playlistCount`, and flattened `entries` with `duration`, `uploadDate`, `timestamp`, `liveStatus`, `isShort`, the channel `tab` they came from, and `channelId` / `channel` when the listing names the uploader (playlists, single videos; flat channel listings do not). A channel root's tabs (Videos, Live, Shorts) are merged; a single video is its own only entry. The Zod schemas ignore unknown fields and drop individual invalid entries (`skippedEntries`).
- `runner.download(url, { output, format?, mergeOutputFormat?, extraArgs?, network?, signal?, log? }, onProgress)`: resolves with `{ filePath }` (the path after merging and moving). `onProgress` gets `{ status, percent, downloadedBytes, totalBytes, speedBytesPerSec, etaSeconds }` with status `downloading`, `finished` (once per stream, so percent restarts for separate video and audio) or `postprocessing`. Aborting the signal kills the process group (ffmpeg included); a `.part` file may remain for the caller to clean up.
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

`packages/api/test/fixtures/fake-yt-dlp` is a Node script that stands in for yt-dlp without network access. Construct the runner with `new YtdlpRunner({ path: () => FAKE })`, set `YTDLP_PATH` to it, or override `YTDLP_BINARY` in a testing module. It serves the trimmed real JSON in `test/fixtures/ytdlp` (`channel.json` for channel URLs, `playlist.json` for `list=` URLs, `video.json` for `watch?v=` URLs), prints real-shaped progress lines for downloads and writes the output file. Env switches: `FAKE_YTDLP_FAIL`, `FAKE_YTDLP_EXIT`, `FAKE_YTDLP_DELAY_MS`, `FAKE_YTDLP_STDOUT`, `FAKE_YTDLP_FIXTURE`, `FAKE_YTDLP_ARGS_FILE` (records argv), `FAKE_YTDLP_VERSION`. Never call the real binary from the test suite.

## Jobs

`src/jobs/` owns the `jobs` table (see the database skill) and runs it. `JobsModule.forRoot({ imports?, runners? })` is registered once in `AppModule` and is global, so any module can inject `JobsService`.

- **Enqueue**: `jobs.enqueue({ type, payload, key?, priority?, maxAttempts? })` → `{ job, created }`. `payload` is JSON with a `title` (the queue row title), optional `subtitle` (channel or artist) and `historyKind` (`video`/`music`/`system`, used for a final failure's history row), plus whatever the runner needs (`{ videoId }`, `{ sourceId }`). `key` de-duplicates: while a job with the same `type` and `key` is queued or running, the existing job is returned (`created: false`). Use `video:<youtube id>`, `track:<youtube id>`, `source:<id>`. Higher `priority` runs first, then the oldest id.
- **Queue view**: `listQueue(): Job[]` (shared `Job` DTO: running first, then queued, each in pick order), `queueView()` (the Activity queue: `listQueue()` plus jobs that failed for good in the last 24 h and were not retried, dismissed or superseded by a newer job with the same key), `summary()` (`{ activeDownloads: download jobs queued or running, queued: jobs of any type queued }`), `activeCount()`, and `latestForKey(type, key)`. The `Job` DTO carries `totalBytes` (column `total_bytes`) and `detail` (`payload.detail`, e.g. the quality) for the queue meta line.
- **Control**: `cancel(id)` marks a queued or running job `cancelled` and aborts its runner, and dismisses a `failed` one the same way; `retry(id)` puts a `failed` or `cancelled` job back as a fresh job (attempts, error and timestamps reset), or returns the active job with the same key instead; `updateProgress(id, { progress, speedBytesPerSec, etaSeconds, totalBytes })` (running jobs only). `complete`, `fail`, `claimNext`, `requeue` and `recoverInterrupted` are the worker's.
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

  and list it in `AppModule`: `JobsModule.forRoot({ imports: [YtdlpModule, SyncModule], runners: [CheckSourceRunner, RevalidateRunner, DownloadRunner] })` (the current registration). `run` may resolve `null` to record no history row (a routine check); outcomes and final failures are recorded with the job's id. Open a job log with `JobLogsService.open(job)`, pass `log.line` to the runner calls, close it and `prune()` in `finally`. `JobContext.progress` is a plain property, so it can be destructured. Runner classes become providers of `JobsModule` (so they can inject `JobsService` to enqueue follow-up work) and are collected into the `JOB_RUNNERS` array the worker reads; one runner per type. Honour `signal`: a cancel or shutdown aborts it, and the worker ignores the run's result afterwards. Progress writes are throttled to one per 500 ms.

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

- `checkSource(sourceId, { signal?, log? })`: for a video source, `runner.metadata(source.url, { limit, network, signal, log })` with `limit` 200 on the first check (`last_checked_at` null) and 60 after. `applyListing(source, metadata, now)` (one transaction, testable without yt-dlp): a `channels` row for every uploader (playlist entries carry theirs; flat channel listings use the source's channel; the playlist owner is the fallback; `source_id` stays null for channels that are not sources), then per entry `evaluateItem`: accepted → `wanted`, rejected → `skipped` with the reason, transient → not stored. Known items move by `nextStatus`: `on_disk`, `downloading`, `missing` and `skipped/unavailable` never change; `wanted` and rules-`skipped` (`no_match`, `no_longer_matches`) follow the verdict (so a rules change can bring skipped items back). The sync never removes files; revalidation does. Existing rows keep their `published_at` (the download stores the exact one) and `source_id`. Playlists also get `playlist_items` positions 1..n for the fetched range and `playlists.item_count`. Then `enqueueDownloads`: one `download` job per `wanted` video (`key: video:<youtube id>`, `priority` = days since epoch of `published_at` so the newest runs first, payload `{ title, subtitle: channel name, historyKind: 'video', videoId, detail: video.quality, playlist? }`), except when its latest download job failed for good or was cancelled (those wait for Retry). Finally `last_checked_at` and `item_count` (`wanted` + `downloading` + `on_disk` videos of the source). A music source is only marked checked ("music sync arrives in Stage 6"). A removed source throws `SourceGoneError`. Nothing goes to history unless the check fails.
- `enqueueCheck(id)` (`check_source`, key `source:<id>`, payload `{ sourceId, title: name, subtitle: 'checking for new content', historyKind: library }`), `enqueueAll()` (subscribed sources), `dueSources(now)` (subscribed, never checked or `last_checked_at` older than `general.checkIntervalHours`, and no check that failed for good within the interval).
- `CheckSourceRunner` (`check_source`) runs `checkSource` with a job log; `PermanentJobError` when the source is gone; resolves `null` (no history).
- `SyncScheduler`: `@Interval` every 5 minutes (and once at boot) enqueues a check for every due source and a revalidation for every source `RevalidationService.dueSources` returns; `SourcesService.onCreated` enqueues a check of a new subscribed source at once and `onRulesChanged` a revalidation.
- `SyncController`: `POST /api/sources/:id/check` → 202 `Job` (404 unknown; works for unsubscribed sources too), `POST /api/sync/check-all` → 202 `Job[]`, `POST /api/sources/:id/rules/preview` (see Sources API).

## Revalidation

`src/sync/revalidation.service.ts` (`RevalidationService`) and `revalidate.runner.ts` (`RevalidateRunner`, job type `revalidate`). The only automatic deletion; it replaces the old retention job.

- `revalidate(sourceId, { jobId?, log?, signal? })` evaluates the source's **current** tree on each of its items (`videos` or `tracks` with `source_id` = the source; items another source listed first are never touched). The context comes from the row (title, is_short, published_at, duration, live_status), the uploader from `channels` (tracks: the artist) and, for playlist sources, the position from `playlist_items`.
  - `on_disk` and not matching → `removeMediaFiles(VIDEO_DIR or MUSIC_DIR, file_path)` deletes the media file, its sidecars (`<name>.jpg|png|webp`, `<name>[.<lang>].vtt|srt|ass|lrc`; nothing else with the same stem) and every folder left empty up to (not including) the mount; then the item becomes `skipped` / `no_longer_matches` with `file_path` and `file_size_bytes` cleared, `sources.size_bytes` drops by its size (never below 0), and history gets `{ kind: video|music, title, result: 'removed', details: 'no longer matches: <failing conditions>', jobId }`. A path outside the mount or a delete error is a `failed` history row and the item stays on disk.
  - `wanted` and not matching → `skipped` / `no_match` (its queued download becomes a no-op).
  - `skipped` / `no_match` or `no_longer_matches` and matching again → `wanted`, and `SyncService.enqueueDownloads` queues it.
  - `downloading`, `missing` and `unavailable` items are left alone. Finally `last_revalidated_at` and `item_count` are updated. Returns `{ removed, kept, unwanted, rewanted, failed }`.
- `preview(sourceId, matcher)` runs the same evaluation on the `on_disk` items against a candidate tree and changes nothing: `RulesPreview` `{ wouldRemove: [{ id, title, failing }], wouldKeep }`.
- `enqueue(sourceId)`: `revalidate` job, key `source:<id>`, payload `{ sourceId, title: name, subtitle: 'checking files against the rules', historyKind }`. `dueSources(now)`: subscribed sources never revalidated or last revalidated `REVALIDATE_INTERVAL_MS` (6 h) or more ago, unless a revalidation failed for good within the interval. Unsubscribed sources are paused (saving their rules still revalidates once).
- `RevalidateRunner` opens a job log (each removal is logged with the files it deleted), resolves `null` (the per-file history rows are the record) and turns `SourceGoneError` into `PermanentJobError`.

## Downloads

`src/downloads/`. `DownloadRunner` (`download`, payload `{ videoId, … }`): loads the video and channel; returns `null` when it is `on_disk`, `missing` or rules-`skipped` (only a retry of `skipped/unavailable` runs); marks it `downloading`; reads the video's own metadata (exact upload date and title; the flat listing date is approximate) and stores it; renders `video.pathTemplate` (`{channel}` = channel row name, `{title}`, `{date}`, `{year}`, `{id}`, `{playlist}` = `payload.playlist`) under `VIDEO_DIR`; runs `runner.download` with `-o <path with % escaped>.%(ext)s` and the options below, feeding `DownloadProgressTracker` into `ctx.progress` (one monotonic 0..0.99 bar across the video and audio streams, with `totalBytes`); on success stats the file and sets `on_disk`, `file_path` (relative, `/` separators), `file_size_bytes`, `downloaded_at`, adds the size to `sources.size_bytes`, and returns `{ title, result: 'done', kind: 'video', details: file path }`.

- Failures: back to `wanted` and rethrow (the worker retries). `isUnavailableReason(reason)` (removed, private, members-only, copyright; not bot checks or HTTP errors) → `skipped/unavailable` and `PermanentJobError`. A cancel (signal reason not `shutdown`) removes `<name>.*.part`, `.ytdl`, `.fNNN.*` and `.temp.*` files, and the name's sidecars when no finished media file exists, then the folder if empty; a shutdown keeps partials so the next run resumes.
- Options (`video-options.ts`, pure): `videoFormat(quality, container)`: `bestvideo[height<=1080]+bestaudio/best[height<=1080]` (`best` drops the cap; `mp4` and `webm` first try streams of that type). `videoExtraArgs(video)`: `--remux-video <container>` (not webm), subtitles `--embed-subs --sub-langs en,nl` when embedded or `--write-subs --sub-langs …` for sidecars (`--write-subs` together with `--embed-subs` would keep the files), thumbnails `--write-thumbnail --convert-thumbnails jpg` (the Plex sidecar `<name>.jpg`). `mergeOutputFormat` = container; network from `networkOptions`.

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
