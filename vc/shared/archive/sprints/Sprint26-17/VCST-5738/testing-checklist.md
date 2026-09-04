# Testing checklist — VCST-5738

**Ticket:** VCST-5738 · Review task (contribution) · Flow `feature-test` · Path **FULL** · Priority Medium (P2)
**Change:** vc-frontend PR #2442 — batch rapid-fire cart line-item removals into one `removeCartItems` mutation
**Env:** vcst-qa @ Platform 3.1063.0, Theme `vc-theme-b2b-vue-2.57.0-pr-2442-29ed` (deployed CONFIRMED from the
served bundle `/assets/index-Nzn__LiE.js`, not merely PINNED on the deploy branch)
**Test Model:** `reports/ba/test-models/VCST-5738-2026-09-04.md` (gate 10/10, 16 scenarios)
**Evidence:** `reports/tickets/Sprint26-17/VCST-5738/screenshots/`

Verdicts are `PASS`/`FAIL`/`BLOCKED`/`NOT-RUN`; written at Step 3, updated in place at 5e. **A condition with no covering case is listed as uncovered, never dropped.**

## Functional conditions — the 8 gap-ACs

The ticket declares no ACs (auto-created wrapper), so each condition is a claim **the PR makes about itself**; `1d` was skipped. Scenario numbers refer to the Test Model.

| # | Condition (gap-AC) | Scenario | Oracle | Verdict | Evidence |
|---|---|---|---|---|---|
| G1 | At most ONE `RemoveCartItems` in flight at any click speed | 3, 15, 16 | **{UNIT-TEST} + {DEPLOYED-BUNDLE}** | NOT-RUN | see *Lane limit* below |
| G2 | Merged request carries the UNION of clicked ids, deduped | 2 | **{UNIT-TEST} + {DEPLOYED-BUNDLE}** | NOT-RUN | see *Lane limit* below |
| G3 | No id is ever re-sent (each flush clears its own queue) | 2 | **{UNIT-TEST} + {DEPLOYED-BUNDLE}** | NOT-RUN | see *Lane limit* below |
| G4 | Two different `cartId`s never merge into one request | 7 | {BL} BL-CART-005 | NOT-RUN | blocked on 3a's shared-cart fixture |
| G5 | Own cart (no `cartId`) always routes to the one default queue | 7, 15 | {OBSERVED} | **PASS** | 3x: live request body carries `lineItemIds` and **no `cartId`** ⇒ partition key `""` |
| G6 | Every queued caller's promise resolves when the batch settles (per-click analytics survive) | 8, 14 | {OBSERVED} | NOT-RUN | — |
| G7 | `optimisticResponse` survives, with Apollo automatic rollback on failure | 8 | {OBSERVED} | NOT-RUN | — |
| G8 | Eases off under load — slower server ⇒ fewer, bigger requests | 16 | {OBSERVED} | NOT-RUN | — |

## Chain-integrity conditions — borrowed invariants

**No `BL-CART-*` invariant covers line-item removal** (all 15 cover quantity/stock/coupons/currency/org isolation/pack size/configuration), so every row borrows an adjacent one — itself a finding, routed to `/qa-review-oracles bl` as MISSING at business value `high`.

| # | Condition | Scenario | Oracle | Verdict | Evidence |
|---|---|---|---|---|---|
| C1 | **[JOURNEY]** Remove 3 of 5 lines in a burst → server cart, recalculated totals and the PLACED ORDER all agree | 1 | {BL} BL-CHK-006 | NOT-RUN | — |
| C2 | **Removal then checkout/Place Order inside the 1 s window does not bill a removed line** | 4 | {BL} BL-CHK-006 | NOT-RUN | — |
| C3 | Removal then reload inside 1 s is not silently lost | 5 | {OBSERVED} | NOT-RUN | — |
| C4 | Last-line removal reaches a genuine server-side empty cart | 6 | {OBSERVED} | **PASS** | 3x: hard reload → "Your cart is empty", badge cleared · `screenshots/C4-cart-empty-after-removal.png` |
| C10 | **`Remove selected` (bulk) vs per-row trash — do both paths behave the same?** | **17 (net-new, 3x EXP-01)** | {OBSERVED} | **PASS** | **ONE** `RemoveCartItems` carrying **3** `lineItemIds`, no `cartId`; cart emptied. Per-row trash sent 1 id. So bulk already collapsed N→1 **before** this PR |
| C5 | Free-shipping threshold recalculates after a BATCHED removal | 9 | {BL} BL-SHIP-003 | NOT-RUN | — |
| C6 | Coupon at its minimum-order threshold is re-evaluated after a batched removal | 10 | {BL} BL-CART-003 | NOT-RUN | — |
| C7 | Interleaved removal + quantity change (sibling targets on ONE link) both apply | 11 | {OBSERVED} | NOT-RUN | — |
| C8 | Visible total equals server total after settle (VC-CART-005 window not widened) | 12 | {OBSERVED} · VC-CART-005 · ECL-1.3 | NOT-RUN | — |
| C9 | Reverse edge: does re-adding a line restore a coupon the removal invalidated? | 10 | **UNVERIFIED — candidate `ABSENT IN PRODUCT`** | NOT-RUN | — |

## Visual axis — `visual_surface: true`

Derived `true` on sources 2 + 3 (`layer: storefront`; target suites `layer: frontend`). The diff is `.ts`-only, but the change alters *when* rows leave the DOM, so layout stability during multi-row removal is in scope. Lane: `ui-ux-expert` on Chrome DevTools MCP — **never firefox**.

