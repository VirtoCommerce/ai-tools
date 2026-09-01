# The two opt-in modes — `--epic` and `--iterate`

Both are thin orchestrations over the same five steps. Neither changes any step's internals, and most runs
use neither — which is why they live here rather than in the command.

---

## `--epic <EPIC-KEY>` — a series of sibling stories

A story is usually one slice whose value only appears in the A→B→C chain, so testing the slices
independently can leave every story green and the Epic broken.

1. **Resolve + order.** Fetch the Epic and its child stories (`getJiraIssue` on the Epic → children). Test
   only the **testable** ones (Done / Ready-for-test / in the deploy under test); note the rest as
   not-yet-testable. **Order by dependency** — the Epic's flow (A creates → B approves → C converts), read
   from the story order / links / the `1a` Epic-context analysis. **State the order chosen.**
2. **Run each story through the normal pipeline, in order** (each keeps its own FAST/FULL routing and its own
   gates), and **carry state forward**: story N's seeded exit state is story N+1's entry precondition — the
   quote `A` created is the one `B` approves. Seed once, cumulatively; don't reset between siblings. A story
   that FAILs or is BLOCKED **halts the chain at that point** — a downstream story that depends on it cannot
   be trusted — so report where it stopped. `--iterate` may be combined to try fixing the failing story
   before continuing.
3. **Cross-story E2E.** After the last story, run the **full Epic journey end-to-end** (A→B→C in one flow) as
   the integration proof — the thing no single-story run covers.
4. **Roll up (5e).** Per-story verdicts **plus an Epic verdict**: all child stories GO + the cross-story E2E
   clean + 0 open P0 across the Epic → the Epic's feature is releasable. Any child at NO-GO, a broken
   cross-story seam, or an open P0 anywhere in the Epic → the Epic is NO-GO (name the blocking story).
   Recommendation only; a human ships. Persist a per-story `summary.json` each, plus an Epic roll-up in
   `summary.json.epic`.

Human gates are unchanged — every per-story gate still fires, and merge/release stay the human's.

**Without `--epic`**, a single ticket still gets its **Epic context** (Step 1a) and integration coverage
against Done siblings — just not the serial multi-story chain.

---

## `--iterate` — the bounded test → fix → re-test loop (Step 5k)

With `--iterate` (default `--max-rounds 2`), a FAIL doesn't stop at the pointer: `/qa-test` drives the
fix-and-retest cycle itself, up to the cap, then hands to a human. **The initial run is round 1.**

**It does not choose the path, and it runs on both.** FAST/FULL is decided at `1a` from ticket type ×
status; `--iterate` only changes the Step-5 close-out. On **FAST** the loop is fully coherent — FAST files
bugs at 5d and runs a change-scoped regression, which is everything 5k needs — and since FAST *is* the
bug-fix / tweak path, it is the likelier place to want the loop. The only FAST differences inside the loop:
round N+1 re-runs the **failed checklist items** (there are no authored cases), and step 3's verifier
re-ratification does not fire, exactly as at every other FAST gate.

**Spelling.** `--iterate 2` and `--iterate=2` are read as `--iterate --max-rounds 2`; a bare
`--max-rounds N` implies `--iterate` (a round cap means nothing without the loop). There is no argv parser,
so state the resolution in one line before Step 1 rather than acting on a guess — full table in the
command's §Usage.

Per round, once the 5c verdict is in:

1. **PASS / PASS WITH NOTES** → exit the loop → Feature Release Gate (5e) → GO/NO-GO recommendation →
   **STOP for the human to merge + release** (never automated). Done.
2. **BLOCKED** → **STOP.** A fix cannot clear an env/data/dependency blocker.
3. **FAIL** → **Fix (auto):** for each **IN-SCOPE** bug 5a judged fixable, run `/qa-fix <ticket-key>`
   (autonomous triage→fix→PR, G0–G7, **never merges**). A bug that G0 BAILs (not-auto-fixable / too-complex /
   multi-repo) → **STOP**, hand that bug to a human; the loop cannot fix it. If no in-scope fixable bug
   remains, fall back to the pointer close-out.
   - **Deploy the prerelease (confirm):** `/qa-deploy-pr <ticket-key>` deploys the fix PR's **prerelease**
     build to the test env — **ask before deploying** (it opens its own gated deploy PR). No merge happens:
     the loop always re-tests an **unmerged prerelease**, so the never-auto-merge triple guard
     (`.claude/rules/quality-gates.md` §2) is never touched.
   - **Re-test (round N+1):** re-run **only the previously-FAILED cases (RED→GREEN) + the change-scoped
     regression (Artifact C)** against the redeployed env — Step 4 re-scoped, then Steps 5a–5c again (the
     full verdict gate; on FULL the independent verifier re-ratifies, 1 round).
4. **Cap reached** — still FAIL after `--max-rounds` rounds → **STOP** with a per-round summary (what each
   round fixed, what still fails) and hand to a human. **STOP at the cap is a success, not a failure.**

**Below-floor findings are outside the loop.** `/qa-fix` needs a filed ticket, and 5d does not file a `Low`,
so 5k only ever fixes what 5d filed.

The loop's brakes: a hard **round cap**, a **confirm on every prerelease deploy**, a **G0 BAIL → STOP**, and
the invariant that **merge + release are always the human's**. `/qa-test` still never merges and never
ships. Record the outcome in `summary.json.iterations` (`rounds`, `max_rounds`, `outcome`).

**Without `--iterate`, none of 5k runs** — the pointer close-out in
[`close-out.md`](close-out.md) §5f is the whole story.
