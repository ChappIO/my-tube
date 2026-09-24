# Handoff: MyTube

## Overview
MyTube is a self-hosted media library that downloads YouTube content with yt-dlp and files it into two libraries: **Music** (artists, albums, playlists, tracks) and **Video** (channels, playlists, videos). Users subscribe to artists and channels; new content is downloaded automatically according to per-subscription rules (skip shorts, keep last N days, title filters). Playback is primarily external (Plex); the web app offers browsing, subscription management, a download queue, settings, and a light in-browser preview.

Deployed as a single Docker container. Mounts: `/media/music`, `/media/video`, `/config` (database + settings). yt-dlp must auto-update without user intervention.

Audience: the owner and friends. No public marketing. Copy tone: dry and technical; the satire lives only in the brand (name, red, inverted play glyph).

## About the Design Files
The files in this bundle are **design references created in HTML** (`.dc.html`). They are prototypes showing intended look and behavior, not production code. Recreate them in the target codebase's environment using its established patterns; if none exists, choose an appropriate stack (a small SPA framework plus a backend that wraps yt-dlp is the obvious fit).

- `MyTube App.dc.html` — the full application prototype (all screens, light/dark, narrow layout).
- `Brand Directions.dc.html` — brand exploration board. Only **Turn 4** (logo set) and **Turn 5 option 5b** (playlist stack) are final; earlier turns are history.
- `support.js` — prototype runtime, not relevant to implementation.

## Fidelity
**High-fidelity.** Colors, type, spacing, radii and interactions are final. Recreate faithfully. Data shown (album names, channels, counts) is sample data.

---

## Brand

### Logo
- Mark: white "download" glyph on a red rounded tile. Glyph = downward triangle above a horizontal bar (a play button turned on its head, resting on a shelf).
- Tile: red `#EA333E`, corner radius ≈ 23% of tile size (96px → 22px, 56px → 12–14px, 28px → 7px).
- Glyph proportions inside tile: triangle ≈ 36% of tile width, 23% tall; bar ≈ 40% wide, 6% tall, radius 3px; gap between ≈ 5%.
- Wordmark: "MyTube", Archivo 800, letter-spacing −0.03em (−0.035em at 64px+).
- Header lockup: 28px tile + 20px wordmark, gap 10px.
- Variants: glyph alone in red or ink; inverted tile (white tile, red glyph) for red/busy grounds; two-tone wordmark "My" ink + "Tube" red.
- Sizes tested: 16, 24, 32, 48, 64. Favicon uses the 16px tile.
- Do not use YouTube's actual logo or play-button shape.

### Icons
- Bell (subscribe): standard bell outline path, 14px, filled with current color.
- Nav glyphs in the prototype are Space Mono characters (⌂ ♫ ▶ ↓ ⚙) as placeholders; replace with a consistent 16–20px icon set (Lucide or Phosphor, regular weight).

---

## Design Tokens

### Colors (light)
| Token | Value | Use |
|---|---|---|
| bg | `#FFFFFF` | page |
| side | `#FAFAFA` | sidebar, bottom tab bar |
| surface | `#F3F4F6` | chips, tile chins, inputs, tab pill tracks |
| surface2 | `#E3E6EA` | inactive toggle track, borders on unchecked boxes |
| line | `#ECEEF1` | all 1px borders |
| ink | `#151618` | primary text |
| muted | `#6F747C` | secondary text, meta |
| red | `#EA333E` | brand, primary buttons, active toggles, subscribed bell, missing counts |
| ok | `#2F9E6A` | "on disk", "done" |

### Colors (dark)
| Token | Value |
|---|---|
| bg | `#0F1012` |
| side | `#131417` |
| surface | `#1A1C20` |
| surface2 | `#26282C` |
| line | `#23252A` |
| ink | `#F2F3F5` |
| muted | `#8B9098` |
| red, ok | unchanged |

Theme is a body-level switch; every color references a token. Default follows the device, overridable in Settings → General.

