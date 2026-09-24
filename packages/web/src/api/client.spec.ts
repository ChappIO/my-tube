import { describe, expect, it } from 'vitest';
import { ApiError, apiErrorMessage } from './client';
import { conflictSourceId } from './sources';

describe('apiErrorMessage', () => {
  it('uses the API message and ends it with a period', () => {
    const error = new ApiError(409, '{"statusCode":409,"message":"Already in the video library"}');
    expect(apiErrorMessage(error, 'fallback')).toBe('Already in the video library.');
  });

  it('appends validation issues and the yt-dlp reason', () => {
    const invalid = new ApiError(
      400,
      JSON.stringify({ message: 'Validation failed', issues: [{ message: 'Too long' }] }),
    );
    expect(apiErrorMessage(invalid, 'fallback')).toBe('Validation failed. Too long');
    const ytdlp = new ApiError(
      502,
      JSON.stringify({ message: 'yt-dlp could not read this link', reason: 'Not found' }),
    );
    expect(apiErrorMessage(ytdlp, 'fallback')).toBe('yt-dlp could not read this link. Not found');
  });

  it('falls back for other errors and bodies', () => {
    expect(apiErrorMessage(new Error('offline'), 'fallback')).toBe('fallback');
    expect(apiErrorMessage(new ApiError(500, '<html>'), 'fallback')).toBe('fallback');
    expect(apiErrorMessage(new ApiError(500, '{}'), 'fallback')).toBe('fallback');
  });
});

describe('conflictSourceId', () => {
  it('reads the existing id from a 409 only', () => {
    const body = '{"statusCode":409,"message":"Already in the video library","sourceId":7}';
    expect(conflictSourceId(new ApiError(409, body))).toBe(7);
    expect(conflictSourceId(new ApiError(400, body))).toBeUndefined();
    expect(conflictSourceId(new Error('x'))).toBeUndefined();
  });
});
