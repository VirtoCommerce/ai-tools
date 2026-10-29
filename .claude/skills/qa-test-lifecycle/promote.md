# /qa-test-lifecycle — Phase 6P, promotion

Supporting file for [`/qa-test-lifecycle`](../../commands/qa-test-lifecycle.md), moved here from the command to keep the command under its BUDGET-004 baseline. Read it in Phase 6 only when Phase 1 resolved a `promotionSource` (or under `--promote-only`).

#### 6P. PROMOTE — fold a legacy/handoff run-scoped case set into durable coverage

Serves case sets `/qa-test` did **not** finish in-run, by `promotionSource.kind`:
- **`in-suite`** — the `Draft` rows a current `/qa-test` run appended to `regression/suites/` (its
  `References` carry the ticket key). They are already in their suite: steps 3–4 do not apply; step **4i**
  flips them in place.
- **`legacy`** — a `reports/tickets/*/VCST-XXXX/test-cases.csv` left by an older `/qa-test`, or a
  re-promotion of cases that stayed `Draft`: steps 3–4 append them.

**Runs when** Phase 1 resolved a `promotionSource` **and** step 1 below re-derives G10 clean. **No-op**
when there is no `promotionSource`. **Never runs** under `--ci` or `--report-only`.

**Precondition, stated precisely — 6P does NOT require an APPROVED pipeline verdict.** It requires the
**G10 re-derivation in step 1 to come back clean for the cases being promoted**, plus the step-2 approval.
(`--promote-only` skips Phases 2–5 and so produces no verdict to gate on.) On a **full** run the pipeline verdict
still applies as a second condition — NEEDS FIXES / BLOCKED means the suites in scope are not in a state to
receive new cases, so do not promote into them.

**Nothing in the manifest-driven runner reads `reports/tickets/**`**, so promotion is the only path from a
legacy ticket-scoped case to regression coverage, and this command is its only owner (`/qa-test` prepares, never promotes).

**1 — Re-derive eligibility independently (do NOT trust the hand-off).** `summary.json`'s
`promotion.eligible[]` says where the previous run got to; it is **not** an approval. Re-derive from the
CSV itself, exactly as G10 does:

- `npm run suites:review -- <csv> --fail-on=High` → **0 GRD-001 Blocker/High, 0 ENV-008** — `<csv>` is
  `promotionSource.casesCsv` (legacy) or each `suiteCsv` holding the in-suite rows, judged on those rows.
- `npm run td:validate` → green (a promoted case whose `@td()` no longer resolves is a permanent red).
- `npm run graphql:lint-labels -- <csv>` for any GraphQL case (DV-019).
- **Every assertion grounded** — no `{HYPOTHESIS}`, no unconfirmed `{SPEC}`. A `{HYPOTHESIS}` that
  this phase cannot resolve keeps its case at `Draft`: **not promotable**, no exceptions. An
  `{OBSERVED}` with no traceable artifact is the failure mode Dimension 10 exists to catch — if the
  `{OBSERVED}` upgrades look unbacked, REJECT the case rather than promoting a fabricated expectation into permanent
  coverage.
- A case the run **never executed** (no PASS/FAIL evidence) is not promotable regardless of its tags.

For a legacy source, cases the hand-off record lists in `promotion.blocked` stay blocked; a case it lists
in `promotion.eligible` that fails re-derivation is **demoted back to blocked** with the reason. Report both sets.

**2 — Human approval (the promotion gate).** Promotion out of `Draft` is **never automatic**
(`.claude/agents/qa-lead-orchestrator.md` §Decision Framework — only `qa-lead-orchestrator` or the
user may promote; `test-management-specialist` never self-promotes). Present the eligible set — case ID,
title, target suite, `Draft → Reviewed` — and **wait for approval**. Rejected or unapproved cases stay
`Draft` (in the ticket folder, or in place for in-suite rows).

**Snapshot before any write.** Before step 4 or 4i, record a blob of each CSV you will write and of
`config/test-suites.json`: `git hash-object -w <file>` per file. Every revert below restores those blobs
(`git cat-file -p <hash> > <file>`) — never `git checkout`, which also discards this run's own Phase 4b
edits and any other session's uncommitted work in the same file.

**3 — Route each approved case to its target suite** (legacy source only). Layer + domain → the owning suite, derived from
`config/test-suites.json` + `.claude/knowledge/execution/module-suite-map.md`. **Prefer appending to an
existing suite** over creating one. A genuinely new suite file needs: a free manifest id (check for
collisions), a `regression/suites/<Layer>/<module>/<id>-<name>.csv`
path, and a full `config/test-suites.json` entry (id, name, file, domain, layer, priority, testCount,
agent, tags, `requiresModules`). **Never invent a module/repo name** to force a route — an unroutable case
stays in the ticket folder and is reported.

