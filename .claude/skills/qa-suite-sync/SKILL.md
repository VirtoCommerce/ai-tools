---
name: qa-suite-sync
description: "[QA Method] Keep regression-suite cases true to the product after a PR, ticket, module update, deploy diff or release, or for a suite or domain: sync stale cases (update, rewrite or remove), write the missing ones, review and fix, verify every new or changed case live, fix, verdict. Reached through /qa-test-lifecycle. Not for testing a ticket (/qa-test), promotion out of Draft (qa-case-promotion), or a whole-suite triangulation sweep (/qa-review-tests --triangulate)."
argument-hint: "PR <owner/repo>#N | VCST-XXXX | module <name> | diff | changelog <ver> | suite <ids> | domain <name>"
---

# qa-suite-sync — keep the suites true

You are the **Test Case Lifecycle Orchestrator**. A run does the whole job by default — there are no
flags that skip a part of it: find what the input changed, bring the affected cases back in line with the
product (update, rewrite or remove them), write the cases that are missing, review and fix them, check every
new or changed case live on the stand, fix what that check shows, and deliver a verdict.

Each phase lives in its own file; read it when you reach the phase, **whole**. The two subagents read
theirs from the path you put in the brief (`briefs.md`).

## The run

0. **Pre-flight** (below).
1. **Scope** — [`scope.md`](scope.md): input → affected suites + change inventory. `suite`/`domain`
   inputs skip step 2.
2. **Dispatch Phases 2–4** to `test-management-specialist` as one brief ([`briefs.md`](briefs.md)):
   sync stale cases ([`sync.md`](sync.md)), analyze gaps and generate ([`generate.md`](generate.md)),
   review and auto-fix ([`review.md`](review.md) 4a, 4b, 4c).
3. **One approval round.** Put the returned `pendingApprovals[]` to the user as **one list**: cases to
   remove / deprecate / rewrite, the Feature Test Matrix of new cases, the manual review items. Then
   re-dispatch with `approved` set to what they approved (`briefs.md`). Unapproved items are reported,
   not written.
4. **Write what was approved but is not the subagent's** — removals and deprecations through
   `scripts/retire.ts` (`sync.md` *For BROKEN cases*), after a snapshot (§Writes).
5. **Triangulate behaviour rewrites** — you run [`review.md`](review.md) 4a-bis on the returned
   `triangulationCandidates[]`; it dispatches `ba-system-analyzer`, which a subagent cannot.
6. **Verify live** — [`verify.md`](verify.md): dispatch `qa-testing-expert` on every new or changed case.
   SKIPPED only when nothing new or changed is in scope, or no browser lane is available — say which.
7. **Fix what verification found** — CHANGED labels and `{HYPOTHESIS}` rewrites go back through steps
   2–6 for those cases only; at most **2** verify→fix rounds, then report what is left. A refuted
   `{SPEC}`/`{DOC}`/`{BL}`/`Catches:` assertion is a bug candidate, never "fixed" (`verify.md` *Filing a bug*).
8. **Gates and verdict** (below).
9. **Report** in chat — [`report-template.md`](report-template.md). For a `diff` input, save the deploy
   state now (`scope.md` *Diff* Step 4).

When the input was a ticket, the router continues with `qa-case-promotion` after this skill — promotion out
of `Draft` is not this skill's.

## Writes

- **Suite CSVs have one writer for the whole run** (`.claude/rules/regression.md` §Suite inventory): the
  subagent while its dispatch is open, you after it returns — never both at once.
- **Never hand-edit a CSV.** Appends go through `scripts/test-cases/append-test-cases-to-suite.ts
  --check-global-ids` (dry-run first); removals and deprecations through
  `npx tsx .claude/skills/qa-suite-sync/scripts/retire.ts` (dry run, then `--apply`); then
  `npm run suites:sync && npm run suites:lint`.
- **Snapshot before you write**, revert from the snapshot:
  `npx tsx .claude/skills/qa-case-promotion/scripts/flip.ts snapshot <files> > <scratchpad>/sync-snapshot.json`,
  `… flip.ts restore <scratchpad>/sync-snapshot.json` — never `git checkout`, which also drops earlier
  edits of this run and other sessions' uncommitted work.

## Pre-flight

1. **`/preflight lifecycle --domain <scope> --components <scope components>`**
   ([`../preflight/SKILL.md`](../preflight/SKILL.md)) — env health, deployed build, ledger Δ, 24 h
   duplicate check, MCP, then kb → VirtoOZ grounding. Include its block in the report header and pass its
   kb/doc hits in the brief.
2. **GraphQL schema refresh** (scope includes GraphQL suites): `npm run schema:refresh` updates
   `.claude/knowledge/api/graphql-schema.md`; pass that path in the brief.

## Gates

