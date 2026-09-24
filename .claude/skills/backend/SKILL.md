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
  sources/              URL resolution, source CRUD, rules and the subscribe toggle
  system/               GET /api/system/info and /logs, the backup and rescan stubs (see System)
  jobs/                 the jobs queue (JobsService), the worker pool (JobsWorker) and the JobRunner seam
  sync/                 rule evaluation (evaluateItem); the sync scheduler joins it in Stage 4
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

## System

`src/system/` (`SystemModule`) serves instance facts and maintenance actions for Settings → Advanced. The contract is `packages/shared/src/system.ts`.

- `GET /api/system/info` → `SystemInfo`: `version` (`APP_VERSION`), `configDir`, `musicDir`, `videoDir` (the resolved `AppConfig` paths, `/config` and `/media/*` in the image) and `platform` (`<process.platform> <process.arch>`). The Settings Library and Data cards show the paths read-only; they are env, never settings.
- `GET /api/system/logs` → `text/plain` attachment `mytube.log`. It streams `CONFIG_DIR/logs/mytube.log` when that file exists; nothing writes it yet (the API logs to stdout, `docker logs`), so today it answers a short note saying so. Stage 7 (maintenance) decides whether a log file is kept and replaces the note.
- `POST /api/system/backup` and `POST /api/system/rescan` are **stubs**: `501` with `SystemActionResult` `{ message: 'Not implemented until Stage 7' }`. Stage 7 replaces them with real jobs (the `backup` and `rescan` job types) and should keep answering `SystemActionResult` so the Data card shows the new message without changes. Stage 7 also fills "Last backup" (read-only "never" in the web until then).
- `data.logLevel` is stored and editable in Settings but not applied to the Nest logger yet; Stage 7 wires it with the log file.

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
- `validatePathTemplate(template, tags)` (pure) returns `{ unknownTags, errors }`: unknown tags or modifiers (`{bogus}`, `{track:3}`), `:02` on a text tag, unmatched braces, `..` folders and absolute paths (`/…`, `\…`, `C:…`). The settings schema runs it in a `superRefine`, so `PATCH /api/settings` answers 400 with the message (`Unknown tag {bogus}.`; the Settings chips list the supported ones) and a stored row that no longer validates falls back to the default.

## Sources and rules

The contract is `packages/shared/src/rules.ts`; the tables are in the database skill ("Sources and catalog").

- `Library` (`video`, `music`) and `SourceKind` (`channel`, `artist`, `playlist`).
- `Rules` is a discriminated union on `library`. Video: `skipShorts` (true), `keepDays` (90, null keeps forever), `publishedAfter` (null; ISO `YYYY-MM-DD`, only items published on or after it are downloaded; independent of `keepDays`: the date decides what comes in, the day window decides what retention deletes, both may be set; the sync maps it to yt-dlp `--dateafter`), `titleFilter` (null; case-insensitive plain substring, no wildcards or regex), `syncOrder` (false; playlists only). Music: `skipLiveRecordings` (false), `embedCoverArt` (true). There is no album-only rule: an artist source downloads albums and singles alike. `DEFAULT_VIDEO_RULES`, `DEFAULT_MUSIC_RULES` and `defaultRules(library)` are the handoff defaults; new video sources should take `keepDays` and `skipShorts` from Settings → Video.
- `describeRules(rules)` returns the handoff's chip labels in order: `no shorts`, `keep 90 days` (`keep 1 day`), `since 2025-01-01`, `only "Monologue"`, `sync order`, `no live`, `cover art`. Rules that are off give no chip.
- `Source` is the DTO for one `sources` row: `id`, `library`, `kind`, `youtubeId`, `url`, `name`, `avatarUrl`, `subscribed`, `rules`, `lastCheckedAt`, `itemCount`, `sizeBytes`, `createdAt`, `updatedAt`. A Drizzle row parses directly.
- `sourceIssues({ library, kind, rules })` lists invalid combinations (rules of the other library, an artist outside Music, sync order on a non-playlist). `Source` applies it; reuse it in create and update inputs.

### Sources API

`src/sources/` (`SourcesService`, `SourcesController`); the DTOs are in `packages/shared/src/sources.ts`.

