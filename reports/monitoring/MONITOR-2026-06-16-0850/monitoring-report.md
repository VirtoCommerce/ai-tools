# Monitoring Summary — MONITOR-2026-06-16-0850

**Date:** 2026-06-16 08:50 UTC · **Env:** vcst-qa · **Window:** last 1440 min (24h) · **Layers:** backend (`vcst-qa`) + storefront (`vcst-qa-storefront`)
**Access:** Azure MCP `monitor_resource_log_query` via Azure AD (API keys empty — expected). Telemetry volume confirmed non-zero on both resources.

## Signature counts
| Seen (distinct) | New | Spiking | Triaged→needs-review | Dismissed | Deferred |
|---|---|---|---|---|---|
| ~24 | ~24 | 0 | 3 | 21 | 0 |

> Fingerprint store held only 3 prior entries (FCM 404→VCST-5210, ES 404 transient, GetFullCart 500) — none match today, so every signature is NEW. No truncation: all signatures fit under the 15-signal cap after grouping.

## Confirmed bugs
_None._ No HIGH-confidence, non-test-correlated defect was isolated, so no live repro was run and no bug draft was written (per skill: NEEDS_REVIEW → do not draft).

## Needs review
| Cluster | Layer | Signatures (count, 24h) | First/Last | Oracle read | Why not confirmed |
|---|---|---|---|---|---|
| **VCST-5028 org-membership/roles** | backend | `MissingMethodException` @ UnlockOrganizationContact ×2 / ChangeOrganizationContactRole ×2 / Lock ×1 / InviteUser.AssignUserRoles ×1; `InvalidOperationException` @ Lock ×2 / Unlock ×1; `PlatformException` NotificationMessageService (inviteUser) ×2; 500 graphql InviteUser/UnlockOrganizationContact/OrganizationMembership.Create/GetOrganizationContacts ×3/GetOrganizationAddresses ×3 | 15-Jun 11:01 → 15:00 | This is the exact feature on branch `test/VCST-5028` (latest commit `17a91cd`). `MissingMethodException` = runtime method-signature/binary mismatch — classic mid-deploy/version-skew signature while a feature is being iterated. | Errors are ~18h stale, fully inside an active QA test session of the feature under development; ambiguous deploy-state vs. real defect. Needs verification against the **current** deployed VCST-5028 build by someone who knows its deploy state. |
| **CompanyInfo / CompanyMembers storefront** | storefront | `TypeError: …reading 'status'` @ Rve.fn ×5; `SyntaxError: 26` @ TC ×6 (same op-id, same window) | 15-Jun 09:48 → 13:26 | Co-occur with the org-membership 500s above; pages are CompanyInfo/CompanyMembers (B2B org admin). | Almost certainly downstream of the backend org 500s during the same test session; not independently reproduced. A missing null-guard on a failed response is plausible but unconfirmed. |
| **Elasticsearch 400 on SearchProducts** | backend | `HTTP essearch-es-http…:9200 400` ×7 → surfaces as 500 CatalogModuleIndexedSearch/SearchProducts ×4 | 15-Jun 13:10 → 22:23 | Prior store has same ES target with **404** marked TRANSIENT; this is **400** (malformed query). | Bracketed by an admin smoke session (asset `bsm-smoke-test`, SaveProduct ×5 @ 22:02). Likely test-induced bad query; needs a clean repro to distinguish from a real query-builder defect. |

## Dismissed
| Class | Signature(s) | Oracle |
|---|---|---|
| BY-DESIGN | AuthorizationError `xapi:my_organization:edit` ×7; AuthorizationError "password expired" ×3 (+ GetShortCart 500 ×3) | Authz/account-state guards firing correctly |
| BY-DESIGN | FluentValidation `createOrganization` ×5 | Input validation working |
| CLIENT-ERROR | KnownArgumentNamesError `storeId on orders` ×2; ArgumentsOfCorrectTypeError `cultureName/roleId` ×1; FieldsOnCorrectTypeError `firstName/lastName on UserType` ×1 | Malformed client GraphQL queries (4xx-class), not server defects |
| NOISE | `ResizeObserver loop…` ×21 (CompanyMembers) | Benign browser event, never a defect |
| NETWORK | `ApolloError: Failed to fetch` ×18 / NetworkError ×2 / SignIn ×1 (page "Matcher") | "Failed to fetch" = transient connectivity; ~0.8/hr over 22h, not a spike |
| TRANSIENT | 503 GET /health ×1; HTTP vcst-qa 502 `pushNotificationHub/negotiate` ×1 (SignalR) | Single-shot, self-recovered |
| KNOWN/TRANSIENT | DbUpdateConcurrencyException + 500 `DeleteFcmToken` ×2 | FCM cleanup race, adjacent to VCST-5210 FCM area |
| TEST-INDUCED | 500 SaveProduct ×5, GetNotifications ×4, EvaluatePrices ×1, GetAvailableShippingRates ×1, DeleteBlobs `bsm-smoke-test` ×1; 500 CreateOrderFromCart ×1; storefront `Missing required param "orderId"` (CheckoutCompleted) ×1, TypeError `deliveryAddress` (Cart) ×1 | 22:00 smoke/regression session (asset name + clustering) |

---
**No JIRA filed, no fix attempted.** Detect-and-report only — human decides whether to escalate any needs-review item to `/qa-bug`/`/qa-fix`.
