# Test Case Lifecycle Report — TLC-2026-07-27-0900

## Summary
- **Input:** `042 review, verify, auto-fix` → direct-scope, `--skip-sync --skip-generate --auto-fix` (+ verify)
- **Date:** 2026-07-27 09:00
- **Env:** vcst-qa · Platform **3.1048.0** · Theme **vc-theme-b2b-vue 2.54.0-pr-2395** (confirmed live in page footer)
- **Scope:** suite 042 `Frontend/smoke/042-smoke-tests.csv` — 34 cases, all Critical/High
- **Verdict:** **APPROVED** — the 2 Critical CHANGED findings were resolved on operator confirmation that the storefront has no Terms & Conditions control. Phase 5 completed (all 14 routes).

## Phase Results

| Phase | Owner | Status | Key metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | 1 suite, 34 cases; no duplicate TLC run in 24h |
| 2. Sync | — | **Skipped** | direct scope, no change source |
| 3. Analyze & Generate | — | **Skipped** | `--skip-generate`; no cases added/removed |
| 4. Review & Fix | test-management-specialist | Done | 133 → **28** findings; 0 Blocker/Critical/High |
| 5. Verify | orchestrator (fallback) | **Done** | **14/14 routes**, 5 flows; 0 BROKEN, 2 CHANGED (Critical) — **both now fixed** |
| 6. Approve | orchestrator | **APPROVED** | 9 gates PASS, 1 N/A; 0 Blocker/Critical/High remaining |

Phase 5 was delegated to `qa-testing-expert` twice; both runs died on transient `529 Overloaded` before producing output. Per `.claude/rules/agents.md` the orchestrator stopped retrying and executed the checks directly — with reduced coverage (see §Environment Verification).

## Review Findings — 133 → 28

| Severity | Before | After |
|---|---|---|
| Critical | 10 | **0** |
| High | 89 | **0** |
| Medium | 33 | 27 |
| Informational | 1 | 1 |

Independently re-verified by the orchestrator: `suites:review` = 28 findings (0 Blocker/Critical/High) · `td:validate` = **90/90 refs resolved**, no bare GUIDs, DV-021 clean · `graphql:lint-labels` = clean (0 runner-native cases) · CSV round-trips at **34 rows × 15 columns, IDs identical and in original order**, 0 deprecated, manifest `testCount` unchanged.

Fix classes applied (details in the git diff — not restated here):
`D-004`×8 specific `[WAIT]` after state-changing `[ACT]` · `C-005`×2 `errors[] empty` on GraphQL mutations · `D-005`×13 compound-step splits · `D-003`×2 checkbox verb `check`→`tick` · `T-002`~40 assertions given real selectors/quoted text · `T-001`/`T-003`×4 falsifiable predicates + `=` formulas · `D-006` 6 cases cleared of terminal Steps-level `[ASSERT]`.

## Tooling defects found and fixed (`scripts/test-cases/lint-test-cases.ts`)

Two **GOLDEN-RULE violations** (`.claude/rules/test-data.md`) in the review tool itself — both the "transcribed constant manufactures phantom findings" pattern. Fixed at source rather than by editing test text, then verified to still catch real violations.

| # | Defect | Phantom findings cleared (repo-wide, 118 suites) |
|---|---|---|
| 1 | `KNOWN_VARS` was a hand-listed **16** env-var names vs **66** real ones; every valid token outside the list was reported `DV-001`/`C-002`. Now derived from the committed `.env.*` layers + `templates/.env*.template` (names only), with per-env suffix stems inferred, not listed. | **43** `DV-001` + **14** `C-002` Highs across 33 cases |
| 2 | `D-003`/`D-005` read the **quoted UI label** the step targets, so a real control named *"I agree to the Terms **and** Conditions"* read as a compound step and a *"**Verify** email"* button as an ambiguous verb — pushing authors to invent label text that isn't in the product. Rules now judge step *shape* via `withoutQuoted()`. | **19** `D-005` + **9** `D-003` Highs (worst: `082-auth-impersonation` ×9) |

`npx tsc --noEmit -p ci/tsconfig.json` clean. Discrimination probes confirm real compound steps (`click 'Save' and navigate…`, `fill 'Email'; fill 'Password'`), real ambiguous verbs (`verify the total is correct`) and unknown tokens (`{{TOTALLY_BOGUS_VAR}}`) all still flag.

## Environment Verification (Phase 5 — partial)

Env healthy: `{BACK_URL}/health` → `Healthy` (modules loaded, cache active); storefront 200.