| Axis | Condition | Scenario | Verdict | Note |
|---|---|---|---|---|
| BL-UI-001..005 | No layout shift / CLS as rows vanish one-by-one from an optimistic list | 13 | NOT-RUN | invariant — **may fail the ticket** |
| BL-A11Y-001..004 | WCAG 2.2 AA on the cart line-item controls | 13 | NOT-RUN | **files SEPARATELY at real severity; does NOT fail this run** |
| Design system | Live custom properties vs generated tokens, no literals | 13 | NOT-RUN | advisory |
| `vs. DESIGN` | Declared tokens / geometry / icon parity | — | **SKIPPED** | **no Prototype link on the ticket** (description is the PR URL only) and `DesignSync` is not inherited by a subagent. A skip is never a pass |

## What Step 4 has actually run so far (partial — inline, chrome lane)

Run inline by the orchestrator, not dispatched to `qa-frontend-expert` (one authenticated session already
held, one surface, no parallelism to gain) — **a stated deviation from the Step-4 dispatch contract.** Cart
built through the real UI; the catalog quantity stepper IS the add-to-cart on this B2B store.

**Executed: G5 · C4 · C10** (3 of 19). **A condition absent from that list has NOT passed.** Not executed:
G1/G2/G3 + C2/C3 (lane limit below) · G4 (no shared-cart fixture, `3a` pending) · C5/C6 (need a cart seeded
AT the threshold) · C1/C7/C8/C9 + G6/G7/G8 (runnable, not yet run) · the visual axis (`ui-ux-expert` not
dispatched).

**Two authoring mechanics, not defects:** the line-item select `<input>` is pointer-intercepted by its
`<label class="vc-checkbox__container">`, so a case must click the label or time out on the actionability
gate; and the stepper added the Xerox line at **quantity 2**, not 1 (`minQuantity`/`packSize`).

**C10's negative control is NOT obtained** — the checkbox interception blocked leaving one row unselected,
so C10 proves *"bulk sends one request with all selected ids"* and **not** *"unselected rows survive"*.

## Lane limit — G1/G2/G3 cannot be verified by a browser assertion

Two clicks inside one 1000 ms window are unreachable here for **two independent reasons**: (1) MCP
round-trip latency exceeds the window — the PR author documents this and fell back to unit tests;
(2) firing both inside one `browser_evaluate` was **BLOCKED** by `hooks/enforce-real-user.mjs`, whose
`@allow-eval` exception excludes test runs. G1/G2/G3 therefore rest on the PR's 3 new unit tests (+38
pre-existing) **plus** the deployed-bundle evidence the config is live. **A case asserting the merge
"live" would be unfalsifiable here** — so 2/3/15/16 are re-oracled `{UNIT-TEST} + {DEPLOYED-BUNDLE}`, and
4/5 (shopper-side, human-only) are authored **`Manual`**, not `Draft`.

## Uncovered — stated, not omitted

- **V2 / L3 and V2 / L4 (`GAP`).** A shared cart's recalculation and checkout are uncovered; `3a` is
  building the fixture. If the platform allows only one active cart per (user, store, currency),
  scenario 7 is `ABSENT IN PRODUCT` — a finding, not a hole.
- **The production `LockError` itself.** The PR disclaims that this change makes it disappear; the two
  backend contributors are out of scope. This run can verify only that the storefront stopped contributing
  concurrency — **not** that the incident is resolved.
- **Suite 065 (shipping) is UNSCANNABLE** (legacy 11-column header) and owns `BL-SHIP-003`, the invariant
  C5 tests — so existing shipping coverage could not be triaged against this change.
- **Load behaviour under a real distributed lock** (G8 / scenario 16) is probed by client-side throttling
  only. A true load test is `vc-perf`'s L2 harness, not this run.
- **NEW RISK — multi-vendor `Remove selected` now shares the queue.** The cart groups by vendor with a
  `Remove selected` **per group**; both go through `RemoveCartItems`, and the partition key (`cartId`) is
  identical, so two groups' bulk removals inside 1000 ms now **merge into one request**. Likely benign
  (same cart, union of ids) but it is new behaviour for the bulk path covered by **none** of the PR's
  tests, and this env's cart was single-vendor (`Vendor: N/A`) so it was not exercisable.

## Regression tracks

- **C1 (ticket-scoped exact set): SKIPPED — the set is empty.** Step 2a scanned 835 rows across 32 suites,
  found 100 at-risk hits and disposed **all 100 as `CONFIRMED`** (0 `REPAIR`, 0 `RE-BASE`, 0 `SUPERSEDED`):
  the change renames nothing and moves no route, selector, arg or alias — it alters transport timing only.
  With no `RE-BASE` ids and no new cases authored yet, there is nothing for an `--ids` run to execute.
- **C2 (release-scoped Critical sweep): runs at `5r`, after the verdict is recorded.**
- `filteredOut: 0` from the Wave-B scan is **not** a clean result — `FILTERED_OUT` is only computable once a
  `--cases` tier is applied, which happens at the Step-3 gate re-run.

## Findings held below the 5d severity floor

- **Dismissed, not filed:** 2 console 404s on `/cart` for `AGENT-TEST-CMP-ALPHA` /
  `AGENT-TEST-CMP-VARPARENT` product images (observed in 3x). Pre-existing fixture-data hygiene from the
  VCST-5735 compare fixtures, unrelated to this PR, and below the floor. Named here so a PASS is not read
  as "the cart console was clean".
- `Not filed (below severity floor): None` — nothing else triaged yet.