**4 — Write via the deterministic appender only** (legacy source only). Hand-rolling the append silently merges two 15-column
rows into one ~29-field record:

```bash
npx tsx scripts/test-cases/append-test-cases-to-suite.ts <target-suite.csv> --rows <approved-rows.csv> --check-global-ids --dry-run
```

Dry-run first; only on a clean dry-run drop `--dry-run`. The appender validates the 15-column schema,
ID format, the `Priority`/`Automation_Status` enums, Title+Section duplicates against the target, and
round-trip verifies the appended block.

**`--check-global-ids` is mandatory here and is not the default.** Without it the appender enforces ID
uniqueness **only within the target suite** — it cannot see an ID that already lives in a *different*
suite, and that is exactly the collision that overwrites the other suite's per-case failure evidence. The flag scans every CSV under `regression/suites/` and
rejects a colliding **incoming** ID. On a collision, **re-ID the incoming case** — never renumber the
existing one, never reuse a retired ID.

> It is opt-in for a historical reason: the corpus once carried hundreds of IDs in more than one suite,
> and checking it against itself failed every append on that debt. 6P passes the flag regardless.

The `Automation_Status` flip `Draft → Reviewed` happens **in the rows being appended** — that flip *is* the
promotion. Stamp `References` with `Promoted: VCST-XXXX → <suite id> (YYYY-MM-DD)`, appending; never
clobber an existing `Synced:` / `Audited:` / `Corrected:` stamp.

**4i — Flip in place** (in-suite source only; the rows are never re-appended).
- With `--run-id`: `npm run tc:promote -- <RUN_ID> --ids <approved ids>` (dry run), then the same with
  `--apply`. It writes `Draft → Automated` from that run's results and holds what it cannot ground (`PR-*`).
- Each approved case it holds, or every approved case without a run: change only that row's
  `Automation_Status` cell `Draft → Reviewed` and append `Promoted: VCST-XXXX (YYYY-MM-DD)` to its
  `References` — no other cell. Never write `Automated` by hand (the blockquote below says why).
- Then step 5, on every suite touched.

> **6P promotes to `Reviewed` by default, and `Reviewed` is a different claim from `Automated`.**
> `Reviewed` says a human/`qa-lead` approved the case; `Automated` says a runner executed it green,
> which only a completed run can evidence — so without a run there is simply no `Automated` claim
> available to make, and hand-editing the cell to say otherwise is the exact failure `tc:promote` exists
> to end.
>
> **Pass `--run-id <RUN_ID|latest>` and 6P makes both flips.** It runs `npm run tc:promote`
> (`.claude/knowledge/execution/regression-promotion.md` §Post-Run Promotion), which derives
> `Draft → Automated` from that run's own `suite-*-results.json`, writes nothing else, and holds
> anything it cannot ground with a `PR-*` code. **A held case falls back to the `Reviewed` flip** if the
> step-2 approval covers it — the two are a ladder, not alternatives. A checklist-verified case (no
> automated-runner verdict at all) is `Reviewed`/`Manual` and stays a human call.
>
> **The same `tc:promote` also runs at [`/qa-regression`](../../commands/qa-regression.md) Step 6.5**, against the run
> it just made. **That is not a second promoter — it is one mechanism reached from the two places the
> evidence exists**, and the scopes are disjoint: 6.5 flips cases that are *already grounded* and does no
> assertion work, while 6P harvests `{HYPOTHESIS}` → `{OBSERVED}`, re-derives G10, and is the only path
> that can promote a case no run has executed. Neither weakens the shared invariant: **promotion out of
> `Draft` is never automatic.**

**5 — Re-sync the manifest and re-gate.**

```bash
npm run suites:sync && npm run suites:lint
```

`suites:sync` refreshes `testCount` + `_meta`; `suites:lint` hard-fails on a declared-but-absent CSV or a
selection that expands to nothing. Then re-run `npm run suites:review -- <target-suite.csv> --fail-on=High`
on the **target** suite. **An append or flip that introduces a new Blocker/Critical in the target is reverted
from the snapshot, not shipped** — same revert-on-regression rule as Phase 4b.

**6 — Leave the ticket folder intact** (legacy source). `test-cases.csv` stays as the run's evidence trail (it is category
2 per `.claude/rules/reports.md`); promotion copies rows out, it does not move or delete the file. Record
in the Phase 6 report: promoted (case ID → target suite), blocked (case ID + concrete reason), and
unroutable.

**Gate (G12) + independent verification:** promotion writes into permanent regression coverage, so the
doer cannot certify it. A fresh `qa-lead` verifier **re-runs `suites:review` on the target suite** and
**`suites:lint`**, and for a sample of promoted cases re-checks that each `{OBSERVED}` traces to a real
`/qa-test` Step-4 artifact. REJECT → restore the target CSV + manifest from the snapshot (never
`git checkout`) → fix → re-verify. ≤2 iterations, then STOP for a human.