| Target | Check | Result | Notes |
|---|---|---|---|
| `/` | SMK-001 hero, nav, search, cart icon, sign-in | **VERIFIED** | 0 console errors |
| `/catalog` | SMK-007 category tiles + facets + products | **VERIFIED** | 3,500 results, 82 product cards; category links **with counts** in left sidebar (Beauty 3, Bolts 29, Home Appliances 326…), facet panel present |
| `/sign-in` | SMK-004 email/password/submit | **VERIFIED** | + Entra ID & Google SSO buttons |
| login flow | SMK-004 first 4 steps | **VERIFIED** | authenticated as the personal test user |
| `/account/orders` | SMK-033 filter control | **VERIFIED** | see below |
| `/account/addresses` | SMK-017 entry point | **VERIFIED** (link) | exists as a direct sidebar route, not only via dashboard |
| `/sign-up` | SMK-002/003 registration form | **CHANGED** ×2 | Personal: radios + First/Last name + Email + Password(+rules) + "Sign up". Company adds "Company name*". **No T&C checkbox — see below** |
| `/cart` | SMK-010/012/013 | **VERIFIED** | line-item table (Properties / Price per item / Quantity / Total), Subtotal $189.00, Shipping +$150.00, Total $406.80, "Clear cart", "Remove selected". `Place order` disabled pending payment (validation, not a defect) |
| `/bulk-order` | SMK-022 | **VERIFIED** | real heading is **"Bulk order pad"**; Copy&Paste / Manually tabs, `SKU,Quantity` textarea; Reset + Add to cart disabled until input |
| `/account/dashboard` | SMK-017 precondition | **VERIFIED** | **"Addresses" link present in sidebar** for the personal account |
| `/account/profile` | SMK-025 | **VERIFIED** | "Profile" heading, First name pre-populated |
| `/account/quotes` | SMK-005 | **VERIFIED** | "Quote requests" heading + "Request Quote"; **no 403** for the personal user |
| `/company/members` | SMK-005/021 | **VERIFIED** *(org user)* | heading + "Invite members" + Filters + members table with roles; no 403; 0 console errors |
| `/company/info` | SMK-021 | **VERIFIED** *(org user)* | org name **`AGENT-TEST-Org-TechFlow-20260310`** rendered — satisfies "organization name shown" |
| `…/agent-test-config-laptop` | SMK-018 option pricing | **VERIFIED** | RAM radiogroup (8GB $0.00 checked, 16GB $100.00), Storage default 512GB SSD, **Price $1,074.00** = 999+0+75 |
| `…/agent-test-ring-txt-cfg` | SMK-019 text section | **VERIFIED** | "Engraving Text *" + **`0 / 30`** counter (maxLength=30 confirmed live); Add to cart **disabled** with "Complete all required options" |

**Counts: 14 VERIFIED · 2 CHANGED · 0 BROKEN · 0 BLOCKED.** All 14 referenced routes covered; 5 flows exercised (personal login, org login, configurable option change, orders Filters dialog, cart delivery-option switch).

### CHANGED (Critical) — SMK-002 / SMK-003 reference a control that does not exist

Both cases step `[ACT] tick 'I agree to the Terms and Conditions' checkbox`. On this build `/sign-up` has **no consent control of any kind** — searched for `agree`, `Terms`, `policy`, `privacy`, `consent`, `accept`, `I have read` across **both** the Personal and Company account variants: zero matches. The form is radios → First name → Last name → Email → Password (+ rules) → `Sign up` (Company adds `Company name*`).

This was escalated rather than auto-fixed, because it was two-sided: a stale step, or a compliance-relevant product defect. **Operator confirmed (2026-07-27): the storefront has no Terms & Conditions control — by design.** So it is a stale step, and both cases were rewritten (see §Applied fixes). This also retroactively justifies Phase 4 declining to reword the quoted label — the label was never the problem.

Live verification additionally exposed a **second** stale label in the same two cases that the static pass could not see: the submit button is **"Sign up"**, not "Create Account"; the account types are **"Personal account"** / **"Company account"**, not "Personal" / "Organization"; and the field labels are lowercase **"First name"** / **"Last name"** / **"Company name"**.

### Applied fixes (post-confirmation)

