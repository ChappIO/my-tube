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
  activity/             HistoryService over the history table (global module; controller in Stage 4)
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
- Other modules import `SettingsModule` and call `settings.get()` when they need a value (read at use time, so changes apply without a restart). Do not cache settings in a service.

**Adding a setting:** add the field with a `.default()` to its group in `packages/shared/src/settings.ts` (option lists as exported `as const` arrays, so the web select reuses them), extend the defaults test in `settings.spec.ts`, rebuild shared, then add the control to the Settings tab (see the frontend skill). No migration: a field without a row uses its default. Removing or narrowing a field is safe too; stale rows are ignored.

Env (`AppConfig`) stays for what is known before the database exists: mount paths, port, version. Those are shown in Settings read-only and are never settings.

## Sources and rules

The contract is `packages/shared/src/rules.ts`; the tables are in the database skill ("Sources and catalog").

- `Library` (`video`, `music`) and `SourceKind` (`channel`, `artist`, `playlist`).
- `Rules` is a discriminated union on `library`. Video: `skipShorts` (true), `keepDays` (90, null keeps forever), `publishedAfter` (null; ISO `YYYY-MM-DD`, only items published on or after it are downloaded; independent of `keepDays`: the date decides what comes in, the day window decides what retention deletes, both may be set; the sync maps it to yt-dlp `--dateafter`), `titleFilter` (null; case-insensitive plain substring, no wildcards or regex), `syncOrder` (false; playlists only). Music: `skipLiveRecordings` (false), `downloadFullAlbums` (true), `embedCoverArt` (true). `DEFAULT_VIDEO_RULES`, `DEFAULT_MUSIC_RULES` and `defaultRules(library)` are the handoff defaults; new video sources should take `keepDays` and `skipShorts` from Settings → Video.
- `describeRules(rules)` returns the handoff's chip labels in order: `no shorts`, `keep 90 days` (`keep 1 day`), `since 2025-01-01`, `only "Monologue"`, `sync order`, `no live`, `full albums`, `cover art`. Rules that are off give no chip.
- `Source` is the DTO for one `sources` row: `id`, `library`, `kind`, `youtubeId`, `url`, `name`, `avatarUrl`, `subscribed`, `rules`, `lastCheckedAt`, `itemCount`, `sizeBytes`, `createdAt`, `updatedAt`. A Drizzle row parses directly.
- `sourceIssues({ library, kind, rules })` lists invalid combinations (rules of the other library, an artist outside Music, sync order on a non-playlist). `Source` applies it; reuse it in create and update inputs.

## Background work

- Subscription checks and downloads run in-process. Use `@nestjs/schedule` for timers and a database-backed queue table for work items. No Redis, no external workers.
- yt-dlp is a binary the app downloads into `CONFIG_DIR` itself on first boot and updates periodically. It is not part of the image.
- `ScheduleModule.forRoot()` is in `AppModule`. Use `@Interval(ms)` / `@Cron` without a name (named intervals collide when tests boot several apps in one process). For a user-configurable interval, run a fixed short tick that re-reads settings and decides whether it is time (see the yt-dlp manager), instead of re-registering timers.
- Record outcomes with the global `HistoryService` (`src/activity`): `record({ kind: 'video' | 'music' | 'system', title, result, details? })` and `recent(limit)` (newest first).

## yt-dlp

`src/ytdlp` is the only code that spawns yt-dlp. Everything else (sources, sync, jobs, maintenance) injects `YtdlpRunner`.

- `runner.version()`: `yt-dlp --version`.
- `runner.metadata(url, { limit?, approximateDates?, network?, signal? })`: `--dump-single-json --flat-playlist` (plus `youtubetab:approximate_date` so flat channel listings carry dates). Returns a normalised `SourceMetadata` (`metadata.ts`): `kind` (`channel`, `playlist`, `video`), ids, names, URLs, `thumbnailUrl` (avatar for channels), `playlistCount`, and flattened `entries` with `duration`, `uploadDate`, `timestamp`, `liveStatus`, `isShort` and the channel `tab` they came from. A channel root's tabs (Videos, Live, Shorts) are merged; a single video is its own only entry. The Zod schemas ignore unknown fields and drop individual invalid entries (`skippedEntries`).
- `runner.download(url, { output, format?, mergeOutputFormat?, extraArgs?, network?, signal? }, onProgress)`: resolves with `{ filePath }` (the path after merging and moving). `onProgress` gets `{ status, percent, downloadedBytes, totalBytes, speedBytesPerSec, etaSeconds }` with status `downloading`, `finished` (once per stream, so percent restarts for separate video and audio) or `postprocessing`. Aborting the signal kills the process group (ffmpeg included); a `.part` file may remain for the caller to clean up.
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

## Testing

- Unit test services and pure functions with Vitest next to the file.
- End-to-end tests in `packages/api/test` boot `AppModule` with `CONFIG_DIR` pointed at a temp dir (see `app.e2e.spec.ts`) and use supertest.
