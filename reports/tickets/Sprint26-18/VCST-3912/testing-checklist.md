# Testing Checklist — VCST-3912

`[Support] #38981 — Price restriction on order, catalog, pricing modules` · Story · High · status `Testing`
Run: 2026-09-10 · Path **FULL** · Flow `feature-test` · Env target **vcptcore-qa** · Model: [`VCST-3912-2026-09-10.md`](../../../ba/test-models/VCST-3912-2026-09-10.md)

## Verdict — Round 3: 4 of 7 FIXED, 1 still reproduces, 2 new, and R3 proven destructive

> Round-1/2 detail is kept below for history; **the current state is the Round 3 table at the end of this file.**

> **Three come from this PR:** `ORDA-108` (store scope fails open), the Admin-SPA digest loop on the new 403, and the unmarked price-free backup its own export fix now produces. The other four pre-date it. The other four are real and worth fixing, but the deleted handler behaved identically, so they are *not fixed by* this PR rather than *broken by* it. That distinction drives triage and it was established from the diff, not assumed.

> **SCOPE of this run.** Everything here exercises the **default** rule — the global `order:read_prices` permission. A live custom `CanReadPrices` override was not exercised, and that was a deliberate call rather than a gap: `samples/VirtoCommerce.OrdersModule2.Web` predates this PR, is built by CI only to prove it compiles, and is not published as a deployable artifact — a solution registers its own override, not that one. The override contract is compile-time, and the per-order semantics a distributor rule depends on are verifiable from source (`ReduceDetailsForCurrentUser` calls `ReduceDetailsForUser(user, orders[i], cloned)` **per order**, not once per user).
>
> What no custom rule can escape is the shared redaction path beneath it — which is where all six defects sit. They therefore apply to the customer scenario with more force, not less: under a per-distributor rule the same leaks expose a *competitor's* prices rather than merely "a price".
>
> An earlier draft of this file claimed the customer scenario was untested and treated the undeployed sample module as a blocker. Both were overstated and are corrected here.

