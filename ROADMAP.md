# Roadmap

Working checklist for building MyTube. Stages come from the architecture skill and are ordered so every stage ends in something you can run and click. Tasks are sized for one subagent and one pull request each.

## How to use this file

- Pick the first unchecked task in the lowest unfinished stage unless a task says it can run in parallel.
- Before starting a task, read `CLAUDE.md` and the skills it names. The task lists which skills and which handoff sections matter.
- A task is done when its "Done when" holds, `pnpm check` passes, and the relevant skill is updated if the task changed a convention.
- Check the box in the same pull request that finishes the task.
- Prefer vertical slices: pair an endpoint with the screen that uses it in one task and one pull request, so the whole feature can be validated at once. Pure infrastructure (migrations, runners, schedulers) may stay backend-only.
- Finish the work inside the task: fix what you find in scope (accessibility, missing variants, polish) before reporting. Only add a new task when it would substantially change the outcome or belongs to a later stage's feature. Small follow-ups are not filed; they pile up.
- Handoff references point into `design_handoff_mytube/README.md`.

## Stage 0: Project setup

- [x] pnpm workspace with shared, api and web packages
- [x] NestJS API with env config, SQLite, SQL migrations, health endpoint
- [x] Vite web app with TanStack Router, React Query, Tailwind
- [x] oxlint, oxfmt, Vitest, CI, Docker image, release workflow
- [x] Skills: architecture, tooling, backend, database, frontend, deployment
- [x] **Per-worktree dev stacks.** `pnpm dev` should take `PORT`/`API_PORT` so several checkouts run side by side for previews (the Vite proxy already reads `API_PORT`; the api dev script and CONFIG_DIR default still assume one checkout). Done when two worktrees can run `pnpm dev` at once without port or database collisions.
- [x] **Infra linters in CI.** Run actionlint, hadolint and shellcheck in the check job (see `pnpm lint:infra`). Done when a deliberate Dockerfile smell fails CI.

## Stage 1: Shell and design system

Skills: frontend. Handoff: Brand, Design Tokens, Layout, Sidebar, Interactions (theme, breakpoint).

- [x] **Design tokens and fonts.** Light and dark color tokens as Tailwind theme variables, Archivo and Space Mono loaded, type scale utilities, radii and shadow tokens. Theme is a body-level attribute; default follows `prefers-color-scheme`. Done when a token demo route renders every token in both themes.
- [x] **Logo and icon set.** The tile-and-glyph logo as an SVG component in the listed sizes and variants, the wordmark, the favicon, and a 16 to 20px icon set (Lucide) replacing the prototype's placeholder glyphs including the bell path. Done when the header lockup matches the handoff at 28px tile and 20px wordmark.
- [x] **App shell.** Layout route with the 232px sidebar on wide screens and the top bar plus five-item bottom tab bar below 760px. Nav items, active states, Add button, sidebar footer placeholder, Activity badge slot. Done when all five screens are reachable in both layouts with plain empty states.
- [x] **Routes.** `/`, `/music/$tab`, `/video/$tab`, `/video/channel/$id`, `/activity`, `/settings/$tab` with typed params, default tabs (Albums, Videos, General) and redirects for bare `/music`, `/video`, `/settings`. Done when navigation and browser back work and the sidebar reflects the route.
- [x] **Core components.** Tab pill track, primary, secondary, outlined and icon-circle buttons, pill and radius-10 inputs, toggle switch, checkbox row, section label, stat card, modal frame with overlay and close, page header. Each with a small story-style demo. Done when the components render in both themes and hit-target minimums hold on narrow screens.
- [x] **Media components.** Square media tile with fixed and slide-up chins, open music tile with circle variant for artists, playlist stack, bell toggle in circle and pill forms, duration badge. Done when the Home tile spec and the playlist stack spec are reproduced pixel-close with sample data.
- [x] **Focus and motion.** Global focus style (2px red outline, offset 2px) and motion tokens or utilities for tile hover, chin reveal and the toggle knob per the handoff's Motion section. Done when the core and media components use them instead of ad-hoc transitions.
- [x] **Dev routes out of production.** Exclude `src/routes/dev/**` from production builds (router plugin filtering or an env gate) so demo pages are not served by the container. Done when `/dev/tokens` 404s in the Docker image and still works in `pnpm dev`.
- [x] **Narrow tab pills.** At 375px the four Music pills with icons overflow the track (440px needed, 343px available). Decide and implement: hide icons below 760px (recommended), keep inside-scroll, or icon-only inactive pills. Done when Music tabs fit at 375px without a cut-off pill.
- [x] **Shared button sizes.** `Button` has no size matching the sidebar "Add to library" pill (Archivo 700 15px, 13px padding) so the sidebar keeps a local pill. Add an `xl` size or decide the local pill stays, and document. Done when the sidebar uses the shared component or the skill says why not.
- [x] **Modal follow-ups.** Focus trap, a header-less variant for Preview, safe nested Escape handling, and a `--color-scrim` token instead of the raw overlay rgba. Done when Preview can use `Modal` without a title row.
- [x] **Tile accessibility.** `MediaTile` nests a channel `<button>` inside a `role="button"` tile. Move to an overlay-link pattern so interactive content is not nested. Done when axe reports no nested-interactive violation on `/dev/media`.
- [x] **Logo demo polish.** On `/dev/logo` the "on white" and "on ink" grounds follow the theme instead of staying fixed; use fixed colors. Consider a pixel-snapped 16px favicon or ICO fallback. Done when the demo reads correctly in dark mode.

