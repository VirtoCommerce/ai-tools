# VCST-4857 — BLOCKED
Significant bugs: 0 in scope, 3 outside (1 High, 2 Medium), plus 6 Medium findings not investigated (scope not decided) — BLOCKED because the write-zone check found 81 files written outside the allowed zones; on the PR #2424 build (local theme fe-ade99ee05271, ruled deployed by the operator) the 12 scenarios, the AC checks and the visual lane found no confirmed bug caused by the PR. Budget: 316.13M of 386.20M tokens (81.9%) · 104.6 of 92.4 min wall (default), information only.

Reconciliation: no row without a result, nothing capped, no unknown Ref, no AC without a row (`trace.json`).
Write zones, listed as the rule requires. Attribution of group (b) is unverified: no agent of this run was briefed to touch those files and git shows them staged or modified by other work in this checkout, which is not proof.
(a) 68 files this run's own scenario agents left in `reports/tickets/Sprint26-22/VCST-4857/vcst/scenarios/`:
- S-10: check.mjs, checkorg.mjs, cleanup.mjs, cleanup2.mjs, fixture.json, lib.mjs, org.mjs, quote.mjs, quote2.mjs, seed.mjs, seedorg.mjs, sel.mjs, state.mjs
- S-12: book, cart, cleanup, clearcart, lib, seedA, setup, verify, xtenant, xtenant2 (all .mjs), fixture.json · S-3: fixture.json
- S-4: cart, cleanup, create, create2, lib, list, probe, reset, state (all .mjs) · S-8: intro, pre, probe, run (all .mjs)
- S-6: cart, cleanup, read, read2, restore, restore2, restore3, restore4, setup, setup2 (all .mjs)
- S-7: addr, book, cleanup, cleanup2, cleanup3, cleanup4, lib, quote, quote2, quoteaddr, recreateD, regions, setup (all .mjs), fixture.json
- S-9: cleanup, lib, probe, race, read, setup (all .mjs)
(b) 13 files outside the run folder: `.claude/knowledge/api/graphql-schema.md` · `.claude/knowledge/oracles/bl/auth.yaml` · `.claude/knowledge/oracles/business-logic.md` · `plugins/vc-fix/knowledge/oracles/business-logic.md` · `regression/suites/Backend/api/110-mfa-sign-in-api.csv` · `regression/suites/Backend/api/110a-mfa-modes-api-backoffice.csv` · `regression/suites/Frontend/auth/111-auth-mfa-sign-in.csv` · `reports/bugs/open/low/BUG-MFA-README-RequestMfaChangeCode-Required-User-VCST-6688.md` · `reports/bugs/open/low/BUG-MFA-UpdateMfaUserMode-Not-Refused-Org-Required-VCST-6687.md` · `reports/bugs/open/medium/BUG-MFA-Disabled-Store-Org-Role-Treated-As-Backoffice-VCST-6686.md` · `reports/tickets/Sprint26-22/VCST-6597/vcst/graphql-fixtures-validation.md` · `reports/tickets/Sprint26-22/VCST-6597/vcst/knowledge/api/graphql-schema.md` · `scripts/seed-data/auth/mfa-fixtures-specs.mjs`

