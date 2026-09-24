import { describe, expect, it } from 'vitest';
import { systemActionMessage } from './system';

describe('systemActionMessage', () => {
  it('uses the message of the 501 stub', async () => {
    const response = new Response(JSON.stringify({ message: 'Not implemented until Stage 7' }), {
      status: 501,
    });
    expect(await systemActionMessage(response)).toBe('Not implemented until Stage 7');
  });

  it('falls back when the body has no message', async () => {
    expect(await systemActionMessage(new Response('oops', { status: 500 }))).toBe('Failed (500).');
    expect(await systemActionMessage(new Response('{}', { status: 200 }))).toBe('Done.');
  });
});
