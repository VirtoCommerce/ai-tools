# MONITOR-2026-08-28-1245 — online bug monitoring

**Env:** vcst @ Platform 3.1061.0 · **Window:** 24 h to 2026-08-28 12:40Z · **Layers:** backend (`vcst-qa`) + storefront (`vcst-qa-storefront`) · **Mode:** live repro enabled

**Telemetry volume (dead-pipe check):** backend 245 255 events (207 231 dep / 37 976 req / 48 exc) · storefront 12 968 (12 534 dep / 424 pageView / 10 exc). Both pipes alive — a low error count is a real signal, not a broken feed.

## Signature counts
| seen | new | spiking | triaged | deferred |
|---|---|---|---|---|
| 26 | 19 | **0** | 19 | 0 |

7 signatures matched the existing fingerprint store (last written 2026-06-23). Its baselines are **per-35-min** windows; normalized to per-hour, **all 7 sit below** their stored baseline (e.g. `500 POST graphql/` 0.9/h now vs 1.7/h baseline; `ApolloError` 0.42/h vs 6.6/h) — so none is SPIKING. No truncation: the `MONITOR_MAX_SIGNALS` cap was not binding once singleton classes were grouped.

## Confirmed bugs (live-reproduced)
| Sev | Layer | Signature | Repo | Draft |
|---|---|---|---|---|
| MEDIUM | xAPI | `ArgumentNullException at LoyaltyUserMissionType+<>c.<.ctor>b__0_2/_3` → `Value cannot be null. (Parameter 'languageCode')` (5) | `vc-module-loyalty` | [`BUG-AI-loyalty-mission-localizedname-null-culturename.md`](../../bugs/open/BUG-AI-loyalty-mission-localizedname-null-culturename.md) |

Reproduced with a paired control: `loyaltyMissionProgress` **with** `cultureName:"en-US"` → 200, clean, 20 items; with the (schema-optional) `cultureName` **omitted or null** → 200 but 40 field errors and every `localizedName`/`description` null. `LoyaltyUserMissionType.cs:39`.

## Needs review (telemetry-confirmed, not live-reproduced)
| Sev | Layer | Signature | Why not drafted |
|---|---|---|---|
| MEDIUM | Platform | `InvalidOperationException at MarketingModule …PromotionPolicyBase.EvaluatePromotionAsync` → **`Sequence contains no matching element`** (10; 27-Aug 13:06 → **28-Aug 11:42**, still active) | **RESOLVED THIS SESSION — now CONFIRMED and filed.** A follow-up `/qa-bug` run reproduced it 3/3 in the real customer path (`/account/missions` in the browser) and pinned the throw to `PromotionPolicyBase.cs:30`, an unguarded `.First(x => x.Code == promoContext.Currency)`. Draft: [`BUG-missions-page-dead-product-resolver-throws-on-missing-currency.md`](../../bugs/open/BUG-missions-page-dead-product-resolver-throws-on-missing-currency.md). The earlier "not reproducible" note was an artefact of probing via a `storeId`-scoped API token, which carries the currency the browser session does not. |
| MEDIUM | Platform | `InvalidOperationException at StoreCurrencyResolver.GetStoreCurrencyAsync:68` → **`requested currency  is not registered in the system`** (empty currency) (16; 27-Aug 14:36 → 17:02, none since) | **Env-state incident, self-healed** — the empty currency is `store.defaultCurrency` unset, and the window sits inside a 14-write `PUT /api/stores` burst (14:28 → 17:05, store-toggle suite). Live re-check now green: `td:reconcile:store` reports `B2B-store defaultCurrency=USD · defaultLanguage=en-US · url` set, 0 failures. Product-side question left open (and matching `reference_store_required_defaults_null_breaks_frontend`): a null default currency takes down `InitializeApplication` + `GetPageContext` with an unhandled 500 rather than a diagnosable error. |
| LOW | Platform | `500 PUT LoyaltyMission/Update` (2; 27-Aug 14:37–14:38) | Admin write 500 with no correlated exception row and no failed dependency — insufficient evidence to classify. Re-check on the next admin mission edit. |

## Dismissed
| Class | Signatures | Oracle / reason |
|---|---|---|
| NOISE — our own malformed queries | `FieldsOnCorrectTypeError` (6), `ProvidedNonNullArgumentsError` (5), `ScalarLeafsError` (2), `KnownArgumentNamesError` (1) | Schema-validation rejections of queries authored during the VCST-5320 missions work (`Cannot query field 'orderId' on type 'LoyaltyOperationLog'`, `Argument 'storeId' … not provided`, `Unknown argument 'currencyCode'`). The server behaved correctly. |
| NOISE — correct behaviour | `Xapi …AuthorizationError` at `GetMissionProgressQueryBuilder` (1) · `GraphQL.ExecutionError` "The cart has validation errors" (1) | Anonymous access denied and cart validation are the designed responses. |
| TRANSIENT / test-data artifact | SQL `2601` duplicate key + `500 SaveProduct` (1+1) · SQL `515` NULL insert + `500 CreatePriceList` (1+1) · `500 DELETE Assets/DeleteBlobs` on `agent-test/loyalty-missions/msn-banner-order-value.svg` (1) · `500 PUT StoreModule/UpdateStore` (1) · ES `HTTP …:9200 400` `_bulk` (1) | All from this repo's own seed/teardown runs. The 2601 matches `project_seed_catalog_link_and_index_lag` (re-seed collision). |
| TRANSIENT | `OperationCanceledException at CurrencyExtensions.GetCurrencyForLanguage` on `clearCart` (1) | Client aborted the request mid-flight. |
| AGGREGATE, not independent | `500 POST graphql/` (22) · `graphql/GetPageContext` (9) · `graphql/InitializeApplication` (6) · `graphql/GetLoyaltyMissionProgress` (11) | Request-level roll-ups of the exceptions already classified above. |
| KNOWN — below baseline | `ApolloError: Failed to fetch` (10, storefront) · `404 /cms-content/pages/index.json` (3) · storefront `400 POST /graphql` (1) | Storefront-side echoes of the backend 500s plus a known-absent CMS index. All previously `noise`/`triaged` and below their normalized baseline. |

## Notes
- `TEAMS_WEBHOOK_URL` is not configured locally — **no Teams card sent**.
- Live repro was run inline by the orchestrator rather than delegated to a QA expert sub-agent (session policy forbids sub-agent dispatch); it needed no browser, only the platform API.
- Token gotcha re-confirmed: `/connect/token` takes **`storeId`** (camelCase). `store_id` yields `user_cannot_login_in_store` — a misleading error already documented at `seed-loyalty-ephemeral-user.mjs:137`. The 5 token 400s in the window are these probe attempts, against 203 successes — no login outage.

**No tracker ticket filed, no fix attempted.**