| Case | Change |
|---|---|
| SMK-002 | Removed the T&C step. `'Personal' account type` → **`'Personal account'` radio**; `'Create Account'` → **`'Sign up'`**; split the 4-field compound fill into one `[ACT] fill` per field with the real lowercase labels |
| SMK-003 | Removed the T&C step. `'Organization' account type` → **`'Company account'` radio**; `'Company Name'` → **`'Company name'`**; `'Create Account'` → **`'Sign up'`**; split the compound fill; Failure_Signals rewritten to the real labels |
| SMK-018 / SMK-019 | Ambiguous `click first option…` → **`click the first option's radio input ('[role=radiogroup] input[type=radio]')`** with an explicit note that the option image is not a selection target (it is a no-op — see determinism finding) |
| SMK-025 | `'First Name'`/`'Last Name'` → **`'First name'`/`'Last name'`** (verified live on `/account/profile`); compound fill split |

Sync provenance recorded in each case's References column per the lifecycle sync rule.

**Deliberately left alone:** SMK-017's and SMK-034's *address*-form field labels (`First Name`, `Street Address`, …) at lines 282/427. I never opened the address form, so I cannot confirm its casing — changing it would be guessing. Worth a follow-up verify pass.

### Flow verifications now groundable `{OBSERVED}`

- **SMK-018 price recompute** — selecting RAM 16GB moved **$1,074.00 → $1,174.00** (999+100+75), no reload. `BL-PRICE-*` / configurable pricing confirmed.
- **BL-BOPIS-002** — switching cart Delivery option to **Pickup** drove **Shipping cost $150.00 → $0.00** and Total $406.80 → $226.80 (189.00 + 37.80 tax). Restored to Shipping afterwards; cart left exactly as found.
- **SMK-019 text-section validation** — required Text section blocks add-to-cart; `0 / 30` counter present.
- **SMK-033 Filters dialog** — status checkboxes + `Reset`/`Apply`, both disabled until a status is ticked.

### Determinism finding for SMK-018/019 (worth fixing in the cases)

Clicking a configurable option's **image** does **not** select it — the RAM header stayed on `8GB` and the price did not move. Only clicking the option's **radio input** selects. A step phrased "click the option" is therefore ambiguous enough to produce a false FAIL on the price assertion. The steps should name the radio explicitly.

### BOPIS pickup-location picker — not exercised (scope limit, not a finding)

With Pickup active, the Shipping details section showed **only** the Delivery-option toggle — no pickup-location picker. The cart held a Canon printer, **not** the suite's `BOPIS_*` fixture, and BOPIS availability is inventory/FFC-dependent, so this is most likely correct behaviour for a non-BOPIS product. SMK-024's "pickup location selection UI opens" / "≥1 pickup location selectable" and SMK-030's FFC-modal assertions remain **unverified** — they need a cart seeded with a BOPIS-eligible product.

### Incidental live facts (useful for future authoring)

- Sign-out is the action **"Logout"** in the account menu (not "Sign out"/"Log out") — refines `feedback_no_signout_page`.
- `/sign-in` **redirects to `/catalog`** when already authenticated — a case that assumes the form renders must sign out first.

**SMK-033 answered — the case's interaction model is correct.** The `Filters` button (`aria-haspopup="dialog"`) opens a dialog containing status **checkboxes with counts** plus **`Reset`** and **`Apply`** buttons. Both start `[disabled]` until a status is ticked — correct validation, *not* a defect (`feedback_no_force_disabled_controls`). The case's `'Clear filters' or 'Reset'` wording already covers the real label. The sidebar additionally exposes the same statuses as one-click filters.

**Live order-status vocabulary:** `Processing`, `Completed`, `New`, `Payment required`, `Ready for pickup`. **No `Shipped`** — the seeded order literally named `AGENT-TEST-ORD-SHIPPED` renders as **`Ready for pickup`**. 042 asserts no `Shipped` status and no tracking-number UI, so it is unaffected; the known gap applies to suite 014, not here.

### Findings that are ENV / tooling issues, not case defects

1. **Suite 042 is not reliably executable on `playwright-firefox`.** Button clicks resolve the element then time out on *"visible, enabled and stable"* — reproduced on both the `/sign-in` submit and the `/account/orders` `Filters` button. **The identical clicks succeed on `playwright-edge`.** This is broader than the documented cart-dropdown quirk (`feedback_firefox_cart_dropdown_quirk`) and matters because the manifest assigns 042 to `qa-testing-expert`, whose default browser is firefox. Firefox login is only achievable via Enter-key submit.
2. **Missing seeded catalog images — systemic test-data gap.** The configurable fixtures were seeded **without their image assets**. 11 console 404s under `/cms-content/assets/catalog/`: `AGENT-TEST-CFG-013` (main + alt-1 + alt-2, in `_sm` and `_md`), its option products (`CFG-013-OPT-8GB` / `-16GB` / `-32GB`), `AGENT-TEST-CFG-017`, `CF-001`; plus `AGENT-TEST-CFG-019` (×3) on the homepage. **These are exactly the fixtures 042 uses** (`CFG_LAPTOP`=CFG-013, `CFG_RING`=CFG-017), so it breaks SMK-007's `…≥1 item with name, price, image` and any "no console errors" assertion. Fix by reseeding the configurable-product image assets.

