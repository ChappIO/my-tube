import { describe, expect, it } from 'vitest';
import { systemActionMessage } from './system';

describe('systemActionMessage', () => {
  it('uses the message of the answer', async () => {
    const queued = new Response(JSON.stringify({ message: 'Backup queued.', jobId: 3 }), {
      status: 202,
    });
    expect(await systemActionMessage(queued)).toBe('Backup queued.');
    const busy = new Response(JSON.stringify({ message: 'A rescan is already running.' }), {
      status: 409,
    });
    expect(await systemActionMessage(busy)).toBe('A rescan is already running.');
  });

  it('falls back when the body has no message', async () => {
    expect(await systemActionMessage(new Response('oops', { status: 500 }))).toBe('Failed (500).');
    expect(await systemActionMessage(new Response('{}', { status: 200 }))).toBe('Done.');
  });
});
