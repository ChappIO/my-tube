import { z } from 'zod';

/*
 * Subtitle jobs (`subtitles` in `JOB_TYPES`): the captions of a video on disk, fetched after
 * its download in a job of their own. Settings → Video → Subtitles shows how many videos on
 * disk still lack a run with the current languages and queues them.
 */

/** `GET /api/subtitles/status`. */
export const SubtitlesStatus = z.object({
  /**
   * Videos on disk whose subtitle job never ran with the current Settings languages (none when
   * no language is picked).
   */
  missing: z.number().int().nonnegative(),
  /** Subtitle jobs queued or running. */
  queued: z.number().int().nonnegative(),
  /** While YouTube's rate limit pauses the subtitle queue: when it resumes (ISO UTC), else null. */
  pausedUntil: z.iso.datetime().nullable(),
});
export type SubtitlesStatus = z.infer<typeof SubtitlesStatus>;

/** `POST /api/subtitles/fetch-missing` (202): how many subtitle jobs were queued. */
export const FetchSubtitlesResult = z.object({ queued: z.number().int().nonnegative() });
export type FetchSubtitlesResult = z.infer<typeof FetchSubtitlesResult>;
