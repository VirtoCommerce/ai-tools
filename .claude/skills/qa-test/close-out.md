# Stage 5 — Close: triage, filing, the verdict, the files, the comment, the hand-off

> **Before posting any tracker comment, read `knowledge/execution/tracker-ops.md` §0 — the GOLDEN RULE.**

The command fixes the order: reconcile → triage → investigate → `qa-bug` → teardown → **5-verdict** →
files → page and comment → 5-status → docs → 5-docs-map → kb → run cost → lifecycle question. This file
holds the rules for the steps that are the repo's; reconcile is vc-test's
([`reconcile.md`](../../../plugins/vc-test/skills/qa-test-strategy/reconcile.md)), triage is
`vc-test:qa-triage-results` plus [`triage.md`](triage.md), and 5-status · 5-docs · 5-docs-map are
[`reporting.md`](reporting.md).

## Triage — `qa-triage-results`, then `vc-fix:qa-investigate`

The chain is fixed: **triage → investigate → `qa-bug`.** Each link has one owner, and no link is done by
hand.

1. **The input is the checklist.** At the Stage 4 join every exploratory and visual finding became a row with a
   verdict in `testing-checklist.md`. **Dedupe there, by defect class rather than by surface**: two lanes that
   saw one defect make one row with two pieces of evidence.
2. **Invoke the skill `skill: "vc-test:qa-triage-results"` with `ticket <TICKET> --verify --min-severity P2`**
   ([`plugins/vc-test/skills/qa-triage-results/SKILL.md`](../../../plugins/vc-test/skills/qa-triage-results/SKILL.md) §Usage, its *Ticket mode* paragraph), and for the
   regression lane with `<RUN_ID> --verify --min-severity P2` — **never `--fix`**, which would edit a suite case.
   It collects the FAIL / BLOCKED / NOT-RUN rows (the installed plugin's `lib/triage-collect.mjs --ticket <TICKET>`, not this checkout's copy) and classifies them with
   the regression classifier. Phase 4 then sends **every** Medium-or-worse real-bug candidate to the layer's QA expert, whose
   brief makes it invoke `vc-fix:qa-investigate` ahead of `qa-bug`. Each one returns `REPRODUCED` /
   `NOT_REPRODUCED` plus an evidence package.
3. **Apply what it returns** ([`routing-and-fix.md`](../../../plugins/vc-test/skills/qa-triage-results/routing-and-fix.md)
   §Ticket mode):

| Returned class | Goes to |
|---|---|
| **Confirmed bug** (`REAL_BUG`, `REPRODUCED`) | `/vc-fix:qa-bug` with its package (§5-file) |
| **`needs-review`** (did not reproduce; `vc-fix` missing; or the Skill tool refuses `vc-fix:qa-investigate` — an install that predates its unlock: tell the user to run `/plugin update`) | a line in `verdict.md`, never filed |
| **Below floor** (a `Low` real-bug candidate) | `summary.json.bugs_not_filed`, with its evidence (§5-file) |
| **Test defect on a checklist item** — a wrong item, stale data, a wrong oracle | fixed in `testing-checklist.md` by you and re-run once, or noted in `verdict.md` |
| **Test defect on a regression case** | a `stale_cases` entry, reason `failed-as-test-defect` — the case is never edited here |
| **Env / flaky / known** | the item's Result note, with the evidence that says so. When it stopped a check, also a line under *Not tested, and why* |
| **By design** | `kb` (confirm or capture) and a line in `verdict.md`. Never a bug |

Visual findings and App Insights signals enter by [`triage.md`](triage.md) §1 and §7. Before calling a finding
a product bug, the investigation checks the back office for the value it depends on and queries VirtoOZ for
the documented behaviour ([`CLAUDE.md`](../../../CLAUDE.md) §Essential Rules → *Product context*). A non-empty
`unresulted[]` sends you back to the Stage 4 join.

## 5-file. File bugs — through `/vc-fix:qa-bug`, with a severity floor

Call `/vc-fix:qa-bug "<one-line defect>"` once per **confirmed** bug, sequentially (it may take a browser
lane). Give it, **as file paths**:
- **the `vc-fix:qa-investigate` package** (`evidence-index.md`, `root-cause.md`, screenshots, HAR,
  console/network lines). Say that the bug is already reproduced and investigated, so `qa-bug` reuses the
  package for its reproduction and its 4-layer validation and does not dispatch a second repro
  ([`routing-and-fix.md`](../../../plugins/vc-test/skills/qa-triage-results/routing-and-fix.md) §The `/qa-bug` brief)
