# VCST-5346 — Testing Checklist (Artifact B)

**Ticket:** VCST-5346 · [Missions][Frontend] Missions & Challenges · Story · Epic VCST-5320
**Path:** FULL · **Flow:** feature-test · `--iterate --max-rounds 2`
**Env:** vcst-qa @ Platform `3.1061.0`, Loyalty `3.1006.0-pr-14-da8a`, theme `2.57.0-pr-2396-80d1-80d1e3b9` (deployed = declared, asset `index-DI9BAQOT.js` verified in artifact), store `B2B-store` USD/en-US
**Build delta since the 2026-08-27 run:** exactly two commits — `5a677230` *feat: add currency code*, `80d1e3b9` *fix: register loyalty routes regardless of auth state*
**Fixtures:** `MSN_E2E_*` re-minted this run; handle in force is **`20260902085919-b156`** (the prior set was found consumed — recorded `InProgress 0%`, live `Completed 100%`; a later re-seed inside the 6 h sweep floor left stale missions colliding on reward attribution, so a full `--max-age-hours 0` sweep was required and the handle moved twice). Cases resolve the handle through `@td(MSN_E2E_RUN.run_id)`, so only this transcribed value was ever stale.
**Dual-currency fixture (added this run):** `MSN_E2E_PRODUCT_A` now carries a second price — `10 USD` / `34 EUR` — and is already a goal item of `MSN_E2E_PERSKU`, so it renders in that mission's featured-SKU modal. `MSN_E2E_PRODUCT_B` stays single-priced as the in-modal control (it renders `0 EUR` in an EUR session, which is what proves the reading was genuinely taken in EUR). The amounts differ deliberately: every currency on this platform is registered at `exchangeRate: 1`, so equal amounts would make a *converting* implementation indistinguishable from a correctly *selecting* one — 10/34 separates selection, 1:1 conversion and `AllPrices.FirstOrDefault()` from a single reading pair.
**Evidence:** `reports/tickets/Sprint26-17/VCST-5346/screenshots/`
**Test Model:** `reports/ba/test-models/VCST-5346-2026-09-02.md`

**Scope decision (operator, this run):** AC-1 is tested-around, not tested — see the AC-1 block below.

## AC-2 / AC-3 conditions

| # | Condition (atomic, observable) | Covering case | Verdict |
|---|---|---|---|
| 2.a | Card shows the mission's localized name | MSNF-011 (existing) | PASS |
| 2.b | Card shows the mission description | MSNF-011 (existing) | PASS |
| 2.c | Card shows the reward amount | MSNF-042/043 (existing) | PASS |
| 2.d | Card shows days remaining | MSNF-017 (existing) | PASS |
| 2.e | Card shows the goal **target** (not only amount spent) | **MSNF-077** (new) | **FAIL** |
| 2.f | Modal shows the goal target | MSNF-042 (existing) | PASS |
| 2.g | Card progress value equals backend `currentValue` | MSNF-015 (existing) | PASS |
| 2.h | Untranslated locale → default-locale name, never the raw internal key | MSNF-068 (existing) | **FAIL** |
| 2.i | Untranslated locale → description present, not dropped | MSNF-068 (existing) | **FAIL** |
| 2.j | Goal amount and progress amount share one currency on a single card | **MSNF-075** (new) | BLOCKED |
| 3.a | SKU modal lists each target SKU with its required quantity | ~~MSNF-026~~ — **case does not exist** | **UNCOVERED** |
| 3.b | SKU modal "targets met" counter is correct | MSNF-025 (existing) | PASS |
| 3.c | Card and modal report the same progress on an unchanged cart | **MSNF-079** (new) · VCST-5824 open | PASS |
| 3.d | Every SKU-modal price equals that SKU's PDP price in the session currency | **MSNF-073** (new) — *the test for `5a677230`* | PASS |
| 3.e | SKU-modal cart subtotal sums one currency and is labelled with it | **MSNF-078** (new) — **needs re-authoring, not fixture data** (see below) | BLOCKED |

