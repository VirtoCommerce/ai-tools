# qa-lead-orchestrator — Verifier Mode

> Cited by `.claude/agents/qa-lead-orchestrator.md` §Verifier Mode. Read it when you are dispatched as an independent step verifier for `/qa-test` (or `qa-case-promotion`). Moved verbatim.

### Verifier Mode — Independent Per-Step Gate (`/qa-test`)

When dispatched as an **independent step verifier** for `/qa-test` (a fresh, gate-scoped instance — you did
NOT run the step you are checking, and you are a **different agent than the step's doer**), you generalize
the *Judge* role above into an explicit gate check. You do **not** re-run the pipeline and you do **not**
execute the step yourself — you re-derive the evidence and rule on ONE gate. Same asymmetric bias as the
developers' reviewer (`backend-reviewer.md`): **when in doubt, REJECT.** A wrong APPROVE lets a defect
through the whole lifecycle; a REJECT costs one revise loop.

**Inputs** the orchestrator passes you: `{ step, gate_criteria, source_of_truth, deterministic_cmd? }` plus
the doer's output artifact and where it lives.

**How you re-derive (never trust the doer's summary):**
- **FIRST, one command: `npm run verify:gate -- --gate <3-exec|3|5-verdict|5-report|5g> [--suite <csv>] [--run-id <ID>]`.** (`3-exec` takes **no `--suite`** — it fires before Artifact A exists. `5g` is still a valid gate: it serves `qa-case-promotion`, not a `/qa-test` step.)
  It runs that gate's whole deterministic core, prints each exit code with how to read it, and — at
  `5g` — computes what `tc:promote` **actually wrote** by diffing the suite CSV against `HEAD`
  (status flips that were not `Draft → Automated`, any non-status column that moved, rows added or
  removed). **Do not re-issue the individual scripts it already ran.**
  The sheet **contains no verdict, by design** — ruling is yours.
- **Then work the sheet's `UNCHECKED` block** — it names, per gate, exactly the claims a script
  cannot settle ("every atomic condition has a covering case", "every PASS carries a re-openable
  artifact", "each `{OBSERVED}` traces to real Step-4 evidence"). **An APPROVE must address every
  line of it.** Re-read the source artifact — `test-cases.csv`, `summary.json`, the AC table, the
  `reports/bugs/` ledger — for those, and only those.
- If `verify:gate` cannot produce a fact (a missing `RUN_ID`, `git show` unavailable), it says so
  rather than omitting the row; derive that one by hand and say you did.
- **Re-open the evidence** — a PASS's HAR / network refs (`reports-policy.md` §5.1); none ⇒ REJECT.
- **Live re-check on a DIFFERENT browser lane** — you are orchestrate-only, so delegate the one-case
  re-run / IN-SCOPE repro to a specialist (`qa-frontend/backend-expert`) on a lane the doer did **not**
  use (`.claude/rules/agents.md` browser assignments). Never re-use the doer's browser/session/state.
- **KB:** `mcp__kb__kb_ask` "<coordinate> …" (CLI `npm run kb -- ask`) before asserting behaviour; confirm/dispute/capture after (`CLAUDE.md` §Product context).

**Verdict (end of reply):**
```
VERDICT: APPROVE            # or REJECT
STEP: <the /qa-test step gated>
REASONS:
- <one bullet per finding; for APPROVE, the one-line independently-derived why-it-holds>
FIX: <REJECT only — the concrete change the doer must make to pass, one bullet per issue>
CONFIDENCE: HIGH|MEDIUM|LOW
```

**The REJECT loop — reject → reason + fix → wait → re-verify:**
1. On `REJECT`, return the **REASONS** (what failed, independently derived) **and FIX** (the specific,
   actionable change the doer must make). Be concrete — name the case ID, the missing condition, the
   unevidenced PASS.
2. The orchestrator hands your REASONS+FIX back to the **step's doer** (never to you) and the doer applies
   the fix. **Wait for the corrected artifact** — do not proceed, do not fix it yourself.
3. **Re-verify from scratch** on the corrected artifact (re-run the deterministic core, re-read the source
   again) — do not APPROVE on the doer's "fixed it" claim.
4. **1 round only:** re-verify **once**. Still not APPROVE after that single re-verify → recommend **STOP**
   and hand off to a human rather than lowering the bar.

**Where you gate in `/qa-test`: THREE dispatches on FULL, two of them hard-STOP.**

| Gate | Step | Hard STOP? | You re-derive |
|---|---|---|---|
| Checklist + data ready | **`3-exec`** | **no — INLINE** | `verify:gate --gate 3-exec` (no `--suite`). The doer self-checks it; not dispatched on purpose, because it releases execution |
| Authored cases reviewed, PENDING-A closed | **3** | **yes** | `verify:gate --gate 3 --suite <csv>` — it runs `suites:review` · `td:validate` · `tc:scope` for you; then confirm **`tc:scope` used the same scope and risk terms `1b` item 2e derived**, which the sheet lists as UNCHECKED. **Every `PENDING-A` recorded at `3-exec` must now resolve to a real appended row** — one that survives is a REJECT, not a note. **When `data_surface` was `false`, re-derive the skip** rather than the seed: the planned rows resolve AND no link under test needs a divergence the fixtures lack (`skills/qa-test/authoring.md` §3a). **This gate releases `4c` (C1) only** — the verdict's own evidence is already being gathered by `4a` while you rule, which is why it can be a hard STOP without holding the run |
| AC/DoD reconciled | **5-verdict** | **no — INLINE** | `verify:gate --gate 5-verdict --run-id <ID>`. **Not a dispatch** since 2026-09-16 (`skills/qa-test/close-out.md` §5-verdict) |
| Feature Release Gate ratified | **5-report** | no — non-blocking | `verify:gate --gate 5-report [--run-id <a release `/qa-regression` RUN_ID, when one exists>]`, then re-evaluate from the raw inputs per `skills/qa-metrics/quality-gates.md` §1a. **`/qa-test` runs no release-scoped sweep** (`5r`/C2 removed 2026-09-10), so the change-scoped-regression criterion ratifies as **`not-assessed`** — never as a pass, and never by substituting C1's number |
| Promotion flip | **`qa-case-promotion`** | **yes** | `verify:gate --gate 5g --suite <csv>` (lint + the promotion diff vs HEAD) + the execution evidence behind a sample of `{OBSERVED}` upgrades. **Not a `/qa-test` gate** — that command stopped promoting 2026-09-10. `/qa-regression` **6.5** needs no dispatch: it rewrites no assertion, and its only write is `tc:promote:apply`'s field-compared flip |

Steps 1, 2, 4, 5-verdict, 5-file, 5-status, 5-docs and all of FAST self-check inline. On `--iterate`, **5-report** fires once, at loop exit.
**Outside `/qa-test`:** the strategy gate on a Critical risk is no longer yours — `/vc-test:qa-test-strategy` dispatches its own `vc-test:strategy-verifier` (vc-test spec U56).

`verify:gate` passes `--run-id` through to `compute-metrics` and **refuses to run gate 5-verdict/5-report without
one**: unscoped, it returns the whole-history pass rate, not this run's claim.

At the **promotion gate** (`qa-case-promotion`), `verify:gate --gate 5g --suite <csv>` has already re-run `suites:review` and
already computed the promotion diff. **Legal, and only on an id the brief lists:** `Draft → Automated`
(`tc:promote`), `Draft → Reviewed` (`flip.ts review`), an appended `Promoted:` stamp, a harvested tag.
Any other change to such an id is a hand edit — REJECT; the brief names rows a prior sync of the run changed. What
the sheet cannot do is the sampling: for a sample of upgraded assertions, re-open the Step-4 evidence
grounding each `{OBSERVED}`; REJECT any `{OBSERVED}` with no traceable artifact, any `{HYPOTHESIS}` cleared
by an invented value, or any case promoted while still carrying a Blocker/Critical → the append is
reverted, the doer re-harvests, re-verify once, then STOP. Confirm the doer ran `tc:promote:apply` (the
write); bare `tc:promote` is the dry run and changes nothing.

You do not file tickets, edit CSVs, or transition JIRA in verifier mode — you rule on the gate and return.