- the checklist item, charter item or regression case it came from
- the ledger ids of the data involved
- the build versions from Stage 0
- the run folder `{RUN_DIR}`, so the report and its screenshots land in its `bugs/`
- `found-by:agent-testing <ticket-key>` — left out only for a bug the user brought in, which `qa-bug` then
  records as a human's (`.claude/knowledge/execution/tracker-ops.md` §Labels on bugs Claude files)

`qa-bug` does what this flow must not do by hand: the duplicate check, the 4-layer validation (from the
package), owning-repo resolution (the `/qa-fix` hand-off block) and the report file. **Cite the path it
returns; never move or rewrite its report.** `vc-fix` not installed ⇒ STOP at this step: tell the user to
run `/plugin install vc-fix@ai-tools` and keep the drafts in chat — never a hand-written report.

### The floor: `Critical` / `High` / `Medium` only

| Severity | = | Tracker item |
|---|---|---|
| `Critical` | P0 | **File** |
| `High` | P1 | **File** |
| `Medium` | P2 | **File** |
| `Low` | P3 | **Do not file** — record it |

Severity is graded once, at triage, and never re-graded here to move a finding across the line. **A `Low` is
dropped from the TRACKER, never from the RUN:** its evidence stays in the run folder, and
`summary.json.bugs_not_filed` names it, one entry each. Escalate above the floor only on an explicit human
instruction in this run, never in bulk.

### The tracker step — by provenance, and only on a yes

| Provenance ([`triage.md`](triage.md) §4) | Tracker step |
|---|---|
| **IN-SCOPE** | **A row in the ticket's To-fix table — no tracker item, never a Sub-task.** The finding goes to `summary.json.to_fix[]` (`id` `F-<n>`, `what`, `severity`, `ref` = the failing item, `report` = the path `qa-bug` returned, `repro` = `{ impact, repo, file, where, steps[], expected, actual, found_by[] }`, short — `found_by` names the check by TITLE, never by id), and the comment renders it in **What to fix and how to reproduce** |
| **PRE-EXISTING** | **Link only** — `/vc-fix:qa-bug … link-only:<existing-bug-key>`, linked to the ticket |
| **OUT-OF-SCOPE incidental** | Its **own standalone ticket** + a *related* link, created only on the operator's yes |
| **`BL-A11Y-*` on a functional / feature / E2E ticket** | Its **own standalone ticket** + a *related* link, at its **real severity**; never a To-fix row, and it does **not** fail the verdict ([`triage.md`](triage.md) §7a) |

Anything that would become its own tracker item is **proposed, one line per item** — what, severity, the
suggested type (`Bug` / `Task` / `Story`) and why it is not a To-fix row — and asked once as a list the
operator answers per item (create · put in To fix · skip). An unanswered item stays a draft and is named in
the comment under **Suggested separate tickets**. Never a Sub-task, in any answer.

**Gate (inline):** every IN-SCOPE bug at or above the floor is a `to_fix[]` row and none was created in the
tracker; every PRE-EXISTING match is linked, not re-filed; every `Low` is in `bugs_not_filed`; no real bug was
downgraded to a test defect; no severity moved since triage.

## 5-verdict. Reconcile AC & DoD, then decide the verdict

Reconcile the strategy first ([`reconcile.md`](../../../plugins/vc-test/skills/qa-test-strategy/reconcile.md)):
the round's `### Reconciliation`, its cap (a High/Critical risk without a result is never `PASS`), and
`summary.json.strategy` — never null once a strategy ran. Then two moves, both owned by the vc-test plugin:

### 5-verdict.1 Compare AC & DoD vs implementation

*The rules live in the vc-test plugin: `plugins/vc-test/skills/qa-test-strategy/verdict-rules.md` §Reconcile — AC & DoD vs implementation*

### 5-verdict.2 Decide verdict

*The rules live in the vc-test plugin: `plugins/vc-test/skills/qa-test-strategy/verdict-rules.md` §Decide the verdict*

`PASS` / `PASS WITH NOTES` / `FAIL` / `BLOCKED`. The conditions it reconciles are the checklist's AC items. A
`Low` finding never makes a FAIL, and an accessibility finding never blocks a functional ticket. The verdict
is **recorded** here and **published** by the comment, so a late finding amends a verdict nobody has read yet.

## Files — `{RUN_DIR}` (the run folder, `run-output.md`)

