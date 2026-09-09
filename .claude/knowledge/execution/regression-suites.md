# Regression — suite inventory, ID/naming rules, XREF-001

> **Moved verbatim from `.claude/rules/regression.md` on 2026-09-08** (PR 2 of the agentic-system audit) so it loads only when a task reads it. `rules/` is the always-loaded tier; this file is on-demand. Section anchors are unchanged.

### Suite inventory

**Derived, not documented here.** `config/test-suites.json` is the source of truth for every suite’s id,
name, file, domain, layer, priority, `testCount`, agent and tags (126 suites, 37 selections — the manifest's `selections` block also carries a `_doc` key that is documentation, not a group). To see the
current split: `npm run suites:lint` prints the totals, or read the manifest directly. A table copied into
this file goes stale the first time a suite is added — which is how the retired `080` release suite below
came to be documented for weeks after its CSV was deleted.

- **Release suite**: none. The master release suite `080` (`_release/080-full-regression-release.csv`) was **retired on 2026-07-31** — its CSV was deleted in commit `9dd9f3e3` and the manifest entry plus the `release` selection were removed once it was found that `release` had been resolving to a missing file (running zero cases while reporting a valid selection). For a major release, use `full` (all 119 — the 126 manifest suites minus its 7 excludes) or a plan-driven `sprint` selection. `npm run suites:lint` now hard-fails on any declared-but-absent suite CSV, so this cannot recur silently.
- **P0 suites**: 042 (Smoke), the four 078 siblings (Backend/API Smoke), 039 (CyberSource Payment), 044 (Security), 049 (Platform API)
- **The split has empirical support beyond wall-clock, measured after the fact.** `history.json`
  (108 suite rows, 19 runs, 3991 cases) shows BLOCKED rising with suite size: 13.5% at ≤15 cases,
  17.9% at 16–40, 17.7% at 41–80, **28.6% at 81+**. `078` at 115 cases sat in the worst bucket;
  four ~29-case siblings sit in the 17.9% one, so the split should recover ≈11 percentage points of
  artefactual BLOCKED on the corpus's most-run selections. That is a stronger reason to have done it
  than the 83 → 40 min it was justified by.
  **A row-range split was also actually tried** — `REG-2026-08-03-1900` carries `078-p1/p2/p3` — and
  it failed by TRUNCATION, not by dependency cascade: p1 accounted for 38 of 38 cases, p2 for 25 of
  39, p3 for **8 of 38**, with only one BLOCKED between them. Cases that simply never reported are
  the signature of a limit running out in order, which is the defect A1's derived caps exist to
  remove. It is weak evidence against sharding as such; the case against that remains the 46
  declared dependency edges and the unsatisfiable `[PRE:*]` gate.
- **`078` is four sibling suites, and the reason generalizes.** It was one 115-case / 83-minute
  suite, which made it the ENTIRE critical path of both `smoke` and `critical`: the lane pool had
  nothing to pack, so the scheduler saved 0% there while saving 42% on `full`. Splitting it took
  `smoke` from **83 min to 39** and `critical` to **60**, with no runtime code — four files where
  there was one, packed by the LPT pool that already existed.
  - **The unit of splitting is a dependency component, not a row range.** 99 of its 115 cases
    declared a dependency in `Preconditions`, 46 of them on a non-bootstrap case
    (`BSM-005 → 006 → 007`, `BSM-015 → 042 → 043`, `BSM-008 → 009 → 071`, …). A row slice cuts
    those chains and turns a slow pass into a fast cascade of BLOCKED. Computed as connected
    components of the declared graph the suite decomposes into **65 pieces, largest 13**, and those
    components line up with its Section themes — so a themed split is also dependency-closed.
  - **`[PRE:*]` coverage is the WRONG shardability gate.** `knowledge/execution/test-execution-preflight.md`
    exempts Admin SPA and API suites by design, and 078 carries zero `[PRE:*]` tags across 115
    cases. Gating on it permanently excludes exactly the suites that dominate `smoke`/`critical`.
  - **Bootstrap is replicated as state, never referenced as a case.** `BSM-001/002/011/019` (login,
    bearer token, an org exists, GraphiQL reachable) stay in `078`; the siblings restate them as
    *"Admin logged in as `{{ADMIN}}` (suite setup)"*. A case ID can live in only one file, so a
    replicated bootstrap case would break global ID uniqueness — the requirement is what travels.
  - **All four stay in `regression/suites/Backend/smoke/`.** `check-smoke-gates.ts` builds its case
    set as the UNION of the sibling CSVs in a directory, so `ADMIN-SMOKE-CHECKLIST.md` and gates
    SG-001/004/005 keep working with no checklist edit. Moving one file out silently breaks them.
- **XREF-001 — a dependency may not leave its suite CSV.** New hard gate in
  `npm run suites:lint` (`findCrossFileCaseRefs`, unit tests `scripts/unit/suite-split-integrity.test.ts`).
  A suite is the unit of dispatch: two suites can run on different lanes, in either order, or one
  without the other, so `"Admin logged in (BSM-001 passed)"` in a CSV that does not contain BSM-001
  is not a precondition, it is a wish — the case runs on whatever state the lane happens to hold.
  This is the dual of the global-ID rule above (an ID belongs to exactly one file; a dependency may
  not leave it), and it is invisible to `check-smoke-gates.ts` for the very reason that makes the
  078 split safe: that gate reads the directory's sibling CSVs as one union, so a cross-sibling
  reference passes SG-001 as valid. A token counts only when it resolves to a real case ID
  somewhere in the corpus, so prose that merely looks like one (`BL-AUTH-005`, `ECL-13.2`,
  `VCST-5089`) can never false-positive. **Ratcheted, not absolute:** 101 pre-existing violations
  across 32 suites are recorded per file in `XREF_BASELINE` — a listed file may never grow, an
  unlisted file must have zero. Same burn-down shape and same reason as `CSV_LINT_BASELINE`.
- **RESOLVED — the two `sales-rep` manifest defects flagged below are fixed** (verified 2026-08-05): the embedded-app suite was renumbered to a free id (`Backend/sales-rep/092b-sales-rep-admin-embedded-app.csv`, alongside `092-sales-rep-admin.csv`), and `Frontend/sales-rep/093-sales-rep-hub-dashboard-storefront.csv` now has a manifest entry (`id: "093"`). `config/test-suites.json` carries 126 unique ids with zero duplicates. Left here as the worked example the naming-convention rules below still reference (`092b`, `SR-EMB-*`).
- **Case IDs are globally unique across the whole corpus** — not merely unique within a suite. The runner keys per-case results and failure evidence by **bare case ID** (`suite-*-results.json` rows, `traces/{TC-ID}-FAIL-trace.json`, and `scripts/lib/regression-triage.ts` fingerprints), so two suites both declaring `CAT-001` let one run's evidence silently overwrite the other's — a real failure can read as someone else's pass. Enforced by **`npm run suites:lint`** (`findDuplicateCaseIds` in `scripts/test-cases/sync-test-suites.ts`, unit tests `scripts/unit/suite-global-case-ids.test.ts`); it scans **every CSV on disk**, orphans included, and **hard-fails** — unlike `CSV_LINT_BASELINE` there is no burn-down set, because the corpus was cleaned to zero collisions on 2026-08-03 (223 of them). IDs are harvested by the line-start scan (`extractExistingIds`), not a field parse, so the suites that aren't strictly CSV-parsable are still covered.
  **Naming convention when two suites want the same prefix** — two cases, and they are different:
  - **Re-prefix** when the suites are different *layers or domains* that merely collided on a shared prefix. The **storefront keeps the bare prefix** and the admin/back-office side takes an `…A` suffix: `CAT-*` (Frontend/catalog) vs **`CATA-*`** (051/053 admin), `ORD-*` (014 storefront) vs **`ORDA-*`** (017/018/019 admin), `SRCH-*` (004/005) vs **`SRCHA-*`** (061 admin). Where a prefix meant two unrelated things, the **documented owner keeps it**: suite 067 keeps `WL-*` (white labeling, per `knowledge/domain/white-labeling.md`) and the wishlist suite 050h became **`WISH-*`**; suite 050i keeps `CFG-GQL-*` (the gold-standard GraphQL suite) and the 9 interlopers in 072/072c became **`CFG-XAPI-*`**. Otherwise the more specific suite is qualified: 077b → **`CPN-SMK-*`**, the embedded-app half of `092` → **`SR-EMB-*`**. Re-prefixing is applied to the **whole prefix in that file**, not just the colliding rows, so each file keeps one coherent namespace and cannot collide again.
  - **Renumber into a free range** when both suites legitimately share one domain namespace and only the numbers clashed — no new prefix: `035` STORE-052…055 → 066…069, `032` AUTH-066/067 → 074/075, `003` CAT-030…040 → 068…078, plus `CFG-TEXT`/`CFG-VAR` singles.
- **Critical UI scope**: `knowledge/oracles/critical-ui-scope.md` defines the checklist of 36 components and 16 pages with applicable BL-UI invariants per cell. **Currently UNCOVERED** — its sole covering suite `048b-layout-stability.csv` (selection `layout-stability`) was removed on 2026-07-25, so all 197 applicable cells are marked `GAP`. The file is retained as the scope definition + audit-protocol reference for `/qa-design`. `npm run scope:validate` still hard-fails if a cell points at a *missing* test ID and warns on the GAP count; `--strict` makes GAPs fatal again once a replacement suite lands.

## Working concurrently on suites

The rules themselves — never run a state-changing git command in a shared tree, one author per suite
CSV per change, a conflict is never resolved with git — are tier 1, in
[`.claude/rules/regression.md`](../../rules/regression.md) §WORKING IN A SHARED TREE. This is the
reasoning and the how-to.

**Why one author, specifically for a CSV.** The same discipline `/qa-review-oracles` applies to
`business-logic.md` and `e-commerce-edge-cases-library.md` — triangulation fans out, the **apply is
single-writer** — plus two reasons specific to suites:

- **A CSV is not mergeable in practice.** Rows are multi-line, quoted, and the safe writers
  (`suites:append`, the surgical byte-level edit `promote-cases.ts` uses) all read-modify-write the
  whole file. Two such writes interleave into a file that parses but is wrong — and `suites:lint`
  cannot tell you which half was intended.
- **The disposition is the artifact, not the diff.** A restructure is a set of coupled decisions —
  this case is culled *because* that journey now crosses its link, these two merge *because* they
  test one rule. Splitting the file between two authors splits the reasoning, and the second author
  cannot see why the first kept what they kept.

**How to work concurrently anyway** — the fan-out is fine, the *write* is what serialises:

| Want | Do |
|---|---|
| Two people analysing one suite | Both analyse; **one** applies. The other hands over a staged rows CSV + a disposition table |
| Two suites, two authors | Fine — ownership is per file, and `config/test-suites.json` is written by `suites:sync`, not by hand. **It is shared state**: agree who runs sync, or exchange the per-suite delta and let one side apply it |
| Handing a suite over mid-change | Say so explicitly and stop writing. The successor re-reads the file from disk before their first edit |
| You find a suite already modified in the tree | **Do not overwrite and do not revert.** Someone else is mid-change; report the conflict and wait |

**A mid-write invalid CSV blocks every concurrent author, not just you.** `suites:sync` and
`suites:lint` hard-fail on a parse error anywhere in the corpus, so a suite left transiently
unparsable — a half-written quoted field, an unbalanced closing quote — takes the manifest gate down
for everyone in the tree until it is fixed. So the surgical-edit discipline (`promote-cases.ts`:
locate the record by its own raw text, replace only the changed bytes, **re-parse and compare
field-by-field**) is not merely about diff hygiene during a shared-tree window — **re-parse after
EVERY write**, not once at the end.

**A fact relayed to another session's SUBAGENT does not arrive — it is lost silently.** Cross-session
messages land in a subagent's context as system-reminder blocks and (correctly) trip the harness's
prompt-injection handling: the receiving agent treats them as untrusted, declines to act, and may
refuse to open files the message points at. **The relay path that works is session → session → the
receiving session RE-ISSUES the fact, in its own words, in the subagent's dispatch brief.** That
re-statement is also what makes the fact reviewable, so it is the right shape independent of the
transport. Never assume a forwarded fact landed; if it matters, it belongs in the brief.

The measured losses behind every line above:
[`docs/decisions/regression-history.md`](../../../docs/decisions/regression-history.md)
§Shared-tree losses.
