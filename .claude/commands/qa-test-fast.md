---
description: "[Testing] Use when a ticket needs a fast but GROUNDED test pass — more than /qa-test FAST's single-agent checklist, less than /qa-test FULL's verifier-gated pipeline. Context from the PR diff, the ticket, the domain map, a test model and the mind map feeds one traced checklist; the checklist and an exploratory session run in parallel with test data made on the fly, plus the qa-design visual lane when the ticket is UI-visible; the run ends in a short human-readable verdict. feature-test route only."
argument-hint: "<TICKET> [--layer fe|be|both] [--no-explore] [--no-visual] [--dry-run]"
disable-model-invocation: true
---

# /qa-test-fast — a grounded quick test of one ticket

You run this orchestration **inline**. Each wave is **one message** of parallel dispatches. The method
behind every step, the rationalization table and the red flags are in
[`../skills/qa-test-fast/SKILL.md`](../skills/qa-test-fast/SKILL.md). **Read it before Step 0.**

| | `/qa-test` FAST | **`/qa-test-fast`** | `/qa-test` FULL |
|---|---|---|---|
| Context | the ticket | ticket + PR diff + domain map + test model + mind map | the same + story review + reachability |
| Execution | one agent (+ visual lane under `--visual`) | checklist lanes ‖ exploratory ‖ visual lane when UI-visible, ≤3 browser lanes at once | + suite authoring + C1 regression + visual lane |
| Gates | inline self-check | inline, per stage | independent verifier per step |
| Suites | untouched | **untouched** | new `Draft` cases |

## Six rules

1. **Bugs are reported only through `/vc-fix:qa-bug`**, one call per bug. Never write a bug report by hand.
2. **No ticket status transition, ever.** The tracker gets **one** comment, and only after the user says
   yes ([`../rules/reports.md`](../rules/reports.md) §0).
3. **Test data is made during the run**, as each checklist item's Data cell says
   ([`../skills/qa-test-fast/execution.md`](../skills/qa-test-fast/execution.md) §Data). There is no
   pre-seed wave. A seeder runs only when an item's Data cell names it.
4. **Every Stage-1 artifact either runs, or is recorded in `verdict.md` as SKIPPED with an observable
   reason** — for example `domain map ABSENT and build FAILED: <why>`. Time pressure is not a reason.
5. **No suite CSV is written.** That means no `Behavior:` stamps and no `Draft` cases.
6. **The deliverable is the HTML page plus `verdict.md`** (≤60 lines, verdict first). The page is not
   optional.

## Step 0 — Pre-flight (inline)

1. **Route.** Fetch the ticket and route it per
   [`../knowledge/execution/ticket-routing.md`](../knowledge/execution/ticket-routing.md). Anything
   other than `feature-test` ⇒ **STOP** and name the right command (`/qa-verify-fix`,
   `/qa-hotfix-check`, `/qa-test`).
2. **Environment.** Run `npm run env:check`, record the deployed build per
   [`../templates/agent-dispatch.md`](../templates/agent-dispatch.md) §Build Verification, and resolve
   `{SPRINT}` as [`../skills/qa-test/preflight.md`](../skills/qa-test/preflight.md) does.
3. **Prior artifacts are inputs.** For this ticket, glob `reports/tickets/*/<TICKET>/`,
   `reports/ba/test-models/<TICKET>-*` and `reports/bugs/**`. A prior model is amended, never forked.
   Prior bugs are the dedupe baseline `qa-bug` checks against. A prior run on a **different build**
   supplies context, never results.
   **A prior `summary.json` on the SAME build** is handled before anything runs:
   - Show its verdict, date and tracker comment id.
   - Ask once whether to re-run. A re-run overwrites that folder's files, so if they are uncommitted,
     ask the user to commit them first.
   - A re-run **amends** the recorded comment id and never posts a second comment
     ([`../knowledge/execution/tracker-ops.md`](../knowledge/execution/tracker-ops.md) §0).
4. **Domain slug.** Take the candidate from the ticket's components and summary, then check it with
   `npm run bl:extract -- --has-domain <slug>`.
5. **Ask the base for this run's coordinates.** For each page path, GraphQL operation and endpoint the
   ticket names, run `mcp__kb__kb_ask` (CLI: `npm run kb -- ask "<coordinate> <question>"`). Record the
   hit ids; a miss is not a blocker. Rule: [`../../CLAUDE.md`](../../CLAUDE.md) §Essential Rules →
   *Product context*.

## Stage 1 — Context

Full briefs, merge rules and the context bundle:
[`../skills/qa-test-fast/context-wave.md`](../skills/qa-test-fast/context-wave.md).

1. **Wave 1 — one message:**
   - **A** ticket, comments and attachments — `ba-system-analyzer`, no browser
   - **B** linked PRs and their `gh pr diff` — `ba-api-specialist`, no browser
   - **C** domain map — `/qa-domain-map <slug>` on `playwright-firefox`, only when the map is
     `ABSENT`/`unresolved`
2. **Join.** Merge A+B+C into the context bundle. If B names a GraphQL operation, run both
   contract-refresh commands ([`context-wave.md`](../skills/qa-test-fast/context-wave.md) §Join 1).
