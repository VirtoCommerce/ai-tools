# VCST-5589 — Fix Verification: Sales Rep statistics `cache-and-network` fetch policy

**Verdict: PASS — fix confirmed working.** 1 in-scope follow-up finding (F1, Medium), 5 informational.

**Env:** vcptcore-qa @ storefront theme `2.55.0-pr-2412-f845-f845476f`, Platform `3.1053.0-pr-3092-cc76`, store `B2B-store`
**Browser:** playwright-chrome (1920×1080) · **Date:** 2026-08-03 · **Rep:** `@td(SR_REP_PRIMARY.email)` (4 served orgs)
**Evidence:** `screenshots/` · GraphQL payloads `graphql-evidence.json` (no Authorization headers/tokens captured)

## 1. The decisive observable — refetch-on-mount

Measured with `browser_network_requests` per client-side navigation cycle. The proof is that **the request
variables are byte-identical to the previous request** (day-stable windows, e.g. `mtdTo=2026-08-03T23:59:59.999Z`)
**yet a fresh POST fires anyway** — impossible under the pre-fix `cache-first`, which would have been a pure cache hit.

| Surface | Cycle | `…OrderStatistics` | `…CartStatistics` | `…CustomerCounts` | Vars identical to prev? |
|---|---|---|---|---|---|
| `/company/dashboard` | 1 (req 185–187) | 1 | 1 | 1 | ✅ all 3 |
| `/company/dashboard` | 2 (req 235–237) | 1 | 1 | 1 | ✅ all 3 |
| `/company/dashboard` | 3 (req 245–247) | 1 | 1 | 1 | ✅ all 3 |
| `/company/dashboard` | 4 (req 253–255) | 1 | 1 | 1 | ✅ all 3 |
| customer profile | 1 (req 215–216) | 1 | 1 | n/a¹ | ✅ both |
| customer profile | 2 (req 261–262) | 1 | 1 | n/a¹ | ✅ both |
| customer profile | 3 (req 270–271) | 1 | 1 | n/a¹ | ✅ both |

¹ `salesRepCustomerCounts` is dashboard-only — correctly absent on the profile.
**Negative control** `salesRepTopSellers` (untouched op): **0 refetches** on every remount — unchanged `cache-first`. Recorded as expected.

