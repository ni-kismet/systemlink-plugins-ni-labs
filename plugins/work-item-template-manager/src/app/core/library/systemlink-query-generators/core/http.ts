/**
 * Shared HTTP helpers for SystemLink REST calls.
 *
 * Assumes a same-origin, SystemLink-hosted context (cookie/session auth). Pass
 * `apiKey` or your own `headers` when calling from outside SystemLink.
 */

/** Options accepted by the JSON request helpers and query generators. */
export interface HttpRequestOptions {
  /** API key sent as `x-ni-api-key` when calling from outside SystemLink. */
  apiKey?: string;
  /** Additional headers merged into the request. */
  headers?: HeadersInit;
  /** Base URL prefixed to the service path (empty for same-origin calls). */
  baseUrl?: string;
  /** Custom `fetch` implementation (defaults to `globalThis.fetch`). */
  fetchImpl?: typeof fetch;
  /** Abort signal for cancellation. */
  signal?: AbortSignal;
  /** Human-readable label used in thrown error messages. */
  label?: string;
}

/** Builds the standard JSON request headers used for SystemLink service calls. */
export function createHeaders(options: HttpRequestOptions = {}): Headers {
  const result = new Headers(options.headers ?? undefined);
  if (!result.has('Content-Type')) {
    result.set('Content-Type', 'application/json');
  }
  if (options.apiKey && !result.has('x-ni-api-key')) {
    result.set('x-ni-api-key', options.apiKey);
  }
  return result;
}

/** Details attached to a {@link SystemLinkRequestError}. */
export interface SystemLinkRequestErrorDetails {
  /** HTTP status code. */
  status?: number;
  /** HTTP status text. */
  statusText?: string;
  /** The request URL. */
  url?: string;
  /** The parsed error response body, when available. */
  body?: unknown;
}

/** Error thrown when a SystemLink service returns a non-2xx response. */
export class SystemLinkRequestError extends Error {
  /** HTTP status code. */
  public readonly status?: number;
  /** HTTP status text. */
  public readonly statusText?: string;
  /** The request URL. */
  public readonly url?: string;
  /** The parsed error response body, when available. */
  public readonly body?: unknown;

  /** Creates a request error carrying the response status and parsed body. */
  public constructor(message: string, details: SystemLinkRequestErrorDetails = {}) {
    super(message);
    this.name = 'SystemLinkRequestError';
    this.status = details.status;
    this.statusText = details.statusText;
    this.url = details.url;
    this.body = details.body;
  }
}

/** Reads and parses an error response body, tolerating non-JSON payloads. */
async function readError(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch {
    return undefined;
  }
}

/** POSTs a JSON body and returns the parsed response. Throws on non-2xx. */
export async function postJson<T = unknown>(
  url: string,
  body: unknown,
  options: HttpRequestOptions = {},
): Promise<T> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const label = options.label ?? 'request';
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: createHeaders(options),
    body: JSON.stringify(body ?? {}),
    signal: options.signal,
  });
  if (!response.ok) {
    throw new SystemLinkRequestError(
      `${label} failed: ${response.status} ${response.statusText} (POST ${url})`,
      { status: response.status, statusText: response.statusText, url, body: await readError(response) },
    );
  }
  return response.json() as Promise<T>;
}

/** A map of query-string parameters accepted by {@link getJson}. */
export type QueryParams = Record<string, string | number | boolean | null | undefined>;

/** GETs a URL with query params and returns the parsed response. Throws on non-2xx. */
export async function getJson<T = unknown>(
  url: string,
  params: QueryParams,
  options: HttpRequestOptions = {},
): Promise<T> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const label = options.label ?? 'request';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  const fullUrl = query ? `${url}?${query}` : url;
  const response = await fetchImpl(fullUrl, {
    method: 'GET',
    headers: createHeaders(options),
    signal: options.signal,
  });
  if (!response.ok) {
    throw new SystemLinkRequestError(
      `${label} failed: ${response.status} ${response.statusText} (GET ${fullUrl})`,
      { status: response.status, statusText: response.statusText, url: fullUrl, body: await readError(response) },
    );
  }
  return response.json() as Promise<T>;
}