3. **Wave 2 — one message:**
   - `/qa-test-model <TICKET> --context <bundle>`, run by you
   - `/qa-test-mind-map update|build <slug> --from <TICKET>` — `ba-system-analyzer`, no browser,
     **without** build step 10; then copy the map signals into the bundle
     ([`context-wave.md`](../skills/qa-test-fast/context-wave.md) §Wave 2)
4. **Wave 3.** Run `/qa-checklist <TICKET> --from-model --mind-map <slug>` and write the result to
   `reports/tickets/{SPRINT}/<TICKET>/testing-checklist.md`.
5. **Stage gate.** Every model gate clause is `PASS`/`FIXED`. Every in-scope scenario row and node is
   either an item or an omission line. Every item has a Data cell.

   **`--dry-run` stops here.** It prints the artifact list and the Stage-2 dispatch plan and writes
   nothing to the tracker.

## Stage 2 — Execution (one message of ≤3 browser lanes; the visual lane follows when a slot frees)

Briefs, the lane split, the data rules and teardown:
[`../skills/qa-test-fast/execution.md`](../skills/qa-test-fast/execution.md).

1. **Checklist runners** — one per checklist lane section. `qa-frontend-expert` takes
   `playwright-chrome`; `qa-backend-expert` takes `playwright-edge`. `--layer` narrows this to one lane.
2. **Exploratory** — `/qa-exploratory ticket <TICKET>` → `qa-testing-expert` on `playwright-firefox`.
   The charter is the model's unresolved items. `--no-explore` drops the lane. That is recorded, never
   silent.
3. **Visual** — `ui-ux-expert` on Chrome DevTools MCP, whenever `visual_surface: true` (derived from the
   Wave-1 diff). **Its brief's first line makes it invoke the Skill tool with `skill: "qa-design"`**; the
   `/qa-design` command is never run. `--no-visual` drops the lane, recorded never silent. Trigger, the
   brief, the lane-count rule (a 4th lane waits for the first to return) and verdict handling:
   [`../skills/qa-test/visual-axis.md`](../skills/qa-test/visual-axis.md) §2, §4, §5. Writes
   `design-report.md` + `summary.json.visual`.
4. **Join.** Pass every bullet of [`execution.md`](../skills/qa-test-fast/execution.md) §Join gate —
   results, ledger, settings, the visual lane's `qa-design skill: loaded`, and every exploratory/visual
   finding as a table row.

## Stage 3 — Verdict

Triage, the verdict rules, the report shapes and the tracker comment:
[`../skills/qa-test-fast/verdict.md`](../skills/qa-test-fast/verdict.md).

1. **Triage.** Invoke the Skill tool with `skill: "qa-triage-results"`, args `ticket <TICKET> --verify`. It
   classifies every non-passing checklist row, and Phase 4 sends **every** real-bug candidate through
   `vc-fix:qa-investigate`, which returns an evidence package for each one. It returns the confirmed bugs, the
   checklist fixes (you apply them; you are the checklist's only writer) and the dismissed rows. A non-empty
   `unresulted[]` sends you back to the Stage 2 join. Visual findings block or advise per
   [`visual-axis.md`](../skills/qa-test/visual-axis.md) §3.
2. **Bugs.** Call `/vc-fix:qa-bug` **once per confirmed bug**, sequentially, passing its investigation package
   so that it reuses the package and does not reproduce the bug again. A `needs-review` candidate is listed in
   `verdict.md` and not filed. Its tracker-ticket step runs only after the user says yes. Then tear down
   by ledger id ([`execution.md`](../skills/qa-test-fast/execution.md) §Data) and re-read.
3. **Verdict.** Decide it per [`../skills/qa-test/close-out.md`](../skills/qa-test/close-out.md)
   §5-verdict.2.
4. **Write the ticket folder:** `summary.json`, `verdict.md`, and the updated `testing-checklist.md`.
   Then run `npm run summary:validate`.
5. **HTML page.** Load the `artifact-design` skill, fill in
   [`../skills/qa-test-fast/report-template.html`](../skills/qa-test-fast/report-template.html), and
   publish it as an Artifact for **Anyone at Virto Commerce** — the user sets that in Share
   ([`verdict.md`](../skills/qa-test-fast/verdict.md) §HTML page).
6. **Ask once:** "Post the verdict comment to <TICKET>?" Yes ⇒ post it per [`verdict.md`](../skills/qa-test-fast/verdict.md) §Tracker
   comment, and write the returned id into `summary.json.tracker.comment_id` — a same-build re-run amends that id
   (Step 0.3); a new build posts a new comment. No status transition.
7. **Bank what the run established.** For each platform behaviour the verdict states: matched ⇒
   `kb confirm <id>`, contradicted ⇒ `kb dispute <id>`, base held nothing ⇒ `kb capture`
   (`--deployment {TEST_ENV}`). Public base — nothing client-specific. List the ids in
   `summary.json.report.kb`, then re-run `npm run summary:validate`.
8. **Chat.** The verdict line, the page link, the `verdict.md` path, the bug links. Nothing else.
