# Test strategy — VCST-6398

## Round 1 of 3 — 2026-10-20

Status: APPROVED (Elena Mutykova, 2026-10-20) · Depth label: deep (computed)
Blocked: no
Build: vc-frontend-next#11 @ d67b0e0a (merges vc-frontend 2.60.0: #2518, #2527, #2543, #2569, #2574 + #2533, #2548 not read) · Stand: vcst · Deployed: UNKNOWN → unverified ("DEPLOYMENT UNKNOWN: VirtoCommerce/vc-frontend-next#11 — no CI artifact resolved for this PR"; the served chunk index-u-TS9qWy.js carries `3.1.0-pr-11-d67b-d67b0e0a`, vc-deploy-dev@vcst-qa theme/artifact.json names the same zip) · Previous: none (clone VCST-6194 = merge 59, Done; VCST-6214 = 2.59 merge, PASS WITH NOTES on 3.0.0-alpha.2685)
Floors fired: F3 (rendering files: mission-card-skeleton.vue, plugin-route-placeholder.vue, …) · F4 (revenue-critical: quotes) · F5 (158 suites at risk via regression:select vc-frontend-next) · F8 (ui-kit: vc-calendar.vue, vc-file-uploader.vue, vc-textarea.vue) · F10 (org context: sales-rep) · F11 (hidden behaviour: default-values, feature-flags) · F1 register half (R2, R6, R7 High) · not fired: F2 (type Task), F6 (no NOT DEPLOYED line), F7 (type Task), F9 (applied inside each floor)

**Mission.** Find out, for the theme owner and the dev team, whether the 2.60.0 merge into vc-frontend-next behaves as the eight areas of comment 112130 say on vcst — and whether turning Module Federation on by default left any shopper or sales rep with a broken boot, hub or menu.