## Stage 2: yt-dlp manager and Settings

Skills: backend, database. Handoff: Screen 6 Settings, Sidebar footer.

- [x] **Settings store.** Typed settings keys with defaults in shared, a settings service over the `settings` table, `GET /api/settings` and `PATCH /api/settings`, and the General tab wired to it (appearance, check interval, downloads at once). Appearance uses `useTheme` from `packages/web/src/theme.ts`; decide whether the theme choice stays per-browser in localStorage (current) or moves to the settings table, and document the decision in the architecture skill. Done when changing a value survives a restart.
- [x] **yt-dlp binary manager.** On boot, locate `CONFIG_DIR/bin/yt-dlp` or download the latest GitHub release for the platform, verify it runs, record the version. A scheduled update check with an interval from settings, and `POST /api/ytdlp/update`. History entries for installs and updates. Done when a fresh container boots with a working yt-dlp and the sidebar footer shows its version and status.
- [x] **yt-dlp runner.** A service wrapping spawn with `metadata(url)` returning parsed JSON and `download(item, options)` streaming progress lines into a callback. Rate limit, proxy and cookies file from settings. Unit tests with a fake binary. Done when the runner is the only code that spawns yt-dlp.
- [x] **Settings screens.** Music, Video and Advanced tabs including the yt-dlp card with Check now, the Network card, and the Data card with Back up now, Download logs and Rescan libraries buttons wired to endpoints (rescan and backup may stub until Stage 7). Done when every field in the handoff's Settings screen is editable or a documented stub.

## Stage 3: Sources and the Add flow

Skills: backend, database, frontend. Handoff: Screen 3 Channels tab and Channel page, Screen 4 Add to library, Components bell toggle.

- [x] **Sources table and rules schema.** Migration for `sources`, `channels`, `artists`, `playlists`. Rules as a Zod schema in shared with the video and music rule sets from the handoff. Done when the schema and migration are in one commit and the database skill lists the tables.
- [x] **URL resolution.** `POST /api/sources/resolve` takes a YouTube URL and returns kind, name, avatar, counts and upload cadence via the yt-dlp runner. Done when channel, artist, playlist and unsupported URLs each return the documented result.
- [x] **Source CRUD and subscribe toggle.** Create from a resolved URL with library and rules, list, get, update rules, toggle subscribed. Unsubscribing never deletes anything. Done when the e2e test covers the full lifecycle.
- [ ] **Add modal.** URL input with detection, source card, Save-to switch that swaps the rule set, rule checkbox rows, Cancel and Subscribe. Done when subscribing closes the modal and the new source appears in Channels.
- [ ] **Channels tab and channel page.** Channel rows with rule chips, checked-ago, bell toggle and Edit rules, the collapse below 760px, and the channel page header with back link. Bell state shared between list and page with optimistic updates. Done when both screens match the handoff with real sources.

## Stage 4: Sync, queue and Activity

Skills: backend, database, frontend. Handoff: Screen 5 Activity, Sidebar badge.

