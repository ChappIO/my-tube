---
name: tooling
description: Repository layout, package manager, scripts, lint/format/test tooling and CI for MyTube. Read this before adding a dependency, a script, a workflow, or when a check fails.
---

# Tooling

MyTube is a pnpm workspace. Node and pnpm versions are pinned; use nvm (`.nvmrc`) and the `packageManager` field.

| Package          | Path              | Role                                                                    | Skill             |
| ---------------- | ----------------- | ----------------------------------------------------------------------- | ----------------- |
| `@mytube/shared` | `packages/shared` | Zod schemas shared by API and web. The single source of truth for DTOs. | backend, frontend |
| `@mytube/api`    | `packages/api`    | NestJS backend. Serves `/api/*` and, in production, the built web app.  | backend           |
| `@mytube/web`    | `packages/web`    | Vite + React SPA.                                                       | frontend          |

`docs/` is not a package: it holds the logo and screenshots the root `README.md` embeds (deployment skill, "README assets").

## Commands (run from the repo root)

- `pnpm dev`: runs `scripts/dev.mjs`, which builds shared once, then runs shared (`tsc --watch`), api (`nest start --watch`) and web (Vite, proxies `/api` to the api) with prefixed output, and prints the URLs. Ctrl-C stops all three. If one process exits, the others are stopped too. Open http://localhost:5173.
- `pnpm dev:api` / `pnpm dev:web`: one side only, with the same env names. `dev:api` builds shared once but does not watch it.
- `pnpm build`: builds all packages in dependency order.
- `pnpm check`: lint, format check, typecheck, tests. CI runs this plus `pnpm build` and `pnpm lint:infra`. Run it before committing.
- `pnpm fmt`: formats everything with oxfmt.
- `pnpm --filter @mytube/api <script>`: run a script in one package.

### Dev stacks per checkout

Every checkout (worktree) runs its own stack, configured by env. Defaults are per checkout, so two worktrees only need different ports:

| Variable     | Default                     | Used by                                               |
| ------------ | --------------------------- | ----------------------------------------------------- |
| `API_PORT`   | `8080` (`PORT` is accepted) | api listen port (passed as `PORT`), Vite proxy target |
| `WEB_PORT`   | `5173`                      | Vite port, `--strictPort` (fails instead of moving)   |
| `CONFIG_DIR` | `<checkout>/.local/config`  | api: database and settings                            |
| `MUSIC_DIR`  | `<checkout>/.local/music`   | api: music library                                    |
| `VIDEO_DIR`  | `<checkout>/.local/video`   | api: video library                                    |

Example for a second checkout: `API_PORT=8082 WEB_PORT=5175 pnpm dev`. `dev.mjs` checks both ports before starting and exits with a message if either is taken. The container defaults in `AppConfig` (`/config`, `/media/*`) are unchanged; only the dev entry points set per-checkout paths. `.local/` is gitignored. The package `dev` scripts use `${VAR:-default}` and so need a POSIX shell.

## Versions

- Exact versions only, no `^` or `~`. Prefer the newest stable release; skip release candidates and betas.
- pnpm enforces a minimum release age. Packages younger than that are listed in `pnpm-workspace.yaml` under `minimumReleaseAgeExclude`; pnpm adds them there when you install.
- Native build scripts are opt-in in `pnpm-workspace.yaml` under `allowBuilds`. Only `better-sqlite3` is allowed.

## Lint and format

- Linter: oxlint, configured in `.oxlintrc.json`, type-aware (via `oxlint-tsgolint`). Categories `correctness` (error) and `suspicious` (warn); warnings fail `pnpm lint`.
- Formatter: oxfmt, configured in `.oxfmtrc.json`. Single quotes, semicolons, trailing commas, width 100.
- Generated files (`routeTree.gen.ts`, `dist/`) are ignored by both.
- Do not add ESLint or Prettier.

## Infrastructure linters

`pnpm lint:infra` runs actionlint (workflows), hadolint (Dockerfile, config in `.hadolint.yaml`) and shellcheck (`docker/entrypoint.sh`). CI runs it in the check job with pinned release binaries (versions and sha256 digests in `ci.yml`); locally they come from Homebrew. Run it after touching anything under `.github`, the Dockerfile or `docker/`. When bumping a linter in CI, update the version and the digest together (the release page lists the sha256 per asset).

## TypeScript

- `tsconfig.base.json` holds the strict shared options. Each package extends it and only sets module/JSX/output options.
- The api and shared packages are Node ESM with `NodeNext` resolution: relative imports need the `.js` extension.
- The web package uses `bundler` resolution: no extensions. The exception is `packages/web/scripts/` (build-time helpers such as `favicon.ts`): Node runs them directly with type stripping, so their imports carry the `.ts` extension. They are typechecked and linted with the package.
- `@mytube/shared` is consumed through its built `dist`. After changing shared without `pnpm dev` running, rebuild it (`pnpm --filter @mytube/shared build`).

## Tests

- Vitest in every package. Unit tests live next to the code as `*.spec.ts`; API end-to-end tests live in `packages/api/test`.
- No test globals: import `describe`, `it`, `expect` from `vitest`.

## CI

- `.github/workflows/ci.yml` runs `pnpm lint:infra`, `pnpm build` and `pnpm check`, then builds the Docker image and curls `/api/health` inside it.
- `.github/workflows/release.yml` builds a multi-arch image and pushes it to GHCR on a `v*` tag. See the deployment skill.