| Endpoint                            | Body / query                                     | Response                                                     |
| ----------------------------------- | ------------------------------------------------ | ------------------------------------------------------------ |
| `POST /api/sources/resolve`         | `ResolveRequest` `{ url }`                       | 200 `ResolvedSource`; 400 unsupported link; 502 yt-dlp error |
| `GET /api/sources`                  | `?library=video\|music` (optional)               | `Source[]`, newest first                                     |
| `GET /api/sources/:id`              |                                                  | `Source`; 404                                                |
| `POST /api/sources`                 | `CreateSource` `{ url, library, kind?, rules? }` | 201 `Source`; 400; 409 `SourceConflict` `{ sourceId }`       |
| `PATCH /api/sources/:id`            | `UpdateSource` `{ rules?, subscribed?, name? }`  | `Source`; 400; 404                                           |
| `PATCH /api/sources/:id/subscribed` | `SetSubscribed` `{ subscribed }` (the bell)      | `Source`; 404                                                |
| `DELETE /api/sources/:id`           |                                                  | 204; 404                                                     |

- **Links.** `parseYoutubeUrl(input)` (shared, pure, also for the web's pre-validation) returns `{ kind: channel|artist|playlist|video, id, url (canonical), music }` or null. It accepts `@handle` (bare or in a URL), `/channel/UC…`, `/c/…`, `/user/…`, `/playlist?list=…`, `watch?v=…&list=…` (the playlist), `watch?v=…`, `youtu.be/…`, `/shorts/…`, `/live/…`, and on `music.youtube.com` `/channel/UC…` (an artist) and `/playlist?list=…`. Mixes (`RD…`, except YouTube Music's curated `RDCLAK…`), liked and watch-later lists are rejected. `guessLibrary(parsed)` is Music for `music.youtube.com`, else Video.
- **Resolve.** Parse (400 with a clear message when null), then `runner.metadata(canonicalUrl, { limit: 30, network })` with the Settings network options. A video resolves to its channel with a second call (`resolvedFrom: 'video'`). `ResolvedSource`: `kind` (a channel in the guessed Music library is an `artist`), `library` (guess), `youtubeId` (channel id or playlist id), `url` (id-based: `/channel/UC…`, artists on `music.youtube.com`, `/playlist?list=…`), `name`, `avatarUrl` (absolute; YouTube's original-size `=s0` avatars are requested at `=s256`), `itemCount` (playlists only; YouTube's flat channel listing has no total, so null for channels and artists), `uploadsPerWeek` and `latestItemAt` (from the newest 30 dated uploads across the channel tabs; null with fewer than two), `alreadyAdded` (`{ sourceId, library }`, preferring the guessed library). yt-dlp failures are 502 `{ message, reason }` with the runner's `reason`. Nothing is cached.
- **Create.** Re-resolves the URL. `kind` defaults to the resolved kind mapped to the chosen library (`kindForLibrary`: channel ↔ artist; a playlist stays a playlist; a playlist link cannot become a channel or the reverse). Rules: `defaultRules(library)`, then for video Settings → Video `keepDays` and `skipShorts`, then the client's `rules`. Then `sourceIssues`. Inserts subscribed, and in the same transaction upserts the `channels`, `artists` or `playlists` row (by kind) and links it when it is not linked yet. 409 with `sourceId` when `(library, youtubeId)` exists.
- **Rule inputs** (`RulesInput`) are partial and have no defaults: `library` is required and must equal the source's library, the other fields are optional and unknown ones rejected. On create they overlay the defaults above, on `PATCH` they overlay the current rules, so a full `Rules` object and a single changed field both work.
- **Removing never deletes media.** `DELETE` removes the `sources` row only. The migration's `ON DELETE SET NULL` unlinks the catalog row (relinked to the same YouTube id's source in the other library when one exists); files and items are never touched. Unsubscribing only flips `subscribed`. Nothing in this module enqueues syncs or downloads (Stage 4).
- **Tests.** `sources.e2e.spec.ts` sets `YTDLP_PATH` to the fake binary, so `@NASA`, `/channel/UC…` and `music.youtube.com/channel/…` get `channel.json`, `list=` links `playlist.json` and `watch?v=`/`youtu.be` links `video.json` (then `channel.json` for its channel); `FAKE_YTDLP_FAIL=1` drives the 502. Pure helpers (`resolve.ts`: cadence, kind mapping, canonical URLs, rule overlay) and `parseYoutubeUrl` have unit tests.

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