**Deployed and executed.** vc-deploy-dev PR [#6499](https://github.com/VirtoCommerce/vc-deploy-dev/pull/6499) pinned `VirtoCommerce.Orders` to the PR-472 build; merged 2026-09-10 09:42, deploy green 09:44. Verified on the stand, not from the action's status: `GET /api/platform/modules` → **`3.1015.0-pr-472-dfa3`**, and an order payload now carries **`withPrices`**.

Fixtures seeded on vcptcore-qa: role **`AGENT-TEST-ORDER-NOPRICES`** (all 10 Orders permissions except `order:read_prices`, plus `platform:access`) and user **`agent-test-noprices`**. Both must be deleted after triage.

| Case | Verdict | One line |
|---|---|---|
| `ORDA-105` | **PASS** | Every scalar monetary field on the order root and its line items is correctly zeroed; `withPrices:false` set. |
| `ORDA-106` | **PASS** | 404 for an absent order and **403 for an out-of-scope order** both confirmed (Round 2, scoped fixture). |
| `ORDA-107` | **FAIL (High)** | Sort-order inference proven exactly. |
| `ORDA-109` | **BLOCKED** | No order with captures/refunds exists in 120 sampled — fixture gap, not a product result. |
| `ORDA-114` | **FAIL (Critical)** | Payment/shipment endpoints return real money **and** falsely report `withPrices:true`. |
| `ORDA-118` | **FAIL (Critical)** | `discounts[]` survives redaction and reconstructs the hidden total — **and renders as a real number on screen**. |
| `ORDA-113` | **FAIL (Critical)** | 6 of 8 Admin surfaces mask correctly; the **invoice PDF renders `Total: $0`** and both Discounts blades show real amounts. |
| `ORDA-120`, `ORDA-121`, `ORDA-122` | observation only | Deep-link, refresh and fault all hold masking. Later RETIRED - see the case-state section: none of them can fail while the server strips prices before they leave. |
| `ORDA-108` | **FAIL (Critical)** | **REGRESSION** — an out-of-scope store request returns all 1248 orders instead of the caller's 54. See Round 2. |
| `ORDA-110` | **PASS** | Restore-on-write via `PUT`: stored `777.77` survived a denied user's save. |
| `ORDA-104`, `111`, `112`, `115`–`117`, `119`, `ORD-GQL-014` | **NOT RUN** | Need an order with captures/refunds, a resolvable platform-export request shape, or the sample module deployed. |

### Admin SPA pass — `playwright-edge`, 8 price surfaces × 2 users

**Bundle freshness proved objectively before anything was judged** (`VC-DEPLOY-003`): the deployed `VirtoCommerce.Orders/dist/app.js` contains **13 occurrences of `withPrices` and 0 of `checkPermission('order:read_prices')`** — the migrated client is genuinely live, so results are attributable to the new behaviour, not a stale 4h-cached bundle.

| Surface | Denied user renders | Verdict |
|---|---|---|
| List grid (Total) | `#.##` | PASS |
| Line items blade | all `#.##` / `#` | PASS |
| Order-totals widget | absent entirely (control confirms absence = masking, not empty data) | PASS |
| Shipment blade | `#` | PASS |
| Operation-tree widget | no price row | PASS |
| **Discounts blade (order)** | **`Coupon 50%` · `44.995` · USD**, and `5,175` on `CO260909-00001` | **FAIL** |
| **Discounts blade (shipment)** | **`test` · `10` · USD** | **FAIL** |
| **Invoice PDF** | **`Total: $0`**, HTTP 200 | **FAIL** |
| List grid sorted by Total | `#.##`, but row order = true ranking | **FAIL** |

The three client-timing observations (deep-link, refresh, fault) all held masking, and the run also caught that `press_key('F5')` does not actually reload in Playwright - re-run with a real navigation rather than reported as a false pass. Their cases were later retired, for the reason given in the case-state section. · `ORDA-113` third sub-case **BLOCKED** — no custom `CanReadPrices` override is installed on this env.

Console: 42 errors for the denied user, **all** 401/403 from modules the narrow fixture role lacks, plus 404 logo assets. **No TypeError and no unhandled `.withPrices` access** — the admin control shows neither, so these are fixture artifacts, not a regression.

### The four defects, as proven

**1. `ORDA-114` — the whole restriction is bypassed one hop sideways (Critical).**
`POST /api/order/payments/search` as `agent-test-noprices` returns `totalCount 1157`, real `sum` values, and `withPrices: true` on every row — the flag actively asserts nothing was withheld. In a 200-row sample, **176 non-zero payments totalling 13,235,931.74**, largest single payment **2,421,250**. Shipments behave the same. The decorator implements only the `CustomerOrder`-typed interfaces, so the child services were never wrapped — exactly what `cursor[bot]` flagged with no reviewer reply, and what the PR's own architecture doc states is "the state the order module is in today".

**2. `ORDA-118` — `discounts[]` is never cleared (Critical).**
`RemovePrices` calls `ReduceDetails(Full & ~WithPrices)`; only the `WithPrices` flag is cleared, so `WithDiscounts` stays set and the `Discounts = null` branch never fires. `TaxDetails`/`FeeDetails` are not referenced by `ReduceDetails` at all. Measured: **15 of 60 orders leak, 26 leaking nodes**, at order level *and* shipment level. `CO260909-00002`: `total 0` beside `discounts[0].discountAmount 44.995` ("50% off cart subtotal"). `CO260909-00001`: `discountAmount 5175`. **In no reviewer comment and not in the architecture doc — found by reading the diff this run.**

**3. `ORDA-113` / invoice — the PDF renders `$0`, ignoring the very flag the feature added (Critical). FOUND IN THE BROWSER PASS; not visible from the API.**
The invoice endpoint returns **HTTP 200** to the denied user and generates a PDF from the already-zeroed entity **without consulting `withPrices`**. Result: a commercially meaningful document stating `Total: $0.00` for an order actually worth 44.99. This is strictly worse than masking — it is indistinguishable from a genuinely zero-value order, and the admin's own legitimate invoice shows `$0` for Shipping/GST, so there is no way for a reader to tell. The toolbar button is unconditionally enabled (`canExecuteMethod: return true`). Server-rendered, and therefore outside the ten migrated client files. Evidence: `screenshots/S4-invoice-DENIED-CO260909-00001.png` + `payloads/invoice.*.DENIED.pdf` against their `CONTROL-`/`ADMIN` counterparts.

**4. `ORDA-107` — the ranking leaks even though the values do not (High).**
Denied user sorts by `total:desc` and receives every total as `0`. Reading those same orders privileged, in the order they were returned: `2421250, 2421250, 2400062, 2400040, 2400040, 930040, 105723.1, 82381.04` — **exactly the true descending order**. Every order in the system is rankable by value, and range filters narrow actual amounts. The architecture doc predicts this and says the design does not address it.


### Round 2 — the scenarios the PR actually changed (fixtures built, 2026-09-10)

Round 1 tested the *default* rule, which pre-dates this PR. This round targets the behaviour the PR's own "Breaks at runtime" section describes. Fixtures created to unblock it: user `agent-test-scoped` / `AgentScoped2026!` on role `AGENT-TEST-ORDER-SCOPED-ELECTRONICS` (`order:read` carrying an `OrderSelectedStoreScope` for store `Electronics`), and `platform:export`/`import` added to the no-prices role.

| New behaviour (per the PR body) | Result |
|---|---|
| `ResponseGroup` no longer rewritten — sections arrive, values zeroed | **PASS** — `Full`/`WithItems`/`Default` each return exactly the group asked for with `total 0`, `withPrices false`. An explicit `responseGroup=WithPrices` does **not** grant prices. |
| Restore-on-write via `PUT` | **PASS** — denied user read `0`, saved, stored `777.77` survived and the comment persisted (disposable order `AGENT-TEST-CO-3912-01`, since deleted). |
| Restore-on-write via `PATCH` | **INCONCLUSIVE** — 400, wrong payload shape (JSON Patch expected). Nothing was written, so "prices intact" proves nothing. Not a pass. |
| `404` for an absent order | **PASS** |
| `403` for an out-of-scope order on GET-by-number | **PASS** |
| **Store scope intersected instead of overwritten** | **FAIL — Critical REGRESSION**, see below |
| Case-insensitive store matching | **FAIL** — folded into the same regression |
| Export/import through the protection service | **NOT RUN** — export permissions now granted, but the platform export request shape could not be resolved (admin control also 500s, so the instrument is unverified — not reported as a product result) |
| The extension point / direct-vs-indirect distributor rule | **NOT RUN** — sample module `VirtoCommerce.OrdersModule2` is built by no pipeline and exists in no artifact feed |

### REGRESSION 1 — store scope fails OPEN, `ORDA-108` {Critical}

```
OLD (deleted):  criteria.StoreIds = allowedStoreIds;                        // unconditional overwrite
NEW:            criteria.StoreIds = AllowedStoreIds.Intersect(criteria.StoreIds)
```

The old code always narrowed a request to the caller's scope. The new one intersects, and **an empty intersection means no store filter at all**. Measured with a user scoped to `Electronics` (entitled to 54 of 1248):

| Requested `storeIds` | Returned |
|---|---|
| *(none)* / `["Electronics"]` / `["B2B-store","Electronics"]` | 54, Electronics only — correct |
| `["B2B-store"]` — out of scope | **1248, every store** |
| `["ELECTRONICS"]` — case differs | **1248, every store** |
| `["NoSuchStore"]` — does not exist | **1248, every store** |

Identical on `POST /api/order/customerOrders/search` **and** `POST /api/order/customerOrders/indexed/search` — the latter is what the Admin grid actually calls.

**Scope of the exposure, corrected after measuring.** Leaked rows carry `withPrices:false` with zeroed totals, and opening one is fail-closed (`GET .../{id}` returns **403**). So this leaks **order metadata, not money**: number, store, customer name, status and dates for all 1248 orders. Still a scope violation and still a regression, but not a price leak — an earlier draft of this report overstated it.

**It is reachable by clicking.** The Store dropdown cannot be used (the fixture lacks `store:read`, so the picker is empty), but **saved filters are browser-local, not per user**: a filter created by an admin with `storeIds:["B2B-store"]` loaded automatically for `agent-test-scoped` after sign-out and sign-in on the same browser, and appears in that user's own filter dropdown. On a shared workstation no crafted request is needed.

Reviewer flagged this High on the PR; the author replied "By design". It is strictly weaker than the code it replaces, so that reply should be revisited.

### REGRESSION 2 — the Admin SPA is not prepared for the new 403 {High}

The PR introduces `403` on `GET .../{id}` for an out-of-scope order. Clicking such an order in the grid sends the blade into an AngularJS infinite digest loop — `[$rootScope:infdig] 10 $digest() iterations reached. Aborting!`, **184 occurrences and still climbing** while the blade stayed open, 3295 console lines from a single click, in the ui-grid row/col watcher. An in-scope order produces about 8 console lines and no loop, so it is specific to the new 403 path. Evidence: `payloads/R2-console-scoped-403-loop.log`.

### Export — VERIFIED. The fix works, and it creates a poison-pill backup {High}

Fixture needed `platform:backuprestore:access` + `:backup` + `:storage` — `platform:export` is not the gate. Once granted, `agent-test-noprices` (no `order:read_prices`) ran a full platform backup with the Orders module selected.

**The PR's headline fix is confirmed.** Same 1250 orders, same archive layout, same Manifest schema:

| | `total` | `subTotal` | `sum` | `withPrices` |
|---|---|---|---|---|
| admin control | 44.99 | 89.99 | 44.99 | *(absent)* |
| `agent-test-noprices` | **0.0** | **0.0** | **0.0** | **false** |

Export previously bypassed authorization entirely and wrote full prices. It no longer does.

**But the resulting archive is an undetectable poison pill.** It is produced through *Data backup and restore*, it is restorable, and nothing marks it as partial:

- 1250 orders, every price `0.0`
- `Manifest.json` keys are `Author, PlatformVersion, HandleSettings, HandleDynamicProperties, HandleSecurity, HandleBinaryData, Modules, Options, Created, IsEncrypted` — **no redaction or partial-data marker of any kind**
- filename shape identical to a valid backup (`vc_backup_<ts>_<host>.zip`), size comparable (1.05 MB vs 1.18 MB)
- job completes green, no warning in the UI or the notification

So a restore from it destroys every price in the system, and neither the operator nor the restore path can tell it from a complete backup. The architecture doc predicts this for the *system* context ("an export running outside an HTTP request produces a backup with every price zeroed, and nothing reports an error"); measured here, it happens for an ordinary interactive user too.

Artifacts: `payloads/R2-T2-backup-DENIED.zip` and `payloads/R2-T2-backup-ADMIN.zip`.

Restoring that archive WAS exercised later, safely: stripped to one disposable order, over an existing order (ORDA-124, prices survive) and onto a deleted one (see below).

### Restore-on-write through the UI — PASS

Run as `agent-test-noprices`; the scoped user has no `order:update`, so its blade shows no Save button and the write half is untestable there by design. Comment added, saved, `PUT` returned 204, with the UI sending `withPrices:false`, `total:0`, item `price:0`. Admin re-read afterwards: **every price unchanged** — total 284.94, subTotal 249.95, tax 47.49, discount 12.5, item 249.95/237.45, shipment 5. Comment persisted, reverted afterwards, prices re-verified.

### Line-item Discounts leak — confirmed on a second order, pure click path

Orders → order → Line items → item row → Discounts widget shows **`12.5 USD`** in plain text for `CO260827-00002`, while `items[0].discountAmount` and `discountTotal` in the same payload are correctly zeroed. The nested `Discount` collection is not reduced. The order-level Discounts widget reads 0, so it is reachable only one level down. `screenshots/R2-T3-04-scoped-lineitem-discounts-LEAK-12.50.png`.

### Incidental, outside this ticket but worth a look

- **Blade state including unsaved edits survives sign-out and is offered to the next user.** After signing out of `agent-test-scoped` with an unsaved comment, admin was prompted "The operation has been modified. Do you want to save changes?" on that user's order — clicking Yes would write one user's edit under another's identity. Same browser-scoped-not-user-scoped mechanism as the saved-filter bleed above.
- Generic export offers `Catalog` and `Pricing` object types to a user holding neither permission.
- A **Revenue per customer** dashboard widget renders for a `read_prices`-denied user; it read 0 here, so it needs a store with real revenue to judge.
- The Store field on the order blade stays on "Loading..." forever for any user without `store:read`.

**Live store counts** (an earlier draft used stale numbers): total 1248, `B2B-store` 1062, `Electronics` 54, `ExportStore` 4.

## Gates

| Gate | Where | Result |
|---|---|---|
| Model complete (10 clauses) | 1e | PASS (inline) |
| Existing coverage disposed | 2a | PASS (inline) |
| **Artifacts reviewed + data resolved** | **Step 3** | **APPROVE** — fresh `qa-lead-orchestrator` in Verifier Mode, re-derived from source. Confirmed the `ORDA-118` leak against the diff independently, confirmed the `ORDA-115` withdrawal, confirmed the REPAIR touched `Preconditions` only, and confirmed zero Critical/High lint findings land on any of the 20 new rows. |
| Execution evidenced | Step 4 | **PASS** — 7 cases executed across two lanes: API (privileged-vs-denied comparison) and Admin SPA (`playwright-edge`, 13 screenshots each paired with an admin control, plus payloads and both invoice PDFs). Bundle freshness proved before judging. |
| Triage + AC/DoD sound | 5b | **PASS (inline)** — all four defects trace to a named code site in the diff; three were predicted by the model before execution, the fourth (invoice) was found only in the browser. |
| Filing sound | 5d | **NOT DONE** — four bugs drafted and held; the tracker write awaits operator consent. |
| Release gate | 5e | **NO-GO** — three Criticals on a data-confidentiality feature. |
| Promotion | 5g | **NOT RUN** — cases that are RED against the build under test are not promotable; all 20 stay `Draft`. |

## Conditions → coverage

Story ACs first. **1d graded all four non-testable or partial** — two are structural claims, two are deliverable-presence checks — so the gap-ACs, not these, carry the run.

| # | Condition | Source | Case | Status |
|---|---|---|---|---|
| 1 | `ICustomerOrderDataProtectionService` owns the decision on every read/save path | AC-1 | ORDA-104, 105 | NOT RUN |
| 2 | A denied caller's order comes back with prices zeroed | AC-2 | ORDA-105, 109 | NOT RUN |
| 3 | A denied caller's save does not destroy stored prices | AC-2 | ORDA-110 | NOT RUN |
| 4 | A sample demonstrates extending the rule | AC-3 | ORDA-113, 115 | NOT RUN |
| 5 | Documentation exists for implementing this in other modules | AC-4 | — | **UNCOVERED — and unmeetable as written.** AC-4 names `IEntityDataProtectionService`, which **does not exist in the shipped diff**. Only `docs/data-protection-architecture.md` defines it, marked `Status: Proposal`, targeting `VirtoCommerce.Platform.Core`. Not a QA-testable condition; raise with the story author. |
| 6 | Search: every one of the 30 monetary fields zeroed, `withPrices` false | gap | ORDA-105 | NOT RUN |
| 7 | Indexed search does not leak prices through sort/filter ordering | gap-21 | ORDA-107 | NOT RUN — **known-open per the dev's own doc** |
| 8 | GET by id/number/outerId: 404 vs 403 does not enable order enumeration | gap-1/2 | ORDA-106 | NOT RUN |
| 9 | Store scope ∩ requested = ∅ returns zero orders, not all stores | gap-5 | ORDA-108 | NOT RUN — **known-open, marked "By design" in review, no unit test** |
| 10 | Nested captures/refunds under a payment are zeroed at every depth | gap-4 | ORDA-109 | NOT RUN |
| 11 | Restore-on-write holds for update, patch and import over an EXISTING order | gap | ORDA-110, 124 | PASS |
| 12 | Export by a permitted admin contains real prices | gap | ORDA-111 | NOT RUN |
| 13 | Export with no `HttpContext` does not silently zero the backup | gap-20 | ORDA-112 | NOT RUN — **known-open, "By design"; contradicts the doc's own rule #4** |
| 14 | Export → import round trip does not write withheld zeros as real prices | gap | — | **Condition withdrawn** — see below; it asks for data that exists nowhere |
| 15 | Independent Payment/Shipment endpoints redact identically | gap-19 | ORDA-114 | NOT RUN — **known-open; the doc states child services are unprotected today** |
| 16 | A custom `CanReadPrices` on a null principal denies, never 500s | gap-3 | ORDA-115 | NOT RUN — **hypothesis withdrawn.** The base service returns `false` for `user is null` and the sample guards `user != null`; the `cursor[bot]` 500 was fixed between `a2d4cfa` and `dfa3864`. Row retained as a `BL-AUTH-017` guard on the extension point only; non-reproduction is the expected result. |
| 17 | `Discounts` / `TaxDetails` / `FeeDetails` carry no money after redaction | **new** | ORDA-118 | NOT RUN — **found this run; in no review comment and not in the architecture doc** |
| 18 | Redacting a cache-owned instance does not strip prices for the next entitled caller | gap | ORDA-116 | NOT RUN |
| 19 | Granting/revoking `order:read_prices` takes effect with no re-login | BL-PLAT-001 | ORDA-117 | NOT RUN |
| 20 | Admin SPA masks from `withPrices`, not a client-side permission check, across all six price surfaces | gap | ORDA-113, 120–122 | NOT RUN |
| 21 | Storefront/xAPI order surface distinguishes withheld from zero | gap | ORD-GQL-014 | NOT RUN — **schema refreshed 2026-09-10 confirms `CustomerOrderType` has no `withPrices` field** |
| 22 | Catalog and pricing legs of the origin requirement | comment 2026-02-24 | — | **OUT OF SCOPE of this PR.** The ticket summary and Modules field name catalog + pricing, and the origin requirement names four data classes; the diff touches **orders only**, and only the *price* aspect. Sibling `VP-8998` is the plausible home — **unconfirmed**. Raise with the story author. |
| 23 | Performance: every save now pays one extra read, even for a fully-privileged caller | gap-17 | — | **UNCOVERED** — no NFR budget stated on the ticket; the doc flags it as an open question. Not filed; below the bar without a stated budget. |

## Visual conditions (`visual_surface: true` — 10 Admin SPA blade/widget files changed)

| Condition | Case | Status |
|---|---|---|
| All six price surfaces mask for a denied user (order list grid · line items · order-totals widget · invoice · shipment · operation-tree widget) — the inventory comes from the customer's own analysis attachment | ORDA-113 | NOT RUN |
| Client-timing sweep: deep-link (`UIP-DEEP`), force-refresh mid-flow (`UIP-REFRESH`), payload failure (`UIP-NET`) | — | **WAIVED** — observed to hold, but not carried as cases: the server strips prices before they leave, so no client-side timing or fault path has a real value available to reveal. `ORDA-113` asserts the same property directly, at the source |
| `BL-UI-004` content boundary on the rewritten order-list price cell template | ORDA-113 | NOT RUN |
| `BL-A11Y-*` on the masked cells | — | **SKIPPED** — the visual lane never dispatched; nothing to audit until the build lands. Not a pass. |

## Step 2a — existing coverage disposed

`tc:scope` over `purchase-flow` + `platform-config`: **27 hits, 22 `WILL_RUN`, 0 `FILTERED_OUT`, 5 `NOT_EXECUTING`**; 6 suites `unscannable` (legacy 11-column headers: `056`, `063`, `064`, `065`, `073`, `076` — **stated, not skipped**; `064` matters here because it is CSV import/export). `unmatchedObservables`: none.

> **Re-running `tc:scope` now returns 35 hits / 30 `WILL_RUN`, not 27 / 22 — and that is expected.** The extra 8 are this run's **own** newly-authored rows (`ORDA-104`, `105`, `111`, `113`, `117`, `120`, `121`, `122`) plus `ORDA-057`, which only started matching the `read_prices` observable **after** the REPAIR corrected its permission names. 35 − 8 = 27. The figures above are the **pre-authoring** scan the dispositions were made against; nothing was missed. Verified independently at the Step-3 verifier gate.

| Disposition | Rows | Action taken |
|---|---|---|
| `REPAIR` | `ORDA-057` — the **only** existing case covering `order:read_prices`, and it named `orders:read_prices` / `orders:update_shipments`, which **do not exist** (live permission catalogue confirms `order:` singular) | **Applied** — mechanics only, oracle untouched. Re-linted: CRLF (567) and BOM preserved, 70 rows still parse, no new finding. **But the row has empty `Assertions` and zero `Failure_Signals`, so it cannot fail** — it is vacuous coverage, and ORDA-104..122 are the real thing. Strengthening it is `/qa-review-tests --fix` work, out of this run's scope. |
| `CONFIRMED` | the remaining 26 hits — checkout/cart/BOPIS/payment rows matching only on the phrase *"order total"* | none; the change does not alter any total, only who may read it |
| `RE-BASE` | none | C1's exact set is therefore the new Draft ids only |
| `SUPERSEDED` | none | — |

## Regression scope

- **C1** — `ORDA-104..ORDA-125` + `ORD-GQL-014`, exact set. **Not run** (blocked).
- **C2** — not scoped and not run: a change-scoped Critical sweep against a build that does not carry the change would measure the old build. Recorded as `not-assessed`, **never as a pass**.
- **Exclusions** — every suite contributed zero cases this run, because nothing executed.

## Incidental findings (not filed)

- `npm run suites:lint` is **already red on `main`**, unrelated to this ticket: `regression/suites/Backend/subscription/093-subscription-admin.csv` exists on disk with no manifest entry, so it can never be selected. Left alone (one-author-per-CSV); belongs to whoever owns suite 093.
- Suite `017` baseline: **293 Critical / 230 High** lint findings, all pre-existing legacy-TestRail-import debt (untagged steps, empty assertions). Not introduced by this run.
- VirtoOZ `PlatformDeveloperGuide` → *scope-based-permissions* teaches the authorize-then-mutate-criteria pattern **this PR replaces**, using `OrderAuthorizationHandler` as its worked example. Shipping VCST-3912 dates the platform's canonical authorization tutorial. Documentation drift, distinct from AC-4, and owned by platform docs rather than this ticket.
- Below the severity floor: none. Nothing was executed, so nothing was observed to grade.

---

## Round 3 — re-verification after the developer's fixes (2026-09-11)

Build **`VirtoCommerce.Orders 3.1015.0-pr-472-0fac`** (was `-dfa3`); the pin was already updated on `vcptcore-qa` by the time this round started. Bundle freshness proved twice over: server `app.js` `last-modified: Fri, 11 Sep 2026 10:17:36 GMT`, and the SPA loaded `app.js?v=8DF0FEDE693A000` whose FILETIME decodes to the same 10:17:36.

Both fixture roles were **rebuilt to the developer's published minimum set** — `customer:read · order:access · order:read · platform:module:read · platform:setting:read · store:read`. Note it contains no `platform:access`, no `order:update`, no `order:read_prices`; both accounts still sign in. `AGENT-TEST-ORDER-NOPRICES` additionally carries `order:invoice:download` (deliberate, see P3) and the three `platform:backuprestore:*` permissions (needed to reach export).

Developer commits map one-to-one onto the findings: `63bdb93` store scope · `9c70f5f` payment/shipment · `75b66ef` discounts · `9ac9d61` index-widget permission check · `85ccae8` `order:invoice:download`.

| # | Defect | Dev's disposition | Verified result |
|---|---|---|---|
| R1 | Store scope fails open | Fixed | **FIXED.** Out-of-scope → 0, nonexistent store → 0, wrong case → the correct 54. Both `/search` and `/indexed/search`. |
| R2 | Admin SPA digest loop on 403 | Fixed | **FIXED.** 0 `[$rootScope:infdig]` on an in-scope order (13 lines) and on a deep-linked out-of-scope one (8 lines), stable over a 25 s dwell. The old entry point is also gone, since the grid no longer leaks a clickable row. |
| P1 | Payment/shipment endpoints leak | Fixed | **FIXED.** 1157 payments and 1363 shipments: 0 non-zero sums, `withPrices:false`. |
| P2 | Discounts survive redaction | Fixed | **FIXED** for the restricted user, order level and line-item level, on screen and at the API (0 leaking nodes across 60 orders, was 15 orders / 26 nodes). **But it over-corrected — see N1.** |
| P3 | Invoice prints `$0` | Resolution: new `order:invoice:download`, recommend granting with `order:read_prices` | **STILL REPRODUCES** under a partial grant — see below. |
| P4 | Sorting reveals the ranking | Ignore | Still reproduces, as expected under that decision. Recorded, not re-litigated. |
| R3 | Unmarked price-free backup | Resolution: document it | **Unchanged** — re-ran the export on the new build: 1250 orders, all `0.0`, `withPrices:false`, and `Manifest.json` still carries no redaction or partial-data marker. |

### P3 — the gate works, the document does not

The permission exists and gates correctly: a user without `order:invoice:download` gets **403**, and the toolbar button is **hidden** rather than shown-and-failing.

But the recommendation ("grant it together with `order:read_prices`") is not enforced by anything. Granting only the new permission — following the advice halfway — reproduces the original defect exactly:

| Field | `agent-test-noprices` on `CO260909-00001` | admin control |
|---|---|---|
| Unit Price | `$0` | `$3450` |
| Line Price | `$0` | `$10350` |
| Order Subtotal | `$0` | `$10350` |
| **Total** | **`$0`** | **`$5215`** |

Same on `CO260909-00002` (`$0` vs `$44.99`). The instrument is sound — admin copies print real figures through the same viewer. So the fix gates *who may download*, not *what the document says*, and the product still permits the grant combination that produces a valid-looking invoice claiming a $5215 order is free.

### N1 — NEW, introduced by the P2 fix: the line-item Discounts widget now masks for everyone

**Reproduced independently by the reporter.** Repro as admin: order **CO260827-00002** (`/#!/workspace/orders?orderId=6bc0acdf-d88d-44d0-b5db-99738863a4f1`) -> Line items -> click row `MIL640X4GLWH` (249.95) -> the line-item **Discounts** widget -> *Discount amount* = `##.##`, while the form field beside it reads `12.50` and `Discount (incl. tax) 15.00`.

**Why it is easy to miss:** of 400 recent orders, **167 carry a line-item discount** and only 46 an order-level one — but **none of the 10 most recent do**. Checking from the top of the order list opens the order-level Discounts blade, which is correct, and leaves the broken widget empty with nothing to mask. Spare repro orders: `CO260827-00001` (29.5), `CO260717-00002` (40), `CO260716-00003` (40).

Admin opens `CO260827-00002` → Line items → item row → Discounts widget and sees **`##.##`** where the payload says `discountAmount: 12.5` and the adjacent line-item form field shows `12.50`. A fully entitled user lost a value they are entitled to. The order-level Discounts grid is unaffected (admin correctly sees `45.00`).

**Mechanism, from the deployed bundle** — this is what makes the diagnosis certain rather than inferred. The mask filter replaces every *digit*:

```js
.filter("showPrice", function(){ return function(e,t){
    var r=/\d/g;
    return r.test(e) && arguments.length>1 && !t && (e=String(e).replace(r,"#")), e }})
```

So the mask preserves digit count. The restricted user's payload carries `0`, which renders `0.00` → **`#.##`**. Admin's payload carries `12.5`, which renders `12.50` → **`##.##`**. The two different mask strings prove the admin's *real* value reached the widget and was masked there — the widget masks unconditionally instead of consulting `withPrices`.

One reassurance that falls out of the same mechanism: there is **no magnitude leak** for the restricted user. The client masks a value the server already zeroed, so the hash count carries no information about the real price.

### N2 — a runaway digest loop on an admin session, not isolated

After one page instance cycled through `agent-test-scoped` → `agent-test-noprices` → `admin`, navigating to an order deep-link produced **49 125 console lines / 10 916 `[$rootScope:infdig]` / 27.6 MB, still climbing seven minutes later** — an order of magnitude worse than the R2 loop that was just fixed (3 295 lines / 184). The watcher signature is ui-grid row/col, not a permission watcher.

**Four targeted probes failed to reproduce it** (fresh-tab admin list 3 errors; fresh-tab admin deep-link 3; admin→admin re-login then list 9; admin→scoped switch then list + blade 10, zero infdig). So: observed and severe, trigger not isolated. Reported as such rather than as a clean repro. Log: `logs/R3-admin-orders-deeplink-console.log`.

Likely related to the account-switching state bleed already recorded in Round 2 (blade state and saved filters are browser-scoped, not user-scoped).

### Also observed

- A 403 deep-link opens an empty "Customer's order" blade with widgets and no data, instead of an access-denied state. Cosmetic; not the old defect.
- `GET api/platform/settings/VirtoCommerce.Platform.UI.WidgetColorMarkers` returns **401** (not 403) for every account including admin, with an unhandled rejection. Pre-existing.
- Under the minimum permission set the shipment blade fires 403s on `api/inventory/fulfillmentcenters/search` and `api/shipping/search` as unhandled rejections rather than handled degradation.

### R3 restore — CONFIRMED DESTRUCTIVE (closed 2026-09-11, was the last open gap)

Done safely on the reporter's suggestion: export a price-free backup as `agent-test-noprices`, strip the archive to **one disposable order**, restore as **admin**. Source review first established the import is a pure upsert (`DoImportAsync` → `DeserializeArrayWithPagingAsync<CustomerOrder>(..., SaveChangesAsync, ...)` — no delete, no truncate), so the blast radius is whatever the archive carries.

| Entity | Before | After |
|---|---|---|
| `AGENT-TEST-RESTORE-3912` Total | **555.55** | **0.00** |
| its line item, Price per item | **555.55** | **0** |
| `CO260909-00002` control | 44.99 | unchanged |
| `CO260827-00002` control | 284.94 | unchanged |
| order count | 1249 | unchanged |

Job log in full, `errorCount: 0`: `Starting platform import... / Importing 'VirtoCommerce.Orders' / Successfully imported 'VirtoCommerce.Orders'`. No warning, no confirmation dialog.

**Root cause** — `if (!await CanReadPrices(user, order)) await RestorePrices(order);`. Restoration runs only when the importing caller *cannot* read prices. A backup is restored by an administrator, who can, so it is skipped and the zeros overwrite the real values. The safeguard protects the caller who does not need it and stands down for the one who does.

**Side effect:** uploading a local file through the Restore drop zone writes it permanently into Backup storage (24 → 25 entries) — upload and stored-archive list are the same storage, so a price-free archive uploaded once is a one-click restore target thereafter.

**Request shape** (not discoverable from the API alone): `POST /api/assets?folderUrl=backups` (multipart) → `GET /api/platform/export/manifest/load?fileUrl=…` → `POST /api/platform/import` (JSON, with `fileUrl` naming the stored asset **and** the full `exportManifest` object; an empty body returns 200 and starts a no-op job).

Cleanup: probe order deleted (count back to 1248). The uploaded 1.7 KB archive could not be removed via any assets/export route — it lives in backup storage, not the assets folder — so it needs manual deletion. It contains one zeroed test order that no longer exists, so restoring it would merely recreate a test order.

### N2 — REPRODUCED on demand (closed 2026-09-11)

Previously "observed, trigger not isolated". Reproduced on the first attempt with the exact account sequence, in **one tab**: store-scoped user → sign out → `agent-test-noprices` → sign out → admin → order deep-link.

| Reading | Console lines | `infdig` | Size |
|---|---|---|---|
| baseline | 46 | 0 | 8 KB |
| after deep-link | 2 669 | 582 | 1.94 MB |
| +60 s idle | 3 520 | 782 | 2.62 MB |
| after 2m20s | **19 228** | **4 272** | **14.3 MB** |

Grows ~3 000 lines / 2.2 MB per 20 s **while idle**; stops only on navigating away.

**Control that isolates it:** fresh tab, *same browser context, same admin session, same deep-link* → **5 lines, 0 `infdig`**. So the cause is the page instance's accumulated state across successive in-tab sign-ins — not the account, order, store or URL. That is why the four earlier probes (all fresh-tab or single re-login) were clean and this was nearly written off as noise.

**What loops:** the orders list grid *underneath* the blade. Two watchers only, paired 34 176 times each — `fn: r` and `fn: function(){return u.row+","+u.col}` (ui-grid row/col, `dist/vendor.js`, AngularJS 1.8.3). Not a permission watcher.

**Hypothesis for the fix:** one re-login is insufficient (admin→admin probe clean), so it likely needs ≥2 sign-in cycles *with a permission-scope change* — stale ui-grid column/scope state from the narrow role surviving sign-out and still live when the wider role re-renders the grid.

Evidence: `logs/R6-A1-*`, `screenshots/R6-A1-infdig-loop-reading1.png`.

---

## Round 4 — build `-fb82`, both remaining defects fixed (2026-09-11)

Pin bump to `-fb82` had been reverted by an unrelated commit (`2d783c8`, a ProfileExperienceApi bump, overwrote the Orders line while editing the same file). Re-pinned in `ecb5934`; deploy green 15:23, module live 15:24.

| # | Defect | State |
|---|---|---|
| R1 · R2 · P1 · P2 | store scope · digest loop · payment/shipment · discounts | Fixed, verified (round 3) |
| **N1** | line-item Discounts widget masked for everyone | **FIXED** — admin now sees `12.50`, restricted user `#.##` (a masked zero, not over-masked). Widget and the form field beside it agree. |
| **R3** | price-free backup destroyed prices on restore | **FIXED** — probe order kept `777.77` through the same export→strip→restore-as-admin cycle that took `555.55 → 0.00` on `-0fac`. Controls and count unchanged. Fix reads the payload flag: `if (!order.WithPrices \|\| !await CanReadPrices(user, order))`. |
| P4 | sorting reveals the ranking | Accepted as `Ignore`; `ORDA-107` retired from suite 017 so it does not sit as a standing red |
| P3 | invoice prints `Total: /usr/bin/bash` under a partial grant | **Open — product decision pending**, not a code question |
| N2 | blade context not cleared on sign-out | Moved out to **VCST-5952** (platform, Sprint 26-18, assigned to the developer) |

Two false alarms cleared during the N1 check by comparing accounts on the same surface: the order-blade `Discount` `#` is an empty-field placeholder (identical for both users), and the empty Name/Coupon cells are the real data shape.

Still not covered: the storefront/xAPI order surface — the persona has no orders and an order created for it is refused by the resolver (`Access denied`) on customer-identity binding. A stand fixture problem, not a PR problem.

### Final state (2026-09-11)

All findings in scope of VCST-3912 are fixed and verified on `3.1015.0-pr-472-fb82`: R1 store scope, R2 digest loop, P1 payment/shipment, P2 discounts, N1 discounts widget, R3 backup restore.

Out of the ticket: **P3** (invoice) — **Keep as Is**, accepted: the download gate is the control, and masking inside a PDF is not wanted · **P4** (sorting reveals the ranking) — accepted by the developer as `Ignore` · **N2** (blade context not cleared on sign-out) — filed as **VCST-5952**, platform, Sprint 26-18.

**Nothing is left unverified.** The storefront/xAPI surface, previously listed as a gap, is out of the change's reach by construction: the PR registers the protection service under its own interface (`ICustomerOrderDataProtectionService`) and leaves `ICustomerOrderService` / `IIndexedCustomerOrderSearchService` pointing at the raw implementations, so anything injecting those — xAPI included — is untouched. Case `ORD-GQL-014`, authored against that hypothesis, now has a void premise and should be retired (proposal only; retirement is a human call, TRI-006).

### Regression coverage — final shape

The cases authored in round 1 (`ORDA-104`..`ORDA-122`) needed **no rewriting after the fixes**. They were written under the rule that a row may not certify a defect: each asserted the correct, specification-derived expectation with the suspected defect named only in `Failure_Signals`. So the same rows that were RED against the broken build are the rows that guard the fixed one.

Three cases added for what the fix round introduced:

| Case | Guards |
|---|---|
| `ORDA-123` | `order:invoice:download` gates the invoice independently of `order:read_prices` — three roles (neither / download only / both), endpoint status and toolbar visibility must agree |
| `ORDA-124` | Restoring a backup exported without prices must not overwrite stored prices — the data-destruction guard, with control orders to prove the import stayed a per-entity upsert |
| `ORDA-125` | A user **with** `order:read_prices` sees real amounts in the line-item Discounts widget — the over-masking direction, which is how that surface failed once already |

All 22 are `Draft`. Promotion to `Automated` needs a suite-runner pass; this run exercised them ad hoc (direct API comparison and two browser sessions), which proves the behaviour but is not the runner evidence `5g` requires.

Proposed retirement: **`ORD-GQL-014`** in suite 050c — its premise is void, since the PR leaves `ICustomerOrderService` pointing at the raw implementation and the storefront surface is out of the change's reach. Retirement is a human call (TRI-006), so it is proposed rather than applied.

### Case state after the run and the edits

| | |
|---|---|
| **Automated** | 17 - ORDA-104, 105, 106, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 123, 124, 125 |
| **Draft** | 0 |
| **Retired** | 5 - ORDA-107, ORDA-119, and the client-timing trio ORDA-120 / 121 / 122. Reasons below; none was removed for being red |

`ORDA-115` was held by the promoter on GRD-001 for carrying a `{HYPOTHESIS}` assertion, then grounded against `BL-AUTH-017` and the two null guards in `dfa3864`, and promoted.

Localization check: `order:invoice:download` has a label in **all 10 locale files** (de, en, es, fr, it, ja, pl, pt, ru, zh), alongside `order:read_prices` in the same `permissions` block.

### Why ORDA-112 was BLOCKED, and what replaced it

The case asked for an export with no HTTP user. Tracing the code settled both halves of that question.

**The mechanism is real and named.** `HangfireUserContextMiddleware` (module `VirtoCommerce.BackgroundJobs`) stamps the enqueuing user onto the job as a client filter and restores it on the worker as a server filter - which is why a background export acts with the rights of whoever started it. For a **recurring** job that same filter substitutes the literal `system:<recurringJobId>`, which is not a real account: `GetCurrentUser()` fails `FindByNameAsync`, `CanReadPrices(null, order)` returns `false`, and every price is stripped.

**Nothing triggers it.** `vc-module-backup-restore` registers no `RecurringJob` and schedules nothing - both export and restore are `[HttpPost]` actions that enqueue from inside the request. The platform has no export controller or job of its own. Of the 26 handlers the BackgroundJobs module registers, the five Orders ones are AdjustInventory, CancelPayment, LogOrderChanges, RefundChanged and SendOrderNotifications; the only export-shaped handlers are Sitemap's, and `ModuleBackgroundJobHandler` is `triggerable: false`.

So the case was testing a hazard with no shipped trigger, which can never run. It was rewritten onto the reachable premise that guards the same regression: **the same export, taken by two users, must diverge.** Re-run as `REG-2026-09-11-1935`, PASS.

| | Orders in archive | `withPrices` | `CO260827-00002` total | item price |
|---|---|---|---|---|
| admin (job 95329) | 1251 | `true` x1251 | **284.94** | 249.95 |
| `agent-test-noprices` (job 95331) | 1251 | `false` x1251 | **0.0** | 0.0 |

The live privileged read of that order was 284.94 before and after both exports. A price-free **admin** archive would now be the visible symptom of a lost identity on the worker.

One thing the trace also closes: the protection decorator is registered under its own interface (`ICustomerOrderDataProtectionService`), not as the implementation of `ICustomerOrderService`. Notification, indexing and event handlers keep resolving the plain services, so none of them can be silently price-blinded by the user who happened to enqueue them.

### ORDA-119 - removed, the condition it asserted is not satisfiable

Reframed off the unreachable system-context premise onto a reachable one - restore a price-blind archive where the orders do **not** already exist - it was run once end to end on a disposable order, and the run is what retired it.

| | before | after the restore |
|---|---|---|
| `AGENT-TEST-ORDA119-3912` total | 888.88 | **0** |
| line-item price | 888.88 | 0 |
| `withPrices` | `true` | **`true`** |

Restore job 95363, `errorCount: 0`, "Platform restore process completed successfully". Controls `CO260827-00002` (284.94) and `CO260909-00002` (44.99) unchanged, order count back to its pre-case value, disposable order deleted.

**But there is no defect to assert here.** The archive carries zeros and the order no longer exists in storage, so the real amounts exist in neither place. `RestorePrices` reads the stored counterpart through `crudService.GetByIdAsync(order.Id)`; with nothing stored, no implementation could recover 888.88. The case demanded the impossible.

What the run does establish is a **configuration rule, not a code defect**, and it is the same shape as P3: a user holding `platform:backuprestore:backup` without `order:read_prices` produces a backup that silently omits every price, the restore accepts it reporting success, and the restored zeros read back with `withPrices: true` - the flag is computed per response, not stored, so a withheld zero and a real zero become indistinguishable. The loss is irreversible from the moment such a backup is taken. Grant backup rights and `order:read_prices` together, exactly as `order:invoice:download` is to be granted with it.

The same reasoning is why `ORDA-110` scopes restore-on-write to an existing order: the architecture doc's own rule #2 - *"a new entity has no stored counterpart and needs no restore"* - puts a created entity out of scope by design.

### ORDA-120 / 121 / 122 - the client-timing trio, retired together

All three came from a mechanical archetype sweep - *what if the blade is deep-linked, refreshed, or its dependency fails* - rather than from a fault model of this feature. For price protection the answer to all three is the same **by construction**: the server strips prices before the response leaves, so the browser never holds a real value that any timing, cache, fault or race could reveal.

That is why the runs looked the way they did. `ORDA-120` passed, but its decisive evidence was the wire payload (`withPrices: false`, every amount `0`, no `284.94` or `249.95` anywhere), not the UI - and that property is exactly what `ORDA-113` already asserts directly, at the source. `ORDA-121` is the same argument in different words. `ORDA-122` could not fail at all: with the order request failing there is no order object, so "no price rendered" is vacuously true; and its cache clause ("no stale real price") cannot fail for a role the server never sends a real price to.

A case that cannot fail against a broken implementation is not coverage, so all three were removed rather than carried as permanent green or permanent Draft.

**What was genuinely observed along the way is kept as an observation, above:** deep-link, refresh and a 404 fault all held masking. Two incidental findings from those runs, neither filed and neither about this feature:

- Deep-linking a non-existent order id returns `404` and the blade opens an empty, editable "Customer's order" form with no error and no not-found state, logging `Possibly unhandled rejection ... platform.errors.generic-error`.
- On a cold deep-link the localization resolves differently than after normal navigation (status `New` vs `New en1`, date `2026年8月27日` vs `Aug 27, 2026`) - the known i18n-on-cold-start issue, not a masking defect.

**One tooling fact worth keeping**, because it will block the next person who tries fault injection: patching `XMLHttpRequest` / `fetch` from inside the page is refused by this repo's `enforce-real-user.mjs` hook, which allows only read-only `browser_evaluate` payloads. The constraint is on scripted page mutation, not on which MCP server issues it, so `evaluate_script` on the Chrome DevTools lane is matched too. Real fault injection needs the transport level - Playwright `page.route` in a scripted runner, or DevTools request blocking.