| Gate | Criteria | Required |
|------|----------|----------|
| G1: Structure | 0 Blocker findings | Yes |
| G2: Determinism | 0 Critical findings | Yes |
| G3: Completeness | <=3 High findings | Yes |
| G4: Testability | 0 Critical findings | Yes |
| G5: Data Validity | 0 Critical/Blocker findings | Yes |
| G6: Coverage | BL-* mapping >= 80% for P0/P1 cases; **and every rule the run contradicted is `SUSPECT` with a bug key (4c)** | Recommended |
| G7: Duplication | No same-layer duplicates | Recommended |
| G8: Environment | 0 BROKEN findings | Yes (if verified) |
| G9: Sync | All STALE cases updated, all BROKEN addressed | Yes (if synced) |
| G10: Assertion Grounding | **0 GRD-001 Blocker/High** + 0 ENV-008. Provenance is **opt-in per case**: a fully-untagged *legacy* case is Informational only (it does not fail this gate), but once a case is **provenance-adopted** (any assertion tagged — i.e. everything Phase 3 generated or Phase 2/4 touched) an untagged sibling is **High** and a `{HYPOTHESIS}` in a past-`Draft` case is a **Blocker** | Yes |
| G11: Technique Coverage | No feature group (≥3 cases) missing the positive + negative + boundary mix (TC-001) | Recommended |

G12 (promotion integrity) belongs to `qa-case-promotion`.

**G10 is the promotion gate, not a nice-to-have.** Per `.claude/skills/qa-test-cases-generator/test-case-template.md`
§Automation_Status, a case moves `Draft → Reviewed` only when (a) the review verdict is ≥ PASS WITH
WARNINGS, (b) every assertion is grounded — for a new-feature suite that requires a passing live check —
and (c) a human or `qa-lead-orchestrator` approves. **This skill never performs (c).** A gate-green run
means *eligible for promotion*, not promoted.

| Verdict | Meaning |
|---------|---------|
| **APPROVED** | All required gates pass. Cases already past `Draft` are ready for `/qa-regression`; any case still `Draft` (incl. everything Phase 3 generated) needs promotion first — **`Draft` cases stay out of regression selections** |
| **APPROVED WITH WARNINGS** | Required gates pass, recommended have minor findings |
| **NEEDS FIXES** | Required gate(s) failed — must address before regression |
| **BLOCKED** | Environment issues prevent verification — investigate env first |

The verdict is advisory: the user makes the go/no-go.

## Which input when

| When | Run |
|------|-----|
| Before a regression run with recent code changes | `/qa-test-lifecycle PR <owner/repo>#N` or `/qa-test-lifecycle diff` |
| After a platform release | `/qa-test-lifecycle changelog <version>` |
| A suite or domain needs review, gap-filling and a live check | `/qa-test-lifecycle suite <ids>` / `domain <name>` |
| After a `/qa-test` run authored new cases | `/qa-test-lifecycle promote VCST-XXXX` (`qa-case-promotion`) |
| A whole suite's assertions may have gone stale, not tied to one change | `/qa-review-tests suite <ID> --triangulate` — this skill triangulates only the cases a change touched (4a-bis) |
| Which suite is most overdue for triangulation | `/qa-review-tests stale` (or `npm run tc:audit:queue`) |

## Rules

- Follow `.claude/templates/agent-dispatch.md` for dispatch conventions, browser fallback and error
  handling, and `.claude/skills/qa-evidence/output-paths.md` for artifact paths.
- **Agent delegation is mandatory** — never run Phases 2–4 yourself; dispatch `test-management-specialist`.
  The exceptions are the writes of step 4 and the 4a-bis triangulation of step 5.
- **`/qa-review-tests` owns the review methodology** (dimensions, codes, severities, evidence bars,
  auto-fix matrix); this skill owns only what runs when. When they appear to disagree, the skill wins and
  this file is the bug. The other mechanisms are owned likewise: `/qa-test-cases-generator` (authoring
  contract), `/qa-generate-data` → `/qa-seed-data` (data prep). Restate none of it here.
- **`Automation_Status` is a closed, case-sensitive enum** — `sync.md` 2c step 5. Never invent a state.
- **Removal is the default for an obsolete case**; deprecate when it must stay visible. Neither happens
  without the user's approval. **Never renumber or reuse an ID** — a removed ID is retired.
- **Ground before you write** — `/preflight lifecycle` (kb → VirtoOZ, Context7 only as fallback) before
  updating or generating cases.
- **Deduplicate** — before generating, check the target suite and related suites for semantic duplicates.
- **One browser at a time** — Phase 5 uses `playwright-firefox` via `qa-testing-expert`.
- **URLs come from the env loader** (`config.js` → `process.env`), never hardcoded.
- **Every write shows a diff summary**; updated cases record `Synced: {source} ({date})` in References.
- **Module dependencies matter** — when module X changes, check downstream modules too.
- **Don't over-sync** — a VALID case (false positive from the diff) stays untouched.
- **Environment issues are not test-case defects** — BROKEN/BLOCKED from Phase 5 may be the stand; flag
  them, don't auto-fix blindly.
- **BL updates run through 4c (`/qa-review-bl`)**, scoped to the `BL-*` this run surfaced — `review.md` 4c.
- **The report is produced in chat, never as a file** — `report-template.md`.
