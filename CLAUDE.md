# MyTube

MyTube exists to let its users break free from the algorithmic YouTube feed. Instead of being fed whatever the recommendation engine picks, users make conscious decisions about which artists and channels to subscribe to, and only that content ends up in their library. Everything else in the project serves that goal.

Concretely, MyTube is a self-hosted media library that downloads YouTube content with yt-dlp and files it into two libraries:

- **Music**: artists, albums, playlists, tracks.
- **Video**: channels, playlists, videos.

Users subscribe to artists and channels. New content is downloaded automatically according to per-subscription rules (skip shorts, keep only the last N days, title filters). Playback is primarily external (Plex). The web app is for browsing the libraries, managing subscriptions, watching the download queue and history, changing settings, and a light in-browser preview.

## Goals

- Put the user in control of what they watch and listen to. No recommendations, no trending, no autoplay of things they did not choose.
- Run as a single Docker container with three mounts: `/media/music`, `/media/video`, and `/config` (database and settings).
- Keep yt-dlp updated automatically, without user intervention.
- Never delete files just because a subscription is removed. Deletion happens through retention rules or an explicit action.
- Match the design handoff faithfully. It is high fidelity: colors, type, spacing, radii and interactions are final.

## Audience and tone

The owner and a few friends. No public marketing. UI copy is dry and technical. The satire lives only in the brand: the name, the red, and the inverted play glyph (a play button turned on its head, resting on a shelf). Do not use YouTube's actual logo or play-button shape.

## Domain vocabulary

- **Library**: Music or Video. Every downloaded item belongs to exactly one.
- **Subscription**: an artist, channel or playlist that is checked for new content on a schedule, with its own rules.
- **Rules**: per-subscription filters such as skip shorts, keep last N days, only titles matching, skip live recordings, download full albums.
- **Queue**: downloads in progress or waiting.
- **History**: completed downloads, retention deletions, and yt-dlp updates.
- **On disk / missing**: whether a known track or video actually exists in the library mount.

## Where to look

- `design_handoff_mytube/README.md`: the full design spec (brand, tokens, screens, components, behavior).
- `design_handoff_mytube/MyTube App.dc.html`: HTML prototype of every screen, light and dark, wide and narrow.
- `design_handoff_mytube/Brand Directions.dc.html`: brand board. Only Turn 4 (logo set) and Turn 5 option 5b (playlist stack) are final.

The prototypes are design references, not production code.

## Working in this repo

Technology choices and conventions live in skills under `.claude/skills`, one per area: `architecture` (how the app works, domain model, delivery order), `tooling` (workspace, scripts, lint, CI), `backend`, `database`, `frontend` and `deployment`. Read the relevant skill before changing that area. `pnpm dev` starts everything; `pnpm check` runs what CI runs.

`ROADMAP.md` is the working checklist. Pick tasks from it in order, and check them off in the pull request that finishes them.
