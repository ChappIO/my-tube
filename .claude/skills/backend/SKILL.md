---
name: backend
description: How the MyTube API (NestJS, packages/api) is structured, how configuration, validation, DTOs and modules work, and the conventions for adding endpoints, services and background jobs. Read before touching packages/api or packages/shared.
---

# Backend

The API is NestJS 12 (ESM) in `packages/api`. Everything is served under the `/api` global prefix. In production it also serves the built web app from `packages/web/dist` with an SPA fallback, so there is one process and one port. See the tooling skill for commands.

## Layout

```
packages/api/src
  main.ts               bootstrap: global prefix, shutdown hooks, listen
  app.module.ts         root module; wires config, database, features, static files
  config/               AppConfig: env-derived paths, port, version (global module)
  database/             SQLite via Drizzle, SQL migrations (see database skill)
  common/               cross-cutting helpers such as ZodValidationPipe
  health/               example feature module (controller only)
  ytdlp/                the yt-dlp runner (the only code that spawns yt-dlp)
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

## Background work

- Subscription checks and downloads run in-process. Use `@nestjs/schedule` for timers and a database-backed queue table for work items. No Redis, no external workers.
- yt-dlp is a binary the app downloads into `CONFIG_DIR` itself on first boot and updates periodically. It is not part of the image.

## yt-dlp

`src/ytdlp` is the only code that spawns yt-dlp. Everything else (sources, sync, jobs, maintenance) injects `YtdlpRunner`.

- `runner.version()`: `yt-dlp --version`.
- `runner.metadata(url, { limit?, approximateDates?, network?, signal? })`: `--dump-single-json --flat-playlist` (plus `youtubetab:approximate_date` so flat channel listings carry dates). Returns a normalised `SourceMetadata` (`metadata.ts`): `kind` (`channel`, `playlist`, `video`), ids, names, URLs, `thumbnailUrl` (avatar for channels), `playlistCount`, and flattened `entries` with `duration`, `uploadDate`, `timestamp`, `liveStatus`, `isShort` and the channel `tab` they came from. A channel root's tabs (Videos, Live, Shorts) are merged; a single video is its own only entry. The Zod schemas ignore unknown fields and drop individual invalid entries (`skippedEntries`).
- `runner.download(url, { output, format?, mergeOutputFormat?, extraArgs?, network?, signal? }, onProgress)`: resolves with `{ filePath }` (the path after merging and moving). `onProgress` gets `{ status, percent, downloadedBytes, totalBytes, speedBytesPerSec, etaSeconds }` with status `downloading`, `finished` (once per stream, so percent restarts for separate video and audio) or `postprocessing`. Aborting the signal kills the process group (ffmpeg included); a `.part` file may remain for the caller to clean up.
- Failures reject with `YtdlpError`: `kind` (`spawn`, `exit`, `aborted`, `output`), `exitCode`, `stderrTail` (last 20 lines) and `reason` (the last `ERROR:` line).
- `NetworkOptions` (`rateLimit`, `proxy`, `cookiesFile`, all optional) are passed by the caller on each call; the runner never reads settings. The caller maps the Settings Network card to it.
- Arguments are built by the pure `buildArgs()` in `args.ts` and passed to `spawn` as an array, never through a shell. URLs always follow `--`. `extraArgs` may not contain flags the runner owns (`RESERVED_FLAGS`: output, print, progress, cookies, proxy, rate limit, exec, config). Every call uses `--ignore-config`. The command is logged at debug level with the cookies path and proxy credentials masked.
- Binary location is a seam: the `YTDLP_BINARY` token provides a `YtdlpBinaryLocator` (`{ path(): string }`), asked on every spawn. The default is `YTDLP_PATH` if set, else `CONFIG_DIR/bin/yt-dlp`. The binary manager replaces this provider and owns downloading and updating the binary.

### Testing with the fake binary

`packages/api/test/fixtures/fake-yt-dlp` is a Node script that stands in for yt-dlp without network access. Construct the runner with `new YtdlpRunner({ path: () => FAKE })`, set `YTDLP_PATH` to it, or override `YTDLP_BINARY` in a testing module. It serves the trimmed real JSON in `test/fixtures/ytdlp` (`channel.json` for channel URLs, `playlist.json` for `list=` URLs, `video.json` for `watch?v=` URLs), prints real-shaped progress lines for downloads and writes the output file. Env switches: `FAKE_YTDLP_FAIL`, `FAKE_YTDLP_EXIT`, `FAKE_YTDLP_DELAY_MS`, `FAKE_YTDLP_STDOUT`, `FAKE_YTDLP_FIXTURE`, `FAKE_YTDLP_ARGS_FILE` (records argv), `FAKE_YTDLP_VERSION`. Never call the real binary from the test suite.

## Testing

- Unit test services and pure functions with Vitest next to the file.
- End-to-end tests in `packages/api/test` boot `AppModule` with `CONFIG_DIR` pointed at a temp dir (see `app.e2e.spec.ts`) and use supertest.
