# MyTube

MyTube exists to let its users break free from the algorithmic YouTube feed. Instead of being fed whatever the recommendation engine picks, users make conscious decisions about which artists and channels to subscribe to, and only that content ends up in their library. Everything else in the project serves that goal.

Concretely, MyTube is a self-hosted media library that downloads YouTube content with yt-dlp and files it into two libraries:

- **Music**: artists, albums, playlists, tracks.
- **Video**: channels, playlists, videos.

Users subscribe to artists and channels. New content is downloaded automatically according to per-subscription rules (an AND/OR/NOT tree of conditions such as skip shorts, not older than N days, title contains). Playback is primarily external (Plex). The web app is for browsing the libraries, managing subscriptions, watching the download queue and history, changing settings, and a light in-browser preview.

## Goals

- Put the user in control of what they watch and listen to. No recommendations, no trending, no autoplay of things they did not choose.
- Run as a single Docker container with three mounts: `/media/music`, `/media/video`, and `/config` (database and settings).
- Keep yt-dlp updated automatically, without user intervention.
- Never delete files just because a subscription is removed. Deletion happens only through a source's rules (revalidation removes files that no longer match) or an explicit action.
- Keep to the design. It is final: colors, type, spacing, radii and interactions are settled. The frontend skill is the design reference; match the existing components.

## Audience and tone

The owner and a few friends. No public marketing. UI copy is dry and technical. The satire lives only in the brand: the name, the red, and the inverted play glyph (a play button turned on its head, resting on a shelf). Do not use YouTube's actual logo or play-button shape.

## Domain vocabulary

- **Library**: Music or Video. Every downloaded item belongs to exactly one.
- **Subscription**: an artist, channel or playlist that is checked for new content on a schedule, with its own rules.
- **Rules**: a per-subscription matcher: an AND/OR/NOT tree of conditions (skip shorts, not older than N days, title contains, …) that decides what is downloaded and what stays.
- **Queue**: downloads in progress or waiting.
- **History**: completed downloads, rule removals, and yt-dlp updates.
- **On disk / missing**: whether a known track or video actually exists in the library mount.

## Working in this repo

Technology choices and conventions live in skills under `.claude/skills`, one per area: `architecture` (how the app works, domain model, settled decisions), `tooling` (workspace, scripts, lint, CI), `backend`, `database`, `frontend` (also the design reference: brand, tokens, layout, components, screens, interactions) and `deployment`. Read the relevant skill before changing that area. `pnpm dev` starts everything; `pnpm check` runs what CI runs.

The project is in its iteration stage: the product is built, and changes are small. Ship each change as one pull request, validate it in the browser before pushing, and update the skills it affects in the same pull request.