| AC | Result | Evidence |
|---|---|---|
| AC-1 old address composables and two queries removed | PASS | C-1 (832 served chunks and source maps; both new queries answer 200) |
| AC-2 header search runs on the server | PASS | C-2, VIS-4, SC-12.5 (the "box hidden at 6 addresses" look was not done) |
| AC-3 header pages by 6, no lost or doubled address | PASS | C-3, SC-12.6 (pager jump on the last page is a Low, see Noticed) |
| AC-4 a new address is auto-selected | PASS by API, look open | C-4; the label after a pick is SC-12.1, not confirmed (below) |
| AC-5 Ship to shows the real selection, also off page 1 | PASS core, 3 findings open | C-5, SC-1.2, SC-4.1, SC-4.2, SC-2.1; open: SC-4.3 (B-3), SC-6.2, SC-12.1; C-6 BLOCKED |
| AC-6 prices and availability follow the address (no code in the diff) | BLOCKED | C-7: no address-sensitive product among 200 scanned |
| AC-7 anonymous saved address auto-applies at checkout | BLOCKED | C-8: needs a look (U65) |
| AC-8 quote address modal pages on the server | PASS | C-9, VIS-7, SC-3.2 |
| AC-9 add on the quote saves, no duplicate | PASS for sequential saves | C-10, C-14, SC-7.1, SC-7.2, SC-7.3, SC-10.1 to SC-10.4; parallel saves duplicate (B-2, outside) |
| AC-10 every AC holds for corporate-limited users | UI PASS, server does not refuse | C-12, SC-2.1, SC-3.1, SC-3.2, SC-12.4 PASS; C-11, SC-3.3, SC-8.1 show the server accepts the write (B-1, outside) |

