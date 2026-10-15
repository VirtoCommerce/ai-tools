# Testing checklist — VCST-5337 + VCST-5731 (Sales Rep customer activity / GA insights)

Env: vcptcore-qa · Store `B2B-store` · Build: theme PR #2458 @5444e67, SalesRep pr-15-7910, GA alpha.277 · Model: `reports/ba/test-models/VCST-5337-2026-10-07.md`
Focus (operator): the rep must see the activity of ALL members of the customers they serve.

Legend: Verdict = PASS / FAIL / BLOCKED / DEFERRED (needs the GA 24–48 h window).

## A. Member identity tagging (storefront → GA) — playwright-chrome
| # | Condition | Model | Verdict |
|---|---|---|---|
| A1 | Each ACME member (`@td(ACME_ADMIN)` maintainer, `@td(ACME_BUYER)` agent, `@td(ACME_BUYER2)` agent, `@td(ACME_VIEWER)` employee) after sign-in: every `/g/collect` `page_view`/`search`/`view_search_results`/`view_item` carries `up.organization_id` = ACME platform id, `up.contact_id` = the member's contact id, `up.session_kind=self`, `up.is_sales_rep=false` | S1 | PASS — 4 ACME members, correct org/contact/self/false |
| A2 | Same for a TechFlow member (USR-007 David) — org id = TechFlow | S1 | BLOCKED — FIXTURE-GAP: no loginable TechFlow member on vcptcore-qa |
| A3 | The `login` event itself carries the member's `up.organization_id` + `session_kind=self` (not empty/anonymous) | S4 | FAIL — no login hit in 5/5 sign-ins (F-1, High) |
| A4 | Multi-org member (USR-014 `qa.multiorg`): after switching organization, later events carry the NEW org id | S2 | BLOCKED — FIXTURE-GAP: multi-org member cannot sign in |
| A5 | Rep impersonating a member: events carry `session_kind=impersonated` | S3 | BLOCKED — plain rep has no impersonation entry |
| A6 | After sign-out: events carry no `up.*` identity (cleared) | S1 | PASS |
| A7 | Plant one unique search term + one product view per member (`qa5337-<member>-20261007`), record term ↔ member ↔ org ↔ UTC hour | S12 | DONE — DEFERRED check 2026-10-09 |

## B. Rep read — scoped xAPI `/graphql/sales-rep` — API
| # | Condition | Model | Verdict |
|---|---|---|---|
| B1 | Plain rep, served org: `salesRepActivities` returns rows only for served orgs; every row's `organizationId` ∈ served set | S6 | PASS |
| B2 | Plain rep, `organizationId` = NOT served org → null / no data (activities, summary, insights) | S7 | PASS |
| B3 | Two reps sharing the same orgs get identical GA category counts | S6 | PASS |
| B4 | Orders tab = only orders with CustomerId = rep's user id; a member's own order is absent | BL-SR | PASS |
| B5 | Customers tab = assignment date (earliest membership), count = served orgs | D | PASS |
| B6 | categoryCounts identical regardless of `categories` filter (count does not depend on the selected tab) | S9 | PASS |
| B7 | Searches tab vs `salesRepCustomerInsights.searchTerms`: one search journey → duplicate feed rows? (guide §6) | S10 | PASS — no duplicates |
| B8 | `skip` > 500 → 0 rows, counts still full | S13 | PASS |
| B9 | Org ids of every served org ≤ 36 chars (else truncation drops the org) | S5 | PASS — all 36 chars |
| B10 | `storeId` of a store the rep is not bound to → null | D-11 | PASS (Electronics trusts B2B-store — data correct) |
| B11 | Analytics diagnostics endpoint: plain rep without `sales-rep:diagnostics` → 401/403; admin → stages | D | PASS |

## C. Rep UI — hub (VCST-5731 ACs + decisions) — playwright-chrome
| # | Condition | Model | Verdict |
|---|---|---|---|
| C1 | Customer profile has a Customer activity widget with Summary / Searches / Product views; Summary loads first, others on first click (5731 AC-1) | S9 | PASS |
| C2 | Searches shows recent search terms, newest first (Recent default), Top switch, "This year" label (5731 AC-2, AC-3) | S9 | PASS |
| C3 | Clicking a search term opens catalog search results for that term in a new tab (5731 AC-4) | S9 | PASS |
| C4 | Org-level view: rows aggregate all members' activity of that organization (5731 AC-6) — cross-check with A7 after 24–48 h | S12 | DEFERRED — 2026-10-09 |
| C5 | `/company/activities`: tabs All/Orders/Customers/Searches/Product views/Logins with counts; zero tab stays visible; count identical across selected tab; period chips This month/This year/All time | S9 | PASS (F-3 cold-read flake, Medium) |
| C6 | Row text: "×N" only when N>1; "during the hour of HH:00"; hourglass on GA items; caveat footer | D | PASS |
| C7 | Product row → PDP in new tab; unresolved product as plain text | D | PASS |
| C8 | `?organizationId=<not served>` in URL → not-found view, no data | S7 | PASS |
| C9 | Dashboard My activity widget: 5 newest events across all customers incl. orders; "~N hours ago" | D | PASS (orders not observable for Tess) |
| C10 | Console/network clean (no GraphQL `errors[]` inside 200) during all of the above | — | PASS |

## Result (2026-10-07)
VCST-5337: **FAIL** — F-1 High (login never tracked), F-2 Medium (rep self-traffic counted as customer, also seen on C3 clicks), F-3 Medium (cold GA reads fail ~60 s). VCST-5731: ACs pass. Findings reported in tracker comments 111596 / 111597 (no separate tickets, statuses unchanged — operator decision).
