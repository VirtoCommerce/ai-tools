# Exploratory Session: Sales Rep customer-orders (storefront)
**Date:** 2026-09-03
**Duration:** ~30 minutes
**Platform:** 3.1063.0
**Theme:** vc-theme-b2b-vue-2.57.0-pr-2444-5946-59465f5e (PRs live: vc-frontend#2444, vc-module-sales-rep#14, vc-module-x-api#84)
**Session type:** [EXP+VAL]
**Discovery technique:** Surprise-seeking (first 10 min) + user-flow edge enumeration on the UIP-* probes 097 omits
**Charter:** Discover scenarios on the Sales Rep customer-orders surface not asserted by suite 097, not covered by 089/091/093, and not in `vc-bug-catalog.md` (VC-ORDERS-*/VC-LIST-*) or the open `BUG-salesrep-*` drafts
**Edge-Case Refs:** ECL-3.1, ECL-3.2, ECL-14.2, ECL-14.3 (hunted) | **BL Refs:** BL-SR-002, BL-SR-004, BL-SR-009, BL-SR-012, BL-SR-013 (judged against)
**Lane:** playwright-chrome | **Fixture state:** verified live before use — `ORDER_REP_PLACED` = `AGENT-TEST-SRO-TF-REP-PLACED` / `a037c69d-7b41-41a3-ba90-15817f19a553` / $118.00 / Sep 2, matching the `aliases.vcst.json` overlay (seeded 2026-09-02T15:52Z); no re-seed since. Orgs observed: TechFlow `96f109a7…`, AcmeCorp `105c2c4e…`.

## Net-New Scenarios Discovered
| # | Scenario | Why uncovered | What we found | Oracle ref | Fate | Suggested next charter |
|---|----------|---------------|---------------|-----------|------|------------------------|
| 1 | Zero-match filter combination (status + date) hides the active status filter and its control | 097 SR-CO-015 covers a *failed/slow* facet request; this is a *successful* one returning `term_facets: []`. No suite asserts drawer contents on a zero-match | **BUG (Medium).** Status group vanishes from the drawer; `status:"Processing"` still in the query, invisible and unremovable; only all-or-nothing Reset recovers | **NONE** | PROMOTE → **SR-CO-026** in 097, `Draft` | Explore every rep filter surface (top-sellers, my-customers, carts) for zero-match facet collapse |
| 2 | Zero-match empty state offers no inline clear/reset affordance | BL-SR-012 asserts the *message* distinction; 097 asserts the zero-customer state (SR-CO-009), not a zero-match orders grid | "No orders match this filter" is a bare text node; recovery only by reopening the drawer. **Low** | BL-SR-012 | PROMOTE → **SR-CO-027** in 097, `Draft` | — (folded into #1's case) |
| 3 | Same org's order count differs ~6× between adjacent rep surfaces | Both figures are individually correct under their own scope; nothing asserts they are *reconcilable* to a reader | my-customers row "11 orders / $3,212" (rep-authored YTD) vs the list's `totalCount: 62` (org-scoped). AcmeCorp likewise 8 vs 16. Neither label discloses its scope. **Mechanism:** BL-SR-002 scopes *every* rep figure to orders the rep **created**, while `salesRepCustomerOrders` is deliberately **creator-agnostic** (checklist C4 — the defect the story exists to fix). The divergence is therefore a predicted consequence of VCST-5733, not a coincidence: the list moved scope, the statistics did not | **NONE** | PROMOTE → **SR-CO-028** in 097, `Draft` (assert both figures + their scope labels) | Explore whether the dashboard KPI tiles use a third scope again |
| 4 | `UIP-TABS` — two customers in two tabs, act in both | Provably absent: 097 runs 8 of the 10 closed `UIP-*` probes, `UIP-TABS` and `UIP-STORAGE` are not among them | **No bleed.** Tab 1 kept AcmeCorp + Processing; its sort request carried `organizationId: 105c2c4e…` with its own filter. Correct | BL-SR-002 | PROMOTE → **SR-CO-029** in 097, `Draft` (cheap P0-security regression guard) | — |
| 5 | Filter/sort/page state across an in-SPA customer switch | SR-CO-006 covers filter→page-1 reset *within one customer* only | **No bleed.** TechFlow's Cancelled+Completed filter did not follow to AcmeCorp; drawer reset, Reset disabled, facets were AcmeCorp's own (7/5/3/1) | BL-SR-012 | PROMOTE → **SR-CO-030** in 097, `Draft` | — |
| 6 | Multi-select status semantics (ECL-3.2 `[THEORETICAL]` AND-vs-OR row) | Nothing in 097 selects more than one status | **Correct: union (OR).** Cancelled(3)+Completed(1) → exactly 4 rows; facet counts summed to `totalCount` (57+3+1+1=62) | ECL-3.2 | PROMOTE → **SR-CO-031** in 097, `Draft` | — |
| 7 | `UIP-STORAGE` — corrupted/stale persisted client state | Absent from 097's sweep, and **not executable under the real-user rule** on this lane (needs JS to corrupt storage) | Not attempted. Also moot in part: filter/sort state is **not** URL-encoded and appears memory-only (URL stayed at `/orders` with no query string after Apply) | **NONE** | DECLINE: not reachable by real-user interaction; needs a harness outside this session's constraints | Probe what this surface persists at all, then whether a corrupted value degrades safely |
| 8 | Mixed-currency Total column (candidate #5) | — | **Not decidable here.** No two-currency customer found among the 5 served orgs; every order rendered USD. Stating this rather than inferring | BL-SR-004 | DECLINE: no fixture supports it | Seed a two-currency customer, then assert per-row currency disambiguation on the Total column |

## Oracle Feedback
| Kind | Entry | Evidence | Route |
|---|---|---|---|
| **Contradicted (scope)** | BL-SR-009 | Its violation signal reads "a raw status/type accepted instead of a rule name", but the shipped `salesRepCustomerOrders` filter grammar **is** raw field:value — `status:"Processing" createddate:["…" TO "…"]`. Read literally, the invariant classifies correct VCST-5733 behaviour as a violation | `/qa-review-oracles bl` |
| **Contradicted (scope)** | BL-SR-010 | Declares named sort rules (`recent`, `total`) with unknown names falling back to default. This surface sends `createdDate:asc` / `total:desc` — a field:direction grammar — and sorts correctly. Neither invariant names `salesRepCustomerOrders` | `/qa-review-oracles bl` |
| **Candidate new invariant** | (none covers it) | A rep surface must disclose its complete active filter set even when the response carries no facets — the control that undoes a filter may not be built solely from result-derived data (scenario #1) | `/qa-review-oracles bl` |
| **Candidate new pattern** | (none — `Oracle ref: NONE`, scenario #3) | Two adjacent surfaces label differently-scoped counts of the same entity identically ("11 orders" vs 62), leaving them irreconcilable to the reader | `/qa-review-oracles ecl` |
| `[THEORETICAL]` → `[OBSERVED]` | ECL-3.2 (multi-select AND-vs-OR row) | Exercised here for the first time; outcome **correct** (OR/union, 3+1=4). Pattern is applicable to this surface but not defective on it — promote the row as observed-and-clean, not as a defect | `/qa-review-oracles ecl` |

## Bugs Found
| # | Severity | Title | Evidence | Net-new? |
|---|----------|-------|----------|----------|
| 1 | Medium | Zero-match filter hides the active status filter and its control | `reports/bugs/open/medium/BUG-salesrep-customer-orders-zero-match-hides-active-status-filter.md` | Yes |
| 2 | Low | Zero-match empty state has no inline clear/reset affordance | same draft, §Notes (below the P3 filing floor) | Yes |

## Risk Areas
- **BL-SR-009/010 are the wrong oracle for this surface.** Suite 097 and future authoring cite the domain's `BL-SR-*` set; two of them describe a filter/sort contract this VCST-5733 query does not implement. That is the phantom-failure class — a stale oracle manufactures FAILs rather than erroring.
- **Facet-derived filter controls.** Any control rendered from `term_facets` inherits the empty-on-zero-match behaviour. The orders drawer is one instance; top-sellers, my-customers and carts are untested for it.
- **No filter state in the URL.** Deep-link restore degrades to default (097 SR-CO-014 permits this), but it also means no filter is ever visible outside the drawer — which is what makes finding #1 reachable.

## Observations
- **Zero console errors** across the whole 30 minutes; every GraphQL call HTTP 200 with no `errors[]`.
- Date inputs are masked and validate honestly: `9/3/2026` → `93/20/26` + "Invalid date format", Apply correctly disabled. Both fields annotate on blur (the apparent asymmetry was focus, not a defect).
- Authorship routing is visibly correct in the DOM: buyer-placed → `/company/my-customers/{org}/orders/{id}`, rep-placed → `/account/orders/{id}` (already 097 SR-CO-010/011).
- Facet counts and `totalCount` agree on non-empty queries; the rep's own org context (BuildRight) is independent of the customer being viewed, per BL-SR-011.

## Questions
- Is `salesRepCustomerOrders`' field:value filter grammar the intended contract for this surface, or should it use the domain's named filter rules? The answer decides whether BL-SR-009/010 get scoped or the query gets changed.
- Should `term_facets` return the unfiltered facet set on a zero-match query so filter controls stay renderable, or should the client cache the last non-empty facets? (Backend vs frontend fix for #1.)
- Is "11 orders" on the my-customers row intended as rep-authored YTD? If so, should the label say so?
- Was leaving every statistic creator-scoped while the order list became creator-agnostic a deliberate VCST-5733 decision (BL-SR-002 vs checklist C4)? If deliberate the labels must disclose scope; if not, the statistics now under-count a rep book of business.

## Charter-from-Gap (next-session candidates)
- Sweep every rep filter surface (top-sellers, my-customers, active carts) for the zero-match facet-collapse pattern.
- Explore the rep dashboard KPI tiles for a *third* order-count scope, and whether any two tiles are reconcilable.
- Seed a two-currency customer and explore the list Total column against BL-SR-004.
- Explore what the customer-orders route persists client-side at all, then whether a corrupted value degrades safely (`UIP-STORAGE`, needs a harness).
