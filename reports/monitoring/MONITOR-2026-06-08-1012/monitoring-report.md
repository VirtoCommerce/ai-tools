# Monitoring Summary — MONITOR-2026-06-08-1012

- **Run:** MONITOR-2026-06-08-1012 · **Date:** 2026-06-08 10:12 UTC · **Env:** vcst-qa-storefront
- **Layer:** frontend (storefront) only · **Window:** invoked at default 35 min; **widened to 24h** because the 35-min window caught only a sparse 2-min traffic burst (not representative)
- **Access:** Azure MCP `monitor_resource_log_query` (AAD) on App Insights `vcst-qa-storefront`
- **Telemetry sanity (24h):** 1,206 browser dependencies + 105 pageViews + 5 browser exceptions — data confirmed flowing (35-min window: 72 deps / 6 pageViews / 0 errors).

## Signature counts (24h)
| Probe | Rows | New | Spiking | Deferred |
|-------|------|-----|---------|----------|
| frontend-exceptions | 2 | 0 (1 promoted from prior "new") | 0 | 0 |
| frontend-browser-failures | 1 | 0 | 0 | 0 |

**Verdict: CLEAN for the window.** No confirmed user-facing defect. The only previously-untriaged signal resolves to a deploy-window stale-chunk transient (below), not a live code bug.

## Confirmed bugs
_None._ No HIGH-confidence REAL_BUG reproduced; no JIRA filed, no fix attempted.

## Needs review
| Severity | Signature | Count / when | Class | Note |
|----------|-----------|--------------|-------|------|
| P3 | `ReferenceError: useCartConfigurationSections is not defined` (Cart, Chrome 148) | 3 @ 07:03–07:24 UTC | TRANSIENT (deploy-window) | Symbol **absent from current vc-frontend source** (only `useConfigurableProduct` / `getProductConfigurationsQuery` exist). Tight 21-min window, single session, no recurrence across the next ~2.5h of cart traffic → stale-chunk / version-skew during a deploy, not a current code defect. NOT live-reproduced (would not reproduce — symbol gone; cf. VCST-4605 version-skew, `feedback_mcp_browser_cache`). Glance only; re-triage if it recurs outside a deploy window. |

## Dismissed
| Class | Signature | Oracle |
|-------|-----------|--------|
| NOISE | `ApolloError: Failed to fetch` (Matcher) ×2 | Known noise (fp 621b3f0090cd); transient client-fetch/connectivity, not a server defect (`feedback_apollo_cart_shipment_stale_data`). |
| TRANSIENT | `500 POST /graphql` (Cart) ×6 @ 06:07 (3-sec burst) | Known transient (fp 4acc1bc6a425). Cross-layer note: **no matching 5xx in the platform `requests` probe** over the same 24h, so not a confirmed backend 500 — bursty, not recurring. |

## Notes
- Detect-and-report only — **no JIRA filed, no fix attempted** (per `/qa-monitoring` design).
- Dedup store updated: `ReferenceError at setup` promoted from `new` → triaged/TRANSIENT; ApolloError + 500 recurrences re-stamped.
- Backend layer not scanned this run (frontend-only selection); see MONITOR-2026-06-08-0947 for the 24h backend pass.
