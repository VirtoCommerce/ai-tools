---
name: qa-case-promotion
description: "[QA Method] Take a ticket's test cases out of Draft: find its Draft rows in regression/suites (or a legacy run-scoped test-cases.csv), re-derive eligibility (G10), get approval, flip Draft -> Automated from a run or Draft -> Reviewed in place, re-gate (G12). Reached through /qa-test-lifecycle promote VCST-XXXX, or after /qa-test-lifecycle VCST-XXXX. Not for authoring or fixing cases (qa-suite-sync), or for flipping already-grounded cases after a regression (/qa-regression Step 6.5)."
argument-hint: "VCST-XXXX [--run-id <RUN_ID|latest>]"
---

# qa-case-promotion — take a ticket's cases out of `Draft`

`/qa-test` leaves the cases it authors in `regression/suites/` as `Draft`; nothing else moves them out. This
skill is the only performer of that move, and it never makes it on its own: eligibility is **derived**, the
promotion is **approved** by the user or `qa-lead-orchestrator`, and the writes go through scripts that
cannot touch any other cell.

Two scripts live beside this file (`scripts/`); run them with `npx tsx`, never hand-edit what they write:

| Script | Does |
|---|---|
| `find-source.ts <KEY>` | lists the ticket's in-suite `Draft` rows and legacy `test-cases.csv` files — JSON; exit 0 found, 1 none, 2 bad key |
| `flip.ts snapshot …` / `restore …` / `review …` | blob snapshot + byte-exact restore; in-place `Draft → Reviewed` with the `Promoted:` stamp (exit 0 / 1 nothing / 2 refused, nothing written) |

## 0 — Find the source

```bash
npx tsx .claude/skills/qa-case-promotion/scripts/find-source.ts VCST-XXXX
```

Exit 1 ⇒ "nothing to promote for VCST-XXXX" — stop. Otherwise two kinds, each handled below:
- **in-suite** — the `Draft` rows a current `/qa-test` run appended (their `References` carry the ticket
  key). They are already in their suite: steps 3–4 do not apply; step **4i** flips them in place.
- **legacy** — a run-scoped `test-cases.csv` left by an older `/qa-test`, or a re-promotion of cases that
  stayed `Draft`: steps 3–4 append them. Nothing in the manifest-driven runner reads `reports/tickets/**`,
  so this is the only path from such a case to regression coverage.

**Precondition, stated precisely — promotion does NOT require an APPROVED sync verdict.** It requires the
**G10 re-derivation in step 1 to come back clean for the cases being promoted**, plus the step-2 approval.
When it follows a `qa-suite-sync` run, that verdict still applies as a second condition — NEEDS FIXES /
BLOCKED means the suites in scope are not in a state to receive new cases, so do not promote into them.

## 1 — Harvest, then re-derive eligibility independently (do NOT trust the hand-off)

**Harvest first** when a run executed the cases (this is what a `PR-007` hold routed here needs): take the
step-2 snapshot now, run `/qa-review-tests file <suite.csv> --verify --fix`, then resolve each remaining
`{HYPOTHESIS}` — `.claude/knowledge/execution/regression-promotion.md` §The full procedure, steps 1–2. A
refuted behaviour is ENV-008, never `{OBSERVED}`.

A legacy `summary.json`'s `promotion.eligible[]` says where the previous run got to; it is **not** an
approval. Re-derive from the CSV itself, exactly as G10 does:

- `npm run suites:review -- <csv> --fail-on=High` → **0 GRD-001 Blocker/High, 0 ENV-008** — `<csv>` is
  the legacy `casesCsv` or each `suiteCsv` holding the in-suite rows, judged on those rows.
- `npm run td:validate` → green (a promoted case whose `@td()` no longer resolves is a permanent red).
- `npm run graphql:lint-labels -- <csv>` for any GraphQL case (DV-019).
- **Every assertion grounded** — no `{HYPOTHESIS}`, no unconfirmed `{SPEC}`. A `{HYPOTHESIS}` that
  this step cannot resolve keeps its case at `Draft`: **not promotable**, no exceptions. An
  `{OBSERVED}` with no traceable artifact is the failure mode Dimension 10 exists to catch — if the
  `{OBSERVED}` upgrades look unbacked, REJECT the case rather than promoting a fabricated expectation into
  permanent coverage.
