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

## Commands (run from the repo root)

- `pnpm dev`: builds shared once, then runs shared (`tsc --watch`), api (`nest start --watch`, port 8080) and web (Vite, port 5173, proxies `/api`) in parallel. Open http://localhost:5173.
- `pnpm build`: builds all packages in dependency order.
- `pnpm check`: lint, format check, typecheck, tests. This is what CI runs. Run it before committing.
- `pnpm fmt`: formats everything with oxfmt.
- `pnpm --filter @mytube/api <script>`: run a script in one package.

## Versions

- Exact versions only, no `^` or `~`. Prefer the newest stable release; skip release candidates and betas.
- pnpm enforces a minimum release age. Packages younger than that are listed in `pnpm-workspace.yaml` under `minimumReleaseAgeExclude`; pnpm adds them there when you install.
- Native build scripts are opt-in in `pnpm-workspace.yaml` under `allowBuilds`. Only `better-sqlite3` is allowed.

## Lint and format

- Linter: oxlint, configured in `.oxlintrc.json`, type-aware (via `oxlint-tsgolint`). Categories `correctness` (error) and `suspicious` (warn); warnings fail `pnpm lint`.
- Formatter: oxfmt, configured in `.oxfmtrc.json`. Single quotes, semicolons, trailing commas, width 100.
- Generated files (`routeTree.gen.ts`, `dist/`) are ignored by both.
- Do not add ESLint or Prettier.

## TypeScript

- `tsconfig.base.json` holds the strict shared options. Each package extends it and only sets module/JSX/output options.
- The api and shared packages are Node ESM with `NodeNext` resolution: relative imports need the `.js` extension.
- The web package uses `bundler` resolution: no extensions.
- `@mytube/shared` is consumed through its built `dist`. After changing shared without `pnpm dev` running, rebuild it (`pnpm --filter @mytube/shared build`).

## Tests

- Vitest in every package. Unit tests live next to the code as `*.spec.ts`; API end-to-end tests live in `packages/api/test`.
- No test globals: import `describe`, `it`, `expect` from `vitest`.

## CI

- `.github/workflows/ci.yml` runs `pnpm check` and `pnpm build`, then builds the Docker image and curls `/api/health` inside it.
- `.github/workflows/release.yml` builds a multi-arch image and pushes it to GHCR on a `v*` tag. See the deployment skill.
