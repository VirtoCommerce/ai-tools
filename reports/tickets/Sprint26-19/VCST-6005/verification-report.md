# VCST-6005: fix verification (Step 5, frontend)

**Verdict: PASS.** RED reproduced on vcst-qa, GREEN on the fixed build, STR **3/3**. No regression was found. One pre-existing low-severity BL-UI-004 overflow was noted (see Incidental).

| | Env | Build (footer) |
|---|---|---|
| RED (pre-fix) | https://vcst-qa-storefront.govirto.com | `2.59.0-pr-2501-3a82-3a82025e` |
| GREEN (fixed) | http://localhost | `2.59.0-pr-2525-ad52-ad5224f8` (PR #2525 head) |

- **Backend:** vcst-qa for both envs, so the data is identical.
- **Rep:** `SR_REP_PRIMARY` (4 served orgs). Signed in through `--secrets` `SALES_REP_PASSWORD`, which worked on both envs.
- **Lane:** playwright-chrome. Chromium headless-shell had to be installed first.
- **Routes:** the Sales Rep hub is served under `/company/*` on both builds. `/sales-reps/my-customers` returns 404.

## Data used (identical rows RED and GREEN)
- **Customer:** `AGENT-TEST-Org-AcmeCorp-20260310` (`/company/my-customers/105c2c4e-…/orders`), page 1, default sort.
- **Rows whose order number wraps at 375px:**
  - AGENT-TEST-SRO-ACME-WIN-PROC $247.00
  - …-WIN-NEW $131.00
  - …-PROCESSING $200.00
  - …-CANCELLED $80.00
  - …-KEYWORD $42.00 (wraps only at 360px content width)
- **Controls (number on one line):** …-FAILED $55.00, …-NEW $120.00, CO260922-00006/5/4.

## Measurements (getBoundingClientRect / getComputedStyle / Range line boxes)
| Surface @375 (content width 360) | RED vcst-qa | GREEN localhost |
|---|---|---|
| Customer orders: totals on more than one line | **5/10** (every wrapping-number row) | **0/10** (3/3 runs) |
| Total span `white-space` / `flex-shrink` | `normal` / `1` | `nowrap` / `0` (`customer-orders__mobile-total`) |
| Row `column-gap` · number→total spacing on wrapping rows | `normal` · **0px** (they touch) | `8px` · 8px |
| Total overflows card / document h-scroll | no / no | no / no |
| Dashboard widget (`isCrossCustomer`): totals on more than one line | **3/5** ($118.00, $247.00, $131.00) | **0/5**, `nowrap`/`0`/`8px`, org name shown |
| Customer-profile Orders widget | **4/5** | **0/5** |
| All-customers `/company/customer-orders` | not measured on RED | **0/10** (6 numbers wrap) |

The same code path on vcst-qa at a true 375px content width gives 4/10 affected.

## Checklist
| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | RED baseline at 375 | **PASS** | 5 of 10 rows split, e.g. "$247.0 / 0" — `red-customer-orders-375-acmecorp.png` |
| 2 | GREEN at 375, 3 consecutive full reloads | **PASS 3/3** | Each run: 10 rows, 5 wrapping numbers, 0 multi-line totals, min gap 8px, all totals full value — `green-customer-orders-375-acmecorp-run1.png` |
| 3 | Root cause addressed | **PASS** | localhost `nowrap` / `0` / gap 8px, against vcst-qa `normal` / `1` / `normal` |
| 4 | Second surface (`sales-rep-orders`, cross-customer) | **PASS** | Dashboard widget RED 3/5 → GREEN 0/5; profile widget 4/5 → 0/5 — `red-/green-dashboard-orders-widget-375.png` |
| 5 | Desktop 1280 regression | **PASS** | See Item 5 below |
| 6 | Tapping the order-number link on a card | **PASS** | See Item 6 below |
| 7 | Console / network | **PASS** (env caveat) | See Item 7 below |
| 8 | Breakpoints | **PASS** | See Item 8 below |
| 9 | BL-UI-004 stress (both envs) | **PASS**, no new finding | See Item 9 below |
| 10 | Overflow audit at 375 (localhost) | **PASS** for the fix | See Item 10 below |

