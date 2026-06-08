# Monitoring Summary — MONITOR-2026-06-08-0947

- **Run:** MONITOR-2026-06-08-0947 · **Date:** 2026-06-08 09:47 UTC · **Env:** vcst-qa
- **Window:** last 24h (2026-06-07 09:46 → 2026-06-08 09:46 UTC) · **Layers:** backend (platform) only
- **Access:** Azure MCP `monitor_resource_log_query` (AAD) on App Insights `vcst-qa`
- **Telemetry sanity:** 14,429 requests + 145,347 dependencies ingested in window — data confirmed flowing.

## Signature counts
| Probe | Rows | New | Spiking | Deferred |
|-------|------|-----|---------|----------|
| backend-exceptions | 0 | 0 | 0 | 0 |
| backend-failed-requests (5xx) | 0 | 0 | 0 | 0 |
| backend-failed-dependencies | 2 | 2 | 0 | 0 |

**Verdict: HEALTHY.** Zero server-side exceptions and zero 5xx requests over 24h. Request mix: 14,385×200, 25×404, 12×101, 4×499, plus single 206/304/302. The prior backend signatures (500 GetFullCart, GraphQL FieldsOnCorrectType, xAPI AuthorizationError) did **not** recur this window.

## Confirmed bugs
_None._ No HIGH-confidence REAL_BUG reproduced; no JIRA filed, no fix attempted.

## Confirmed → filed
| Severity | Signature | Probe | Root cause | Ticket |
|----------|-----------|-------|-----------|--------|
| P3 (Low) | `HTTP fcm.googleapis.com 404` ×5 | backend-failed-dependencies | `vc-module-push-messages` `FcmPushMessageRecipientChangedEventHandler.SendFirebaseMessage` logs FCM `UNREGISTERED`/404 failures but never prunes the dead token → re-sent every push. Confirmed by source-code trace (not a transient external outcome). | [VCST-5210](https://virtocommerce.atlassian.net/browse/VCST-5210) · [BUG report](../../bugs/open/BUG-FCM-stale-token-not-pruned.md) |

## Dismissed
| Class | Signature | Oracle |
|-------|-----------|--------|
| TRANSIENT | `HTTP essearch…:9200 404` (`…platformvcst-member-backup` index) ×1 @ 09:39:37 | Single index-not-found during a member backup/swap op; kin of known ES-400 family (fp b1dc5661b024, P3). Not reproducible. |

## Notes
- Detect-and-report only — **no JIRA filed, no fix attempted** (per `/qa-monitoring` design).
- Dedup store updated with 2 new dependency signatures (`reports/monitoring/.seen-fingerprints.json`).
- Frontend/storefront layer **not** scanned this run (backend-only selection).
