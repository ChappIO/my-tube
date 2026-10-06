import { describe, expect, it } from 'vitest';
import { sameImage } from './artwork.service.js';

describe('sameImage', () => {
  it('ignores the signature of a YouTube image URL', () => {
    const a = 'https://i9.ytimg.com/s_p/OLAK5uy_x/sddefault.jpg?sqp=CKCj&rs=AOn4CLA&v=1739';
    const b = 'https://i9.ytimg.com/s_p/OLAK5uy_x/sddefault.jpg?sqp=CPab&rs=AOn4CLB&v=1739';
    expect(sameImage(a, b)).toBe(true);
    expect(sameImage(a, a.replace('v=1739', 'v=1740'))).toBe(false);
    expect(sameImage(a, a.replace('sddefault', 'hqdefault'))).toBe(false);
    expect(sameImage('not a url', 'not a url')).toBe(true);
    expect(sameImage('not a url', 'another')).toBe(false);
  });
});
