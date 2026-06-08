# Monitoring Report — MONITOR-2026-06-08-1903

- **Env:** vcptcore-qa — https://vcptcore-qa.govirto.com/ (backend) · https://vcptcore-qa-storefront.govirto.com (storefront)
- **Window:** last 35 min · **Layers:** backend + frontend · **Mode:** full (query → dedup → triage → live repro)
- **Signatures:** 2 in-window · 2 new · 0 spiking · 0 confirmed bugs · 1 needs-review · 1 dismissed (incidental)
- **Outcome:** No JIRA filed, no fix attempted. Detect-and-report only.

> First functional monitoring run on vcptcore-qa. `.env.vcptcore` App Insights config was broken
> (wrong data-plane AppIds + wrong resource group); fixed this run — see Config Fix below.

## Confirmed bugs
_None._ The only in-window signal (Azure Search indexing 404) was live-verified as **no user-facing impact**.

## Needs review

| Layer | Signature | Cnt (35m / 24h) | Class | Note |
|---|---|---|---|---|
| backend | `Azure Search … Add/update/delete documents` 404 → `qa-demovc-3-search.search.windows.net` (and its `InProc Microsoft.Search SearchClient.IndexDocuments` wrapper) | 2 / 5 | NEEDS_REVIEW (P3) | Indexer **write-path** 404. Storefront search live-verified FUNCTIONAL ("beer"→20 results, "printer"→11, query-specific facets + PDPs). Index is queryable; a subset of write ops 404. Back-office follow-up: confirm the indexer keeps up and why the target is the shared `qa-demovc-3-search` (looks cross-env). No storefront symptom. |

## Dismissed

| Class | Signature (24h context, out of 35-min window) | Oracle |
|---|---|---|
| THIRD_PARTY / test-config | `webhook.site` POST 404 (several GUIDs, ~26/24h) | Expired test-webhook capture endpoints; not product code |
| CONFIG | `EventGrid SendEvents` + `POST /api/events` 401 (op `Security/UnlockUser`) & `ClientSecretCredential.GetToken` → login.microsoftonline.com 401 | `test-event-grid-dont-delete` integration auth; same root (AAD secret); config, not code |
| BY-DESIGN | `AuthorizationError: "password expired … use changePassword"` (3) + "Access denied" (1) | Expected auth flow (see business-logic auth invariants) |
| NEEDS_REVIEW (low) | `graphql/MergeCart` 500 (2/24h), single `ChangePassword`/`GetFullCart` 500 | Not in 35-min window; MergeCart 500 often stale legacy-cart data (`feedback_apollo_cart_shipment_stale_data`) — watch next run |
| INCIDENTAL (not telemetry) | Storefront product images `ERR_NAME_NOT_RESOLVED` → dead host `starmarket-platform.demo.govirto.com` | Found during live repro, not in AI signals; image-CDN host misconfig — cosmetic, out of monitoring scope |

## Config fix applied (`.env.vcptcore`)
- `AZURE_RESOURCE_GROUP`: `vcptcore-qa` → **`vcptcore`** (resources live in RG `vcptcore`; old value broke portal deep-links)
- `APPINSIGHTS_APP_ID_BACKEND`: `884ea59d…` → **`0ab21c6a-c538-4e49-8bf8-92459beb4e45`** (true `properties.AppId`)
- `APPINSIGHTS_APP_ID_STOREFRONT`: `0e1e631f…` → **`e015609e-0547-401e-91db-f38c47d8c343`**
- Root cause: prior values were resource object/Graph ids, not the data-plane Application IDs the query API needs → "The application could not be found" on every probe.

## Notes
- Fingerprint store is **shared across envs** (vcst + vcptcore in one file). Env-specific signatures (hostnames) don't collide, but generic ones (e.g. `500 POST graphql/GetFullCart`) could dedup across envs. Consider per-env stores if vcptcore monitoring becomes routine.
- Frontend layer: 0 signatures in-window (clean).