### Verdict rationale

This run was recorded **NEEDS FIXES** while SMK-002/SMK-003 carried a step targeting a control absent from the deployed build — they could not pass as written, and 042 is the P0 pre-deploy GO/NO-GO gate. On operator confirmation that the storefront has no T&C control, both cases were rewritten and the verdict is now **APPROVED**: 0 Blocker / 0 Critical / 0 High, 34 rows × 15 columns with IDs intact, `td:validate` 90/90, GraphQL label lint clean.

Residual: 27 Medium (26 × `D-006` `[ASSERT]`-gates-a-step, judged intentional; 1 × `C-007`) + 1 Informational (`GRD-001` provenance). None block regression.

## Quality Gates

| Gate | Status | Detail |
|------|--------|--------|
| G1 Structure | **PASS** | 0 Blocker; 34 rows × 15 cols, IDs preserved |
| G2 Determinism | **PASS** | 0 Critical (all 8 `D-004` resolved) |
| G3 Completeness | **PASS** | 0 High (cap ≤3) |
| G4 Testability | **PASS** | 0 Critical |
| G5 Data Validity | **PASS** | 90/90 refs resolved, no GUIDs, DV-021 clean |
| G6 Coverage | **PASS** | BL-* on **33/34** P0/P1 = **97.1%** (≥80%); 35 distinct BL cited; ECL 34/34. Phase 4c no-op — 0 BL candidates surfaced |
| G7 Duplication | **PASS** | no same-layer duplicates reported |
| G8 Environment | **PASS** | 14/14 routes, **0 BROKEN**; both CHANGED findings fixed |
| G9 Sync | **N/A** | Phase 2 skipped (direct scope) |

**Verdict: APPROVED** — see §Verdict rationale above.

## Remaining Items — open, not blocking the suite itself

| Item | Owner decision needed | Why |
|---|---|---|
| **Firefox click-stability** — no per-suite browser override exists in `config/test-suites.json` (0 suites carry a `browser` field), so the only real levers are changing 042's `agent` (a suite-ownership change) or documenting the constraint. **Not applied** — adding an inert config field would look like a fix without being one | yes | in a 3-slot regression run 042 can land on the firefox slot and be unable to click |
| Reseed the configurable-product **image assets** (CFG-013 + its 3 options, CFG-017, CFG-019, CF-001) | no — just needs running | 11 console 404s on 042's own fixtures; breaks SMK-007's `name, price, image` assertion |
| Seed a BOPIS-eligible cart to verify SMK-024/030 | no | pickup-location picker never exercised (absence on a non-BOPIS cart is expected) |
| Verify the **address-form** field labels (SMK-017 line 282, SMK-034 line 427) | no | left unchanged because the form was never opened — do not guess casing |

### Deferred (correctly out of scope)
| Item | Rule | Note |
|---|---|---|
| 27 `[ASSERT]`-in-Steps in 24 cases | D-006 (Medium) | each individually judged to genuinely **gate** the next step — kept intentionally |
| Cart / Configurable / B2B groups lack negative+boundary cases | TC-001 (Medium) | needs Phase 3 authoring, which was skipped |
| All 34 cases carry no assertion provenance tags | GRD-001 (Info) | partial tagging would fabricate `{OBSERVED}`. Phase 5 now makes a substantial set genuinely groundable — all 14 routes, SMK-018 price recompute, BL-BOPIS-002 $0.00 shipping, SMK-019 text validation, SMK-033 Filters dialog |
| SMK-021 has no BL-* ref | BL-001 | only P0/P1 case without one |

## Files Modified
- `regression/suites/Frontend/smoke/042-smoke-tests.csv` — 34 cases fixed in place (no adds/deletes/renumbering)
- `scripts/test-cases/lint-test-cases.ts` — 2 phantom-finding defects fixed (derived `KNOWN_VARS`; quote-aware `D-003`/`D-005`)

## Next Steps
- [x] Resolve the SMK-002/003 T&C question — **confirmed no T&C control by design; both cases rewritten**
- [ ] Decide 042's browser assignment before the next pre-deploy smoke run
- [ ] Reseed configurable-product image assets
- [ ] `/qa-regression smoke` — 042 is APPROVED and ready to run
