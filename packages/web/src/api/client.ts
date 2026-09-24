import type { z } from 'zod';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    body: string,
  ) {
    super(`${status}: ${body || 'request failed'}`);
    this.name = 'ApiError';
  }
}

/** GET a JSON endpoint and validate the response against its shared schema. */
export async function apiGet<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(path, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    throw new ApiError(response.status, await response.text());
  }
  return schema.parse(await response.json());
}
