/**
 * Application Insights query client — online bug monitoring.
 * --------------------------------------------------------------
 * Thin wrapper over the App Insights REST query API
 * (https://api.applicationinsights.io/v1/apps/{appId}/query), used by the
 * headless monitor twin (`ci/run-monitor.ts`).
 *
 * Auth is AAD-first: it acquires an Azure AD token via `DefaultAzureCredential`
 * (your `az login` / VS Code Azure session / a CI service principal / managed
 * identity) and sends it as a Bearer token. If no Azure identity is available it
 * falls back to a per-resource read-telemetry API key (`x-api-key`). So in a
 * developer or Azure-connected CI environment NO API key is needed; the key path
 * stays as a fallback for runners with no Azure identity.
 *
 * Two separate resources are addressed by App ID: the platform/backend and the
 * storefront. App IDs, API keys, and display names are all per-env and come from
 * the environment (config.js / .env.example) — never hardcoded. A layer is
 * "configured" when its App ID is set; auth resolves at query time (AAD or key).
 *
 * fetch + AbortController timeout shape mirrors scripts/lib/graphql-executor.ts.
 */
import { DefaultAzureCredential, type AccessToken, type TokenCredential } from "@azure/identity";

export type Layer = "backend" | "frontend";

const API_BASE = "https://api.applicationinsights.io/v1/apps";
/** AAD scope for the App Insights Data Plane query API. */
const AI_SCOPE = "https://api.applicationinsights.io/.default";

// --- AAD token (cached across queries within a run) ---
let _credential: TokenCredential | null = null;
let _cachedToken: AccessToken | null = null;

/**
 * Acquire an Azure AD bearer token for the App Insights query API, or null when
 * no Azure identity is available (so the caller can fall back to an API key).
 * Cached until ~60s before expiry. Disable explicitly with MONITOR_AUTH=key.
 */
export async function getAadToken(): Promise<string | null> {
  if ((process.env.MONITOR_AUTH || "").toLowerCase() === "key") return null;
  try {
    if (!_credential) _credential = new DefaultAzureCredential();
    if (!_cachedToken || _cachedToken.expiresOnTimestamp - Date.now() < 60_000) {
      _cachedToken = await _credential.getToken(AI_SCOPE);
    }
    return _cachedToken?.token ?? null;
  } catch {
    return null; // no usable Azure identity → fall back to API key
  }
}

export interface AppInsightsConfig {
  appId: string;
  apiKey: string;
}

/** Resolve the App ID + API key for a layer from the environment. */
export function layerConfig(layer: Layer): AppInsightsConfig {
  if (layer === "backend") {
    return {
      appId: process.env.APPINSIGHTS_APP_ID_BACKEND || "",
      apiKey: process.env.APPINSIGHTS_API_KEY_BACKEND || "",
    };
  }
  return {
    appId: process.env.APPINSIGHTS_APP_ID_STOREFRONT || "",
    apiKey: process.env.APPINSIGHTS_API_KEY_STOREFRONT || "",
  };
}

/**
 * True when the layer has an App ID. Auth (AAD token or API key) is resolved at
 * query time — a developer/CI Azure identity covers auth without any API key.
 */
export function isLayerConfigured(layer: Layer): boolean {
  return Boolean(layerConfig(layer).appId);
}

/** A single result row, keyed by KQL column name. */
export type Row = Record<string, unknown>;

export interface QueryResult {
  ok: boolean;
  status: number;
  rows: Row[];
  /** Error message when ok === false (HTTP error, timeout, or App Insights error). */
  error?: string;
  elapsed_ms: number;
}

interface RawTable {
  name: string;
  columns: Array<{ name: string; type: string }>;
  rows: unknown[][];
}

/**
 * Run a KQL query against one App Insights resource.
 *
 * @param layer     backend | frontend — selects the resource (App ID + key)
 * @param kql       the KQL text (typically read from ci/monitoring/queries/*.kql)
 * @param timespan  ISO-8601 duration window, e.g. "PT35M" (35 min), "P1D" (1 day)
 */
