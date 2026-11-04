# Test strategy — VCST-4857

## Round 1 of 3 — 2026-11-04

Status: APPROVED (Lenajava1, 2026-11-04) · Depth label: deep (computed)
Blocked: no — F6's line ("NOT DEPLOYED: VirtoCommerce/vc-frontend#2424 — vc-frontend 2.62.0-pr-2424-cdad-cdade315 not deployed (has 2.62.0-pr-2622-caac-caac275a)") reads vcst's own storefront (vcst-qa-storefront.govirto.com, another build); the operator ruled for this run that the local PR #2424 build at http://localhost counts as deployed
Build: VirtoCommerce/vc-frontend#2424 @ cdade315 (vc-theme-b2b-vue-2.62.0-pr-2424-cdad-cdade315) · Stand: vcst (storefront http://localhost → /graphql, /connect/token, /files proxied to vcst-qa, store B2B-store) · Deployed: verified locally (theme marker X-VC-Local-Theme fe-ade99ee05271, read 2026-11-04); for vcst's own storefront the bundle says Deployed: NO → F6, overridden by the operator · Previous: none
Floors fired: F3 (rendering files edit-quote.vue, ship-to-selector.vue) · F4 (revenue-critical: quotes) · F5 (55 suites at risk) · F6 (NOT DEPLOYED on vcst's own storefront — see Blocked) · F10 (org context: /organization) · F11 (setting: XApiPermissions.CanEditOrganization) · F12 (significant-zone hotspots H-1 access, H-2/H-3/H-4 buyer-path, H-5 data) · not fired: F1 (priority Medium; its register half holds — R1 Critical, R2–R4 High ⇒ exploratory), F2 (Task, not a Story), F7 (Task, ACs present), F8 (fails closed; no ui-kit path in #2424), F9 (applied inside every floor)
Change map: C:\Users\mutyk\My Projects\ai-tools\.vc-fix\vc-test\VCST-4857\vcst\change-map.json

**Mission.** Find out, for the dev team and the PO, whether moving the Ship to selector and the quote address modal onto the paged, searchable address composables (PR #2424) keeps every user type — anonymous, personal, corporate, corporate-limited — on the right address, with the right right to add one, and with no lost or duplicated addresses.

### Inputs
| Input | What we have | Gap → project risk |
|---|---|---|
| Project environment | vcst-qa backend behind a local frontend-only container (http://localhost, theme marker fe-ade99ee05271); every storefront check uses http://localhost, never vcst's FRONT_URL · lanes chrome, edge, firefox free · accounts: personal USER_EMAIL, corporate ORG_USER_EMAIL (org-maintainer), two-org MULTI_ORG_USER_EMAIL, anonymous; corporate-limited unresolved · F11 value — XApiPermissions.CanEditOrganization = `xapi:my_organization:edit`, a role permission, not a store setting: held by org-maintainer and org-manager, absent from org-employee and purchasing-agent per test-data/b2b/roles.csv; the live grant per account is unread | P1, P2, P7 |
| Product elements | storefront only (vc-frontend#2424, 23 files): useShipToLocation (shared singleton, server search + paging, ids lookup of the selected address, canAddNewAddress by user type), ship-to-selector.vue, edit-quote.vue (server-paged modal, duplicate check removed), refetchAddressBooks after the four address mutations; queries GetMyAddresses / GetOrganizationAddresses removed · relies on the profile xAPI `ids` argument (VCST-5073, 3.1006.0) | P3, P5 |
| Quality criteria | AC-1…AC-10 (description + comment 104864) · VCST-5073 ids contract · no BL/ECL (no domain) · docs: storefront user guide (Addresses, Company info) — silent on who may add a Ship to address · kb: KB-95FBC464, KB-DADDA418, KB-19826CC0 (contested), KB-C9FE6156 · no design link | P4, P6 |

### Risks
| R | What a customer would see if this is wrong | Source | L×I | Level |
|---|---|---|---|---|
| R1 | A buyer whose selected Ship to address is off page 1, not a favorite, or since deleted sees no address, the wrong one or a deleted one in the header and at checkout | AC-5 · client-app/shared/ship-to-location/composables/useShipToLocation.ts:169 · VCST-5073 · KB-95FBC464 | 16 | Critical |
| R2 | A corporate user who switches organization keeps organization A's address in B's header, cart shipment and prices | AC-10 · KB-DADDA418 · floor:F10 | 12 | High |
| R3 | A corporate-limited user sees Add address in the header or on the quote page and writes into the organization's book, or a corporate user holding the permission loses Add address | AC-10 · client-app/shared/ship-to-location/composables/useShipToLocation.ts:135 · useShipToLocation.ts:153 · floor:F11 | 12 | High |
| R4 | On the quote page the address modal does not page, a selected or added address is not saved on the quote, or Add address leaves a duplicate in the account book | AC-8 · AC-9 · client-app/modules/quotes/pages/edit-quote.vue:338 · client-app/modules/quotes/pages/edit-quote.vue:364 · client-app/modules/quotes/pages/edit-quote.vue:271 · KB-19826CC0 · F4 quotes | 12 | High |
| R5 | After an add, edit, delete or favorite in one place, the header, account, checkout or quote list still shows the old book and a deleted address can be selected | AC-9 · client-app/core/api/graphql/account/mutations/refetchAddressBooks.ts:10 | 9 | Medium |
| R6 | The header shows one address while the cart ships to another after two selections in parallel | AC-5 · KB-95FBC464 | 8 | Medium |
| R7 | The header lookup shows another customer's or organization's address, or errors when no address is selected | VCST-5073 · client-app/core/api/graphql/account/queries/getCurrentCustomerAddresses/getCurrentCustomerAddresses.graphql:11 | 5 | Medium |
| R8 | With more than 6 addresses the header search, pager, spinner or popover misbehave: spinner never stops, popover closes, See more shown instead of the pager | AC-2 · AC-3 · client-app/shared/ship-to-location/composables/useShipToLocation.ts:119 · client-app/shared/ship-to-location/composables/useShipToLocation.ts:111 · client-app/shared/ship-to-location/components/ship-to-selector.vue:218 · client-app/shared/ship-to-location/components/ship-to-selector.vue:220 | 9 | Medium |
| R9 | Catalog prices and availability ignore the selected address | AC-6 (NO CODE in the diff) | 8 | Medium |
| R10 | A newly added address is not auto-selected, an anonymous saved address no longer auto-applies at checkout, or a user inherits another user's local selection | AC-4 · AC-7 · client-app/shared/ship-to-location/composables/useShipToLocation.ts:321 · client-app/shared/ship-to-location/composables/useShipToLocation.ts:355 | 9 | Medium |
| R11 | The quote, checkout, account or company page that used a removed query shows an empty address list or a GraphQL error | AC-1 · F4 quotes (AC-1 code at edit-quote.vue:162) | 6 | Medium |

Project risks: P1 the storefront under test is a local container proxying vcst-qa, while vcst's own storefront runs another build → every lane opens http://localhost and confirms the X-VC-Local-Theme marker on its first page. · P2 no vcst corporate-limited account is identified and no account's live grants were read → at entry read me.permissions for the four accounts; no account without xapi:my_organization:edit ⇒ S-3, S-8 BLOCKED. · P3 no mind map or data model for the domain → every address is created in the case (AGENT-TEST-) and deleted in Cleanup. · P4 no address-sensitive price or availability fixture is known on vcst → live-discover one at entry; none ⇒ the AC-6 row BLOCKED, named. · P5 vc-frontend#2284 returns 404 and was not analysed → accepted. · P6 kb and VirtoOZ were flagged unavailable; the kb CLI answered, the storefront guide is silent on Ship to add rights → the server-side half of R3 goes to the PO as a question. · P7 the profile xAPI module version on vcst is unread → S-1 reads it at entry.

### Strategy mix
Analytical ✔ · Methodical ✔ · Consultative ✔ · Model-based ✔: R2, R3 are MODEL, carried by scenarios · Reactive ✔: F12, {HYPOTHESIS} halves of R3 and R8 ·
Regression-averse ✔: F5 — suites listed in Out of scope, not run under vc-test (U7) · Process-compliant —: no external standard in scope

### Approach per risk
| R | Technique / approach | Oracle {authority} | Layer · tool | Lane · agent | Effort |
|---|---|---|---|---|---|
| R1 | FLOW, ST — S-1, S-4 | AC-5 {SPEC}; ids contract of VCST-5073 {SPEC} | storefront + xAPI · Playwright + HAR | chrome · qa-frontend-expert | high |
| R2 | MODEL, FLOW — S-2 | AC-5, AC-10 {SPEC}; selection kept per organization, null in B — KB-DADDA418 {OBSERVED} | storefront + xAPI · Playwright + HAR | firefox · qa-testing-expert | high |
| R3 | MODEL, DT — S-3, S-8 | AC-10 {SPEC}; old gate (Add address only with xapi:my_organization:edit), read from the code PR #2424 removes, not observed {HYPOTHESIS} — observed at entry on vcst's own storefront (old build) before S-3 decides; server refusal of an org write {HYPOTHESIS} → PO | storefront + xAPI · Playwright, GraphQL | edge · qa-backend-expert | high |
| R4 | FLOW, EP — S-7, S-5 | AC-8, AC-9 {SPEC}; server skip of an identical address KB-19826CC0 {OBSERVED, contested} | storefront + xAPI · Playwright, GraphQL | chrome · qa-frontend-expert | high |
| R5 | FLOW, ST — S-6, S-10 | AC-5, AC-9 {SPEC} | storefront · Playwright (two tabs) | firefox · qa-testing-expert | medium |
| R6 | FLOW — S-9 | Contact.selectedAddressId and the cart shipment name one address — KB-95FBC464 {OBSERVED} | storefront + xAPI · Playwright + HAR | firefox · qa-testing-expert | medium |
| R7 | EP, BVA — S-11 | VCST-5073: foreign ids → empty, invalid or empty id → empty, never 500 {SPEC} | xAPI · GraphQL | api · qa-backend-expert | medium |
| R8 | BVA, EXPLORE, VISUAL:PROBE — ac-checks + S-12 charter | AC-2, AC-3 {SPEC}; spinner and popover transitions {HYPOTHESIS} (charter) | storefront · Playwright | chrome · vc-test:ui-ux-expert (PROBE); AC rows none · ac-checks | medium |
| R9 | DT — ac-checks | AC-6 {SPEC} | storefront · checklist runner | none · ac-checks | medium |
| R10 | FLOW — ac-checks | AC-4, AC-7 {SPEC} | storefront · checklist runner | none · ac-checks | medium |
| R11 | EP — ac-checks | AC-1 {SPEC}: no request names GetMyAddresses or GetOrganizationAddresses (HAR) | storefront · checklist runner | none · ac-checks | medium |

### Scenarios
| S | Class | What it does | Bug it hunts | Why likely | Score | Proof | Writes |
|---|---|---|---|---|---|---|---|
| S-1 | 1 | Selected-address lookup by ids on the stand's real profile xAPI build | the stand's profile xAPI predates the ids argument (VCST-5073), so the GetCurrentUserAddresses ids lookup fails with a GraphQL validation error and the header shows no selected address once it is off page 1 | new-door (H-13), new-door (H-4) · R1 | 16 | browser | — |
| S-2 | 4 | Corporate contact switches organization | the selection belongs to organization A, the ids lookup in organization B returns nothing and the cart-shipment fallback keeps A's address in B's header and prices | untested (Review thread (2026-10-02) states the shared createSharedComposable...), new-door (H-4) · R2 | 15 | browser | — |
| S-3 | 3 | Corporate-limited user adds an address on the quote page | edit-quote.vue calls addOrUpdateOrganizationAddresses on every Add address save with no canAddNewAddress gate, so a limited user writes to the organization address book through the quote page | new-door (H-14), untested (client-app/modules/quotes/pages/edit-quote.vue (server pagination o...) · R3 | 15 | browser | — |
| S-4 | 2 | Selected address deleted after it was selected | the ids lookup returns nothing but findSelectedAccountAddress falls back to the cart shipment's deliveryAddress, so the header and checkout keep showing an address that no longer exists | untested (updateMemberAddresses, deleteMemberAddresses, addAddressToFavorites...), prior-bug (KB-95FBC464) · R1 | 12 | browser | — |
| S-5 | 5 | Parallel saves of the same new address | several updateMemberAddresses calls read the book before any of them writes, so all pass the server's duplicate skip and the book holds N copies (SCALE) | prior-bug (KB-19826CC0), untested (client-app/modules/quotes/pages/edit-quote.vue (server pagination o...) · R4 | 12 | api | — |
| S-6 | 1 | Address deleted in another tab, then selected from the stale header list | refetchAddressBooks refreshes only the tab that ran the mutation, so the other tab's header offers a deleted address and selecting it writes a deleted id to the contact and the cart shipment | untested (updateMemberAddresses, deleteMemberAddresses, addAddressToFavorites...), prior-bug (KB-95FBC464) · R5 | 12 | browser | — |
| S-7 | 3 | Quote Add address with an address that already exists on another page | the client duplicate check is gone and the server does not skip the copy, so the account book gets a second identical row (S-4) | prior-bug (KB-19826CC0), untested (client-app/modules/quotes/pages/edit-quote.vue (server pagination o...) · R4 | 12 | browser | — |
| S-8 | 3 | Corporate-limited user adds an org address through the API directly | the UI now hides Add address by userType, not by CanEditOrganization, and the server accepts updateMemberAddresses on the organization from a user who should be refused | new-door (H-14) · R3 | 10 | api | — |
| S-9 | 5 | Two tabs select different ship-to addresses at once | the contact update and the cart shipment update of the two selections interleave, so Contact.selectedAddressId names one address while the cart ships to the other | prior-bug (KB-95FBC464) · R6 | 8 | browser | — |
| S-10 | 1 | Address added on the quote page reaches the header Ship to list without reload | the quote page and the header no longer share one address array and the refetch misses the header query, so the header list stays stale after an add on the quote page (S-5) | untested (updateMemberAddresses, deleteMemberAddresses, addAddressToFavorites...), untested (client-app/modules/quotes/pages/edit-quote.vue (server pagination o...) · R5 | 8 | browser | — |
| S-11 | 3 | ids lookup returns only the caller's own addresses | the selected-address lookup returns a foreign contact's or organization's address when its id is passed, or errors on an empty id | new-door (H-13) · R7 | 8 | api | — |
| S-12 | 3 | Free exploratory charter over the Ship to address book | Charter: the header and mobile Ship to selector, the account and company address pages, checkout shipping and the edit-quote address modals, for anonymous, personal, corporate and corporate-limited users; aim at who can add or see which addresses (access), price and availability after a selection (money), duplicate or lost addresses (data), the cart shipment address (order state) and a buyer stuck without a usable address (broken buyer path) | exploratory (free) · R8 | 0 | browser | — |

Shared store: none
Changed rows: none

### Artifacts
| Artifact | Decision |
|---|---|
| Scenarios | RUN — S-1…S-12 |
| Test model | SKIP — scenarios cover the MODEL risks |
| Mind map | SKIP — no domain map resolved (known.domain gap) |
| Checklist | RUN (always) — ac-checks rows AC-1…AC-10, each naming its R |
| Exploratory | RUN — S-12, the free class-3 scenario · 45 min, ALONGSIDE — charter: R8 + F12 hotspots H-1…H-8 |
| Visual lane | RUN (F3) — instruments: PROBE (R8: pager, search box and long addresses in the header popover and quote modal) |
| Contract refresh | RUN — the diff names GetCurrentUserAddresses / GetCurrentOrganizationAddresses with the ids argument |
| Coverage triage + regression | SKIP — regression is not run by vc-test (U7); suites at risk in Out of scope |
| Verifier | RUN (Critical R1) |
| Case authoring | never in the run (D2) — candidate cases are listed at close-out |

### Data
Accounts: personal USER_EMAIL · corporate ORG_USER_EMAIL (org-maintainer) · two-org corporate MULTI_ORG_USER_EMAIL (S-2) · corporate-limited: an org member without xapi:my_organization:edit, resolved at entry (P2) · anonymous: none. Passwords by name through the lane only.
Addresses: created in the case (FIFTH RULE) as AGENT-TEST- through updateMemberAddresses — 8 for the personal book (page 2 exists), 10+ in the corporate-limited user's organization, made by a corporate account of that organization — and deleted in Cleanup. Price/availability product for AC-6: live-discover (P4).
Must differ: the selected address sits on page 2, is not a favorite and is not the cart shipment's previous address (R1, S-4) · organization A and B selections differ (R2) · the duplicate pair is identical in every field, and a control differs only in name/email (R4, KB-19826CC0) · the two tabs pick different addresses (R6) · the AC-6 product's price or availability differs between two addresses (R9) · Before redeploy: none

### Out of scope
- Regression (F5, U7): suites at risk 006, 011, 011b, 012, 013, 015, 025, 026, 027, 027b, 028, 029, 030, 033, 049, 050a, 050b1, 050b2, 050b3, 050b4, 050b5, 050c, 050d, 050e, 050f, 050g, 050h, 050i, 050j, 050k, 050l, 050m, 050m2, 050m3, 050n, 050o, 059, 059b, 059m, 059p, 061b, 063, 072c, 075b, 075c, 075d, 075f, 078, 081, 083c, 083e, 086, 095, 096, 101 — not run by vc-test (U7). Residual risk by group: checkout and quotes 011, 011b, 012, 013, 015, 081 — High (R1, R4, R10); organization, roles and account menu 006, 026, 027, 027b, 033 — High (R2, R3); cart 028, 029, 030 — Medium (cart shipment address, R6, S-4, S-9); the GraphQL, loyalty, page-builder, platform and back-office suites — Low (matched by regression:select on the vc-frontend path; this diff touches no backend). Follow-up `/qa-regression 006,011,011b,012,013,015,025,026,027,027b,028,029,030,033,049,050a,050b1,050b2,050b3,050b4,050b5,050c,050d,050e,050f,050g,050h,050i,050j,050k,050l,050m,050m2,050m3,050n,050o,059,059b,059m,059p,061b,063,072c,075b,075c,075d,075f,078,081,083c,083e,086,095,096,101`, the High groups first
- Not selected (scorer budget; residual risk each): C-2 keyword spinner after header remount — Medium · C-11 selection written on the old build, page 2, not favorite — Medium · C-3 catalog price/availability follows an off-page-1 selection — Medium (AC-6 row covers the page-1 case only) · C-9 limited user before the book total loads — Medium · C-16 limited user stuck after a zero-result search (review thread still open) — Medium · C-17 sign-out/sign-in as another type without reload — Medium · C-4 auto-select on a book larger than the mutation response — Low · C-5 isSameAddress empty-vs-null fields — Low · C-10 anonymous local address across sign-in/out — Low · C-19 quote choice for zero/one/many addresses — Low · C-20 anonymous See more vs pager — Low · C-23 rapid page clicks and keystrokes — Low
- vc-frontend#2284 (404, not analysed) — residual risk unknown, Low by the ticket text
- Mind map / data model — none exists for the domain — residual risk Low (scenarios create their data)
- Mobile-header-only layouts beyond the S-12 charter, and vc-frontend-next — residual risk Low

### Criteria
Entry: http://localhost answers with X-VC-Local-Theme fe-ade99ee05271 · `npm run env:check` green for vcst · vcst-qa /graphql and /connect/token reachable through localhost · me.permissions read for the four accounts · profile xAPI version read (S-1) · the old Add address gate observed on vcst's own storefront for a corporate-limited and a corporate account (R3 baseline) · Suspend (BLOCKED): the local container is down or its marker changes mid-run; vcst-qa unreachable; no corporate-limited account (S-3, S-8 only); no address-sensitive product (AC-6 row only)
Exit: every in-scope R has a result or a named deviation · the 45-min exploratory box is spent · every AGENT-TEST- address the run created is deleted · the R3 server-refusal question is put to the PO

### Amendments

### Reconciliation (filled at close-out)
| R | Planned | Ran (item ids · charter · lane · case ids) | Result | Deviation — reason |
|---|---|---|---|---|
| R1 | S-1, S-4 · FLOW, ST — S-1, S-4 · chrome | C-5, C-6, VIS-1, SC-1.1, SC-1.2, SC-1.3, SC-4.1, SC-4.2, SC-4.3, SC-4.4, SC-12.2, SC-12.8 | FAIL Medium | one instance seen |
| R2 | S-2 · MODEL, FLOW — S-2 · firefox | C-12, C-13, SC-2.1, SC-2.2, SC-2.3 | FAIL Medium | one instance seen |
| R3 | S-3, S-8 · MODEL, DT — S-3, S-8 · edge | C-11, SC-3.1, SC-3.2, SC-3.3, SC-3.4, SC-3.5, SC-8.1, SC-8.2, SC-12.7 | FAIL High | — |
| R4 | S-5, S-7 · FLOW, EP — S-7, S-5 · chrome | C-9, C-10, C-14, C-15, VIS-2, VIS-7, SC-2.3, SC-5.1, SC-5.2, SC-5.3, SC-6.4, SC-7.1, SC-7.2, SC-7.3 | FAIL High | — |
| R5 | S-6, S-10 · FLOW, ST — S-6, S-10 · firefox | C-10, SC-6.1, SC-6.2, SC-6.3, SC-6.4, SC-10.1, SC-10.2, SC-10.3, SC-10.4 | FAIL Medium | — |
| R6 | S-9 · FLOW — S-9 · firefox | SC-6.2, SC-9.1, SC-9.2, SC-9.3, SC-12.3 | FAIL Medium | — |
| R7 | S-11 · EP, BVA — S-11 · api | SC-1.3, SC-11.1, SC-11.2, SC-11.3, SC-11.4, SC-11.5, SC-11.6, SC-11.7, SC-11.8, SC-12.4 | PASS | — |
| R8 | S-12 · BVA, EXPLORE, VISUAL:PROBE — ac-checks + S-12 charter · chrome | C-2, C-3, VIS-3, VIS-4, VIS-5, VIS-6, VIS-7, SC-12.1, SC-12.2, SC-12.3, SC-12.4, SC-12.5, SC-12.6, SC-12.7, SC-12.8, SC-12.9 | FAIL Medium | — |
| R9 | DT — ac-checks · none | C-7 | BLOCKED | no address-sensitive product (project risk P4) |
| R10 | FLOW — ac-checks · none | C-4, C-8 | BLOCKED | needs a look (U65: no ui-checks lane) |
| R11 | EP — ac-checks · none | C-1 | PASS | — |

Candidate cases (→ /qa-test-lifecycle): none yet · Carried to Round 2 / escalation: none yet
