-- Sources the user added (channels, artists, playlists) and the catalog rows for channels,
-- artists and playlists. Items (videos, tracks, albums, playlist_items) come in a later file.

CREATE TABLE sources (
  id INTEGER PRIMARY KEY,
  library TEXT NOT NULL CHECK (library IN ('music', 'video')),
  kind TEXT NOT NULL CHECK (kind IN ('channel', 'artist', 'playlist')),
  youtube_id TEXT NOT NULL,
  url TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  subscribed INTEGER NOT NULL DEFAULT 1 CHECK (subscribed IN (0, 1)),
  -- The shared `Rules` schema as JSON; its `library` tag must match the row.
  rules TEXT NOT NULL CHECK (json_valid(rules) AND json_extract(rules, '$.library') = library),
  last_checked_at TEXT,
  item_count INTEGER NOT NULL DEFAULT 0,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (library, youtube_id)
);

-- Every channel MyTube knows about, including channels of videos that arrived through a
-- playlist. `source_id` is set when the channel itself was added as a source.
CREATE TABLE channels (
  id INTEGER PRIMARY KEY,
  source_id INTEGER REFERENCES sources (id) ON DELETE SET NULL,
  youtube_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX channels_source_id ON channels (source_id);

-- Every artist MyTube knows about. `youtube_id` is the YouTube Music artist or channel id and
-- is null for artists known only from tags.
CREATE TABLE artists (
  id INTEGER PRIMARY KEY,
  source_id INTEGER REFERENCES sources (id) ON DELETE SET NULL,
  youtube_id TEXT UNIQUE,
  name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX artists_source_id ON artists (source_id);
CREATE INDEX artists_name ON artists (name);

-- Playlists synced from YouTube. MyTube never builds its own playlists.
CREATE TABLE playlists (
  id INTEGER PRIMARY KEY,
  source_id INTEGER REFERENCES sources (id) ON DELETE SET NULL,
  library TEXT NOT NULL CHECK (library IN ('music', 'video')),
  youtube_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  thumbnail_url TEXT,
  item_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX playlists_source_id ON playlists (source_id);