## Bugs
Confirmed live, all three outside this ticket (backend or unchanged by PR #2424); none filed, a human decides.
- High Organization address writes are not permission-checked: an org member without `xapi:my_organization:edit` can add and delete org addresses through updateMemberAddresses / deleteMemberAddresses (vc-module-profile-experience-api 3.1023.0). Not a regression, the header gate in the PR holds. PO question: should the server refuse? — `reports/tickets/Sprint26-22/VCST-4857/vcst/investigations/C-11` (not filed) [B-1; rows C-11, SC-3.3, SC-8.1]
- Medium Parallel saves of one new address leave 2 to 10 identical copies in the book (check is in memory between an unlocked read and the save); sequential saves are skipped correctly — `reports/tickets/Sprint26-22/VCST-4857/vcst/investigations/C-15` (not filed) [B-2; rows C-15, SC-5.2]
- Medium Deleting the selected address leaves the cart shipment's copy, so checkout shows the deleted address as shipping and billing and Place order stays enabled. Same on the old build (pr-2622), so not a regression — `reports/tickets/Sprint26-22/VCST-4857/vcst/investigations/SC-4.3` (not filed) [B-3; row SC-4.3]
Medium findings not confirmed and not counted. The operator limited investigation to the top 4 root causes (budget); each keeps its row evidence:
- SC-12.1 header label stays on the old address after a pick: NOT REPRODUCED on Chrome (0 of 7), seen 4 of 4 on Firefox, a lane with click stalls; the selection path is unchanged by the PR (`investigations/SC-12.1`).
- SC-6.2 a stale second tab selects a deleted address and the server accepts it for contact and cart · SC-9.1 a stale second tab adds a second cart shipment (low confidence, PO question) · SC-12.2 editing the selected address leaves the cart shipment copy old (low confidence, PO question) · SC-2.3 one updateMemberAddresses call with several new addresses stores only the last (backend, KB-739A7741).
- VIS-2 quote modal rows at 375 px have buttons with no accessible name (WCAG 4.1.2). Accessibility on a feature ticket is its own ticket and does not move this verdict; named so a PASS is never read as "no accessibility problems".

## Noticed
- VIS-1 mobile header label reads "Add new address" for 3+ s after a 1280 to 375 resize, correct after opening the popover (header, 375 px)
- VIS-3 pager jumps 284 px (popover) and 158 px (quote modal) when the last page has fewer rows (header popover, quote modal)
- SC-4.4, SC-5.3, SC-6.4 one call with 8 or 3 new addresses stores only the last, same cause as SC-2.3 (API, personal and organization books)
- SC-6.1, SC-6.3 header list is not refreshed on reopen after a delete in another tab, and the click on the stale address shows nothing (header, two tabs)
- SC-9.3 2 of 24 scripted racing selections ended with contact and cart shipment on different addresses (API replica of the two calls)
- SC-12.3 the cart's Select address modal and the header Ship to can name different addresses (cart page)
- C-4 the server sets the selected address by itself for a contact's first address; the mutation response is capped at 20 items (API)

## Suspicions
- Limited user stuck after a zero-result search (S-1) — not checked (the scenario for it was not selected)
- Selected-address lookup re-fires and shows a second loader (S-2) — not checked
- Spinner never stops after the selector remounts with a keyword (S-3) — not checked
- Address on another page saved twice after the client check was removed (S-4) — refuted (C-14, SC-7.1, SC-7.2) for sequential saves; confirmed (C-15, SC-5.2) for parallel saves, a backend cause
- Header list stale after an add on the quote page (S-5) — refuted (SC-10.1, SC-10.3)
- Address count stale or 0 on first load or after sign-in, hiding search, pager or Add (S-6) — not checked (SC-2.1, SC-12.7 saw a brief "Add new address" paint, not decided as this)
- Shared composable keeps state across sign-out and sign-in as another user (S-7) — not checked (SC-12.7 covered anonymous to personal only: no leak)

## Not tested, and why
- Round-1 finding for the PO: the third strategy verifier REJECTed the residual risk of C-16 (limited user stuck after a zero-result search, review thread still open): it is High, not the Medium the strategy states. Not run.
- C-6, C-13 (selection and organization switch under 20 fresh connections) BLOCKED "one instance seen" (U59): 20 of 20 clean, one route marker; triage calls this a test defect — residual risk Medium (R1 Critical, R2 High, cross-instance not seen)
- C-7 (AC-6 prices follow address) BLOCKED, no address-sensitive product, 200 of 4652 products and region price lists not scanned — Medium, needs a region price list fixture
- C-8 (AC-7 anonymous address at checkout, signed-in selection not inherited) BLOCKED, needs a look (U65) — Medium (R10)
- Not looked: search box hidden at 6 addresses (C-2), modal opens with no cursor (C-9), cart-shipment fallback of the header (SC-2.1, SC-4.2), what checkout takes when two shipments exist (SC-9.1), Place order with a deleted address (SC-4.3) — Medium
- Not selected at the budget cut — Medium: C-2 spinner after remount · C-11 selection written on the old build · C-3 price after an off-page-1 pick · C-9 limited user before the book total loads · C-17 sign-out and sign-in as another type. Low: C-4, C-5, C-10, C-19, C-20, C-23. Nothing was struck at approval (`Changed rows: none`)
- Exploratory row: ran as S-12 (U65), not listed. Verifier row: ran in the strategy step before approval
- SKIP: test model and mind map (no domain map; scenarios create their data) — Low · coverage triage and regression (U7) — High for checkout and quotes suites 011, 011b, 012, 013, 015, 081 and for organization and roles suites 006, 026, 027, 027b, 033; Medium for cart 028, 029, 030; Low for the rest of the 55 at-risk suites (list in the strategy); follow-up `/qa-regression` · case authoring never in the run
- C-8 and the four other BLOCKED or open rows have no candidate case yet. vc-frontend#2284 (404) and vc-frontend-next not analysed — Low · mobile layouts beyond S-12 — Low

## Data
Created: not counted here, the cleanup ledger was not among my inputs · removed: each row states its own cleanup, never re-verified · exit criterion "every AGENT-TEST- address deleted" unconfirmed by this verdict · settings restored and re-read: none known

## Context used
Strategy `reports/tickets/Sprint26-22/VCST-4857/vcst/test-strategy.md` · Round 1 · Model SKIP — no MODEL risk beyond the scenarios · Checklist `reports/tickets/Sprint26-22/VCST-4857/vcst/testing-checklist.md` · Domain map none resolved · Mind map SKIPPED: no domain map · Exploratory S-12 charter, SC-12.1 to SC-12.9, no SBTM folder named · Triage `triage-report.md` · PRs VirtoCommerce/vc-frontend#2424 @ cdade315 · Stand: PR theme at http://localhost proxied to vcst-qa, ruled deployed by the operator (the bundle's NOT DEPLOYED line is vcst's own storefront, a different build)

## Cost
| Step | Input-equivalent | Share | Output | Active min |
|---|---|---|---|---|
| investigate | 40.65M | 12.9% | 0.15M | 33 |
| scenario:S-3 | 39.36M | 12.5% | 0.06M | 17.2 |
| scenario:S-12 | 35.69M | 11.3% | 0.04M | 15.8 |
| orchestrator | 25.42M | 8.0% | 0.06M | 29.6 |
| visual | 22.43M | 7.1% | 0.04M | 10.3 |
| scenario:S-10 | 20.20M | 6.4% | 0.03M | 8.9 |
| scenario:S-2 | 19.57M | 6.2% | 0.04M | 10.9 |
| scenario:S-7 | 18.63M | 5.9% | 0.03M | 10.3 |
| scenario:S-4 | 18.54M | 5.9% | 0.03M | 8.7 |
| ac-checks | 18.11M | 5.7% | 0.09M | 19.5 |
| scenario:S-6 | 13.64M | 4.3% | 0.03M | 7.4 |
| strategy | 9.22M | 2.9% | 0.08M | 13.8 |
| scenario:S-1 | 9.08M | 2.9% | 0.02M | 6 |
| scenario:S-5 | 7.03M | 2.2% | 0.04M | 9.4 |
| scenario:S-9 | 6.45M | 2.0% | 0.02M | 5.4 |
| scenario:S-8 | 2.98M | 0.9% | 0.01M | 2.5 |
| scenarios | 2.88M | 0.9% | 0.04M | 5.7 |
| scenario:S-11 | 2.40M | 0.8% | 0.01M | 2.7 |
| triage | 1.53M | 0.5% | 0.02M | 2.8 |
| checklist | 1.12M | 0.4% | 0.01M | 2 |
| context | 1.02M | 0.3% | 0.02M | 2.4 |
| change-map | 0.18M | 0.1% | 0.01M | 1 |
| **total** | 316.13M | 100% | 0.89M | 225.3 (wall 104.6) |

budget: 316.13M of 386.20M (81.9%) · 104.6 of 92.4 min wall (default)

- S-1 · class 1 · PASS · 0 significant bugs · 9.08M, 6 min
- S-2 · class 4 · FAIL Medium (SC-2.3) · 0 confirmed (1 unconfirmed) · 19.57M, 10.9 min
- S-3 · class 3 · FAIL Medium (SC-3.3) · 1 (B-1, outside) · 39.36M, 17.2 min
- S-4 · class 2 · FAIL Medium (SC-4.3) · 1 (B-3, outside) · 18.54M, 8.7 min
- S-5 · class 5 · FAIL Medium (SC-5.2) · 1 (B-2, outside) · 7.03M, 9.4 min
- S-6 · class 1 · FAIL Medium (SC-6.1, SC-6.2) · 0 confirmed (1 unconfirmed) · 13.64M, 7.4 min
- S-7 · class 3 · PASS · 0 significant bugs · 18.63M, 10.3 min
- S-8 · class 3 · FAIL Medium (SC-8.1) · 1 (B-1, outside) · 2.98M, 2.5 min
- S-9 · class 5 · FAIL Medium (SC-9.1, SC-9.3) · 0 confirmed (1 unconfirmed) · 6.45M, 5.4 min
- S-10 · class 1 · PASS · 0 significant bugs · 20.20M, 8.9 min
- S-11 · class 3 · PASS · 0 significant bugs · 2.40M, 2.7 min
- S-12 · class 3 · FAIL Medium (SC-12.1, SC-12.2) · 0 confirmed (2 unconfirmed) · 35.69M, 15.8 min

Scenarios: proposed 24 (12 selected + 12 not selected + 0 rejected + 0 added at approval) · selected 12 · run 12
