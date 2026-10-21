# Specialist workflow — the full 12 steps, the Frontend Journey Exception, the cross-layer checklist

Moved out of `agents/test-management-specialist.md` (BUDGET-004). The agent body keeps each step's headline
and every MANDATORY gate; **this file is the full text — read it when you run the workflow.** Section text
below is verbatim from the agent body (two positional cross-references adjusted: "UI Exploration Protocol" now
means the agent body's, "Frontend Journey Exception" is the section at the end of this file).

## Workflow (when assigned a feature, e.g., VCST-2000)

1. **Look up docs** — Context7 (`/virtocommerce/vc-docs`), JIRA ticket ACs, Figma, scope/dependencies
2. **Decompose into layers** — Which layers apply? (API, GraphQL, Admin, Storefront, E2E). Record in test plan
3. **Explore per layer (MANDATORY)** — Run `/qa-sbtm <feature>` first to surface unknown unknowns before writing test cases. Then explore per layer: Storefront labels, Admin blades, API schemas, GraphQL operations (see UI Exploration Protocol in the agent body). Use `/qa-api ref <module>` to get exact mutation/query signatures before writing test steps
4. **Apply test design techniques (MANDATORY)** — Run `/qa-test-design <feature>` to systematically derive test conditions before writing cases. **The techniques serve the four Mental Model questions — they don't replace them.** Use them to operationalize "how do we break this?" and "what wasn't considered?": pairwise for toggles/flags, decision tables for business rules, state transitions for lifecycles, **error guessing for "what if X breaks?" gaps the spec missed**, BVA for numeric edges. Produces structured test conditions that feed directly into step 6. Skip this step only for trivial bug-fix verifications with < 3 test cases.
5. **Create test plan** — Save to `{RUN_DIR}/test-plan.md` (the brief's run folder) with **Layer Coverage Matrix**:
   ```
   | Layer | Applicable? | # Cases | Assigned Agent | Target Suite |
   |-------|-------------|---------|---------------|-------------|
   | REST API | Yes/No | N | qa-backend-expert | `Backend/api/049-*` |
   | GraphQL | Yes/No | N | qa-backend-expert | `Backend/graphql/050*` |
   | Admin UI | Yes/No | N | qa-backend-expert | `Backend/<module>/*` |
   | Storefront | Yes/No | N | qa-frontend-expert | `Frontend/<area>/*` |
   | E2E | Yes/No | N | frontend + backend | feature suite |
   ```
5b. **Prepare test-data combinations (MANDATORY before generating data-dependent cases)** — run
   `/qa-generate-data <feature>` to DESIGN the cross-entity combinations the scenarios need (products ×
   loyalty × promotions × pricing × inventory × B2B). It learns the live variant space, builds the
   pairwise matrix, reuses existing fixtures, authors only the gaps as ready-to-seed fixtures, and wires
   one `@td()` **combination alias per Combo ID**. Consume the returned matrix to map cases → Combo IDs
   in step 6. Then provision via `/qa-seed-data <domains>` (step 8). Skip only for cases that need no
   seeded entities (pure-UI/copy/validation). This is WHERE the `@td()` values in step 6 come from —
   don't invent ad-hoc data.
6. **Generate test cases per layer** — use the right tool per layer, applying test conditions from step 4.
   **Each data-dependent case's `Test_Data` column references the prepared combination by alias —
   `@td(COMBO_ALIAS.field)` (from step 5b) — never an ad-hoc literal; map ≥1 case per Combo ID:**
   - **REST API layer**: `/qa-api cases REST <module>` — reads `api-test-case-patterns.md` for coverage checklist + `xapi-query-ref.md` for endpoint signatures
   - **GraphQL layer**: `/qa-api cases <xModule> <operation>` — reads patterns + query signatures; applies `[GQL]`/`[ERRORS]`/`[ROUNDTRIP]` tags; always includes `errors[]` check. For new/modified queries or mutations, also apply the "New Query/Mutation Verification" checklist from `graphql-checklist.md` (schema, required/optional fields, permissions, response structure)
   - **Admin UI / Storefront / E2E layers**: `/qa-test-cases-generator VCST-XXXX --layer admin|storefront|e2e`
   - **Storefront journey cases**: for features listed in `e2e-scenario-catalog.md` (E2E-*) or flows with cross-screen state (checkout, cart→order, BOPIS end-to-end, login+purchase), prefer one journey case over a set of atomic screen cases — see §Frontend Journey Exception below
   - **KB:** `mcp__kb__kb_ask` "<coordinate> …" (CLI `npm run kb -- ask`) before asserting behaviour; confirm/dispute/capture after (`CLAUDE.md` §Product context).
   - All cases: enriched 15-column CSV with **layer-specific tags** from `test-case-template.md`
   - **All generated cases start with `Automation_Status = Draft`.** `Draft` is a real, executable state, **not a holding pen**: the regression runner does **not** skip it, which is what lets the authoring run execute its own new cases. Promotion (step 7) records that a case has *earned* its status from evidence — it is not what makes the case runnable
   - Domain checklists as input: storefront → `domain-checklists.md`, admin/API → `backend-admin-checklists.md`. REAL labels from step 3. P0: happy + negative, P1: errors + edge cases
   - Minimum per API/GraphQL operation: 1 happy path + 2 negative cases (missing auth, invalid input)
   - Each test case must record which technique produced it (EP, BVA, Decision Table, Pairwise, State Transition, Classification Tree, Error Guessing) for traceability
7. **Peer review gate (MANDATORY — ISTQB)** — before cases enter any suite:
   1. Run `/qa-review-tests file <path>` on the freshly generated CSV. Fix all Blockers and Critical findings; reduce Highs where practical
   2. Verdict must be ≥ **PASS WITH WARNINGS** (zero Blockers, ≤3 Criticals). If NEEDS FIXES, iterate on the cases and re-review
   2b. **Grounding gate (Dimension 10 / GRD-*)** — every assertion must be grounded (`{SPEC}`/`{BL}`/`{DOC}`/`{OBSERVED}`); zero `{HYPOTHESIS}`/untagged. For a **new feature** (behavior grounded only by `{SPEC}`/`{HYPOTHESIS}` after offline generation), run `/qa-review-tests file <path> --verify --fix` against the deployed build so `qa-testing-expert` confirms each behavior live and upgrades it to `{OBSERVED}` — this live pass is MANDATORY before promotion; ungrounded assertions block it
   3. Hand off to `qa-lead-orchestrator` with the review report and request approval to promote `Draft → Reviewed`. **Under `/qa-test` there is no hand-off and no promotion** — step 9's table applies: you return the appended row IDs, the rows stay `Draft`, and a later `/qa-test-lifecycle` pass promotes them from that run's execution evidence (`/qa-test`'s own `5g` gate was removed 2026-09-10)
   4. **You do NOT self-promote, under any caller** — `/qa-test-lifecycle` 6P and `/qa-regression` 6.5 alike. Via `/qa-test-lifecycle` 6P: only after `qa-lead-orchestrator` approval, update `Automation_Status` from `Draft` to `Reviewed` (then author assigns execution mode: `Automated` / `Manual` / `Semi-Automated`). Via the post-run promotion (6P with `--run-id`, or `/qa-regression` **6.5**): **never edit the cell by hand at all** — `npm run tc:promote:apply` writes it, and it writes `Automated` **only**, from a real `RUN_ID`; `Reviewed`/`Manual` stay a human call
   5. Cases rejected by the lead: address feedback, regenerate if needed, re-run review
8. **Ensure test data** — provision the combinations prepared in step 5b: `/qa-seed-data <domains>`
   seeds the gap fixtures (they are `seeded=false` templates until then) and writes real IDs back so
   `@td(COMBO_ALIAS.field)` resolves. Document `{{VAR}}` bindings + the `@td()` combination aliases in
   the Test_Data column. (Step 5b designs + authors the data; this step provisions it.)
9. **Organize into suites — cases land in `regression/suites/` as `Draft`, never in a ticket folder.**
   API→`Backend/api/049-*`, GraphQL→`Backend/graphql/050*`, Admin→`Backend/<module>/*`,
   Storefront→`Frontend/<area>/*`, E2E→feature suite. Append with
   `append-test-cases-to-suite.ts … --check-global-ids`, never a hand-rolled append, then `suites:sync`.
   **There is no `reports/tickets/**/test-cases.csv`** — `.claude/rules/reports.md` §1 forbids it, and a
   case parked outside the corpus is a case no runner can reach.

   **Who flips the status, and when, depends on the caller** — this is the one place the two pipelines
   differ, and getting it wrong strands the cases:

 | Caller | Append | Flip |
 |---|---|---|
 | **`/qa-test` Step 3** | you append `Draft` **during the run** | it **stays `Draft`** when the run ends. A later **`/qa-test-lifecycle`** pass flips it via `npm run tc:promote:apply`, citing that run's `RUN_ID`. You do not hand off, and you never promote |
 | **`/qa-test-lifecycle` Phase 6P** | 6P appends (handoff / re-promotion / non-`/qa-test` sources) | 6P flips `Draft → Reviewed` on `qa-lead-orchestrator` approval — step 7 above |
10. **Create RTM** — Per-layer coverage: "AC-1 covered by API-042, GQL-042, E2E-042". Target >=95% overall (each applicable layer must have cases for a requirement to count as fully covered)
11. **Validate (MANDATORY)** — P0/P1 per layer: UI in Playwright, API via Postman/curl, GraphQL in GraphiQL. Fix mismatches
12. **Deliver Feature Test Matrix** — Test plan path, cases by layer × priority (Draft vs Reviewed counts), coverage %, delegation per layer, JIRA links

## Frontend Journey Exception

Default rule is "one scenario per case". For Storefront UI features where behavior depends on **cross-screen state**, write **one continuous journey case** instead of sharding into atomic per-screen cases — the bugs live in the seams.

**Use a journey case when:**
- Behavior under test is **continuity of state** across ≥2 screens (cart persistence, form data carry-over, session, selected org/ship-to, applied coupon)
- User goal requires **sequential completion** (checkout, registration+first-purchase, quote→order)
- Regression target is a **full user flow** listed in `e2e-scenario-catalog.md` (E2E-*)

**Stay atomic when:**
- Single-screen validation (field error, toast, label, empty state)
- Widget/component behavior (facet chip removal, quantity stepper)
- API/GraphQL/Admin layers — always atomic

**Journey case requirements:**
- `[JOURNEY]` tag in `Section` column (e.g., `Checkout > Guest > [JOURNEY]`) so the regression runner groups them correctly
- `Steps` block uses `--- SCREEN: <name> ---` dividers between screens (same pattern as `--- LAYER ---` in E2E)
- Every screen boundary gets at least one `[ASSERT]` before the next `[NAV]`
- `Failure_Signals` must include at least one **mid-journey** signal (e.g., cart badge drops to 0 after login, shipping step resets on browser-back)
- `Cleanup` restores a neutral state even if the journey aborts midway
- Counts as **one scenario** — the journey is the unit; atomicity is preserved at that grain

## Cross-Layer Verification Checklist (every P0/P1 E2E case)

- [ ] STOREFRONT: UI state correct
- [ ] CONSOLE: No JS errors
- [ ] NETWORK: No 4xx/5xx
- [ ] API: Data persisted
- [ ] ADMIN: Back-office reflects change
- [ ] SEARCH: Index updated (30-60s)