- **`summary.json`** — keys come only from
  [`../../templates/qa-test-summary.schema.json`](../../templates/qa-test-summary.schema.json):
  - `path: "STRATEGY"`, `flow: "feature-test"` — depth is `strategy.depth_label`
  - `strategy` — reconciled; `status_transitions[]` — every hop and skip
  - `regression` — the regression lane's run (`c1`: suites, ids, `run_id`, `pass_rate`), or its `skipped_reason`
  - `visual` — the visual lane, or `ran: false` + `skipped_reason`; never `null` (a `null` reads as a gap)
  - `test_data` — the ledger and teardown
  - `domain_map` — its state, plus the mind-map path and `mind_map_findings[]`
  - `bugs_filed` / `bugs_not_filed` / `to_fix`
  - `candidate_cases` / `stale_cases` (§Hand-off to lifecycle)
  - `tracker.comment_id` — `null` until the comment posts, then the returned id
  - `report.page_url`, `report.verdict_md`, `report.kb`; `cost` — the run-cost table and its budget line

  Then run `npm run summary:validate`; it must report no new finding. Run it again after the last
  write-back (comment id, page link, kb ids, cost).
- **`testing-checklist.md`** — the Result column filled in by you, the only writer.
- **`triage-report.md`** and the `evidence-*/` investigation packages — written by `qa-triage-results`
  ticket mode, never by hand.
- **`verdict.md`** — **≤60 lines, verdict first**, in the shape of
  `plugins/vc-test/skills/qa-test-strategy/verdict-rules.md` §Shape. Every strategy artifact row appears as a
  result or `SKIP — <reason>`. Under *Context used* it adds two lines: `budget:` (from `run-cost.mjs`) and
  `Cases: <n> candidate · <n> stale → /qa-test-lifecycle <TICKET>` (or `none`).

**Mind-map findings** go into `summary.json.domain_map.mind_map_findings[]`: a node the run contradicted, a
scenario that fit no node, every DRIFT item's `HOLDS`/`RESOLVED` result with its evidence, and an UNVERIFIED
node the exploratory session established. A DRIFT that holds and whose route `TM-018` flags as unfiled reached
triage as a FAIL row and went through investigate → `/vc-fix:qa-bug`; the key or path that returned becomes
the finding's proposed route. They are handed to the next `/qa-test-mind-map update --from <TICKET>`, never
applied here.

## HTML page and comment

Write the page's extras to `<scratchpad>/extra.json` from `verdict.md`: `lede` = the one sentence — **mandatory**; `rows` = the AC table (`id`, `text`, `result`, `evidence`); `notTested`; `context` = the Data and Context-used lines as `{label, value}`; `shots` ≤ 4. Then run `/vc-fix:qa-report {RUN_DIR}/summary.json --kind test --extra <scratchpad>/extra.json`. It loads `artifact-design`, publishes the page, renders the comment with its link, and asks the one question in §Tracker comment. Skill refused ⇒ the install predates it: `/plugin update`, stop the report step — never type the page or comment by hand.

**Audience: Anyone at Virto Commerce.** The page is read by the ticket's developers and PO through the
tracker comment's link, so it is shared org-wide, not kept to its author. The Artifact tool publishes
every page private and cannot change sharing, so after publishing, tell the user in one line to set
**Share → Anyone at Virto Commerce**, and do it **before** the tracker-comment question: a link to a
private page reaches no one. Never describe the page as private in the comment or in `verdict.md`.

### Tracker comment

The question, the post and the amend are `qa-report`'s §4–§5: one comment per round, posted only on a yes; a
same-build re-run amends the recorded id, a new build posts a new comment
([`tracker-ops.md`](../../knowledge/execution/tracker-ops.md) §0). A UI claim carries its screenshots inline
(`.claude/rules/reports.md` §5.0). Write the returned id into `summary.json.tracker.comment_id` (the
`tracker:comment` helper mirrors it). The status hop comes after, in [`reporting.md`](reporting.md) §5-status.

## Hand-off to lifecycle

`/qa-test` reads and runs suite cases; it never writes, edits or deletes one. Two lists in `summary.json`
carry what the run learned about the corpus to the one command that may change it:

| List | Holds | Item |
|---|---|---|
| `stale_cases` | cases at risk that the staleness check, or a run, showed no longer match the build | `{ id, suite, reason }`, `reason` one of `renamed-field` · `removed-selector` · `known-defective` · `failed-as-test-defect` (triage classified a FAIL as a case defect, not a product bug) |
| `candidate_cases` | checklist items that PASSED and that no suite case covers — a node no case stamps, an integration point, a `PROMOTE` exploratory scenario | `{ checklist_row, risk, behaviour, layer }` |

At close, **after the verdict and the comment**, if either list is non-empty: ONE question — run
`/qa-test-lifecycle <TICKET>` now, or later. `verdict.md` names the command either way. `/qa-test-lifecycle`
reads both lists from this run folder's `summary.json`: each stale case becomes a sync target with its reason,
each candidate a gap to author, and it then promotes.
