/**
 * Ask a storefront which store it serves — no login: the storefront's own GraphQL resolves the store
 * from its domain (`pageContext(domain:)`), exactly as the browser does on first load.
 *
 * Used by discover-repos (which host to point a LOCAL storefront dev run at) and by normalize-env (an
 * empty STORE_ID is detected instead of asked for).
 */

const hostnameOf = (u) => {
  try { return new URL(u).hostname; } catch { return ""; }
};
const originOf = (u) => {
  try { return new URL(u).origin; } catch { return String(u || "").replace(/\/$/, ""); }
};

/**
 * Probe which host both RESOLVES the store and PROXIES the storefront GraphQL — the value
 * `APP_BACKEND_URL` must take for a LOCAL dev run (vc-frontend's app-runner.ts derives the
 * store-resolution `domain` from APP_BACKEND_URL's hostname in dev; the ADMIN host does NOT
 * resolve the store → blank app). Tries FRONT_URL first, then BACK_URL. Returns
 * { backendUrlForDev, storeId, storeDomain } or null. Never throws.
 */
export async function probeStorefrontBackend({ frontUrl, backUrl, storeId }) {
  const query =
    "query GetPageContext($domain:String,$permalink:String){pageContext(domain:$domain,permalink:$permalink){store{storeId storeName}}}";
  for (const candidate of [frontUrl, backUrl].filter(Boolean)) {
    const origin = originOf(candidate);
    const domain = hostnameOf(candidate);
    try {
      const res = await fetch(`${origin}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ operationName: "GetPageContext", query, variables: { domain, permalink: "sign-in" } }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const store = data?.data?.pageContext?.store;
      if (store?.storeId) {
        return { backendUrlForDev: origin, storeId: store.storeId || storeId || "", storeDomain: domain };
      }
    } catch {
      /* try next candidate */
    }
  }
  return null;
}