export async function queryAppInsights(
  layer: Layer,
  kql: string,
  timespan: string,
  timeoutMs = 60_000,
): Promise<QueryResult> {
  const suffix = layer === "backend" ? "BACKEND" : "STOREFRONT";
  const { appId, apiKey } = layerConfig(layer);
  if (!appId) {
    return {
      ok: false,
      status: 0,
      rows: [],
      error: `App Insights not configured for layer "${layer}" (set APPINSIGHTS_APP_ID_${suffix})`,
      elapsed_ms: 0,
    };
  }

  // Auth: AAD bearer token first (no key needed); fall back to a read API key.
  const token = await getAadToken();
  const authHeaders: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : apiKey
      ? { "x-api-key": apiKey }
      : {};
  if (Object.keys(authHeaders).length === 0) {
    return {
      ok: false,
      status: 0,
      rows: [],
      error: `No App Insights auth for layer "${layer}": no Azure identity (az login / service principal) and no APPINSIGHTS_API_KEY_${suffix}`,
      elapsed_ms: 0,
    };
  }

  const url = `${API_BASE}/${appId}/query`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = Date.now();

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify({ query: kql, timespan }),
      signal: controller.signal,
    });

    const rawBody = await res.text();
    const elapsed_ms = Date.now() - t0;

    if (!res.ok) {
      // App Insights returns a JSON error envelope: { error: { message, ... } }
      let msg = `HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(rawBody) as { error?: { message?: string } };
        if (parsed.error?.message) msg = parsed.error.message;
      } catch {
        if (rawBody) msg = rawBody.slice(0, 300);
      }
      return { ok: false, status: res.status, rows: [], error: msg, elapsed_ms };
    }

    const parsed = JSON.parse(rawBody) as { tables?: RawTable[] };
    const table =
      parsed.tables?.find((t) => t.name === "PrimaryResult") || parsed.tables?.[0];
    const rows = table ? tableToRows(table) : [];
    return { ok: true, status: res.status, rows, elapsed_ms };
  } catch (err) {
    const elapsed_ms = Date.now() - t0;
    const error =
      err instanceof Error && err.name === "AbortError"
        ? `Timeout after ${timeoutMs / 1000}s querying ${layer} App Insights`
        : err instanceof Error
          ? err.message
          : String(err);
    return { ok: false, status: 0, rows: [], error, elapsed_ms };
  } finally {
    clearTimeout(timer);
  }
}

/** Convert an App Insights column/rows table into an array of keyed objects. */
function tableToRows(table: RawTable): Row[] {
  const cols = table.columns.map((c) => c.name);
  return table.rows.map((r) => {
    const obj: Row = {};
    for (let i = 0; i < cols.length; i++) obj[cols[i]] = r[i];
    return obj;
  });
}

/** The App Insights resource NAME for a layer (env-driven, never hardcoded). */
export function resourceName(layer: Layer): string {
  return layer === "backend"
    ? process.env.APPINSIGHTS_RESOURCE_BACKEND || ""
    : process.env.APPINSIGHTS_RESOURCE_STOREFRONT || "";
}

/**
 * Build a portal deep-link to the Transaction Search for a given operation_Id,
 * so a reviewer can jump straight from the report to the live telemetry.
 * Subscription, resource group, and resource name all come from the environment;
 * returns "" (no link) when any are unset — never hardcodes an env's resource.
 */
export function portalSearchLink(layer: Layer, operationId: string): string {
  const sub = process.env.AZURE_SUBSCRIPTION_ID || "";
  const rg = process.env.AZURE_RESOURCE_GROUP || "";
  const appName = resourceName(layer);
  if (!sub || !rg || !appName || !operationId) return "";
  const resourceId = `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.Insights/components/${appName}`;
  return `https://portal.azure.com/#blade/AppInsightsExtension/DetailsV2Blade/DataModel/%7B%22eventId%22%3A%22${encodeURIComponent(
    operationId,
  )}%22%2C%22ComponentId%22%3A%22${encodeURIComponent(resourceId)}%22%7D`;
}
