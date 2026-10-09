# Stage 3 — triage, verdict, and the human-readable report

## Triage — `qa-triage-results ticket`, then `vc-fix:qa-investigate`

The chain is fixed: **triage → investigate → `qa-bug`.** Each link has one owner, and no link is done by
hand.

1. **The input is the checklist.** At the Stage 2 join every exploratory and visual finding became a row with a
   verdict in `testing-checklist.md`. **Dedupe there, by defect class rather than by surface**: two lanes that
   saw one defect make one row with two pieces of evidence.
2. **Invoke the `qa-triage-results` skill with `ticket <TICKET> --verify`**
   ([`../../commands/qa-triage-results.md`](../../commands/qa-triage-results.md) §Usage, its *Ticket mode* paragraph). It collects
   the FAIL / BLOCKED / NOT-RUN rows (`npm run triage:collect -- --ticket <TICKET>`) and classifies them with
   the regression classifier. Phase 4 then sends **every** real-bug candidate to the layer's QA expert, whose
   brief makes it invoke `vc-fix:qa-investigate` ahead of `qa-bug`. Each one returns `REPRODUCED` /
   `NOT_REPRODUCED` plus an evidence package.
3. **Apply what it returns** ([`../qa-triage-results/routing-and-fix.md`](../qa-triage-results/routing-and-fix.md)
   §Ticket mode):

| Returned class | Goes to |
|---|---|
| **Confirmed bug** (`REAL_BUG`, `REPRODUCED`) | `/vc-fix:qa-bug` with its package (below) |
| **`needs-review`** (did not reproduce; `vc-fix` missing; or the Skill tool refuses `vc-fix:qa-investigate` — an install that predates its unlock: tell the user to run `/plugin update`) | a line in `verdict.md`, never filed |
| **Test defect** — a wrong checklist item, stale data, a wrong oracle | fixed in `testing-checklist.md` by you and re-run once, or noted in `verdict.md` |
| **Env / flaky / known** | the item's Result note, with the evidence that says so. When it stopped a check, also a line under *Not tested, and why* |
| **By design** | `kb` (confirm or capture) and a line in `verdict.md`. Never a bug |

A visual finding's effect on the verdict is set by
[`../qa-test/visual-axis.md`](../qa-test/visual-axis.md) §3: a `BL-UI` FAIL blocks, an a11y FAIL on a
functional ticket is filed standalone, and `vs. DESIGN` drift only advises.

Before calling a finding a product bug, the investigation must check the back office for the value it
depends on and query VirtoOZ for the documented behaviour ([`../../../CLAUDE.md`](../../../CLAUDE.md) §Essential Rules →
*Product context*). Severity follows `/qa-defect`.

## Bugs — through `/vc-fix:qa-bug`, one at a time

Call `/vc-fix:qa-bug "<one-line defect>"` once per **confirmed** bug. Give it, **as file paths**:
- **the `vc-fix:qa-investigate` package** (`evidence-index.md`, `root-cause.md`, screenshots, HAR,
  console/network lines). Say that the bug is already reproduced and investigated, so `qa-bug` reuses the
  package for its reproduction and its 4-layer validation and does not dispatch a second repro
  ([`../qa-triage-results/routing-and-fix.md`](../qa-triage-results/routing-and-fix.md) §The `/qa-bug` brief)
- the checklist item id or charter item it came from
- the ledger ids of the data involved
- the build versions from Step 0
- `found-by:agent-testing <ticket-key>` — left out only for a bug the user brought in, which `qa-bug` then
  records as a human's (`.claude/knowledge/execution/tracker-ops.md` §Labels on bugs Claude files)

`qa-bug` then does what this flow must not do by hand: the duplicate check, the 4-layer validation (from the
package), owning-repo resolution (the `/qa-fix` handoff block) and the report file. **Cite the
path `qa-bug` returns.** Never move or rewrite its report. **Its tracker-ticket step runs only on the user's yes**, asked once per
bug. The calls run sequentially because `qa-bug` may take a browser lane.

**`vc-fix` not installed** (`/vc-fix:qa-bug` unavailable) ⇒ STOP at this step. Tell the user to run
`/plugin install vc-fix@ai-tools` and keep the drafts in chat. Never fall back to a hand-written report.

## Verdict

First reconcile the strategy ([`../qa-test-strategy/SKILL.md`](../qa-test-strategy/SKILL.md)
§Reconcile): a High or Critical risk without a result caps the verdict below `PASS`. The vocabulary and
the decision rules are [`../qa-test/close-out.md`](../qa-test/close-out.md)
§5-verdict.2 — `PASS` / `PASS_WITH_NOTES` / `FAIL` / `BLOCKED`. The conditions it reconciles are the
checklist's AC items. A `Low` finding never makes a FAIL, and an accessibility finding never blocks a
functional ticket.

**Round 3 with a non-`PASS` verdict** — the last allowed round (D6): `verdict.md` adds an `## Escalation`
section per [`../qa-test-strategy/rounds.md`](../qa-test-strategy/rounds.md) §At most three — the three
verdicts, what failed more than once, and the people the ticket goes back to. No round 4 is offered.

## Files — `reports/tickets/{SPRINT}/<TICKET>/`

