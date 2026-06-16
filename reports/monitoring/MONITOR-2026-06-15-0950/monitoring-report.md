# Monitoring Summary — MONITOR-2026-06-15-0950

- **Date/env/window:** 2026-06-15 ~09:50 UTC · vcst-qa · last **1440 min (24h)**
- **Layers:** backend `vcst-qa` + storefront `vcst-qa-storefront` (App IDs from `.env.vcst`)
- **Auth path:** AAD via `az monitor app-insights query` (API-key REST unavailable; MCP `monitor_resource_log_query` router erroring)
- **Probes:** 5/5 ran (bk exceptions/5xx/deps, fe exceptions/AJAX). bk-deps + fe-AJAX returned **0 rows**.

## Signature counts
- Raw signatures: **10** · NEW: 6 · SPIKING: 1 (`500 POST graphql/`) · SEEN-stable (skipped): 3
- Triaged this run: **5 groups** (cap 15 — nothing deferred) · Confirmed bugs: **0** · Live repro: 1 session, both signals **NOT reproduced**

## Confirmed bugs
_None._ No signal reproduced under live normal use → no JIRA filed, no draft written.

## Needs review (human decision)
| Sig | Layer | Signature | 24h count | Sev | Why not filed |
|-----|-------|-----------|-----------|-----|---------------|
| A+D | backend | `InvalidVariableError: $storeId null` → `500 POST graphql/` | 140 exc + 165 5xx | P2 | High-volume **burst that stopped 06-14 21:35** (none in last ~12h). Live repro 06-15 09:46: all `/graphql` 200 incl addItem, no `$storeId` error. Likely test traffic or transient client — needs human glance at the 19:00–21:35 window. |
| I | frontend | `TypeError: undefined reading 'status'` (CompanyInfo) | 1 | P3 | Single occurrence 06-15 08:40. CompanyInfo/CompanyMembers render clean on live repro (signed in as B2B user). Watch. |
| J | frontend | `SyntaxError: 26` (CompanyInfo) | 1 | P3 | Same instant (08:40:31) as I — likely one minified cascade. Not reproduced. |

## Dismissed
| Class | Signature | Oracle |
|-------|-----------|--------|
| TRANSIENT | `DbUpdateConcurrencyException` `removeWishlistItem` → `500 DeleteWishlistItem` (1+1) | Delete race / double-click; single event |
| TRANSIENT | `503 GET /health` (1) | Warmup/restart probe |
| KNOWN_ISSUE | `AuthorizationError: password expired` (25) | Benign expected auth (`877057b20fec`); normal user retries |
| NOISE | `ResizeObserver loop … undelivered notifications` (7) | Known-benign browser warning (`bb043720752a`) |
| NOISE | `ApolloError: Failed to fetch` (2) | Transient fetch noise (`5362af428cbc`) |

## Evidence / state
- Live repro detail: storefront build `2.51.0-pr-2315`, all `POST /graphql` = 200, cart add OK, Company Info/Members render fully. Only benign noise (stale-CDN image 404s, `electro2.json` 404, GA4 teardown aborts).
- Fingerprint store updated (`.seen-fingerprints.json`): 6 new + 4 refreshed; `updatedAt` 2026-06-15T09:50Z.

**Detect-and-report only — no JIRA filed, no fix attempted.** A human picks up the A+D needs-review item via `/qa-bug` → `/qa-fix` if warranted.
