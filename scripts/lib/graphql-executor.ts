/**
 * Executes a GraphQL operation against {backUrl}/graphql via fetch.
 * Returns the parsed response plus timing + status for evidence.
 */

export interface ExecuteOptions {
  backUrl: string;
  token?: string;
  timeoutMs?: number;
}

export interface GraphQLResponse {
  status: number;
  ok: boolean;
  data: unknown;
  errors: Array<{ message: string; extensions?: unknown; path?: unknown }>;
  rawBody: string;
  elapsed_ms: number;
}

export async function executeOperation(
  query: string,
  variables: Record<string, unknown> | undefined,
  opts: ExecuteOptions
): Promise<GraphQLResponse> {
  const url = `${opts.backUrl.replace(/\/$/, "")}/graphql`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs || 30_000);

  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: JSON.stringify({ query, variables: variables || {} }),
      signal: controller.signal,
    });

    const rawBody = await res.text();
    const elapsed_ms = Date.now() - t0;

    let parsed: { data?: unknown; errors?: Array<{ message: string }> } = {};
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      // non-JSON body — return empty data/errors but preserve rawBody
    }

    return {
      status: res.status,
      ok: res.ok,
      data: parsed.data ?? null,
      errors: parsed.errors ?? [],
      rawBody,
      elapsed_ms,
    };
  } finally {
    clearTimeout(timer);
  }
}