## Gap conditions (no story AC — from 1d)

| # | Condition | Covering case | Verdict |
|---|---|---|---|
| G5 | Partially-successful payload still renders every mission that resolved | **MSNF-074** (new) — *VCST-5843 Done but fix absent from branch* | BLOCKED |
| G6 | Anonymous `/account/missions` → sign-in with `returnUrl`, not 404 | **MSNF-072** `[JOURNEY]` (new) — *the test for `80d1e3b9`* | PASS |
| G6b | In-session sign-in reveals the Missions nav entry without a reload | **MSNF-076** (new) — *regression introduced by `80d1e3b9`* | PASS |
| G7 | Zero missions available → dedicated empty state, distinct from the error state | MSNF-007 (existing) | BLOCKED |
| G8 | Zero-target / zero-reward / expired missions each render a defined state | MSNF-059 + 075d MSN-016 | PASS |
| G11 | Mission controls expose distinct accessible names; modal background hidden from AT | MSNF-046/047 (existing) · VCST-5826 open | **FAIL** |
| G12 | 375 px SKU modal does not truncate product names | ~~MSNF-023~~ — **case does not exist** · VCST-5831 open | **UNCOVERED** |
| G13 | Points-history row identifies its granting mission | **MSNF-080** (new) — BL-LOY-015 VIOLATED backend-side | **FAIL** |

## Uncovered conditions — stated, not dropped