## 2. Phase B checks

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Dashboard loads; every KPI matches the backend response exactly | **PASS** | New orders 1/$133.20/0 today · Active carts 0/$0.00/0 · WEEK 0 · MTD 0 · YTD 1/$133.20 · My customers 4/0/0 — all equal to `newOrders`/`activeCarts`/`week`/`mtd`/`ytd`/`assignedCustomers`+`thisMonth`. `C1-dashboard-initial.png` |
| 2 | SPA away→back fires a fresh request per op; values consistent | **PASS ×4** | §1. Only 3 requests fire — no over-fetch |
| 2a | `VcLoaderOverlay` covers the refetch | **NOT OBSERVABLE** | Round-trip (~200–400 ms) completes faster than a tool tick; no overlay ever captured. The card shows its cached value immediately, then reconciles. See F2b |
| 3 | Customer profile: fresh request + correct values on remount | **PASS ×3** | ACME MTD $0.00 / YTD 1 $133.20 / AOV $133.20 = `mtd`/`ytd`/`ytd.average`. `C1-profile-acme.png` |
| 4 | Customer switching — no cross-customer bleed | **PASS ×3** | ACME→AcmeWest→(ACME)→TechFlow→ACME. Each fires its own `organizationId`; AcmeWest & TechFlow render all-zeros, ACME re-renders $133.20. `C1-profile-acmewest-no-bleed.png` |
| 5 | Period/window filter → fresh request with new window vars | **BLOCKED** | **No period control exists on either surface on this build.** Dashboard exposes fixed WEEK/MTD/YTD tiles + order-status chips + Top-sellers category chips/sort; profile exposes category chips + Units/Revenue sort only. Confirms 091 SR-CP-033's `BLOCKED-BY-BUILD` note, and extends it to the dashboard |
| 5a | *Substitute lever:* Top-sellers category chip | **PASS** | Chip → exactly 1 new `SalesRepTopSellers` (new `filter` var); the 3 statistics ops correctly do **not** refire |
| 6 | **Data change reflected without F5** | **PASS (bidirectional)** | Admin SPA (2nd tab, storefront tab never reloaded): order `CO260716-00001` status **New → Processing** → SPA nav cycle → "New orders" **1 → 0 / $133.20 → $0.00**. Reverted **Processing → New** → cycle → **0 → 1**. Request 245 carried variables identical to 142 and returned the *new* `newOrders.count: 0`. `datachange-kpi-fresh-list-stale.png` |
| 6a | Backend-side statistics cache staleness (PR author's flagged risk) | **NOT REPRODUCED** | The fresh request returned the updated value immediately (no wait, no reindex delay) in both directions. No backend cache issue |

## 3. Scoped regression

**`093-sales-rep-hub-dashboard-storefront.csv`**

| ID | Result | Note |
|---|---|---|
| SR-HD-001 | **PASS** | Hub at `/company/dashboard`, distinct from buyer `/account/dashboard`; all widgets render, `/graphql` 200, `errors[]` empty |
| SR-HD-004 | **PARTIAL** | Container + count + total ✅ and **traceable to real data** (resolves the case's real-vs-mock `{HYPOTHESIS}`: values are real). AOV is **not** rendered on the dashboard tile → see F2 |
| SR-HD-005 | **DESIGN-CONFIRM** | No $/% period-over-period indicator on the dashboard tiles, though the response carries `weekVsPrevWeek`/`mtdVsPrevMonth`/`ytdVsLastYear`. No NaN/Infinity/raw null anywhere → see F2 |
| SR-HD-006 | **PASS** | Active carts 0 / $0.00 = `activeCarts.count`/`total`, filter `active-carts` |
| SR-HD-007 | **PASS** | assigned **4** (matches rail badge), ordering 0, new 0 |
| SR-HD-008 | **PASS** | Top Sellers renders 1 row ≤5, name/SKU/image/units. Negative control: no refetch on remount |
| SR-HD-012 | **BLOCKED** | No period control on this build (Phase B #5) |
| SR-HD-014 | **BLOCKED** | Requires forcing a widget's GraphQL request to fail. No route-interception tool in the playwright-chrome MCP surface, and `browser_evaluate`/`run_code_unsafe` are barred by the real-user rule. *Partial signal:* two unrelated ops (`GetSlugInfo`,`GetOrders`) failed `ERR_CONNECTION_CLOSED` during rapid nav and the page stayed interactive with no crash — see F5 |
| SR-HD-016 | **PASS** | Rendered Active Projects count **0** = API `count` **0**, exact |
| SR-HD-017 | **PASS** | Rendered 4/0/0 = API `assignedCustomers` 4 / `thisMonth.orderingCustomers` 0 / `newCustomers` 0, exact |

**`091-sales-rep-customer-profile-storefront.csv`**

| ID | Result | Note |
|---|---|---|
| SR-CP-015 | **PASS** | Sales-widgets container present on the same profile route; **values are real**, traceable to `salesRepCustomerOrderStatistics(organizationId)` — resolves the case's real-vs-mock flag |
| SR-CP-020 | **PASS** | All sections reach rendered state; `salesRepCustomer`/`salesRepOrders` 200, `errors[]` empty; no app-origin console error |
| SR-CP-028 | **PASS** | MTD tile $0.00 = `mtd.total.formattedAmount` (correct — the only order is dated Jul 17, today is Aug 3) |
| SR-CP-029 | **PASS** | YTD 1 / $133.20 + AOV $133.20 = `ytd.count`/`total`/`average`; YTD ≥ MTD holds |
| SR-CP-030 | **DESIGN-CONFIRM** | Tile shows `0% of YTD` (a share-of-YTD ratio, correct math, no NaN) — **not** the period-over-period $ + % change the case asserts. Same gap as SR-HD-005 → F2 |
| SR-CP-033 | **BLOCKED** | Confirms the case's own `BLOCKED-BY-BUILD` precondition — no period control on the profile Top-sellers block |
| SR-CP-035 | **PASS** | Rendered MTD total == API `mtd.total.formattedAmount`, exact, no stale cache |

**`cache-and-network`-specific regression risks**

| Risk | Result |
|---|---|
| Request storm / refetch loop | **PASS** — 35 s idle on the dashboard → **0** `/graphql` requests |
| Loading flicker (empty/placeholder flash on remount) | **PASS** — first observation after remount already shows the cached value; never an empty state |
| Values still correct vs backend payload | **PASS** — SR-HD-016/017 and SR-CP-035 all exact |
| Console / network clean | **PASS** — all 58 `/graphql` POSTs **200**, `errors[]` empty. No TypeError, no unhandled rejection. Only known noise (F4/F5) |
| Non-sales-rep surfaces unaffected | **PASS** — buyer `/account/dashboard` (proper "There are no orders yet" empty state) and `/account/orders` (order + status) render normally |

## 4. Findings

**F1 — Medium — the same widget-vs-list contradiction survives, with polarity inverted.** After the Admin status
change and an SPA nav cycle, the dashboard shows **"New orders 0 / $0.00"** while the **Recent orders table
directly below it still shows `CO260716-00001` with status "New en1"** — because `salesRepOrders` was not
included in the fix and stays `cache-first` (network evidence: only requests 245/246/247 fired; no
`SalesRepOrders`). Screenshot `datachange-kpi-fresh-list-stale.png`. This is *not* a failure of VCST-5589
(the ticket scoped exactly three ops, and all three are correct), and it is *not* the out-of-scope
already-on-screen case (this is a genuine remount). It is the residual half of the user-facing symptom the
ticket set out to remove. Recommend a follow-up extending `STATISTICS_FETCH_POLICY` — or an equivalent —
to the sibling list ops (`salesRepOrders`, and consider `salesRepTopSellers`, `salesRepCustomer`).

**F2 — Info — dashboard/profile tiles do not surface data the API already returns.** No AOV and no
period-over-period $/% change on the dashboard tiles (SR-HD-004/005); the profile MTD tile shows
"% of YTD" instead of a period-over-period % (SR-CP-030). The payload carries `average`,
`totalChange`, `totalChangePercent`, `countChange` for all three comparison windows. Either the UI should
render them or those three `{SPEC}` assertions should be corrected to the implemented design. No NaN /
Infinity / raw `null` was rendered anywhere, so the graceful-degradation half of those assertions holds.
**F2b — Info** — no refreshing indication during the in-flight window: the tile presents the cached figure
as current until the response lands. Correct `cache-and-network` UX and it avoids a flicker regression, but
it is the opposite of the "overlay covers the refetch" expectation. Worth a product decision, not a defect.

**F3 — Info — possible `salesRepTopSellers` revenue arithmetic issue (untouched op, pre-existing).**
Top Sellers reports **1 unit, Revenue $233.00** for the only order in the data set, whose total is **$133.20**
(and whose `ytd.total`/`average` are both $133.20). Line revenue exceeding the whole order total looks wrong
(list-vs-sale price, or a discount not applied). Outside this fix's blast radius; flagged for whoever owns
VCST-5368.

**F4 — Info — pre-existing env noise, excluded from pass/fail.** `dc.services.visualstudio.com/v2/track` 400
"Invalid workspace" (known); catalog image 404s (`cms-content/assets/...`, `ikea.com`); a service-worker
`404 when fetching the script`; `[WebSocket] Connection closed {code: 1006}`.

**F5 — Info — two aborted `/graphql` requests.** `GetSlugInfo` and `GetOrders` failed `ERR_CONNECTION_CLOSED`
(+3 Apollo warnings) when navigating away before they resolved — a benign in-flight navigation abort.
Neither is one of the three statistics ops; those had zero failures across the session.

**Confirmed by design (not defects), per the dev's stated scope:** no post-mutation cache eviction, and no
polling — 0 requests during 35 s idle; a widget already on screen does not live-update until the rep
navigates back.

## 5. Test-data / account notes

- **`belovedushka@gmail.com` is NOT a Sales Rep on vcptcore-qa** — it is a *buyer* (left rail shows
  Corporate ▸ *Sales reps*, i.e. the buyer-side "my reps" page). `/company/dashboard` route-guard-redirects it
  to `/account/dashboard`. Verification used the seeded `@td(SR_REP_PRIMARY.email)` instead. The
  `reference_sales_rep_storefront_login` memory should be corrected.
- **Teardown complete.** Order `CO260716-00001` status restored to its original **New en1** and re-verified
  from the storefront (buyer orders list + KPI back to 1). No other data mutated; no test accounts created.
- **Seed thinness limits depth:** 1 order (Jul 17, $133.20), 0 carts, 1 product, only 1 of 4 served orgs has
  orders. Enough for exact cross-layer matching and the New→Processing lever, but MTD/WEEK/comparison windows
  are all zero, so non-zero comparison rendering and multi-value ranking were not exercised.

---

## Re-verification 2026-08-03 (post-seed)

**Same env/theme/browser as above** (theme `2.55.0-pr-2412-f845-f845476f`, playwright-chrome, rep `@td(SR_REP_PRIMARY.email)`).
Oracle re-run: `TEST_ENV=vcptcore npm run sales-rep:stats` @ 15:09Z. **All rendered figures below were cross-checked against
the UI's own live GraphQL response bodies** (captured via `browser_network_request`), not only against the probe — stronger evidence
than the pre-seed pass. Screenshots: `screenshots/POSTSEED-*`.

> The pre-seed numbers above are the historical record of the fix verification and are unchanged. The data changed afterwards.

### F2 resolved — the AOV half is CORRECTED, the comparison half is CONFIRMED

The decisive new evidence is the **request document**, not the values. Live `SalesRepCustomerOrderStatistics` (dashboard req 205/207, profile req 175) **asks for**
`mtd.average`, `ytd.average`, and all three `comparison` blocks (`totalChange{formattedAmount} totalChangePercent countChange countChangePercent`).

| F2 sub-claim | Pre-seed verdict | Post-seed verdict | Evidence |
|---|---|---|---|
| No AOV on **dashboard** tiles | gap | **CONFIRMED gap** | Query requests `mtd.average`; response returns `$215.22` (and `ytd.average $207.02`). **No dashboard tile renders either.** Six tiles observed: New orders / Active carts / Orders placed WEEK/MTD/YTD / My customers |
| No AOV on **profile** | F2 wording implied profile too | **CORRECTED — AOV IS rendered** | Profile has a dedicated tile **"Avg order value / $105.03 / Average per order (YTD)"** = `ytd.average.formattedAmount` exactly. F2 should be re-scoped to *dashboard-only* |
| No period-over-period $/% indicator | gap, but confounded by all-zero data | **CONFIRMED gap — no longer confoundable** | The comparison blocks return **non-null `totalChange`** (`$1,937.00` / `$1,937.00` / `$2,070.20`) and **non-null `countChange`** (9 / 9 / 10). Percents are legitimately NULL (BL-SR-003). **None of the six non-null values render anywhere.** So the gap is *not* a null-percent artefact — an unambiguous signed $ change is fetched and discarded |

**Discriminator 2 (the carts +100%) — answered, but not the way the brief expected.** The tile I looked at is **"Active carts"** (the dashboard's Active-Projects tile). It renders exactly three things: **`2`**, **`$37.00`**, **`2 new this week`**. That third line is **`newCartsThisWeek.count` = 2** (a period count), **not** a change indicator — it is not `+1` and not `100%`. Two independent reasons the +100% cannot reach the UI:

1. **`SalesRepCustomerCartStatistics` does not request `comparison` at all** — the live document asks only for `activeCarts: period(filter)` and `newCartsThisWeek: period(from,to,filter)`. No comparison field is selected, so no change indicator is renderable by construction.
2. **The probe's +100% is an artefact of a wider window than the UI uses.** The UI sends `prevWeekFrom/To = 2026-07-27T00:00:00Z .. 2026-07-27T23:59:59.999Z` (one day — same elapsed length as week-to-date, since Aug 3 is a Monday), whereas the probe used the full previous week `Jul 27 .. Aug 2`. The prior cart is dated **Jul 28**, i.e. outside the UI's own prevWeek. Under the UI's window prevWeek = 0, so the percent would be NULL there too.

**Net:** F2's comparison claim stands as a **real UI gap**, proven by the *order* tiles (non-null $/count changes fetched, none rendered) rather than by the cart +100%, which never reaches the client. The earlier report was not unfair on this point.

### Priority 1 and 2 — case results

Rendered value vs live payload value. `093-sales-rep-hub-dashboard-storefront.csv`:

| ID | Result | Rendered | Payload | Note |
|---|---|---|---|---|
| SR-HD-004 | **PARTIAL** | New orders **6** / **$515.20** / **5 placed today**; Orders placed MTD **9 / $1,937.00**, YTD **10 / $2,070.20** | `newOrders` 6/$515.20, `newOrdersToday` 5; `mtd` 9/$1,937.00; `ytd` 10/$2,070.20 — all **exact** | Count + total exact and traceable to real data (`{HYPOTHESIS}` resolved: **real, not mock**). **AOV not rendered** on any dashboard tile though `average` is fetched → F2 |
| SR-HD-005 | **DESIGN-CONFIRM** (gap) | no $ or % comparison indicator on any tile | `totalChange $1,937.00`, `countChange 9`, percents NULL | Graceful-degradation half **PASS**: no `NaN`/`Infinity`/raw `null` anywhere (regex scan of the a11y tree). Also **no placeholder** (dash / `N/A`) — the comparison area simply does not exist |
| SR-HD-006 | **PASS** | Active carts **2** / **$37.00** | `activeCarts.count 2`, `total $37.00`, `filter "active-carts"` | Exact |
| SR-HD-007 | **PARTIAL** | My customers **4** / **4 ordered this month** / **0 new customers** | `assignedCustomers 4`, `thisMonth.orderingCustomers 4`, `newCustomers 0` — exact | Three values exact; **MoM change indicator absent** — the `SalesRepCustomerCounts` document does **not** select `comparison` at all |
| SR-HD-008 | **PASS** | 5 rows, units desc **42 / 12 / 8 / 4 / 1** with name+SKU+image/placeholder | by-units #1 `151349` (42/$266.67) … #5 `6022122` (1/$233.00) | ≤5 rows; matches oracle rank/name/sku/units/revenue exactly; no `organizationId` sent (cross-customer) |
| SR-HD-009 | **PASS** | **list visibly re-ranked**: #1 `2200133715163` Hermitage $846.67, #2 `41MY01` $523.66, #3 `5999086456519` $300.00, #4 `151349` $266.67, #5 `6022122` $233.00 | `sort:"by-revenue"`, `take:5` (req 211) | #1 and #4 **swapped** exactly as the oracle predicted. `POSTSEED-topsellers-by-revenue.png` |
| SR-HD-011 | **PASS** | "Bolts" chip → list narrows **5 rows → 1** (`41MY01`, 8u/$523.66), rank renumbered to 1 | `filter:"02fe37dcaeb2458a831011abe43fd335"` (req 214) | Chips carry localized labels, not raw i18n keys or rule ids |
| SR-HD-014 | **BLOCKED** | — | — | See below — better-founded reason than the pre-seed one, and **no env mutation performed** |
| SR-HD-016 | **PASS** | **2** | `activeCarts.count` **2** | Exact, no stale cache |
| SR-HD-017 | **PASS** | **4 / 4 / 0** | `assignedCustomers 4` / `orderingCustomers 4` / `newCustomers 0` | All three exact |

`091-sales-rep-customer-profile-storefront.csv` — org `AGENT-TEST-Org-AcmeCorp-20260310` (`105c2c4e-…`). Profile tiles observed: New orders **3 / $295.20 / 2 placed today** · Active cart **$25.00** · Purchased·MTD **$497.00 / 79% of YTD** · Orders placed·YTD **6 / $630.20** · Avg order value **$105.03 / Average per order (YTD)**.

| ID | Result | Rendered | Payload | Note |
|---|---|---|---|---|
| SR-CP-028 | **PARTIAL** | MTD tile: **$497.00** + "79% of YTD" only | `mtd` count **5**, total **$497.00**, average **$99.40** | Total exact. The MTD tile shows **no count and no AOV** — `mtd.average $99.40` is fetched and discarded; the AOV tile is **YTD**-based, not MTD. Two of three assertions unmet *on that tile* |
| SR-CP-029 | **PASS** | YTD tile **6 / $630.20**; AOV **$105.03** in the adjacent tile | `ytd` count 6, total $630.20, average **$105.03** | All exact. YTD $630.20 >= MTD $497.00. AOV lives in a sibling tile rather than "the same tile" — acceptable reading of the assertion |
| SR-CP-030 | **DESIGN-CONFIRM** (gap) | MTD tile shows **"79% of YTD"** (497.00/630.20 = 78.9% → correct math) | `totalChange $497.00`, `countChange 5`, percents NULL | A **share-of-YTD ratio**, not the period-over-period $+% the case asserts — unchanged from pre-seed, now with a **non-null $497.00 change available and still unrendered**. Graceful half **PASS** (no NaN/Infinity/null) |
| SR-CP-031 | **PASS** | 4 rows, units desc **5 / 2 / 1 / 1**: `41MY01` $303.66, `151349` $126.67, `6022122` $233.00, `2200133715163` $66.67 | identical rank/name/sku/units/revenue (req 182) | ≤5 rows, snapshot-sourced names/SKUs |
| SR-CP-032 | **PASS** | re-ranked by revenue: `41MY01` $303.66, **`6022122` $233.00**, `151349` $126.67, `2200133715163` $66.67 | `sort:"by-revenue"` | Rows **2 and 3 swap**; Revenue header goes `[active]` |
| SR-CP-035 | **PASS** | MTD total **$497.00** | `mtd.total.formattedAmount` **$497.00** | Exact, no stale cache |

### Priority 3 — the two blocked checks

**SR-HD-014 — BLOCKED (deliberate; no env change made).** I did **not** revoke the rep's permission or org membership. Reasoning: **no admin-side lever can produce the fault this case specifies** — one widget's op failing while its siblings succeed. All four sales-rep ops share one scoped endpoint and one auth scope, so (a) revoking the sales-rep permission/role fails *all* of them and route-guards the hub away (that tests gating, a different assertion, and makes "the OTHER widgets still render" unverifiable by construction), while (b) removing org membership only changes the *data* — the ops still return 200 with different numbers, no error path at all. On a shared env a role-permission mutation also has blast radius beyond this session (the other seeded reps, the 050m/091/093 suites, any parallel agent), and restoring a permission set is not atomic. Recommendation: **re-home this assertion as a vitest component test with a mocked erroring Apollo link**, or re-scope it to the page-level empty state below.

*Zero-risk partial signal obtained instead:* navigating to a profile URL for an org the rep does not serve (`/company/my-customers/00000000-1111-…`) renders a **graceful localized empty state — "Customer not found or not in your customers." + "Back to my customers"** — with the left rail fully intact; I clicked a rail link afterwards and it navigated normally. No stack trace, no blank area, no crash, no app-origin console error. This covers SR-HD-014's *spirit* (graceful degradation + rail stays interactive) on the resolver-returns-null path, but **not** the request-failure path. `POSTSEED-SRHD014-partial-graceful-not-found.png`

**Loader overlay (`VcLoaderOverlay`) — NOT OBSERVABLE.** Retried 5x with the larger payload (9 orders / 5 ranked products): after an SPA remount, after a by-revenue sort, after a category chip, and after a **cold hard page load** (no cache at all — the strongest case). Each time an immediate a11y-tree regex scan for `loader|loading|skeleton|spinner|progressbar|animate-pulse` returned **no matches**; tiles showed their value with no intermediate empty/placeholder state. Two limitations I cannot separate with real-user tooling: the round trip completes inside one tool tick, **and** a purely visual overlay carrying no `role`/`aria-busy`/text would not appear in the a11y tree even if present. So this is reported as NOT OBSERVABLE, not as absent. Ticket expected-result #4 ("a loading indicator during the refetch") therefore remains **unconfirmed either way** and needs a component-level or video/trace check.

### Priority 4 — the two open questions

**F3 — RESOLVED, and it is NOT an arithmetic bug.** Opened `CO260716-00001` (`/account/orders/574f6f59-…`) and read the line item directly. `POSTSEED-F3-order-CO260716-00001-lineitem.png`

| Field on the order | Value |
|---|---|
| Line item | DOUWE EGBERTS COCOA FANTASY BLUE BAG 1.0KG, `original_sku` **6022122** |
| **Price per item** | **$233.00** |
| **Quantity** | **1** |
| Line total shown | **$186.40** (with **$233.00** struck through) · line "Subtotal: $186.40" |
| Order summary | Subtotal **$233.00** · Discount **- $149.80** · Tax $0.00 · Shipping **+ $50.00** · **Total $133.20** |

So `salesRepTopSellers.revenue` = **list price x qty = $233.00 x 1**, i.e. the **extended line price gross of discount**. The order total is lower ($133.20) purely because of the $149.80 discount less $50.00 shipping — `233.00 - 149.80 + 50.00 = 133.20`, so BL-CHK-006 holds. This also explains the aggregate: ACME's Top-Products revenue sums to **$730.00** vs its order totals **$630.20**, a **$99.80** gap = exactly that order's `149.80 - 50.00`. **Arithmetic is correct; the definition is the open question.** BL-SR-008 says only "`revenue` is Money" and does not state gross-vs-net, so nothing is violated as written. **Recommend clarifying BL-SR-008** on whether `revenue` should be net of discounts — a "Revenue" column reporting gross list price overstates revenue whenever a promotion applies. Reclassify F3 from "possible arithmetic issue" to **definitional / spec-clarification (Info)**.

**Empty cart counted as active (BL-SR-006) — displayed count is consistent; the API-level concern persists in dated windows.** Active Projects renders **2**, and both contributing carts are genuinely non-empty (`ORG-001 $25.00`, `ORG-004 $12.00`, sum `$37.00`). **So the displayed count matches the number of non-empty carts — no UI-visible violation.** The tile is fed by the *undated* `activeCarts: period(filter:"active-carts")`, which returns 2/$37.00. The concern lives in the **dated** windows: the probe reports `prevWeek` **count 1 / total $0.00** and `ytd` **count 4 / total $37.00** — 4 carts but only 2 carrying value. That is consistent with BL-SR-006's violation signal ("empty carts counted as active"), but a currency-scoped total (a non-USD cart counting while contributing $0.00 to a USD total) is an alternative explanation I cannot exclude from the storefront. Either way this is a **backend contract question for `salesRepCustomerCartStatistics`, not a storefront UI defect** (VCST-5100 lesson) — route to the xAPI layer with an API-level probe of the 2 zero-value YTD carts.

### VCST-5589 sanity check with richer data — still holds

One SPA away-and-back cycle (`/company/dashboard` → `/company/my-customers` → back) fired **exactly 3** `/graphql` POSTs — requests **207 / 208 / 209** = `SalesRepCustomerOrderStatistics`, `SalesRepCustomerCartStatistics`, `SalesRepCustomerCounts` — with **variables byte-identical** to the earlier requests in the same session (day-stable windows, e.g. `mtdTo=2026-08-03T23:59:59.999Z`), so a genuine network hit under `cache-and-network` on an identical cache key. No over-fetch. Negative control **`SalesRepTopSellers` did not refire** on remount (still `cache-first`), as before. **PASS.**

### Notes

- All `/graphql` POSTs this session: **200**, `errors[]` empty. Console errors are the known env noise only (App Insights `v2/track` 400 "Invalid workspace", catalog image 404s, service-worker script 404, two `ERR_CONNECTION_CLOSED` in-flight nav aborts, a pre-login `connect/token` 400). **No app-origin TypeError or unhandled rejection.**
- Incidental (minor, low confidence): after selecting a category chip, the Revenue header lost its `[active]` sort marker although the request still carried `sort:"by-revenue"` — a possible sort-indicator/state display mismatch. Not asserted by any case; worth a look.
- **No test data was created, mutated, or deleted in this run** — read-only navigation and UI sort/filter controls only. Nothing to revert.
