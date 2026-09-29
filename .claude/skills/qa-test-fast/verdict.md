# Stage 3 — triage, verdict, and the human-readable report

## Triage

Merge the runner results and the exploratory findings, then dedupe them. **Dedupe by defect class,
not by surface** — two lanes seeing one defect is one finding with two pieces of evidence. Classify
each finding:

| Class | Goes to |
|---|---|
| **Product bug** | `/vc-fix:qa-bug` (below) |
| **Test defect** — a wrong checklist item, stale data, a wrong oracle | fixed in `testing-checklist.md` and re-run once, or noted in `verdict.md` |
| **Env / flaky / known** | the item's Result note, with the evidence that says so. When it stopped a check, also a line under *Not tested, and why* |
| **By design** | `kb` (confirm or capture) and a line in `verdict.md`. Never a bug |

Before calling a finding a product bug, check the back office for the value it depends on and query
VirtoOZ for the documented behaviour ([`../../../CLAUDE.md`](../../../CLAUDE.md) §Essential Rules →
*Product context*). Severity follows `/qa-defect`.

## Bugs — through `/vc-fix:qa-bug`, one at a time

Call `/vc-fix:qa-bug "<one-line defect>"` once per product bug. Give it, **as file paths**:
- the evidence (screenshots, HAR, console/network lines)
- the checklist item id or charter item it came from
- the ledger ids of the data involved
- the build versions from Step 0

`qa-bug` then does what this flow must not do by hand: duplicate check, 4-layer validation, source and
log research, owning-repo resolution (the `/qa-fix` handoff block), and the report file. **Cite the
path `qa-bug` returns.** Never move or rewrite its report. **Its tracker-ticket step runs only on the user's yes**, asked once per
bug. The calls run sequentially because `qa-bug` may take a browser lane.

**`vc-fix` not installed** (`/vc-fix:qa-bug` unavailable) ⇒ STOP at this step. Tell the user to run
`/plugin install vc-fix@vc-tools` and keep the drafts in chat. Never fall back to a hand-written report.

## Verdict

The vocabulary and the decision rules are [`../qa-test/close-out.md`](../qa-test/close-out.md)
§5-verdict.2 — `PASS` / `PASS_WITH_NOTES` / `FAIL` / `BLOCKED`. The conditions it reconciles are the
checklist's AC items. A `Low` finding never makes a FAIL, and an accessibility finding never blocks a
functional ticket.

## Files — `reports/tickets/{SPRINT}/<TICKET>/`

- **`summary.json`** — keys come only from
  [`../../templates/qa-test-summary.schema.json`](../../templates/qa-test-summary.schema.json):
  - `path: "FAST_GROUNDED"`, `flow: "feature-test"`
  - `regression: null` (C1 never runs here)
  - `discovery` — the exploratory lane
  - `test_data` — the ledger and teardown
  - `domain_map` — its state, plus the mind-map path and `mind_map_findings[]`
  - `bugs_filed` / `bugs_not_filed`
  - `tracker.comment_id` — `null` until §Tracker comment posts, then the returned id
  - `report.page_url` and `report.kb` — filled after §HTML page and the kb step
  
  Then run `npm run summary:validate`; it must report no new finding. Run it again after the last
  write-back (comment id, page link, kb ids).
- **`testing-checklist.md`** — the Result column filled in by you, the only writer.
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
- <item / charter item> — <reason>
- <node id> — candidate case (passed here, no suite case stamps it)

## Data
Created <n> AGENT-TEST- entities · removed <n> · settings restored and re-read: <list | none>

## Context used
Model <path> · Checklist <path> · Domain map <state> · Mind map <path | SKIPPED: reason> · Exploratory <SBTM path | ran:false reason> · PRs <repo#n list>
```

**Mind-map findings** go into `summary.json.domain_map.mind_map_findings[]`: a node the run
contradicted, a scenario that fit no node, every DRIFT item's `HOLDS`/`RESOLVED` result with its
evidence, and an UNVERIFIED node the exploratory session established. A DRIFT that holds and whose
route `TM-018` flags as unfiled is a bug: it goes through `/vc-fix:qa-bug` like any other, and the key
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
  then write the returned id into `summary.json.tracker.comment_id` — a same-build re-run amends it
- it is **one** comment, amended and never appended to, per
  [`../../knowledge/execution/tracker-ops.md`](../../knowledge/execution/tracker-ops.md) §0
- screenshots go **inline**, verified from `renderedBody` ([`../../rules/reports.md`](../../rules/reports.md) §5.0)
- its content is `verdict.md` minus the Context section, plus the page link

No status transition, whatever the verdict.