### Inputs
| Input | What we have | Gap → project risk |
|---|---|---|
| Project environment | vcst (B2B-store), theme 3.1.0-pr-11-d67b, platform 3.1086.0-pr-3139, SalesRep 3.1014.0, Xapi 3.1027.0, Return 3.1005.0, Loyalty 3.1009.0, Quote 3.1005.0; MF manifest route 200. Settings (F11): theme `module_federation_enabled`=true, `sales_rep_builtin_enabled`=false (deployed bundle); store SalesRep.Enabled=true, Loyalty.Enable=true, Loyalty.Missions.Enable=true, GoogleAnalytics4.EnableTracking=true, Quotes.EnableQuotes=true, Return.ReturnEnabled=true. Lanes: chrome, edge, firefox, DevTools | P1, P2, P3, P4 |
| Product elements | storefront only: compare table, configurable PDP checklist + section navigation, PDP SKU ink, quantity control (cart, quotes), punch-out header label + custom-grant auth, MF host + plugin contributions + Sales Rep Hub plugin, missions skeleton/banner, organization returns, file limits, DOM analytics engine, 4 ui-kit components; backend-packages.json bumps | — |
| Quality criteria | AC-1…AC-28 (AC-2…28 from comment 112130 {SPEC}; PR bodies are the author's word) · BL-UI-001 (CLS) · KB-8891459E, KB-0C163966, KB-C4597892, KB-D9DF8E54, KB-56048C88, KB-9E0ED0F4, KB-C239652A, KB-89822898 · no design link | P5 |

### Risks
| R | What a customer would see if this is wrong | Source | L×I | Level |
|---|---|---|---|---|
| R1 | On /compare the tabs do not switch rows, the differ line is missing, the sticky header notches or detaches, values sit under the wrong product when scrolled sideways, or the mobile bar splits | AC-2 · AC-3 · AC-4 · AC-5 · AC-6 · client-app/shared/compare/components/compare-table.vue:486 · client-app/shared/compare/components/compare-table.vue:445 · client-app/shared/compare/components/compare-table.vue:490 · client-app/shared/compare/components/compare-table.vue:430 · client-app/shared/compare/components/compare-table.vue:539 · client-app/shared/compare/components/compare-table.vue:455 · client-app/shared/compare/components/compare-table.vue:17 · client-app/shared/compare/components/compare-table.vue:465 · KB-8891459E | 3×3=9 | Medium |
| R2 | A buyer on a configurable PDP sees a wrong or stale section list, a green row while Add to cart stays disabled, or "Review" jumps nowhere / behind the header / to the wrong section | AC-7 · AC-8 · client-app/shared/catalog/components/configuration/product-configuration-checklist.vue:81 · client-app/shared/catalog/components/configuration/product-configuration-checklist.vue:87 · client-app/shared/catalog/components/configuration/product-configuration-checklist.vue:71 · client-app/shared/catalog/components/configuration/product-configuration-checklist.vue:76 · client-app/shared/catalog/components/configuration/product-configuration-checklist.vue:34 · client-app/shared/catalog/components/configuration/product-configuration.vue:18 · client-app/shared/catalog/components/configuration/product-configuration.vue:208 · client-app/shared/catalog/components/configuration/product-configuration.vue:217 · client-app/shared/catalog/components/configuration/product-configuration.vue:218 · client-app/shared/catalog/components/product-price-block.vue:13 · client-app/shared/catalog/components/configuration/product-configuration-checklist.vue:20 · client-app/shared/catalog/components/configuration/product-configuration-checklist.vue:129 · KB-0C163966 | 4×3=12 | High |
| R3 | The SKU line under the product title is unreadable in dark mode, or changes tint in light presets | AC-9 · client-app/pages/product.vue:33 | 2×2=4 | Low |
| R4 | In cart or a quote a buyer types a quantity above the range and gets no explanation, or a wrong one | AC-10 · KB-89822898 | 3×3=9 | Medium |
| R5 | A punch-out buyer sees no "Punchout mode" label, a mis-sized one, a crowded search field at 1024px, or the label survives sign-out; a punch-out start leaves the previous user's session | AC-11 · AC-12 · AC-13 · AC-14 · AC-15 · AC-16 · client-app/core/composables/useAuth.ts:102 · client-app/app-runner.ts:39 · KB-C239652A | 3×3=9 | Medium |
| R6 | A sales rep gets no hub, a dead menu entry, a placeholder that never resolves, or a user without the right org/permission sees hub content | AC-17 · AC-18 · AC-19 · AC-20 · AC-21 · floor:F10 · client-app/core/federation/contributions/plugin-route-placeholder.vue:2 · client-app/core/federation/contributions/declare.ts:66 · client-app/app-runner.ts:320 · client-app/core/federation/index.ts:611 · client-app/core/composables/useNavigations.ts:104 · client-app/modules/sales-rep/routes.ts:119 · KB-56048C88 | 3×4=12 | High |
| R7 | With Module Federation on by default every shopper's first page waits on (or breaks with) the plugin list; a failing plugin leaves dead menu links; the built-in hub registers twice or not at all | floor:F11 · client-app/config/settings_data.json:12 · client-app/config/settings_data.json:14 · client-app/modules/sales-rep/index.ts:53 · client-app/core/api/graphql/store/queries/getStorePlugins/getStorePlugins.graphql:21 · client-app/core/federation/index.ts:124 · client-app/core/federation/index.ts:734 · client-app/core/federation/contributions/evaluate.ts:149 | 3×4=12 | High |
| R8 | /account/missions jumps on load (no skeleton) or the rewards banner links nowhere | AC-22 · AC-23 · KB-C4597892 · BL-UI-001 | 3×2=6 | Medium |
| R9 | An organization user cannot open the organization returns list, can change a return from it, or a non-holder sees it | AC-24 · AC-25 · KB-9E0ED0F4 | 3×3=9 | Medium |
| R10 | A file attach field accepts an over-limit file or count, or shows no / a raw error | AC-26 | 3×2=6 | Medium |
| R11 | Analytics loses view_item_list / select_item on the named lists, sends them twice, or without list id/name | AC-27 · AC-28 · client-app/core/plugins/dom-analytics/engine.ts:205 · client-app/core/plugins/dom-analytics/registry.ts:7 · client-app/shared/catalog/components/product-card.vue:81 · client-app/pages/product.vue:5 · client-app/core/plugins/dom-analytics/engine.ts:232 · client-app/core/plugins/dom-analytics/engine.ts:161 · client-app/shared/catalog/components/product-card.vue:13 · client-app/shared/static-content/components/products-block.vue:5 · client-app/shared/static-content/components/products-carousel.vue:5 · client-app/shared/static-content/components/favorite-products.vue:26 · client-app/shared/catalog/components/product/variations.vue:13 · client-app/core/plugins/dom-analytics/rules.ts:5 | 3×3=9 | Medium |
| R12 | Compare and ui-kit surfaces lose contrast, token or a11y semantics (unnamed headers, wrong row descriptions, raw i18n key, bold values) | client-app/shared/compare/components/compare-table.vue:202 · client-app/shared/compare/components/compare-table.vue:67 · client-app/shared/compare/components/compare-table.vue:9 · client-app/shared/compare/components/compare-table.vue:679 · F8 ui-kit | 2×3=6 | Medium |
| R13 | A flow the comment did not list (cart, quotes, PDP, category, reviews, search) regresses after the 15 conflict resolutions | AC-1 · F5 · claims "everything not listed looked the same" | 3×3=9 | Medium |

Project risks: P1 VirtoCommerce.Punchout is not installed on vcst (`POST /api/punchout/cxml` → 404, no module in the list) and vc-frontend-next is deployed nowhere else → R5 items BLOCKED with that attempt; only the "no session ⇒ no label" negative runs; accepted. P2 CFG_HAT carries `shape-drift-20260518` (4→2 sections) → live-discover a configurable product with a required and an optional section; FIXTURE-GAP if none. P3 the bundle cannot verify deployment (UNKNOWN) → verdict says "deployment unverified" and quotes the line; mitigated by the served-chunk version. P4 index HTML is cached max-age=7200 (KB-D9DF8E54) → runners open cache-busted URLs and check the footer/chunk version first. P5 PR #2533 and #2548 were not read (over-cap) and next#11's diff was read to file 72 of 300 → R13's regression covers their surfaces; accepted.

### Strategy mix
Analytical ✔ · Methodical ✔ · Consultative ✔ · Model-based ✔: R6, R7 take MODEL (F10, F11) · Reactive ✔: F1 register half (High risks), the PO question on text/file row labels (#2527 thread) · Regression-averse ✔: F5 · Process-compliant ✔: WCAG 2.2 AA on the compare table semantics (R12)

### Approach per risk
| R | Technique / approach | Oracle {authority} | Layer · tool | Lane · agent | Effort |
|---|---|---|---|---|---|
| R1 | EP, STATE, VISUAL | AC-2…AC-6 {SPEC} | storefront · Playwright | chrome · qa-frontend-expert | medium |
| R2 | FLOW, DT | AC-7, AC-8 {SPEC}; KB-0C163966 {OBSERVED} | storefront · Playwright | chrome · qa-frontend-expert | high |
| R3 | VISUAL | AC-9 {SPEC} | storefront · DevTools | devtools · ui-ux-expert | low |
| R4 | BVA | AC-10 {SPEC}; KB-89822898 {OBSERVED} | storefront · Playwright | chrome · qa-frontend-expert | medium |
| R5 | EP | AC-11…AC-16 {SPEC} | storefront · Playwright | edge · qa-backend-expert | low |
| R6 | MODEL | AC-17…AC-21 {SPEC}; KB-56048C88 {OBSERVED} | storefront + xAPI · Playwright | edge · qa-backend-expert | high |
| R7 | MODEL | settings_data.json shipped values {SPEC}; KB-56048C88 {OBSERVED} | storefront · Playwright HAR | edge · qa-backend-expert | high |
| R8 | EP, VISUAL | AC-22, AC-23 {SPEC}; BL-UI-001 {BL} | storefront · Playwright | chrome · qa-frontend-expert | medium |
| R9 | DT | AC-24, AC-25 {SPEC}; KB-9E0ED0F4 {OBSERVED} | storefront + xAPI · Playwright | edge · qa-backend-expert | medium |
| R10 | BVA | AC-26 {SPEC} | storefront · Playwright | chrome · qa-frontend-expert | medium |
| R11 | EP, EG | AC-27, AC-28 {SPEC} | storefront · dataLayer + HAR | chrome · qa-frontend-expert | medium |
| R12 | VISUAL | WCAG 2.2 AA 1.3.1/1.4.3 {DOC} | storefront · DevTools + axe | devtools · ui-ux-expert | medium |
| R13 | REGRESSION | suite expectations {OBSERVED} | storefront · Playwright | regression-orchestrator | medium |

### Artifacts
| Artifact | Decision |
|---|---|
| Test model | RUN (new) — expands R6, R7 |
| Mind map | RUN — update configurable-products (domain map PRESENT) |
| Checklist | RUN (always) |
| Exploratory | RUN 45 min, ALONGSIDE — charter: R2 (text/file row label PO question), R6/R7 model unresolved items, R11 dedupe across filter/reset |
| Visual lane | RUN (F3/F8) — R3, R12, token audit of the 4 ui-kit components, dark + light, desktop + mobile |
| Contract refresh | RUN — done at Join 1: no drift on GetStorePlugins / organizationReturns, 86/86 fixtures |
| Coverage triage + regression | RUN — critical cases of the suites covering the eight areas: 098, 072, 072d, 028, 015, 083c, 014b, 093, 093b, 106, 043; staleness check first (tc:scope + suites:executability:check), stale → lifecycle; the other 147 at-risk suites → Out of scope |
| Verifier | SKIP — no Critical risk |
| Case authoring | never in the run (D2) — candidate cases are listed at close-out |

Lanes sequenced: chrome ‖ edge ‖ firefox first; DevTools visual joins when the first returns; the regression runs after the three browser lanes return.

### Data
R1: live-discover 2+ products of one category, added to compare in the case (guest). R2: live-discover a configurable product with ≥1 required and ≥1 optional section (CFG_HAT drifted — P2). R4: AGENT_POOL_SLOT_1 b2b user, a product with a max-quantity rule, create-on-fly cart line + a quote (quote deleted at teardown). R6/R7: @td(SR_REP_PRIMARY), a non-rep buyer (AGENT_POOL_SLOT_3) for the negative. R8: @td(LOYALTY_VIP_USER). R9: @td(ORG_RET_HOLDER_GLOBAL) holder + @td(ORG_RET_BUYER) non-holder in ORG_RET_VIEWER_ORG. R10: generated files over/under the limit in the case. R11: guest on category, PDP with variations, cart recently browsed.
Must differ: R2 a required vs an optional section, a filled vs an empty one; R9 a holder vs a non-holder of the same organization; R4 a quantity inside vs above the range. Before redeploy: none.

### Out of scope
- AC-1's "create a new repository" half — repository setup, not a storefront behaviour; the release number conflict (59 vs 60) is a PO question — residual risk Low
- Punch-out label behaviour on a live session (AC-11…16 except the negative) — module absent on vcst (P1) — residual risk Medium
- The other 147 suites `regression:select` named (whole frontend + GraphQL backends) — a fork-wide merge selects everything; the eight areas' suites run — residual risk Medium
- PRs #2533, #2548 and next#11 files past the diff cut — not read — residual risk Medium (R13 covers their surfaces)

### Criteria
Entry: footer/chunk shows 3.1.0-pr-11-d67b · `npm run env:check` green · fixtures reachable · Suspend (BLOCKED): theme build differs from pr-11, GetStorePlugins errors for every user, storefront down
Exit: every in-scope R has a result or a named deviation · exploratory box spent · visual lane returned with `qa-design skill: loaded`

### Amendments

### Reconciliation (filled at close-out)
| R | Planned | Ran (item ids · charter · lane · case ids) | Result | Deviation — reason |
|---|---|---|---|---|

Candidate cases (→ /qa-test-lifecycle): <ids or none> · Carried to Round 2 / escalation: <R-ids or none>
