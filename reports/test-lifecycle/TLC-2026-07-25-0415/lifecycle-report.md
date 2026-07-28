# Test Case Lifecycle Report — TLC-2026-07-25-0415

## Summary
- **Input:** `014` → resolved as `suite 014` (Orders Frontend)
- **Input Type:** direct-scope
- **Date:** 2026-07-25 04:15
- **Platform:** 3.1048.0 · **Theme:** 2.54.0-pr-2395-fd70 (deploy-state cache @ 2026-07-24T19:21Z, env vcst-qa)
- **Modules:** Orders 3.1013.0 · XOrder 3.1007.0 · Cart 3.1007.0 · XCart 3.1028.0 · Customer 3.1020.0
- **Verdict:** **NEEDS FIXES** (0 Blocker, 0 Critical — G3 Completeness is the only failing gate)

Suite 014 was **structurally unparseable** and silently under-counted. That is repaired
(3 lost test cases recovered) and **every Blocker- and Critical-severity finding is now resolved**
(1 Blocker + 16 Criticals across three passes). G1, G2, G4, G5, G6 pass.

What remains is 254 High/Medium content-quality findings that need one of three **human** inputs —
per-page UI grounding (T-002), real requirement refs (REQ-001), or a product decision on 7 order-state
fixtures. None of them is safely machine-resolvable; see §Blockers resolved and §Remaining.

## Phase Results

| Phase | Status | Key Metrics |
|-------|--------|-------------|
| 1. Scope | Done | 1 suite (014), direct-scope |
| 2. Sync | Skipped | No change source (direct scope) — per command contract |
| 3. Analyze & Generate | Partial | Fixture gap found (8 unaliased entity tokens); no cases generated |
| 4a. Review (static) | Done | 342 findings — 0 Blocker, 10 Critical, 301 High, 30 Medium |
| 4b. Auto-Fix | Done | 49 edits across 5 rules → **342 → 303**, **10 Critical → 0** |
| 4c. BL Audit | No-op | Run surfaced 0 BL candidates (Phase 2 skipped, no cases generated) |
| 5. Verify (browser) | Skipped | Deferred — G3 still fails; verify after the authoring pass |
| 6. Approve | **NEEDS FIXES** | 7 of 8 evaluated gates PASS; G3 Completeness fails |

## Structural Repair (applied)

Suite 014 could not be parsed by the repo's own linter. Two distinct corruptions:

| Class | Defect | Count | Fix |
|-------|--------|-------|-----|
| A | Unescaped inner `"` in Assertions/Failure_Signals prose (`createddate:["...Z" TO "...Z"]`) | 24 quotes | Escaped as `""` |
| B | Lost record break — `"Draft""ORD-081"` instead of `"Draft"`CRLF`"ORD-081"` | 3 records | Row breaks restored |

**Class B was silently destroying test cases.** ORD-081, ORD-082, ORD-083 had been swallowed
into ORD-080's record as extra columns, and ORD-080's `Automation_Status` had become
`Draft"ORD-081`. Any strict reader saw 96 records, not 99 — so **3 VCST-4892 date-picker
cases (2 of them FAIL-DETECT guards for a still-open bug) were invisible to the runner.**

Repair was validated before writing: 15 header cols, 99 records × exactly 15 cols, 0 duplicate
IDs, visible text byte-identical after quote normalization (the script refuses to write unless
all hold).

### Recovered cases
| ID | Section | Priority | Title |
|----|---------|----------|-------|
| ORD-081 | Orders > Date Filter > Navigation | High | Applied date range persists after back navigation (FAIL-DETECT) |
| ORD-082 | Orders > Date Filter > Validation | High | Reversed range shows inline validation and blocks Apply |
| ORD-083 | Orders > Date Filter > BVA | Medium | Same-day range (Start = End) accepted and filters correctly |

## Tooling defects fixed (blocked the pipeline itself)

1. **`scripts/test-cases/lint-test-cases.ts` choked on the UTF-8 BOM** — reported a bogus
   `S-007 Blocker: Invalid Opening Quote … (utf8 bom)` and analysed **zero** dimensions.
   12 of 118 suite CSVs carry a BOM, so the Phase 4a gate was inert for all of them.
   Fixed by stripping the BOM at read.
