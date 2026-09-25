# MyTube

MyTube is for breaking free from the algorithmic YouTube feed. You decide which channels, artists and playlists you follow; MyTube checks them on a schedule, downloads what your rules let through with [yt-dlp](https://github.com/yt-dlp/yt-dlp), and files it into two plain folders: a Music library (artist, album, track, tagged, with cover art) and a Video library (channel, video, with a sidecar thumbnail). Nothing is recommended, nothing trends, nothing plays next. Watch and listen with Plex (or anything else that reads folders); the web app is for managing subscriptions, the queue, the history and the settings, plus a quick preview.

It is one Docker container with three mounts.

## Install

```yaml
# docker-compose.yml
services:
  mytube:
    image: ghcr.io/chappio/my-tube:latest
    container_name: mytube
    ports:
      - '8080:8080'
    environment:
      PUID: 1000
      PGID: 1000
      TZ: Europe/Amsterdam
    volumes:
      - ./config:/config
      - /srv/media/music:/media/music
      - /srv/media/video:/media/video
    restart: unless-stopped
```

```bash
docker compose up -d
```

Then open http://your-host:8080.

### Image tags

| Tag      | What                                              |
| -------- | ------------------------------------------------- |
| `latest` | The newest release.                               |
| `1.2.3`  | One release (the `v1.2.3` tag on GitHub).         |
| `1.2`    | The newest patch of a minor release. Pin to this. |

Images are built for `linux/amd64` and `linux/arm64`.

### Mounts

| Path           | Holds                                                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `/config`      | The database (`mytube.db`, settings included), backups, logs, the yt-dlp binary, the artwork cache and an optional `cookies.txt`. Small. |
| `/media/music` | The Music library: `Artist / Album / ## Title.m4a`. Point Plex's music library here.                                                     |
| `/media/video` | The Video library: `Channel / Title (Date).mkv` with `Title (Date).jpg` next to it. Point Plex's video library here.                     |

The folder structures and formats are editable in Settings → Music and Settings → Video.

### Environment

| Variable | Default | Meaning                                                                                                                             |
| -------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `PUID`   | `1000`  | User id MyTube runs as. Files in the libraries and in `/config` are owned by it. Use the id that owns your media folders (`id -u`). |
| `PGID`   | `1000`  | Group id, likewise (`id -g`).                                                                                                       |
| `TZ`     | UTC     | Time zone for the nightly backup (04:00) and rescan (04:30) and for the log. Any tz database name.                                  |
| `PORT`   | `8080`  | Port inside the container. Changing the published port (`'9000:8080'`) is usually enough.                                           |

Only `/config` is chowned to `PUID:PGID` on start. The media folders are left as they are, so make sure that user can write to them.

### Health check

`GET /api/health` answers `{"status":"ok","version":…}`. The image has a `HEALTHCHECK` on it, so `docker ps` shows `healthy` once the app is up.

### No authentication

MyTube has no login. Anyone who can reach the port can add sources, change rules and delete files. Keep it on your home network, or put it behind a reverse proxy that does authentication (Authelia, Authentik, basic auth, Tailscale, …). Do not expose it to the internet as is.

## First run

1. Open the app. On first start it downloads the latest yt-dlp into `/config/bin`; the sidebar footer shows its version once that is done.
2. Click **Add to library** and paste a YouTube link: a channel (`https://www.youtube.com/@NASA`), an artist on YouTube Music (`https://music.youtube.com/channel/…`) or a playlist. A single video link resolves to its channel. Choose Video or Music.
3. Set the rules before you subscribe. They are an AND/OR/NOT tree of conditions (no shorts, not older than 90 days, no members-only videos, title contains …). New sources start from the defaults in Settings → Video and Settings → Music. The same rules decide what is kept: tighten them later and files that no longer match are removed (Edit rules shows what would go before you save).
4. Subscribe. The source is checked at once and then every 2 hours (Settings → General). Downloads show up in Activity.
5. Point Plex (or Jellyfin, or a music player) at the two library folders.

Removing a source or turning its bell off never deletes files. Files are removed only by a source's rules or by **Delete file** in the preview.

## Where things are

| What                  | Where                                                                                                                                                                                                                                                                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application log       | `/config/logs/mytube.log` (rotated at 5 MB, three old files kept), also on stdout (`docker logs mytube`). Settings → Advanced → **Download logs**.                                                                                                                                                                                       |
| yt-dlp output per job | `/config/logs/jobs/<job id>.log`, the newest 200. Linked from the Activity queue and history (**View log**).                                                                                                                                                                                                                             |
| Database and settings | `/config/mytube.db`                                                                                                                                                                                                                                                                                                                      |
| Backups               | `/config/backups/mytube-<time>.sqlite`: every night at 04:00, and on **Back up now** in Settings → Advanced. The newest 7 are kept.                                                                                                                                                                                                      |
| yt-dlp                | `/config/bin/yt-dlp`. Checked for updates every 6 hours and replaced automatically (Settings → Advanced).                                                                                                                                                                                                                                |
| Cookies (optional)    | If YouTube asks for a sign-in or a bot check: Settings → Advanced → Network → Cookies, **Upload** or **Paste** a cookies.txt exported from your browser (**How to export cookies** there has the steps). MyTube keeps it as `/config/cookies.txt`, owner-only, not in backups. Or mount your own file and type its path in the same row. |

Every night at 04:30 MyTube also rescans both libraries: a file you deleted or moved outside the app shows as missing, a file that came back shows as on disk again, and the library sizes in Settings are recounted. Files MyTube does not know are counted in the history entry and left alone. **Rescan libraries** in Settings → Advanced does the same at once.

## Restore a backup

1. Stop the container: `docker compose stop mytube`.
2. In your config folder, copy the backup over the database and remove the two WAL files next to it:

   ```bash
   cp config/backups/mytube-2026-09-26T04:00:00Z.sqlite config/mytube.db
   rm -f config/mytube.db-wal config/mytube.db-shm
   ```

3. Start it again: `docker compose start mytube`.

The backup holds everything MyTube knows: sources, rules, settings, the library index and the history. Media files and the cookies file are not in it (export cookies again after a restore on a new machine); back those up the way you back up the rest of your media. After restoring an older backup, run **Rescan libraries** so the on-disk flags match the folders.

## Update

```bash
docker compose pull && docker compose up -d
```

The database is migrated on start. yt-dlp updates itself inside `/config` and does not need a new image.

## Contributing

Start with [`CLAUDE.md`](CLAUDE.md); the conventions and the design reference live in the skills under `.claude/skills`.
