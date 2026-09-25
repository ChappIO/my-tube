-- A pinned album: the user asked for the whole album (the artist page's Download on a release
-- the rules skip). Its tracks count as matching whatever the source's rules say, so neither the
-- sync nor revalidation skips or removes them; unpinning hands them back to the rules.
ALTER TABLE albums ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1));