2. **`CSV_LINT_BASELINE` shrunk 11 → 8** — `suites:lint` itself reported `014, 040b, 082`
   as passing-but-still-baselined. All three de-baselined (040b/082 pass because of fix #1).
3. **Stale `testCount`** — manifest said 95 for suite 014; the real count is **99**. Corrected.

## Phase 4b — deterministic fixes applied (49 edits)

Every rule was gated on the **linter's own finding set**, not a locally re-derived regex.
(First attempt used a broader mutation pattern and would have edited 14 cases where the gate
flagged only 5 — discarded.)

| Rule | Sev | Fixed | What was done |
|------|-----|------:|---------------|
| D-004 | Critical | 5 | Inserted a context-appropriate `[WAIT]` after each state-changing `[ACT]` |
| C-005 | Critical | 5 | Added `[API] mutation response errors[] is empty` to `Cross_Layer_Checks` |
| D-006 | Medium | 20 | Removed **trailing** `[ASSERT]` lines from `Steps` (already covered by `Assertions`) |
| DV-001 | High | 15 | `{{COMPLETED_ORDER}}` / `{{SHIPPED_ORDER}}` / `{{PROCESSING_ORDER}}` → `@td(X.number)`; key renamed `…_order_id=` → `…_order=` |
| S-006 | High | 4 | Status → canonical vocabulary; the prose preserved into `References` |

**S-006 mapping:** `Validated` → `Reviewed` · `N/A: Feature not on storefront…` → `Deprecated` ·
`Generated — verified PASS on 2026-05-26 manual repro (…)` → `Manual` (×2).

**D-006 deliberately conservative.** A Steps `[ASSERT]` was removed only when it is *trailing*
(no later action step, so it cannot gate anything). **8 mid-flow `[ASSERT]`s were left in place
and reported** — in CHK-049, for example, `[ASSERT] Verify 'Download Invoice' is absent or
disabled` genuinely gates the following `[ACT] If button is shown, click it`. Deleting those
would have destroyed flow semantics; the linter's own wording ("confirm it gates a step") is a
judgment call, not an auto-fix.

### Post-fix validation
- `suites:review` → **0 Blocker, 0 Critical** (was 10 Critical)
- `td:validate` → `014-orders-frontend.csv: 44/44 resolved`, no hardcoded GUIDs
- `suites:lint` → OK (119 suites), 014 no longer baselined
- Strict re-parse → 99 records × 15 cols

## Phase 4b (second pass) — `--auto-fix` normalization

The 79 C-003 "only 1 assertion" findings were **not** missing assertions. 78 of them had
4 assertions on a single `;`-separated line, and the linter's `lines()` helper splits on
newline only. Same for D-005: the Steps cells were single `;`-separated lines. So the fix was
formatting normalization, fabricating nothing.

| Pass | Action | Effect |
|------|--------|--------|
| Split cells | Split Steps + Assertions at `;` **only where a `[TAG]` follows**; strip dangling trailing `;` | 78 Steps cells + 98 Assertions cells; +806 step lines, +298 assertion lines |
| D-004 re-pass | Re-ran `[WAIT]` insertion — splitting exposed `[ACT]`s the line-by-line rule could not previously see | +26 `[WAIT]` |
| D-006 re-pass | Trailing `[ASSERT]` in Steps: dropped when duplicated in Assertions, **moved into Assertions** when unique | 67 cases — 98 dropped, **74 promoted** (content preserved) |

Never split on `and`/`then` — that is a semantic judgment, not formatting. 41 steps remain
compound for that reason and are left for a human.

Result: **C-003 79 → 1** · **D-005 92 → 41** · **D-006 86 → 65** · step lines 872, assertion lines 524.

### Honest accounting: the raw total barely moved (303 → 342)

Splitting one long line into 8 tagged lines means the per-line rules now evaluate 8 things
where they previously evaluated 1. Findings that were always true became *visible*:

| Rule | Before | After | Why |
|------|-------:|------:|-----|
| T-002 vague `[DOM]` | 29 | **120** | Each assertion now checked individually |
| D-002 generic element ref | 0 | **6** | `[ACT] clear the search field` was buried mid-line |
| D-003 ambiguous verb | 3 | 7 | same |
| T-001 / T-003 | 8 / 1 | 11 / 4 | same |
| DUP-001 / DUP-004 | 0 | 1 / 3 | Duplicate setup steps now comparable |

**This is the gate working, not new damage** — the suite is strictly better-formed than before.
But it means **G2 regressed PASS → FAIL**: the 6 newly-visible D-002 Criticals
(`clear the search field`, `enter a search term in the search field`, …) need the **real UI
label in quotes**, which I will not guess — quoting an invented label would satisfy the linter
while making the test wrong. Those need `storefront-selectors.md` or a live look.

## Static Review — remaining findings (342)

| Rule | Count | Sev | Dimension | Why not auto-fixed |
|------|------:|-----|-----------|--------------------|
| T-002 `[DOM]` assertion lacks specifics | 120 | High | 4 Testability | Needs the real element/text — cannot be invented |
| D-006 mid-flow `[ASSERT]` | 65 | Medium | 2 Determinism | May gate the following action — human call |
| REQ-001 High case lacks requirement link | 59 | High | 3 Completeness | Needs real traceability; a placeholder ref is worse than none |
| D-005 compound step (`and`/`then`) | 41 | High | 2 Determinism | Splitting on prose conjunctions is semantic, not formatting |
| DV-001 unknown `{{TOKEN}}` | 11 | High | 5 Data Validity | **Blocked on missing fixtures (below)** |
| T-001 vague predicate | 11 | High | 4 Testability | Judgment |
| TC-001 missing negative/boundary | 10 | Medium | 9 Technique | Authoring new cases |
| D-003 ambiguous verb in `[ACT]` | 7 | High | 2 Determinism | Needs the assertion split out by hand |
| D-002 generic element reference | 6 | **Critical** | 2 Determinism | **Needs the real UI label** — see above |
| T-003 `[MATH]` without formula | 4 | High | 4 Testability | Needs the actual arithmetic |
| C-006 / C-003 / DUP-001 / DUP-004 / GRD-001 | 8 | mixed | — | mixed |

### Data-validity gap (DV-001) — the substantive blocker

The remaining 11 findings are **8 distinct order-entity tokens with no alias at all**:
`BOPIS_PICKUP_ORDER`, `SAMPLE_TRACKING_NUMBER`, `ORDER_WITH_DISCONTINUED_ITEM`,
`ORDER_WITH_OOS_ITEM`, `INVOICE_AVAILABLE_ORDER`, `ORDER_WITH_RETURN`,
`ORDER_PAST_RETURN_WINDOW`, `PARTIALLY_SHIPPED_ORDER`.

`{{VAR}}` is for per-environment config, not entities (`.claude/rules/test-data.md`), so these
resolve to nothing at runtime. Every case referencing them is **unrunnable regardless of the
other findings** — this is the top priority, ahead of the cosmetic rules.

## Blockers resolved (pass 3)

### D-002 — 6 Criticals, fixed with grounded labels (not guesses)

The rule wanted the real UI label in quotes. Rather than invent one, I resolved it from source:
`client-app/shared/account/components/orders.vue` → the orders search is a `VcInput` with
`:placeholder="$t('pages.account.orders.search_placeholder')"`, `maxlength="64"`, `clearable`, and an
append `VcButton :aria-label="$t('common.buttons.search_orders')"`; `locales/en.json` gives the strings:

| Key | Real string |
|-----|-------------|
| `pages.account.orders.search_placeholder` | **"Search by number, name or other data"** |
| `common.buttons.search_orders` | **"Search orders"** |

10 step lines across ORD-015 / ORD-022 / ORD-056 / ORD-059 rewritten to name the real control
(`[ACT] type PREFIX into the 'Search by number, name or other data' input`), and the `maxlength=64`
fact recorded in References for the two prefix-search cases. **D-002 6 → 0, Critical → 0.**

Reusable for the T-002 backlog on this page: `OrdersTable` / `OrdersDesktopFilters` /
`OrdersMobileFilters` components; labels "All orders", "My orders", "Reset filters", "Reset search",
"There are no results found", "There are no orders yet". Grounded against `dev`, not the pinned
theme 2.54.0 — worth re-confirming if a label looks off.

### DV-001 — `SAMPLE_TRACKING_NUMBER` resolved; 7 fixtures are a product call

Added `SAMPLE_TRACKING_NUMBER` as an `_inline` alias (`AGENT-TEST-TRK-CHK024`) — it is a *generated
input* typed into Admin, not a lookup of existing data, so it is env-invariant and correctly lives in
the committed base (no GUID, DV-021 clean). 5 tokens rewired. **DV-001 11 → 9.**

### The deferred-fixture premise was partly wrong — and that is the real finding

`orders-specs.mjs` and `test-data/README.md` deferred the remaining 7 states as "feature-gated,
needs a product-owner call", naming three store-config keys to confirm. A live read of **all 96
settings** on `GET /api/stores/{STORE_ID}` shows the store-config half of that premise is **false**:

- **No** store-level enable flag exists for returns, invoice, or buyer-cancel. `RETURNS_FEATURE_ENABLED`,
  the invoice store setting, and `STORE_CONFIG_BUYER_CANCEL` **do not exist** — and there is no
  storefront `$cfg.*` counterpart either. "Enable the setting first" was never the blocker.
- **Returns module IS installed** — `Return.ReturnNewNumberTemplate` is the only `Return.*` setting.
- **Pickup IS enabled** — `XPickup.Enabled = true`, so `BOPIS_PICKUP_ORDER` is reachable today.
- **Invoice has no platform setting at all** — CHK-047/048 + ORD-014/041/042/043 may be testing a
  surface this deployment does not have.

So the genuine product-owner questions are only: (a) the aggregate status string for a mixed-shipment
order, (b) the store return window, (c) whether invoice download is in scope. Recorded in
`orders-specs.mjs` + `test-data/README.md` so the phantom keys don't get re-added.

## Security finding (unrelated to the suite, but worth fixing today)

`.mcp.json` points all three Playwright servers' `--secrets` at **`.env.local`**, which
`.claude/rules/mcp-browsers.md` explicitly forbids: that file also holds `GITHUB_TOKEN`,
`GITHUB_FIX_BUGS_TOKEN`, `JIRA_API_TOKEN`, `ANTHROPIC_API_KEY`, `FIGMA_API_KEY`, `POSTMAN_API_KEY`.
Secret substitution triggers on the NAME, so a malicious page or prompt-injection could get an agent
to type a PAT into an arbitrary web form. The correctly-scoped `.env.playwright.local` **already
exists** but is not wired. Fix is one line per server (`--secrets .env.playwright.local`) + an MCP
restart. `.mcp.json` is gitignored/per-machine, so this must be fixed on each machine.

## Quality Gates

| Gate | Initial | Batch 1 | `--auto-fix` | **Final** | Details |
|------|---------|---------|--------------|-----------|---------|
| G1 Structure | FAIL | PASS | PASS | **PASS** | 0 Blocker (was 1 — the parse failure) |
| G2 Determinism | FAIL | PASS | FAIL | **PASS** | D-004/C-005 cleared, then the 6 exposed D-002 grounded |
| G3 Completeness | FAIL | FAIL | FAIL | **FAIL** | 254 High ≫ threshold of 3 — the only failing gate |
| G4 Testability | PASS | PASS | PASS | **PASS** | 0 Critical (135 High) |
| G5 Data Validity | PASS | PASS | PASS | **PASS** | 0 Critical/Blocker; 9 High tokens await 7 fixtures |
| G6 Coverage | PASS | PASS | PASS | **PASS** | BL-* on 99/99 cases; 4c had no candidates |
| G7 Duplication | PASS | PASS | WARN | **WARN** | 0 duplicate IDs; 4 duplicate-setup findings now detectable |
| G8 Environment | SKIP | SKIP | SKIP | **SKIP** | Phase 5 deferred |
| G9 Sync | N/A | N/A | N/A | **N/A** | Phase 2 skipped (direct scope) |

**Final validation:** `suites:review` 0 Blocker / 0 Critical · `td:validate` 49/49 resolved, no bare
GUIDs, DV-021 clean · `suites:lint` OK (119 suites) · strict parse 99 records × 15 cols.

## Files Modified
- `regression/suites/Frontend/orders/014-orders-frontend.csv` — structural repair (3 cases recovered) + 49 deterministic fixes
- `scripts/test-cases/lint-test-cases.ts` — strip UTF-8 BOM before parse
- `scripts/test-cases/sync-test-suites.ts` — de-baseline 014, 040b, 082
- `config/test-suites.json` — 014 `testCount` 95 → 99; `generated` date (tool-written)

## Remaining Items

### Must fix before `/qa-regression 014`
1. **8 missing order fixtures** — `/qa-generate-data` for orders in specific states (BOPIS pickup, partially shipped, past return window, with discontinued/OOS item, invoice-available, with return) + a tracking number.
2. **92 D-005 compound steps** — split into one action per step.
3. **79 C-003 single-assertion cases** — add a second falsifiable assertion.

### Should fix
- 59 REQ-001 requirement links · 29 T-002 vague `[DOM]` assertions · 8 D-006 mid-flow `[ASSERT]` ·
  10 TC-001 technique gaps · 8 T-001 vague predicates.

## Next Steps
- [ ] `/qa-generate-data` for the 8 missing order-state fixtures (unblocks DV-001)
- [ ] Authoring pass on D-005 + C-003 (the two big rules)
- [ ] Re-run `npm run suites:review`, then Phase 5 browser verification → G8
- [ ] Burn down the remaining 8 baselined suites (015, 026, 030, 044, 045, 048b, 052, 080) — 015 is the sibling Quotes suite and likely carries the same corruption class

## Note on execution
Phases 2–4 ran in-orchestrator rather than delegated to `test-management-specialist`, and
Phase 5 was deferred: this session carries an explicit "do not call the Agent tool unless the
user requested it" directive, which overrides the command's default delegation. Confirmed with
the operator mid-run.