### Typography
Fonts: **Archivo** (UI) and **Space Mono** (metadata: durations, paths, counts, timestamps, table headers, sort/filter labels). Google Fonts.

| Role | Spec |
|---|---|
| Page title (h1) | Archivo 800, 32px / 1.1, −0.03em (26px on narrow) |
| Modal title | Archivo 800, 22px, −0.02em |
| Section/card title | Archivo 700, 17px |
| Channel row name | Archivo 700, 16px |
| Stat value | Archivo 700, 16px |
| Nav item | Archivo 600, 15px |
| Queue title | Archivo 600, 15px |
| Tile title | Archivo 600, 13–14px / 1.3, clamp 2 lines |
| Body / table cell | Archivo 400–500, 14px |
| Tile secondary | Archivo 400, 12px, muted |
| Button | Archivo 600–700, 13–15px |
| Tab pill | Archivo 600, 14px (13px small) |
| Section label | Space Mono 700, 12px, uppercase, 0.08em, muted |
| Table header | Space Mono 700, 11px, uppercase, 0.06em, muted |
| Meta line | Space Mono 400, 11–12px, muted |
| Duration badge | Space Mono 700, 10px |
| Nav badge | Space Mono 700, 11px |

### Spacing
Base 4px. Common values: 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40.
- Main content padding: 32px 40px 64px (narrow: 0 16px 96px).
- Vertical rhythm between page sections: 28px (narrow 20px).
- Tile grid gap: 20px (narrow 12px). Music grid gap: 20px.
- Card padding: 22px 24px. Channel row padding: 14px 16px.

### Radii
- Pills (buttons, tabs, chips, inputs): 999px
- Tiles, art, cards, rows: 12px (settings cards 14px, modals 18px)
- Chips inside rows, small badges: 4–6px
- Nav items: 10px
- Logo tile: ~23% of size

### Shadows
- Tile hover: `0 12px 28px -12px rgba(0,0,0,0.35)`
- Modal: `0 40px 80px -30px rgba(0,0,0,0.5)` (preview: 0.6)
- Bell badge on art: `0 0 0 3px bg` ring
- No other shadows. Playlist stack has no shadow.

### Motion
- Tile hover: `transform .2s ease, box-shadow .2s ease`
- Chin reveal: `transform .2s ease` (translateY 100% → 0)
- Toggle knob: `left .15s`
- Nothing else animates.

---

## Layout

### Wide (≥ 760px)
Two columns: sidebar 232px fixed, sticky, full height, `side` bg, right border `line`; main column fluid, `min-width:0`.

### Narrow (< 760px)
- Sidebar hidden.
- Sticky top bar: header lockup left, round red 40px "+" button right (opens Add). Bg `bg`, padding 12px 0.
- Fixed bottom tab bar: 5 items in a 5-column grid, `side` bg, top border, 6px padding + safe-area inset. Item: glyph 16px above label Archivo 600 11px, min-height 44px, active color `ink`, inactive `muted`. Activity badge sits top-right of its glyph.
- Main padding 0 16px 96px (leaves room for the tab bar).
- Grids use `minmax(150px, 1fr)`.
- Tables collapse (see Tracks, History, Channels).
- Settings key/value grids collapse to label-above-field, fields full width.

---

## Sidebar
- Header lockup at top, padding 6px 10px 22px.
- Nav items: Home, Music, Video, Activity, Settings. Row: 11px 12px padding, radius 10px, gap 12px, glyph 16px wide (Space Mono 13px, muted) + label. Active: bg `surface`, color `ink`. Inactive: transparent, color `muted`. Hover: bg `surface`.
- Activity shows a red pill badge (count of active downloads), right-aligned.
- Spacer, then **"+ Add to library"** button: full width, red bg, white, Archivo 700 15px, 13px padding, pill.
- Footer: Space Mono 11px / 1.6 muted: `yt-dlp 2026.09.22` newline `up to date · auto-update on`.

---

## Screens