| Condition | Why uncovered |
|---|---|
| **AC-1a** — new-mission notification is displayed | **NOT IMPLEMENTED at either layer.** Backend emits no notification (0 `PushMessage`/`INotification`/`SendAsync`/template hits; manifest declares no notification dependency); the frontend PR adds no notification surface. Precisely designed in frames F4/F8. Operator decision: route to PO, do not fail this run's scope. |
| **AC-1b** — completion notification shows points awarded | Same. Designed in frame F5 (points total + per-mission breakdown + two CTAs). |
| **AC-1c** — a dismissed notification does not re-show | Unreachable while AC-1a/b are unimplemented. |
| **G1 / G2** — displayed progress vs `BL-LOY-016` (order total incl. shipping+tax, net discount) and `BL-LOY-017` (cash-currency lines only) | Backend accrual link (L1–L5), owned by sibling VCST-5319 (ran 2026-09-01, verdict FAIL). Out of this story's L6 display scope; a wrong number here is that ticket's defect, not this one's. |
| **G4** — cancelled order reverses its mission contribution | **BL-LOY-019 VIOLATED — the reversal mechanism does not exist in product.** Recorded so its absence is not mistaken for coverage; backend scope. |
| **G10** — mission progress under a B2B org switch: per-contact or per-org? | Undefined by the story. Needs a PO answer before it is testable at all. |
| **UIP-TABS / UIP-INPUT** | Named in the model, not authored this run. `MSNF-UIP-BACK-001`, `MSNF-UIP-EXPIRE-001` and `MSNF-UIP-STORAGE-001` already exist in 083c as Draft, so the gap is narrower than the previous model's — `UIP-BACK` was listed here in error and is in fact covered. |
| **`culture × currency` (model scenario #18)** | Covered-but-unexecuted, not uncovered. MSNF-075 **did** gain the culture arm at the Step-3 re-verify, so an authored case exists for the cell — but it **BLOCKED** at execution (its mission read `Completed` against a `progress_percent_at_seed: 0` baseline). It needs a re-run on uncontended fixtures, not new authoring. |
| Points-history row **currency** | Matrix cell `Points-history × L6c` is a declared `GAP` — no AC governs the page, so no case was authored for it. |
| **MSNF-078 (condition 3.e)** — asserts a state that is **unreachable by construction** | Investigated as a suspected fixture defect (the `PERSKU-PTS` control rendering `$0.00 USD`); the seeding turned out to be **correct**. `loyaltyMissionProgress` takes **one** `currencyCode` for the whole query and the storefront passes the session currency, so every row of every modal is normalised to one currency — two modals can never carry different currency codes in a single session, whatever anything is priced in. The `$0.00` is currency-scoped price evaluation: a pricelist holds one currency, and a product with no row in the requested one falls to the empty-price fallback, which stamps the *request* currency at amount 0 and drops `isAvailable`/`isBuyable`. Proven by the mirror — with `currencyCode` omitted the same rows return `1 PTS` / `10 USD` / `34 EUR`; with `currencyCode=PTS` the USD products return `0 PTS`. **No fixture change can satisfy this case as written.** The defect it hunts is still real but reachable only via the omitted-`currencyCode` path — the first-paint race where `currentCurrency` is unresolved at bootstrap — so the case needs re-authoring against that trigger. Recorded so it does not sit looking like it is waiting on data that will never arrive. |
| **MSNF-073 EUR arm** — **RESOLVED this run** | The single-currency fixture limitation first recorded here was closed after the Step-3 gate REJECTED the case as vacuous: `MSN_E2E_PRODUCT_A` was re-seeded dual-priced (`10 USD` / `34 EUR`) alongside single-priced `MSN_E2E_PRODUCT_B` as an in-modal control. MSNF-073 then **PASSED** with genuine discrimination — a `FirstOrDefault()` implementation would have failed both the amount and the denomination assertion. |

## Pre-flight API evidence (superseded by execution, kept for the audit trail)

Probing `loyaltyMissionProgress` directly before any browser run: a USD session returned `currency.code = USD` on every featured-SKU row and an EUR session returned `EUR`, with **no** `errors[]` on a full nested `product` selection. That settled 1c's open source question in the fix's favour and confirmed VCST-5842's resolver fix, and it is what made MSNF-074's trigger non-organic. MSNF-073 has since proved the same point with real discrimination.

### The BL-PRICE-005 line on MSNF-073

Probed live: the platform already signals unavailability correctly — in EUR the single-priced control reports `isAvailable`/`isBuyable`/`isInStock` all false alongside `€0.00`, and the mission query selects `availabilityData` via the shared fragment. So the invariant holds at the data layer and `€0.00` is just a price field carrying no meaningful value. The assertion was reworded at the Step-3 gate to score only the *availability presentation* (is the row shown unavailable, stepper and add-to-cart inactive?) rather than the absence of an amount — conflating the two would have failed a correct modal. MSNF-073 subsequently **PASSED**.

## Findings held below the 5d severity floor

*(filled at 5d — `Low`/P3 findings keep their `reports/bugs/open/` draft and are named here because on any run this file is the durable record)*

`Not filed (below severity floor): ` — **to be completed at 5d**

## Regression scope (Artifact C)

`083c`, `083d`, `075d` · `--cases critical --also-ids MSNF-072..MSNF-080` · no `--target` time trim (operator decision).
Narrowed from the selector's fail-open 62-suite / 392-min set on 1c's source evidence that the shared `client-app/core/api/graphql/types.ts` change is inert (one doc-comment reword plus one optional loyalty-only input field, both TypeScript-only). **Every suite dropped by that narrowing is named in the Step-5 report's Scope Exclusions.**


## Execution results

**Run `REG-2026-09-02-0930`** (09:30–10:21Z) — 36 cases: 22 PASS · 5 FAIL · 6 BLOCKED · 3 SKIPPED · **61.1%**. Lanes: 083c chrome, 083d edge, 075d machine. No suite touched firefox; no retries needed.

**Gap-coverage run** (a second pass, same lane) — the `--cases critical` filter had excluded the High/Medium cases covering 12 of the 23 conditions, so only 11 were executed by the main run. Nine further cases were executed to close that: 4 PASS · 2 FAIL · 3 BLOCKED.

**Condition tally:** 23 mapped · 21 with a verdict · **12 PASS · 5 FAIL · 4 BLOCKED · 2 UNCOVERED**.
AC-2/AC-3 alone: 15 conditions, 14 decided (93%), 9 PASS / 3 FAIL / 2 BLOCKED.

**Two conditions are UNCOVERED because their mapped cases do not exist.** `MSNF-023` and `MSNF-026` were deleted on 2026-08-28 in commit `de670ad5` — the VCST-5346 value-chain restructure itself. This checklist's condition→case map was built from the 2026-08-27 run's inventory, one day before the cull, and the IDs were not re-checked against the current CSV. Conditions **3.a** (SKU modal lists each target SKU with its quantity) and **G12** (375 px truncation) therefore have no covering case at all and need new ones authored.

### The four BLOCKED, and why none is a product signal

| Case | Reason |
|---|---|
| MSNF-074 (G5) | The `errors[] + data` trigger no longer occurs organically — VCST-5842's backend fix removed it. Correctly held at `BLOCKED:PRECONDITION_UNMET` rather than scored PASS, since a clean payload takes the same path under either error policy |
| MSNF-078 (3.e) | **Fixture defect.** `PERSKU-PTS` is seeded at `$0.00 USD` rather than a distinct `PTS` price, with `isAvailable`/`isBuyable` false, so both modals resolve to USD and the currency-label assertion is undecidable as seeded |
| MSNF-075 (2.j) | Its mission read `Completed` against a `progress_percent_at_seed: 0` baseline |
| MSNF-007 (G7) | The zero-mission empty state is unreachable for any seeded account on this store (`totalCount = 28`) |

### Fixture problems this run exposed — both need fixing before the suite pair is trusted

1. **Missions are minted with a backdated window.** Freshly seeded missions carry `startDate`/`periodStart` of `2026-08-26`, a week before the 08:59 mint, so they retroactively count orders placed before they existed. `$234.00 spent` against a `$50` target exceeds what either suite placed, so this — not concurrency — is the larger cause of the `Completed`-at-start blocks.
2. **083c and 083d were run concurrently against the shared `LOYALTY_VIP_USER`.** The fixture set provisions dedicated per-case accounts, but several cases' preconditions sign in as the shared VIP account instead. These two suites must be serialised, or those cases re-pointed at their per-case accounts.

Separately, the overlay's `*_at_seed` fields are **stale** against generation `20260902085919-b156`: `MSN_ORDERVALUE` records `Completed / 100%` while live reads `InProgress / 0%`. Nothing in this run depended on them, but any case that does would be misled.

## Findings held below the 5d severity floor

`Not filed (below severity floor):` **F7** — untranslated locale drops the mission description entirely (name falls back, description returns `null`); draft `reports/bugs/open/` , prior ticket VCST-5828 (Cancelled). **F8** — every language-selector option carries the active locale's flag alt text, so each option's accessible name states the wrong language. **F9** — open-ended mission card renders a bare amber dot with no adjacent text, colour as the sole differentiator (BL-A11Y-003); prior ticket VCST-5827 (Cancelled).

**Filed then closed:** VCST-5858 (Sub-task) — **Cancelled as a duplicate** of a disposition a parallel session had already made (won't-fix, P3 latent, re-open bar "a partial response observed in the wild"). I over-graded it Medium: the shape is reachable at the API layer, but the shipped storefront passes `cultureName`, so no ordinary-use path triggers it. The residual point is narrower and is a records issue on VCST-5843 — it reads `Done` when the outcome was *declined*. `MSNF-074` keeps the watch armed and will turn red on its own if the trigger ever becomes reachable.

**Assessed Medium and file-eligible, not filed by operator decision at the 5d gate:** F1 (raw i18n keys visible in `fr`), F2 (card omits the spend target — needs a PO ruling on AC-2 text vs design F1/F2, not a third re-file), F6 (xAPI throws `ARGUMENT_NULL` on an omitted optional `cultureName`). F4 links to the open VCST-5826; F5 attributes to VCST-5319. These are recorded here because on any run this file is the durable record — a finding that appears in neither the checklist nor a draft has been deleted rather than deprioritised.