**Item 5, desktop 1280.** Headers Order # / Date / Status / Total and all 10 rows match vcst-qa exactly. Total-desc sort gives the same top 4 on both envs ($40,236.00, $4,580.40, $2,577.59, $1,739.99). Page 2 loads. `red-/green-desktop-1280-table.png`.

**Item 6, card link.** Clicking WIN-PROC opened `/account/orders/2a1f9f3b-…`, heading "Order #AGENT-TEST-SRO-ACME-WIN-PROC", total $247.00. The href is the same on vcst-qa. `green-order-details-from-card-375.png`.

**Item 7, console / network.**
- vcst-qa: 0 console errors, all GraphQL 200.
- localhost: all GraphQL 200 with no `errors[]`.
- localhost only: `ws://localhost/graphql` handshake returns 400 on every page.
- localhost only: about 40s after load the WS retry gives up, Apollo logs error #30, and the toast "Our server is currently experiencing technical issues" appears. It reproduces with no DOM changes. It does not appear on vcst-qa after 45s.
- This is local-env WebSocket proxying and is unrelated to the 2-file CSS diff.

**Item 8, breakpoints.** `mobile-breakpoint="lg"`: cards at 1023px, table at 1024px on both envs.
- At 1023 (widest card width) nothing wraps on either env, and localhost is `nowrap`.
- At 320 without injection: vcst-qa 5 split totals, localhost 0.

**Item 9, stress.** Values injected into rows 1–2: "CO260930-000000000012345" and the spaceless "COSPACELESSORDERNUMBER000000000012345", each with total "$1,234,567.89".
- vcst-qa: at 375 both totals split over 2 lines. At 320, 7 of 10 totals split.
- localhost 375: totals on 1 line, numbers wrap to 2 lines (the link has `word-break: break-word`), gap 8px.
- localhost 320: totals on 1 line, the spaceless number wraps to 3 lines.
- localhost at both widths: no overlap, nothing outside the card, no document h-scroll.
- Evidence: `red-/green-stress-375.png`, `red-/green-stress-320.png`.

**Item 10, overflow audit.** No document h-scroll and no card-content overflow. One pre-existing pagination overflow, described below.

## Incidental (not regressions of this fix; both reproduce on vcst-qa)
1. **Low, BL-UI-004, pre-existing.** At 375px with a classic scrollbar (360 content width), `.vc-pagination__container` is 339px wide inside a 322px `.vc-pagination`. The "Next" button ends at x=358, 4px past the Orders card's right edge (354), so it visibly pokes out of the card. The numbers match exactly on vcst-qa (widget 6..354, pagination 19..341, container 19..358). It likely sits in the shared VcPagination / VcTable footer rather than in this page. `green-incidental-pagination-overflow-375.png`.
2. **Low, UX, env-triggered.** When the GraphQL WebSocket subscription fails for good, the global generic error toast "server is currently experiencing technical issues" appears on an otherwise healthy page. It was seen only on localhost, where WS is not proxied.

## Evidence
- Screenshots (`screenshots/`): red-customer-orders-375-acmecorp, red-dashboard-orders-widget-375, red-desktop-1280-table, red-stress-375, red-stress-320, green-customer-orders-375-acmecorp-run1, green-dashboard-orders-widget-375, green-desktop-1280-table, green-stress-375, green-stress-320, green-order-details-from-card-375, green-incidental-pagination-overflow-375 (.png)
- HAR: `test-results/chrome/har/session.har` (lane-captured, gitignored, holds bearer tokens, do not attach)
- KB: confirmed KB-EA467E9B; captured KB-A240F961 (card/table breakpoint and card link target). Queued, not yet pushed.
- Test data: none created, so no teardown needed. DOM stress values were in-page only and cleared by reload.