### 1. Home — "What's new"
Purpose: what landed recently, across both libraries.

Header (flex, space-between, wrap): h1 "What's new", sub "Across music and video, newest first." (Archivo 14 muted). Right: three stat cards — border `line`, radius 10px, padding 10px 14px, `white-space:nowrap`; label Space Mono 11 muted over value Archivo 700 16. Cards: `queue → 3 downloading`, `downloaded, all time → 4,812 files`, `library → 412 GB`.

Groups by day ("Today", "Yesterday"…): section label (Space Mono 700 12 uppercase 0.08em muted) then a grid `repeat(auto-fill, minmax(180px,1fr))`, gap 20px.

**Home tile** (shared spec, see Components): always square. Video tiles have a fixed chin (title + channel). Music/playlist tiles show only art; the chin slides up over the art on hover. Clicking a channel name in a video chin opens that channel page (stops propagation). Clicking the tile opens Preview.

### 2. Music
Header: h1 "Music", sub "31 artists · 84 albums · 3 playlists · 4 artist subscriptions". Right: tab pill track with **Artists / Albums / Playlists / Tracks**. Default tab: Albums.

Grid tabs use **open music tiles** (not square boxes): grid `minmax(180px,1fr)`, gap 20px. Tile = padding 10px (12px for artists), radius 14px, grid gap 12px; hover `scale(1.03)` + bg `surface`. Art is square, radius 12px; artists use a circle. Text below:
- Title Archivo 600 14 / 1.3
- Secondary Archivo 400 12 muted (artist for albums; "Yours" / "Synced from YouTube" for playlists; none for artists)
- Meta Space Mono 11 muted, `nowrap` + ellipsis. Artists center-aligned; others left.

Meta content:
- Albums: `2007 · 10 tracks`. If incomplete: `12/14 tracks` in **red**.
- Artists: `9 albums · 112 tracks`.
- Playlists: `42 tracks · 2h51`; incomplete `65/68 tracks · 4h12` in red.

Subscribed **artists** show a bell badge: 28px red circle, white bell 14px, ring `0 0 0 3px bg`, positioned so its center sits on the avatar's edge at 45° (top/right offset `calc(14.6% − 14px)`). Albums and playlists have no bell (adding one downloads everything).

Playlist art uses the **playlist stack** (see Components).

**Tracks tab**: toolbar row (flex, gap 10, wrap): filter input (pill, `surface` bg, border `line`, 300px; placeholder "Filter by title, artist or album"), filter tab pill **All / Missing / Recent**, right-aligned count `17 of 17 tracks` (Space Mono 12 muted).
Table: container border `line`, radius 12, overflow hidden. Header row bg `surface`, grid `40px 2fr 1.3fr 1.3fr 80px 110px 90px`, gap 16, padding 10px 16px; columns `# / Title / Artist / Album / Length (right) / Added / Status`; every header except # is clickable to sort (toggle direction on repeat), active column in `ink` with ↑/↓. Rows: same grid, padding 8px 16px, top border `line`, hover bg `surface`, click → Preview. Title cell: 32px rounded-square cover (radius 6) + title Archivo 500. Artist cell: 24px round avatar + name muted. Length/Added Space Mono 12 muted. Status Space Mono 700 11: `on disk` ok green, `missing` red.
Narrow: header hidden; "sort" label + outlined pills (Title, Artist, Album, Length, Added; active gets `ink` border and arrow); rows become list items: 44px cover, title + `artist · album`, right column duration over status.

### 3. Video
Header: h1 "Video", sub "4 channels · 1 playlist · 368 videos · 130 GB". Tabs **Videos / Channels**. Default: Videos.

**Videos tab**: square video tiles (Home tile spec with fixed chin), grid `minmax(180px,1fr)`. Chin: title (2-line clamp) + `channel · when`; channel name is a link (hover red + underline) that opens the channel page.

