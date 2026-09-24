-- Audit trail shown on the Activity screen: downloads, retention deletions, yt-dlp installs
-- and updates. `details` holds free text such as an error message.
CREATE TABLE history (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  kind TEXT NOT NULL CHECK (kind IN ('video', 'music', 'system')),
  title TEXT NOT NULL,
  result TEXT NOT NULL,
  details TEXT
);

CREATE INDEX history_at ON history (at);

-- State of the yt-dlp binary manager. At most one row (id 1), created on first write.
CREATE TABLE ytdlp_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  installed_version TEXT,
  latest_version TEXT,
  last_checked_at TEXT,
  last_updated_at TEXT,
  last_error TEXT
);