- **`summary.json`** — keys come only from
  [`../../templates/qa-test-summary.schema.json`](../../templates/qa-test-summary.schema.json):
  - `path: "FAST_GROUNDED"`, `flow: "feature-test"`
  - `regression` — `null` when the strategy skipped it; otherwise `regression.c1` holds the run over the
    non-stale id list (`RUN_ID`, ids, pass rate) and the stale ids it kept out
  - `visual` — the visual lane, or `ran: false` + `skipped_reason`; never `null` (a `null` reads as a gap)
  - `discovery` — the exploratory lane
  - `test_data` — the ledger and teardown
  - `domain_map` — its state, plus the mind-map path and `mind_map_findings[]`
  - `strategy` — the strategy file, round, depth label, floors fired, approval, reconciliation counts and
    candidate cases
  - `bugs_filed` / `bugs_not_filed`
  - `tracker.comment_id` — `null` until §Tracker comment posts, then the returned id
  - `report.page_url` and `report.kb` — filled after §HTML page and the kb step
  
  Then run `npm run summary:validate`; it must report no new finding. Run it again after the last
  write-back (comment id, page link, kb ids).
- **`testing-checklist.md`** — the Result column filled in by you, the only writer.
- **`triage-report.md`** and the `evidence-*/` investigation packages — written by `qa-triage-results`
  ticket mode, never by hand.
- **`verdict.md`** — **≤60 lines, in this order, nothing else:**

```markdown
# <TICKET> — <VERDICT>
<one sentence: what was tested, on which build, and the deciding fact>

| AC | Result | Evidence |
|---|---|---|
| AC-1 <short> | PASS | screenshots/<file> |

## Bugs
- <severity> <title> — <the path qa-bug returned> (<tracker key | not filed>)

## Not tested, and why
- <R-n / item / charter item> — <reason>
- Stale cases kept out of regression → /qa-test-lifecycle: <ids | none>

## Candidate cases (→ /qa-test-lifecycle, D2)
- <item / node id> — passed here, no suite case covers it

## Data
Created <n> AGENT-TEST- entities · removed <n> · settings restored and re-read: <list | none>

## Context used
Round <N> of 3 · Depth <light | standard | deep> · Strategy <path> (<APPROVED | AUTO>) · Regression <RUN_ID, n cases | SKIPPED: reason> · Model <path | SKIPPED: reason> · Checklist <path> · Domain map <state> · Mind map <path | SKIPPED: reason> · Exploratory <SBTM path | ran:false reason> · PRs <repo#n list>
```

**Mind-map findings** go into `summary.json.domain_map.mind_map_findings[]`: a node the run
contradicted, a scenario that fit no node, every DRIFT item's `HOLDS`/`RESOLVED` result with its
evidence, and an UNVERIFIED node the exploratory session established. A DRIFT that holds and whose
route `TM-018` flags as unfiled is a bug: it reaches triage as a FAIL row
([`context-wave.md`](context-wave.md) §Wave 4) and goes through investigate → `/vc-fix:qa-bug` like any other, and the key
or path that returns becomes the finding's proposed route. They are handed to the next
`/qa-test-mind-map update --from <TICKET>`, never applied here
([`../qa-test/reporting.md`](../qa-test/reporting.md) §5-docs-map).

## HTML page

Load the `artifact-design` skill, then copy
[`report-template.html`](report-template.html) to your scratchpad and fill in its `{{…}}` slots from
`verdict.md`; the env, the ticket summary, the date and the checklist pass counts come from
`summary.json`. The page states no finding `verdict.md` does not carry. The page:
- embeds at most 4 screenshots, as `data:` URIs (the page must stand alone and stay under 1 MB)
- links every bug report and the other files by their repo path

Publish it with the Artifact tool. **Then**, after it is
published, add the link as a `Page: <url>` line directly under `verdict.md`'s one-sentence line and
into `summary.json.report.page_url`. The page is built from `verdict.md`, so the link can only be added
afterwards.

**Audience: Anyone at Virto Commerce.** The page is read by the ticket's developers and PO through the
tracker comment's link, so it is shared org-wide, not kept to its author. The Artifact tool publishes
every page private and cannot change sharing, so after publishing, tell the user in one line to set
**Share → Anyone at Virto Commerce**, and do it **before** the tracker-comment question: a link to a
private page reaches no one. Never describe the page as private in the comment or in `verdict.md`.

## Tracker comment

Ask once: *"Post the verdict comment to <TICKET>?"* On yes:
- post it per [`../qa-test/reporting.md`](../qa-test/reporting.md) §5-report.2 (`npm run tracker:comment`),
  with `--artifact "<build.deployed>"`, then write the returned id into `summary.json.tracker.comment_id` —
  a same-build re-run amends it; a re-run on a NEW build posts a new comment ([`../../knowledge/execution/tracker-ops.md`](../../knowledge/execution/tracker-ops.md) §0 rule 5)
- it is **one** comment, amended and never appended to, per
  [`../../knowledge/execution/tracker-ops.md`](../../knowledge/execution/tracker-ops.md) §0
- screenshots go **inline**, verified from `renderedBody` ([`../../rules/reports.md`](../../rules/reports.md) §5.0)
- its content is `verdict.md` minus the Context section, plus the page link

No status transition, whatever the verdict.
