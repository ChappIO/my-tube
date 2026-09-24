-- Items (videos, albums, tracks, playlist entries) and the jobs queue.
--
-- Item status lifecycle (see the database skill): `wanted` (known, accepted, not on disk yet)
-- → `downloading` → `on_disk`; `on_disk` → `missing` (rescan found no file, or retention
-- deleted it); a new item the source's rules reject is stored as `skipped` with `skip_reason`.

-- Every video MyTube knows, whether or not it is on disk. `source_id` is the source it was
-- found through (null when that source was removed; the row and the file stay).
CREATE TABLE videos (
  id INTEGER PRIMARY KEY,
  channel_id INTEGER NOT NULL REFERENCES channels (id),
  source_id INTEGER REFERENCES sources (id) ON DELETE SET NULL,
  youtube_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  duration_seconds INTEGER,
  published_at TEXT,
  thumbnail_url TEXT,
  is_short INTEGER NOT NULL DEFAULT 0 CHECK (is_short IN (0, 1)),
  live_status TEXT,
  status TEXT NOT NULL DEFAULT 'wanted'
    CHECK (status IN ('wanted', 'downloading', 'on_disk', 'missing', 'skipped')),
  skip_reason TEXT,
  file_path TEXT,
  file_size_bytes INTEGER,
  downloaded_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX videos_channel_id ON videos (channel_id);
CREATE INDEX videos_source_id ON videos (source_id);
CREATE INDEX videos_status ON videos (status);
CREATE INDEX videos_published_at ON videos (published_at);

-- Albums of known artists. `youtube_id` is the YouTube Music album (playlist) id, null for
-- albums known only from tags.
CREATE TABLE albums (
  id INTEGER PRIMARY KEY,
  artist_id INTEGER NOT NULL REFERENCES artists (id),
  youtube_id TEXT UNIQUE,
  title TEXT NOT NULL,
  year INTEGER,
  cover_url TEXT,
  track_count INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX albums_artist_id ON albums (artist_id);

-- Every track MyTube knows. `album_id` is null until album grouping assigns one.
CREATE TABLE tracks (
  id INTEGER PRIMARY KEY,
  album_id INTEGER REFERENCES albums (id),
  artist_id INTEGER NOT NULL REFERENCES artists (id),
  source_id INTEGER REFERENCES sources (id) ON DELETE SET NULL,
  youtube_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  track_number INTEGER,
  disc_number INTEGER,
  duration_seconds INTEGER,
  published_at TEXT,
  thumbnail_url TEXT,
  status TEXT NOT NULL DEFAULT 'wanted'
    CHECK (status IN ('wanted', 'downloading', 'on_disk', 'missing', 'skipped')),
  skip_reason TEXT,
  file_path TEXT,
  file_size_bytes INTEGER,
  downloaded_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX tracks_album_id ON tracks (album_id);
CREATE INDEX tracks_artist_id ON tracks (artist_id);
CREATE INDEX tracks_source_id ON tracks (source_id);
CREATE INDEX tracks_status ON tracks (status);
CREATE INDEX tracks_published_at ON tracks (published_at);

-- Ordered entries of a synced playlist: exactly one of `video_id` and `track_id` is set.
CREATE TABLE playlist_items (
  id INTEGER PRIMARY KEY,
  playlist_id INTEGER NOT NULL REFERENCES playlists (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  video_id INTEGER REFERENCES videos (id),
  track_id INTEGER REFERENCES tracks (id),
  CHECK ((video_id IS NULL) <> (track_id IS NULL)),
  UNIQUE (playlist_id, position)
);
CREATE INDEX playlist_items_video_id ON playlist_items (video_id);
CREATE INDEX playlist_items_track_id ON playlist_items (track_id);

-- The work queue. `payload` is JSON whose shape depends on `type` and always carries the
-- `title` the Activity queue shows. `dedupe_key` identifies the work (`video:<youtube id>`,
-- `source:<id>`): at most one queued or running job per (type, key). `run_after` delays a
-- retry. Higher `priority` runs first, then the oldest id.
CREATE TABLE jobs (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('download', 'check_source', 'retention', 'rescan', 'backup')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'done', 'failed', 'cancelled')),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  dedupe_key TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts >= 1),
  run_after TEXT,
  progress REAL,
  speed_bytes_per_sec INTEGER,
  eta_seconds INTEGER,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  started_at TEXT,
  finished_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX jobs_pick ON jobs (status, priority, run_after, id);
CREATE UNIQUE INDEX jobs_active_key ON jobs (type, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status IN ('queued', 'running');
