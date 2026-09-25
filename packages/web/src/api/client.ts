import { z } from 'zod';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    /** The raw response body (usually Nest's JSON error). */
    readonly body: string,
  ) {
    super(`${status}: ${body || 'request failed'}`);
    this.name = 'ApiError';
  }

  /** The body parsed as JSON, or undefined when it is not JSON. */
  json(): unknown {
    try {
      const value: unknown = JSON.parse(this.body);
      return value;
    } catch {
      return undefined;
    }
  }
}

/** The parts of Nest's error body the web app reads (`message`, validation `issues`, yt-dlp `reason`). */
const ApiErrorBody = z.object({
  message: z.union([z.string(), z.array(z.string())]),
  issues: z.array(z.object({ message: z.string() })).optional(),
  reason: z.string().nullable().optional(),
});

/**
 * A readable line for a failed request: the API's `message` (with the `issues` of a validation
 * error and the `reason` of a yt-dlp failure appended), else `fallback`. Non-API errors (network
 * down) give `fallback` too.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  const body = ApiErrorBody.safeParse(error.json());
  if (!body.success) return fallback;
  const { message, issues, reason } = body.data;
  const text = Array.isArray(message) ? message.join(' ') : message;
  if (!text) return fallback;
  const details = (issues ?? []).map((issue) => issue.message);
  if (reason) details.push(reason);
  const sentence = /[.!?…]$/.test(text) ? text : `${text}.`;
  return details.length > 0 ? `${sentence} ${details.join('. ')}` : sentence;
}

/**
 * Why a load failed, as the second sentence of an error state: the API's message
 * (`Internal server error.`), `The server answered 502.` for a bare status, `The server did not
 * answer.` when the request never got a response, or the error's own message.
 */
export function loadErrorDetail(error: unknown): string {
  if (error instanceof ApiError)
    return apiErrorMessage(error, `The server answered ${error.status}.`);
  // fetch rejects with a TypeError when the server cannot be reached.
  if (error instanceof TypeError) return 'The server did not answer.';
  if (error instanceof z.ZodError) return 'The answer was not in the expected shape.';
  if (error instanceof Error && error.message) {
    return /[.!?…]$/.test(error.message) ? error.message : `${error.message}.`;
  }
  return 'Unknown error.';
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

/** GET a plain-text endpoint (job logs). Throws `ApiError` on non-2xx. */
export async function apiGetText(path: string): Promise<string> {
  const response = await fetch(path, { headers: { accept: 'text/plain' } });
  if (!response.ok) throw new ApiError(response.status, await response.text());
  return response.text();
}

/** POST (an optional JSON body) and validate the response against its shared schema. */
export async function apiPost<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parseResponse(response, schema);
}

/** POST without a body to an endpoint that answers 204 No Content. Throws `ApiError` on non-2xx. */
export async function apiPostEmpty(path: string): Promise<void> {
  const response = await fetch(path, { method: 'POST', headers: { accept: 'application/json' } });
  if (!response.ok) throw new ApiError(response.status, await response.text());
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

/** DELETE a resource. Resolves on any 2xx (usually 204, no body). */
export async function apiDelete(path: string): Promise<void> {
  const response = await fetch(path, { method: 'DELETE', headers: { accept: 'application/json' } });
  if (!response.ok) throw new ApiError(response.status, await response.text());
}

/**
 * PUT a plain-text body (a string or a picked `File`) and validate the JSON answer against its
 * shared schema (the cookies file upload). Throws `ApiError` on non-2xx.
 */
export async function apiPutText<T>(
  path: string,
  body: string | Blob,
  schema: z.ZodType<T>,
): Promise<T> {
  const response = await fetch(path, {
    method: 'PUT',
    headers: { accept: 'application/json', 'content-type': 'text/plain; charset=utf-8' },
    body,
  });
  return parseResponse(response, schema);
}

/** DELETE a resource that answers with JSON, validated against its shared schema. */
export async function apiDeleteJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(path, { method: 'DELETE', headers: { accept: 'application/json' } });
  return parseResponse(response, schema);
}