## Jobs

`src/jobs/` owns the `jobs` table (see the database skill) and runs it. `JobsModule.forRoot({ imports?, runners? })` is registered once in `AppModule` and is global, so any module can inject `JobsService`.

- **Enqueue**: `jobs.enqueue({ type, payload, key?, priority?, maxAttempts? })` → `{ job, created }`. `payload` is JSON with a `title` (the queue row title), optional `subtitle` (channel or artist) and `historyKind` (`video`/`music`/`system`, used for a final failure's history row), plus whatever the runner needs (`{ videoId }`, `{ sourceId }`). `key` de-duplicates: while a job with the same `type` and `key` is queued or running, the existing job is returned (`created: false`). Use `video:<youtube id>`, `track:<youtube id>`, `source:<id>`. Higher `priority` runs first, then the oldest id.
- **Queue view**: `listQueue(): Job[]` (shared `Job` DTO: running first, then queued, each in pick order) and `activeCount()` for the badge. The Activity endpoints wrap these and `HistoryService.recent()`.
- **Control**: `cancel(id)` marks a queued or running job `cancelled` and aborts its runner; `updateProgress(id, { progress, speedBytesPerSec, etaSeconds })` (running jobs only). `complete`, `fail`, `claimNext`, `requeue` and `recoverInterrupted` are the worker's.
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

  and list it in `AppModule`: `JobsModule.forRoot({ imports: [YtdlpModule, …], runners: [DownloadRunner] })`. Runner classes become providers of `JobsModule` (so they can inject `JobsService` to enqueue follow-up work) and are collected into the `JOB_RUNNERS` array the worker reads; one runner per type. Honour `signal`: a cancel or shutdown aborts it, and the worker ignores the run's result afterwards. Progress writes are throttled to one per 500 ms.

- **Tests**: `jobs.service.spec.ts` and `jobs.worker.spec.ts` use `test/jobs-harness.ts` (in-memory database, real `JobsService`/`SettingsService`/`HistoryService`, a hand-moved clock via the `JOBS_CLOCK` seam) and fake runners whose runs the test resolves or rejects.

## Sync rules

`src/sync/rules.ts` holds `evaluateItem(entry, rules, now)`: a pure function over one `SourceMetadata` entry and a source's `Rules`, returning `{ accept: true }` or `{ accept: false, reason: SkipReason, transient }`. The first failing rule wins:

| Library | Rule                 | Reason                 | Rejects                                                                                      |
| ------- | -------------------- | ---------------------- | -------------------------------------------------------------------------------------------- |
| both    | (always)             | `upcoming` (transient) | `liveStatus` `is_upcoming`                                                                   |
| both    | (always)             | `live` (transient)     | `liveStatus` `is_live` or `post_live`: never download an ongoing stream                      |
| video   | `skipShorts`         | `short`                | `isShort`                                                                                    |
| video   | `publishedAfter`     | `published_before`     | upload date before the date; the same day is accepted                                        |
| video   | `keepDays`           | `older_than_keep_days` | upload date before `now` minus `keepDays` days (UTC date; the boundary day is accepted)      |
| video   | `titleFilter`        | `title_filter`         | title without the case-insensitive substring (no title never matches)                        |
| music   | `skipLiveRecordings` | `live`                 | title with the word "live" (`\blive\b`, case-insensitive: "Live at…", "(Live)", not "Olive") |

Entries without a date pass the date rules (flat listings omit dates now and then; yt-dlp's flat dates are approximate to the day). The sync stores non-transient rejections as `skipped` items with the reason and leaves transient ones for the next check.

## Testing

- Unit test services and pure functions with Vitest next to the file.
- End-to-end tests in `packages/api/test` boot `AppModule` with `CONFIG_DIR` pointed at a temp dir (see `app.e2e.spec.ts`) and use supertest.
