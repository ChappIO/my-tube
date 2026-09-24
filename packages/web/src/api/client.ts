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

async function parseResponse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  if (!response.ok) {
    throw new ApiError(response.status, await response.text());
  }
  return schema.parse(await response.json());
}

/** GET a JSON endpoint and validate the response against its shared schema. */
export async function apiGet<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(path, { headers: { accept: 'application/json' } });
  return parseResponse(response, schema);
}

/** PATCH a JSON body and validate the response against its shared schema. */
export async function apiPatch<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(path, {
    method: 'PATCH',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseResponse(response, schema);
}