**Channels tab**: vertical list, gap 12. Row: grid `56px 1fr auto`, gap 16, padding 14px 16px, border `line`, radius 12. 56px round avatar. Middle: name Archivo 700 16 (name text is a link → channel page, hover red), meta Archivo 13 muted (`Channel · 214 videos · 38 GB`), rule chips below (Space Mono 11, `surface` bg, pill, 3px 8px: `no shorts`, `keep 90 days`, `only "Monologue"`, `sync order`). Right: `checked 12 min ago` (Space Mono 12 muted), **bell toggle** (36px circle; subscribed = red bg, white bell, red border; not = transparent, ink bell, `line` border), **Edit** outlined pill.
Narrow: grid `56px 1fr`, action group wraps to a full-width row below, `checked …` hidden.

**Channel page** (entered by clicking a channel name anywhere): back link "← Video" (Archivo 600 13 muted, hover ink). Header flex: 88px round avatar, h1 name, `Channel · 214 videos · 38 GB · checked 12 min ago`, rule chips (4px 9px). Right: **Edit rules** outlined pill and the **bell pill** ("Subscribed" red / "Subscribe" outlined, bell icon + label, padding 9px 16px 9px 12px). Below: this channel's videos as square tiles with chin (title + relative date).

### 4. Add to library (modal)
Overlay `rgba(21,22,24,0.45)`, click outside closes. Dialog `min(560px, 100%)`, radius 18, padding 28, gap 22.
- Title "Add to library" + 32px round × button (`surface` bg).
- Label "Paste a YouTube link" (Archivo 600 13 muted) + input (Space Mono 14, 13px 14px, radius 10, `surface`, border `line`; placeholder `https://www.youtube.com/@channel or /playlist?list=…`).
- Once a URL is recognised: detected-source card (44px avatar, name Archivo 700 15, meta Space Mono 12 muted e.g. `channel · 1,204 videos · 3 uploads/week`).
- "Save to" tab pill **Video / Music**.
- "Rules" checkbox rows (11px 12px, radius 10; checked row bg `surface`; box 20px radius 6, red when checked with white ✓, `surface2` border when not; label Archivo 500 14; hint Space Mono 12 muted right).
  - Video: `Skip shorts — under 60 s`, `Keep only the last 90 days — older files deleted`, `Only titles matching — "Deep Dive"`.
  - Music: `Skip live recordings — title contains "live"`, `Download full albums — not singles`, `Embed cover art — from YouTube Music`.
- Footer right: **Cancel** (`surface` pill) and **Subscribe** (red pill, Archivo 700 14).
The exact rule set will follow from the backend; this screen was not reviewed in detail and is a starting point.

### 5. Activity
h1 "Activity", sub "What is downloading now and what landed recently."
**Queue · 3**: rows (border `line`, radius 12, padding 14px 16px): title Archivo 600 15; meta Space Mono 12 muted (`Deep Dive Podcast · 1080p · 1.2 GB · 4.1 MB/s`); right: state Space Mono 700 13 (`downloading 64%` red, `queued` muted); full-width 4px progress bar (`surface` track, red fill).
**History**: bordered container; rows grid `120px 1fr auto auto`, gap 16, padding 12px 16px, top border. Cells: when (Space Mono 12 muted), title (Archivo 500), kind chip (`video` / `music` / `system`, Space Mono 11 pill `surface`), result (Space Mono 12: `done` green, `updated` green, `removed, older than 90 days` muted). Include yt-dlp updates and retention deletions as history entries.
Narrow: grid `1fr auto`, when and kind hidden, title ellipsized.

### 6. Settings
h1 "Settings" + tab pill **General / Music / Video / Advanced**. Content `max-width:760px`, cards gap 20.
Card: border `line`, radius 14, padding 22px 24px, gap 16, title Archivo 700 17.
Key/value grid: `180px 1fr`, gap 12px 20px; key Archivo 14 muted, value Space Mono 13 in a `surface` box (9px 12px, radius 8, `max-content`, min 160px). Narrow: one column, key above value with 8px top margin, value full width.
Toggle row: separated by a top border, 14px top padding; label Archivo 600 14 + description Archivo 13 muted; switch 44×26, track red when on / `surface2` when off, 20px white knob, left 3px → 21px.