- A case **never executed** (no PASS/FAIL evidence) is not promotable regardless of its tags.

For a legacy source, cases the hand-off record lists in `promotion.blocked` stay blocked; a case it lists
in `promotion.eligible` that fails re-derivation is **demoted back to blocked** with the reason. Report both sets.

## 2 — Human approval (the promotion gate)

Promotion out of `Draft` is **never automatic** (`.claude/agents/qa-lead-orchestrator.md` §Decision
Framework — only `qa-lead-orchestrator` or the user may promote; `test-management-specialist` never
self-promotes). Present the eligible set — case ID, title, target suite, `Draft → Reviewed` (or
`→ Automated` where a run will ground it) — and **wait for approval**. Rejected or unapproved cases stay
`Draft` (in the ticket folder, or in place for in-suite rows).

**Snapshot before any write.** Before step 4 or 4i, snapshot every CSV you will write and
`config/test-suites.json`:

```bash
npx tsx .claude/skills/qa-case-promotion/scripts/flip.ts snapshot <suite.csv>... config/test-suites.json > <scratchpad>/promotion-snapshot.json
```

Every revert below is `flip.ts restore <scratchpad>/promotion-snapshot.json` — never `git checkout`, which
also discards this run's earlier edits and any other session's uncommitted work in the same file.

## 3 — Route each approved case to its target suite (legacy source only)

Layer + domain → the owning suite, derived from `config/test-suites.json` +
`.claude/knowledge/execution/module-suite-map.md`. **Prefer appending to an existing suite** over creating
one. A genuinely new suite file needs: a free manifest id (check for collisions), a
`regression/suites/<Layer>/<module>/<id>-<name>.csv` path, and a full `config/test-suites.json` entry (id,
name, file, domain, layer, priority, testCount, agent, tags, `requiresModules`). **Never invent a
module/repo name** to force a route — an unroutable case stays in the ticket folder and is reported.

## 4 — Write via the deterministic appender only (legacy source only)

Hand-rolling the append silently merges two 15-column rows into one ~29-field record:

```bash
npx tsx scripts/test-cases/append-test-cases-to-suite.ts <target-suite.csv> --rows <approved-rows.csv> --check-global-ids --dry-run
```

Dry-run first; only on a clean dry-run drop `--dry-run`. The appender validates the 15-column schema, ID
format, the `Priority`/`Automation_Status` enums, Title+Section duplicates against the target, and
round-trip verifies the appended block.

**`--check-global-ids` is mandatory here and is not the default.** Without it the appender enforces ID
uniqueness **only within the target suite** — it cannot see an ID that already lives in a *different*
suite, and that is exactly the collision that overwrites the other suite's per-case failure evidence. The
flag scans every CSV under `regression/suites/` and rejects a colliding **incoming** ID. On a collision,
**re-ID the incoming case** — never renumber the existing one, never reuse a retired ID.

> It is opt-in for a historical reason: the corpus once carried hundreds of IDs in more than one suite,
> and checking it against itself failed every append on that debt. Promotion passes the flag regardless.

The `Automation_Status` flip `Draft → Reviewed` happens **in the rows being appended** — that flip *is* the
promotion. Stamp `References` with `Promoted: VCST-XXXX → <suite id> (YYYY-MM-DD)`, appending; never
clobber an existing `Synced:` / `Audited:` / `Corrected:` stamp.

## 4i — Flip in place (in-suite source only; the rows are never re-appended)

- **`Automated` from a run.** `npm run tc:promote -- <RUN_ID> --ids <approved ids>` (dry run), then the
  same with `--apply`. `<RUN_ID>` is `--run-id` when given, else `latest`. It writes `Draft → Automated`
  from that run's results and holds what it cannot ground with a `PR-*` code (`PR-002`: the run did not
  execute the case).
- **`Reviewed` for the cases the run says nothing against** — each approved case held at `PR-002` (not in
  the run), `PR-004` (non-executing lane) or `PR-006` (green, too few runs), or every approved case when there
  is no usable run (`PR-013`). Any other hold (`PR-003` not PASS, `PR-005` flaky, `PR-007`, `PR-008`, …)
  keeps the case `Draft`: report it with its code.
  ```bash
  npx tsx .claude/skills/qa-case-promotion/scripts/flip.ts review <suite.csv> --ticket VCST-XXXX --ids <A,B>          # dry run
  npx tsx .claude/skills/qa-case-promotion/scripts/flip.ts review <suite.csv> --ticket VCST-XXXX --ids <A,B> --apply
  ```
  Exit 2 = refused (a row no longer `Draft`, an unknown id, a suite the editor cannot place) and nothing
  was written — report it, never edit the cell by hand.
