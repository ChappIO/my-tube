import { describe, expect, it } from 'vitest';
import { HealthResponse } from './health.js';

describe('HealthResponse', () => {
  it('accepts a valid payload', () => {
    expect(HealthResponse.parse({ status: 'ok', version: '1.0.0', uptimeSeconds: 3 })).toEqual({
      status: 'ok',
      version: '1.0.0',
      uptimeSeconds: 3,
    });
  });

  it('rejects an unknown status', () => {
    expect(() =>
      HealthResponse.parse({ status: 'down', version: 'x', uptimeSeconds: 0 }),
    ).toThrow();
  });
});