- **General**: Appearance (Light / Dark pill, "Follows the device by default."); Subscriptions (`Check for new content → every 2 hours`, `Downloads at once → 2`).
- **Music**: Library (`Path /media/music`, `Folder structure Artist / Album / ## Title`, `Size 282 GB · 3,104 tracks`); Format (`Audio best available`, `Container m4a`, `Loudness normalization off`); Behaviour toggles: Download full albums (on), Embed cover art and tags (on), Skip live recordings (off).
- **Video**: Library (`/media/video`, `Channel / Title (Date)`, `130 GB · 368 videos`); Format (`Quality 1080p`, `Container mkv`, `Subtitles en, nl · embedded`); Defaults for new channels: `Keep videos for 90 days`, toggles Skip shorts (on), Save thumbnails (on, "As a sidecar file, for Plex.").
- **Advanced**: yt-dlp card first (`Installed 2026.09.22 · up to date · auto-update on`, **Check now** outlined pill, toggle "Update automatically — Checks every 6 hours. Downloads fail fast when yt-dlp is stale, so keep this on."); Network (`Rate limit none`, `Proxy none`, `Cookies file /config/cookies.txt`); Data (`Config and database /config`, `Last backup today 04:00`, `Log level info`; buttons Back up now / Download logs / Rescan libraries); footnote "Paths are container mounts. Change them in your Docker configuration."

### 7. Preview (modal)
Overlay `rgba(21,22,24,0.7)`. Dialog `width: min(880px, 100%, calc((100vh − 160px) · 16/9))`, `max-height: calc(100vh − 48px)`, radius 18. Top: 16/9 black (`#0F1012`) player area with a 72px translucent white play circle. Footer 22px 26px: title Archivo 700 18, file path Space Mono 12 muted; right: **Open in Plex** (`surface` pill, primary) and **Delete file** (outlined pill). Click outside closes.

---

## Components

### Square media tile (Home, Videos, Channel page)
- Container: `aspect-ratio:1`, radius 12, overflow hidden, bg `surface`, flex column, cursor pointer. Hover: `scale(1.04)` + tile shadow.
- Art: `flex:1`, radius **12px on all corners**, z-index above chin, fill = cover/thumbnail (`object-fit: cover`). Video: duration badge bottom-right (Space Mono 700 10, `ink` bg, `bg` text, 2px 6px, radius 4). No "video"/"music" type tag.
- Chin: bg `surface`, padding 10px 12px 12px; title Archivo 600 13 / 1.3 clamped to 2 lines; secondary Archivo 12 muted, ellipsis. Because the art is rounded on all sides and sits on the chin, the chin's top edge shows **inverted (concave) corners**. When the chin overlays (music on Home), reproduce this with two 12px concave corner pieces above the chin's top edge (radial-gradient or SVG), colored `surface`.
- Video tiles: chin in flow, always visible (art shrinks to fill the rest of the square).
- Music/playlist tiles on Home: art fills the square; chin is absolutely positioned at the bottom, `translateY(100%)`, slides to 0 on hover. Art does not resize.

### Open music tile (Music tab)
See Screen 2. No box; art + text; hover scale 1.03 + `surface` bg behind the whole tile.

### Playlist stack (playlist art everywhere)
Four covers of tracks in the playlist rendered in one 3D row inside a square, `perspective: 420px`, `perspective-origin: 30% 50%`, `transform-style: preserve-3d`, container overflow hidden, radius 12, bg `surface`.
Cover *i* (0 = front): `position:absolute; top:12%; bottom:12%; left: 8% + i·20%; width:62%; border-radius:10px; transform-origin:left center; transform: translateZ(−i·90px) rotateY(θ)` with θ = −10° for the front cover and −38° for the rest; z-index 4 − i.
Covers 1–3 carry a full overlay in the tile's surface color at opacity 0.24, 0.48, 0.72 so they fade into the background without showing through each other. No shadows.
Fewer than four tracks: repeat covers or fall back to a single cover.