- Then step 5, on every suite touched.

> **`Reviewed` is a different claim from `Automated`.** `Reviewed` says a human/`qa-lead` approved the
> case; `Automated` says a runner executed it green, which only a completed run can evidence — so without a
> run there is no `Automated` claim to make, and hand-editing the cell to say otherwise is the exact
> failure `tc:promote` exists to end (`.claude/knowledge/execution/regression-promotion.md` §Post-Run
> Promotion). The two flips are a ladder, not alternatives; a checklist-verified case (no automated-runner
> verdict at all) is `Reviewed`/`Manual` and stays a human call.
>
> **The same `tc:promote` also runs at [`/qa-regression`](../../commands/qa-regression.md) Step 6.5**,
> against the run it just made. That is not a second promoter — it is one mechanism reached from the two
> places the evidence exists, and the scopes are disjoint: 6.5 flips cases that are *already grounded* and
> does no assertion work, while this skill re-derives G10 and is the only path that can promote a case no
> run has executed. Neither weakens the shared invariant: **promotion out of `Draft` is never automatic.**

## 5 — Re-sync the manifest and re-gate

```bash
npm run suites:sync && npm run suites:lint
```

`suites:sync` refreshes `testCount` + `_meta`; `suites:lint` hard-fails on a declared-but-absent CSV or a
selection that expands to nothing. Then re-run `npm run suites:review -- <target-suite.csv> --fail-on=High`
on every **target** suite. **An append or flip that introduces a new Blocker/Critical in the target is
reverted from the snapshot, not shipped.**

## 6 — Leave the ticket folder intact (legacy source)

`test-cases.csv` stays as the run's evidence trail (`.claude/rules/reports.md` §1); promotion copies rows
out, it does not move or delete the file.

## G12 — Promotion Integrity (gate) + independent verification

**Required whenever this skill promoted anything.** No **incoming** ID collides with any case under
`regression/suites/` — proven by `append-test-cases-to-suite.ts --check-global-ids --dry-run` exiting 0,
**not** by a plain dry-run (which only checks the target suite); `npm run suites:lint` green after
`suites:sync`; each target suite's `suites:review` no worse than before the write; no case promoted that
G10 didn't clear. *(This gate governs what promotion **adds**; it does not require pre-existing cross-suite
duplicate IDs to be fixed first.)*

Promotion writes into permanent regression coverage, so the doer cannot certify it. Dispatch a fresh
`qa-lead-orchestrator` in §Verifier Mode — the brief lists the approved ids, which went `Automated` and which
`Reviewed`, which were harvested, and the rows a `qa-suite-sync` earlier in this run changed (G1–G11
gated those): it **re-runs `suites:review` on each target suite** and
**`suites:lint`**, and for a sample of promoted cases re-checks that each `{OBSERVED}` traces to a real
run artifact. REJECT → `flip.ts restore` the snapshot → fix → re-verify. ≤2 iterations, then STOP for a human.

## Report

**Chat only.** Add this section to the run's chat report (or print it alone after `promote VCST-XXXX`).
Never save it — no report file, nothing written into a `summary.json` (a legacy one is read, never updated):

```markdown
## Promotion
Source: in-suite `Draft` rows for VCST-XXXX, or `reports/tickets/{SPRINT}/VCST-XXXX/test-cases.csv` — N found, M promoted, K blocked, J unroutable.

| Case ID | Target suite | Status | `Draft →` | Reason (if not promoted) |
|---------|--------------|--------|-----------|--------------------------|
| TC-XXX | 028 `Frontend/cart/028-cart-core.csv` | PROMOTED | Reviewed | — |
| TC-YYY | — | BLOCKED | stays `Draft` | unresolved `{HYPOTHESIS}` — which error wins when both predicates block |

Manifest: `config/test-suites.json` testCount updated for [suite ids]; `suites:lint` green; G12 verifier: APPROVE.
```