- [ ] **Items tables.** Migration for `videos`, `tracks`, `albums`, `playlist_items` with the shared item fields and status enum. Done when the database skill documents the status lifecycle.
- [ ] **Jobs table and worker.** Migration for `jobs`, a worker loop honouring downloads-at-once, retries with backoff, cancellation, progress and speed updates, history rows on completion and failure. Done when unit tests cover ordering, concurrency and failure without a real download.
- [ ] **Rule evaluation.** A pure function deciding which fetched items a source's rules accept (shorts, title match, live recordings, full albums only). Done when every rule has a unit test.
- [ ] **Sync scheduler.** `check_source` jobs on the settings interval, fetching metadata through the runner, diffing against known items, inserting new ones and enqueueing downloads. Updates `last_checked_at`. Done when adding a subscribed source results in queued downloads within one interval.
- [ ] **Download job.** Runs the runner with format, container, subtitles and thumbnail options from settings, writes to the templated path, marks the item on disk with size, and stores the sidecar thumbnail. Done when a real small video lands in the video mount with the right name.
- [ ] **Activity screen and badge.** Queue rows with progress bars, history table with day grouping and the narrow collapse, polling while open, and the sidebar badge count on a slower poll. Done when a running download visibly progresses without reloading.

## Stage 5: Video library

Skills: frontend, backend. Handoff: Screen 1 Home, Screen 3 Videos tab, Screen 7 Preview.

- [ ] **Library read endpoints.** Videos list with channel and on-disk info, home feed grouped by day across both libraries, thumbnail serving. Done when responses validate against shared schemas in e2e tests.
- [ ] **Videos tab.** Square tiles with fixed chins, channel links that stop propagation, narrow grid sizing. Done when the tab matches the handoff with real downloads.
- [ ] **Home screen.** Header with the three stat cards, day groups, mixed video and music tiles with the hover chin behaviour. Done when stats reflect the database.
- [ ] **Preview modal.** Range-streamed playback, title and file path footer, Delete file with confirmation, click-outside close. Done when a downloaded video plays in the browser and delete removes the file and updates status.

## Stage 6: Music library

Skills: frontend, backend, database. Handoff: Screen 2 Music, Components open music tile and playlist stack.

- [ ] **Music sync and download.** Artist and playlist sources in the music library, album grouping from yt-dlp metadata, audio format and container from settings, track paths from the music template. Done when an artist source downloads an album into the music mount.
- [ ] **Metadata provider chain.** Provider interface, yt-dlp provider always on, MusicBrainz and Discogs providers off by default with Settings toggles and a Discogs token, tag and cover embedding after download. Done when enabling a provider changes tags on the next download and disabling it is the default.
- [ ] **Artists, Albums and Playlists tabs.** Open music tiles, artist circles with the bell badge, incomplete counts in red, playlist stack art. Done when the summary line and meta lines match the handoff formats.
- [ ] **Tracks tab.** Filter input, All, Missing and Recent filters, sortable columns with the Added-descending default, the narrow list collapse with sort pills. Done when filtering and sorting are server-backed and covered by tests.

## Stage 7: Retention and maintenance

Skills: backend, database. Handoff: Screen 6 Advanced, Screen 5 History entries.

- [ ] **Retention job.** Scheduled deletion of files older than a source's keep window, items marked missing, history entries with the "removed, older than N days" result. Done when a test proves an unsubscribed source is never cleaned by retention alone.
- [ ] **Rescan.** Walk the mounts, reconcile on-disk status and sizes, report counts. Wired to the Settings button (replaces the 501 stub of `POST /api/system/rescan`). Fill the Settings → Music / Video Library "Size" rows (`282 GB · 3,104 tracks`), which show "— · —" until then. Done when deleting a file outside the app shows as missing after a rescan.
- [ ] **Backups and logs.** Scheduled database backup into `CONFIG_DIR/backups` with rotation, Back up now (replaces the 501 stub of `POST /api/system/backup`), and Download logs: write the log file `GET /api/system/logs` already serves (`CONFIG_DIR/logs/mytube.log`) and apply the stored `data.logLevel` to the logger. Done when the Data card shows the last backup time.
- [ ] **Empty and error states.** Plain muted copy for every screen with no data and for API failures. Done when a fresh install shows sensible text on every route.
- [ ] **User documentation.** README with the compose example, mounts, PUID and PGID, the no-authentication note and first-run steps. Done when a friend can install it from the README alone.
