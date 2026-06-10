/**
 * A typed, recording `fetch` double for the activity-client tests. The handler
 * maps a request URL (and init) to a `Response`; every call is recorded so
 * tests can assert on headers / which endpoints were hit.
 */

export interface RecordedCall {
  url: string;
  init?: RequestInit;
}

export interface FakeFetch {
  fetchImpl: typeof fetch;
  calls: RecordedCall[];
}

/** Build a JSON `Response` with the given status (default 200). */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Read a header from a RequestInit's plain-object `headers` (the shape our clients use). */
export function headerOf(call: RecordedCall | undefined, name: string): string | undefined {
  const headers = call?.init?.headers as Record<string, string> | undefined;
  return headers?.[name];
}

export function recordingFetch(handler: (url: string, init?: RequestInit) => Response): FakeFetch {
  const calls: RecordedCall[] = [];
  const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    return Promise.resolve(handler(url, init));
  }) as typeof fetch;
  return { fetchImpl, calls };
}
