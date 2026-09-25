-- yt-dlp's `availability` of a video or track (`subscriber_only` for members-only videos,
-- `public`, `unlisted`, ...), for the `is_members_only` rule condition. The sync stores what the
-- flat listing says (null unless the entry carries a badge), so revalidation evaluates the rule
-- as the sync did. Null is unknown.
ALTER TABLE videos ADD COLUMN availability TEXT;
ALTER TABLE tracks ADD COLUMN availability TEXT;
