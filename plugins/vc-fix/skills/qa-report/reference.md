# /qa-report — reference

Read selectively by [`SKILL.md`](SKILL.md). Nothing here restates a number: budgets live in the template
front-matter, the verdict vocabulary in `lib/model.mjs`.

## The lede

Every comment opens with a required `{{LEDE}}`: one to three sentences saying what happened. It is the
one part no machine record can supply, so the **calling skill writes it**; the renderer validates that it
is present and within the template's `lede_max`, and will never compose, shorten or trim one. `--lede`
is a required flag; `lede` inside `--extra` satisfies it equally, and the flag wins. Absent or over
`lede_max` ⇒ exit 2.

What the opening must answer, per kind:

| Kind | Answer |
|---|---|
| `test` | What the ticket now does (or fails to do) on the surface a user touches — and, on a non-pass, what that blocks. |
| `fix` | Whether the reported behaviour is gone, in the words of the original STR; if not, what still happens. |
| `regression` | Whether the release can go out on this run; on a non-GO, which area fails and why it matters. |
| `smoke` | Whether the environment is fit to test on; on a NO_GO, what is broken first. |

Four ways a lede fails review:
1. **Restating the strip** — "12 of 14 passed" in words; the counts line under it already says so.
2. **Ticket-speak** — AC ids, internal phase names or pipeline vocabulary instead of what a user sees.
3. **Describing a code site** — a file, component or query name rather than observable behaviour.
4. **Hedging the verdict** — a lede that disagrees with, or softens, the verdict in the heading.

## Templates

`templates/comment-<kind>.md`, front-matter keys: `kind`, `budget` (max chars of the rendered comment),
`lede_max` (max chars of the lede), `trim` (the lists collapsed to `+N more` first, in order, when over
budget). Slot syntax: `{{KEY}}` value · `{{#L}}…{{/L}}` per item of list `L` (`{{.}}` the item) ·
`{{^L}}…{{/L}}` when `L` is empty · `{{?L}}…{{/L}}` when `L` is non-empty · `{{L_MORE}}` the items that
were collapsed. **A budget is changed in the template, in a PR, never by hand in a run.** Exit 3 means
the comment cannot fit even fully collapsed; the fix is the template.

## Sources

| Kind | Machine record | Fields read |
|---|---|---|
| `test` | `summary.json` | ticket, verdict, environment, build, date, case totals, `estimates` (AC / DoD), the regression block, business rules verified, `bugs_filed`, `bugs_not_filed`, `release`, `report.page_url`, `screenshots` |
| `fix` | `verification-summary.json` | ticket, verdict, environment, build, date, checklist totals, STR and baseline results, `before_after[]`, regression / side-effect issues, `bugs_filed`, `evidence_artifact` |
| `regression`, `smoke` | the run folder `suite-*-results*.json` | per suite: id, name, environment, start / completion, each case's status, id and title. A suite with no `completedAt` is an unconsolidated run — refused |

`before_after[]` items: `check`, `before`, `after`, and optionally `before_shot`, `after_shot`. A
VERIFIED / VERIFIED_WITH_NOTES / NEW_REGRESSION verdict without a pair is refused: a fix is proven by a
red-to-green pair. Case `notes` are dropped on purpose — they are free text that carries account emails and fixture detail, which
belong in the run folder and never in a ticket comment.

## Verdicts

The vocabulary per kind is `lib/model.mjs` `VERDICTS`. A `test` and a `fix` verdict come from the machine
record; a `regression` / `smoke` verdict is the pipeline's own quality-gate verdict and is passed in
with `--verdict`, because a run folder records none.

## Dialects

| Tracker | `--dialect` | Why |
|---|---|---|
| Jira | `markdown` | A Jira comment body is Markdown. |
| Jira, with screenshots | `wiki` | A screenshot shows inline only if the file is attached to the issue first and then referenced as `!name.png\|width=700!` through the Jira **v2** comment API, which makes the whole body wiki markup. A Markdown image path posts `200 OK` and renders nothing. |
| Azure Boards | `html` | An Azure Boards work-item comment body is HTML. |

Fuller treatment in the ai-tools repo: `.claude/knowledge/execution/tracker-ops.md` §5a / §5c.

## Publish gate

The one source for whether a report page is published (moved here from `/qa-verify-fix` 6A).

- **Native project** (`projectType` other than `client`, or no profile): publish `page.html` as an
  Artifact; the link goes into the comment and the ticket's machine record. A private page reaches no
  one, so the operator sets sharing to the organisation.
- **Client project**: nothing is published. The page is a local file (`evidence.html` for a fix, in the
  ticket folder) and may ride on the post as an attachment inside the client's own tracker. An Artifact
  only on the operator's explicit request, after scrubbing every client host, path and identifier.

## Extras

`--extra file.json` accepts a closed key list; an unknown key is exit 2.

| Key | Shape |
|---|---|
| `title` | string — page title |
| `lede` | string — the same slot as `--lede`; the flag wins |
| `rows` | array of `{ id, text, result, evidence }` — the page's case table |
| `notTested` | array of strings |
| `context` | array of strings — page-only context lines |
| `shots` | array of image paths, appended to the model's own |

`--set KEY=VALUE` overrides one template line (e.g. `BUILD`) and is for a fact the record lacks.

## Why no hook

Rendering is invoked by the pipelines that finish a run, not by a hook on a file write: a hook cannot
ask the one yes/no question, cannot know the tracker, and would post from a half-written record. The
skill is the step; `render.mjs` is the deterministic part it calls.

## Callers

| Caller | Call |
|---|---|
| `/qa-test` 5-report | `qa-report <TICKET> --kind test --lede "…" --confirmed` |
| `/qa-test-fast` | same, from its own `summary.json` |
| `/qa-verify-fix` Step 6 | `qa-report <TICKET> --kind fix --lede "…" --confirmed` |
| `/qa-regression` | `qa-report <RUN_ID> --verdict <v> [--ticket K] --lede "…"` |
| `/qa-smoke` | `qa-report <RUN_ID> --verdict <v> --lede "…"` |
| A person | any of the above without `--confirmed`; the skill asks once |
