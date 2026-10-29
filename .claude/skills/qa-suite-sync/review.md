# qa-suite-sync — Phase 4, review and fix

Supporting file for [`qa-suite-sync`](SKILL.md). Read it at Phase 4 — the subagent reads 4a, 4b and 4c; you run 4a-bis.

### Phase 4 — REVIEW & FIX (Quality Assurance)

**Always runs.** Dispatch `test-management-specialist` (continuing delegation).

#### 4a. Static Analysis (`/qa-review-tests` dimensions 1–7, 9, 10)

Reviews ALL cases in scope (existing + updated + newly generated). **The
[`/qa-review-tests` skill](../qa-review-tests/SKILL.md) owns the dimension set — this command
does not restate it.** Read its Review Dimensions table (and `.claude/skills/qa-review-tests/review-criteria.md`) for the checks,
codes, and severities; a restated copy here would drift, and has. Delegate by *dimension number*:

| Dimensions | Where they run in this pipeline |
|---|---|
| **1–7, 9, 10** — structure, determinism, completeness, testability, data validity, BL/ECL + requirement traceability, duplication, technique coverage, assertion grounding | **Here (Phase 4a)**, static, no browser. Start with the deterministic core: `npm run suites:review -- <csv>` (dims 1–7, 9, 10 as exact rules, plus `TRI-000` stamp staleness), then spend LLM effort only on the judgment rules it can't decide |
| **8** — live environment verification | **Phase 5** (`qa-testing-expert`, `playwright-firefox`) |
| **10 (live half)** — grounding `{HYPOTHESIS}`/unconfirmed-`{SPEC}` → `{OBSERVED}` | **Phase 5** — static 4a only *detects* an ungrounded assertion; only the live pass can ground it |
| **11** — behavioral triangulation (*is the asserted behavior still TRUE?*) | **Not run wholesale by this pipeline.** Phase 2's change signal is a *candidate*, not confirmation — see 4a-bis below. A full suite sweep is `/qa-review-tests suite <ID> --triangulate` or its scheduled twin `ci/run-suite-audit.ts` |

Also run, per the skill's Step 3/3.5: `npx tsx scripts/test-data/validate-td-refs.ts` (DV-013…020) and
`npm run graphql:lint-labels -- <csv>` for every GraphQL suite (DV-019).

#### 4a-bis. Behavior rewrites go through the Dimension-11 evidence bar

Phase 2 reclassifies a case as STALE/BROKEN from **one** axis (the change inventory + the docs).
That is enough to justify a *mechanical* update (renamed selector, moved URL, added field), but **not
enough to rewrite what a case asserts happens** — the skill's Dimension 11 requires an agreeing
evidence tuple from every applicable axis (**docs + live + source**) before a DRIFT rewrite lands, and
treats source-vs-live disagreement as CONTRADICTORY (usually deploy lag), never as a rewrite.

So, symmetrically with 4c's handling of `BL-*`:

- A Phase-2 STALE/BROKEN finding that changes only *how* a case is driven → apply in 4b.
- A finding that changes *what behavior is expected* → the subagent returns it in
  `triangulationCandidates[]` unwritten; **you (the orchestrator), after the Phases 2–4 dispatch returns**,
  run `/qa-review-tests --triangulate` **scoped to those cases only** — it dispatches `ba-system-analyzer`
  for the docs + source axes, which a subagent cannot do — and apply strictly under its auto-fix matrix (CONFIRMED → stamp refresh; DRIFT →
  rewrite the drifted assertion only; MISSING/CONTRADICTORY/UNGROUNDED/RETIRE → report, never write).
- A DRIFT rewrite must keep `{{VAR}}`/`@td()` and assert the structural invariant — never a literal
  price/SKU/URL observed live (DV-016). This is the most likely way an auto-fix does damage.
- On a **legacy untagged case, do not add a provenance tag** to the assertion you rewrote — one tag
  makes the case provenance-adopted and turns every untagged sibling into a GRD-001 High. The row-level
  `Audited:` stamp carries the evidence (`.claude/skills/qa-review-tests/triangulation-criteria.md` §5 rule 4).

#### 4b. Auto-Fix

**Auto-fixable (applied without asking, each re-gated below; the manual items are returned in `pendingApprovals[]`):**
- Missing step type tags → infer from verbs
- Missing `errors[]` check → add to Cross_Layer_Checks
- Hardcoded URLs → replace with `{{VAR}}`
- Empty Failure_Signals → generate from assertions
- Empty Cleanup → infer from mutation steps
- GraphQL: missing `command` wrapper (DV-007) → wrap mutation args
- GraphQL: wrong arg/response field/input field/MoneyType (DV-008–DV-011) → replace with correct schema values

**Manual items (presented as checklist for user):**
- Vague assertions — needs domain knowledge
- Missing preconditions — needs flow understanding
- Duplicate cases — needs human decision
- Missing BL-*/ECL-* refs — needs domain mapping
- GraphQL: invalid query/mutation name (DV-006) — needs correct alternative

**After fixes — re-gate, and revert on regression** (the skill's Step 7 gate; a structure-only re-check
is not sufficient): re-run `npm run suites:review -- <csv> --fail-on=High`, `npm run td:validate`, and
`npm run graphql:lint-labels -- <csv>` for GraphQL suites. **An auto-fix that introduces a new
Blocker/Critical is reverted, not shipped.**

**Write-scope ceiling (same as the skill's `--fix`):**

| | Without asking | Only after the user approves (`pendingApprovals[]`) | Never |
|---|---|---|---|
| Deterministic dim 1–7/9/10 fixes | ✓ (re-gated, reverted on regression) | | |
| Dim 11 CONFIRMED / DRIFT (via 4a-bis) | ✓ | | |
| Rewriting what a case expects, deleting/deprecating a case, authoring a case | | ✓ | |
| Dim 11 MISSING / CONTRADICTORY / UNGROUNDED / RETIRE | | | written — reported only |
| `Automation_Status` out of `Draft` | | | here — `qa-case-promotion` only |

#### 4c. BL Sync (always — scoped to the run's BL candidates)

Run **`/qa-review-bl`** on exactly the `BL-*` this run surfaced — the Phase 2 contradictions + the
Phase 3 `blProposals.new[]`. **None ⇒ no-op.** A whole domain is standalone `/qa-review-bl domain
<name>`. Operations (`.claude/skills/qa-review-oracles/bl-audit-criteria.md` §1):

- **A rule a case contradicted → MARK-SUSPECT**: `status: SUSPECT`, `suspect_reason` = `[bug] <KEY>` (`bl:fresh --resolve` clears it on Fixed). With no bug key yet, the rule goes into the run's `bugCandidates[]` — filed only as `verify.md` *Filing a bug* says, never from inside 4c. The rule's text is never rewritten from what the run saw.
- **A candidate a human source states → NEW / SYNC** in `bl/<slug>.yaml` (value gate for NEW), then `npm run bl:render` + `bl:convert:check`.
- **A `SUSPECT` rule in scope whose bug now has a Jira decision → RESOLVE** (Fixed → `ACTIVE`; By design / Won't fix → rule rewritten from the resolution).
- Behaviour no rule covers → `kb_capture`. No proposals file, no review queue; RETIRE is only proposed.
- The 4c summary is the receipt (a `BL-AUDIT` file only on request); **G6** reads `SUSPECT` + bug keys from `bl/<slug>.yaml`.

---