### Tab pill track
Track: `surface` bg, padding 4, pill. Items: 8px 16px (7px 14px small), pill, Archivo 600 14 (13). Active: `bg` fill + `ink` text; inactive: transparent + `muted`.

### Buttons
- Primary: red bg, white text, Archivo 600–700, 9–13px vertical / 16–20px horizontal, pill.
- Secondary: `surface` bg, ink text.
- Outlined: 1px `line` border, transparent; hover `surface`.
- Icon circle: 32–40px, `surface` or red.
- Minimum hit target 36px; 44px on narrow.

### Bell toggle
36px circle (list) or pill with label (channel page). Subscribed: red fill, white glyph, red border. Not subscribed: transparent, ink glyph, `line` border. Toggles immediately; both instances reflect the same state.

### Inputs
Pill or radius-10 field, `surface` bg, 1px `line` border, ink text, Space Mono for URL/path inputs, Archivo for search/filter. No focus ring designed; use a 2px red outline offset 2px.

### Artwork colors (prototype only)
Real covers/thumbnails replace the gradients. The prototype hashes the title to a two-tone gradient purely for impression; a "placeholders" tweak shows striped placeholders instead.

---

## Interactions & Behavior
- Navigation: sidebar/bottom bar switch screens; state is in-memory in the prototype. Implement as routes (`/`, `/music/:tab`, `/video/:tab`, `/video/channel/:id`, `/activity`, `/settings/:tab`).
- Channel name anywhere (channel row, video tile chin, home video chin) → channel page; `stopPropagation` so the tile's preview doesn't open.
- Tile / track row click → Preview modal.
- Tracks: text filter matches title, artist, album (case-insensitive); filters All / Missing (not on disk) / Recent (added within the current month in the prototype; use "last 30 days"); sort by column, repeat click flips direction; default sort Added descending.
- Bell toggles subscription with no confirmation; unsubscribing should not delete files (handle deletion via retention rules or an explicit action).
- Add modal: URL detection populates the source card; Save-to switch changes the rule set; Subscribe closes the modal and creates the subscription.
- Settings toggles are immediate; key/value fields are editable controls (select or text) in production.
- Theme: Light/Dark in Settings; default follows `prefers-color-scheme`.
- Responsive breakpoint: 760px.
- Empty and error states are not designed; keep them plain (muted Archivo 14 text, e.g. "Nothing downloaded yet.").

## State Management
- `screen`, `musicTab` (Artists/Albums/Playlists/Tracks), `videoTab` (Videos/Channels), `channel` (id or null), `settingsTab`.
- `trackQuery`, `trackFilter`, `sortKey`, `sortDir`.
- `subscriptions` (per channel/artist/playlist: on/off + rules).
- `addOpen`, `addUrl`, `addLib`, `addRules`.
- `preview` (item or null).
- `theme`, settings toggles.
- `narrow` (viewport < 760).
- Data: libraries (artists, albums, tracks with on-disk flag, playlists with completeness), channels (rules, last check, size), videos, queue (progress, speed), history, yt-dlp version/status, totals (all-time file count, library size).

## Assets
- Fonts: Archivo (400–800), Space Mono (400, 700) from Google Fonts.
- Logo: build from the spec above (CSS or SVG); no bitmap provided.
- Bell icon path used in the prototype: `M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z` (24×24 viewBox).
- All cover/thumbnail imagery in the prototype is generated color; use real media artwork.

## Files
- `MyTube App.dc.html` — application prototype. Tweaks: `theme` (light/dark), `placeholders` (striped art).
- `Brand Directions.dc.html` — brand board; Turn 4 = logo set, Turn 5 → 5b = playlist stack.
- `support.js` — prototype runtime dependency, ignore.
