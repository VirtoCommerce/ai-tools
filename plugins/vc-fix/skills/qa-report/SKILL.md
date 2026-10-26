---
name: qa-report
description: "[QA Method] Turn a FINISHED run into its ONE tracker comment (brief, within the template's char budget) and a human-readable HTML report page — after /qa-test, /qa-test-fast, /qa-verify-fix (before/after the fix), /qa-regression and /qa-smoke, or standalone on a ticket key or RUN_ID. The single home of every result-comment template. Renders from the run's machine record, never from memory; asks once, posts once, amends after. Not for bug reports (/qa-bug) or release notes (/ba-analyze docs release)."
argument-hint: "<TICKET | RUN_ID | path> [--kind test|fix|regression|smoke] [--lede '<sentences>'] [--verdict GO|CONDITIONAL_GO|NO_GO] [--ticket KEY] [--bugs K1,K2] [--extra file.json] [--set KEY=VALUE] [--confirmed]"
---

# /qa-report — the result comment and the report page

```
/vc-fix:qa-report VCST-1234                                  # the ticket's run folder: this session's, else its newest
/vc-fix:qa-report REG-2026-10-05-1200 --verdict GO --ticket VCST-1300
/vc-fix:qa-report SMOKE-2026-10-05-0900 --verdict NO_GO
```

**Deterministic core: `render.mjs`** (`node "$pluginRoot/skills/qa-report/render.mjs"`; in the ai-tools
repo `npm run report:render --`; flags and exit codes in its header). It reads the run's machine record,
fills `templates/comment-<kind>.md` within that template's `budget`, and fills `templates/page.html`.
**This skill never writes a comment or a page by hand** — a renderer refusal (exit 2/3) is shown and the
step stops. Why each rule exists, the sources per kind and the dialect table: [`reference.md`](reference.md).

Class: **Mechanic** (report rendering) — exempt from the `kb` step. `$pluginRoot`:
[`../../knowledge/execution/plugin-root.md`](../../knowledge/execution/plugin-root.md).

## 1. Resolve the source

| Argument | Kind | Source |
|---|---|---|
| ticket key | `fix` if `verification-summary.json` is newer, else `test` (`--kind` overrides; both and no `--kind` ⇒ ask) | the session's run folder when it is that ticket's (`node "$pluginRoot/scripts/env/run-folder.mjs" dir --json` → `ticket`), else the newest record in `… dir --ticket <KEY> --prior` (every env and layout, a folder outside the project too); in the ai-tools repo `npm run run:dir --` |
| `REG-*` | `regression` | `reports/regression/<RUN_ID>/` |
| `SMOKE-*` | `smoke` | `reports/regression/<RUN_ID>/` |
| a path | from the file name / folder | as given |

Nothing found ⇒ STOP: "no machine record for <arg> — run the pipeline first". A run kind needs
`--verdict` (the pipeline's own quality-gate verdict; a run folder records none).

## 2. Render

**Write the lede first — it is the one thing here that is yours.** One to three sentences saying what
happened, in the voice of someone who read the run: what the ticket now does on the surface a user
touches, or what fails and what that blocks. Everything else in the comment is derived from the machine
record. Do **not** restate the counts in words, do not write ticket-speak, and do not describe a code
site — the strip under the lede already carries the numbers. What each kind's lede must answer, and the
four ways it fails review: [`reference.md`](reference.md) §The lede. Over `lede_max` ⇒ exit 2; shorten
the sentences, never ask the renderer to.

```bash
node "$pluginRoot/skills/qa-report/render.mjs" --kind <kind> --source <path> --out <scratchpad>/qa-report-<id> \
  --lede "<one to three sentences>" [--verdict …] [--ticket …] [--bugs …] [--extra …] [--set …] --dialect <d> --images embed --json
```

`--dialect`: Jira ⇒ `markdown`; Jira **and** the model has screenshots (fix kind with
`before_shot`/`after_shot`) ⇒ `wiki`; Azure Boards ⇒ `html` (tracker from `project-profile.json`; no profile ⇒ STOP and run `/project-init`).
Exit 2 ⇒ show the message, stop. Exit 3 ⇒ the comment cannot fit even fully collapsed: show it, stop —
never shorten it by hand (the fix is the template, in a PR).

## 3. The page — publish gate

Load the `artifact-design` skill, then:
- **Native project** (`projectType` ≠ `client`): publishing uploads the run's evidence to an
  external host, so **ask the operator first and publish only if they agree**. `--confirmed` is consent to
  post the *comment* only — never read it as consent to publish. On agreement publish `page.html` with the
  Artifact tool (icon `checklist`), then tell the user in one line to set **Share → everyone in your organisation**
  — a private page reaches no one — and re-run §2 with `--page-url <url>` so the comment carries
  the link. A decline keeps the page local and the comment stands alone.
- **Client project**: do **not** publish. Kind `fix` ⇒ re-render with `--images ref` and save its `page.html`
  in the ticket folder as `evidence.html`. Other kinds ⇒ no page; the comment stands alone. The page stays
  inside the client's own tracker by going on the post as `--attach-file` (§5), which works only in the
  ai-tools repo. Publish an Artifact only on the operator's explicit request, after scrubbing every client
  host / path / identifier — and **never for a client-owned-code bug**, even when asked
  ([`reference.md`](reference.md) §Publish gate).
- Record the link: `summary.json.report.page_url` (test) or `verification-summary.json.evidence_artifact` (fix).

## 4. Ask once — unless the caller already holds consent

Show the comment text and `chars/budget`. Invoked with `--confirmed` (the calling pipeline's own step
already decided to post — `/qa-test` 5-report, `/qa-verify-fix` Step 6) ⇒ skip the question. Otherwise ask
once: *"Post this to <TICKET>?"* No ticket (a run with no `--ticket`) ⇒ show it and stop; nothing is posted.

## 5. Post or amend — ONE comment per ticket per round

[`../../knowledge/execution/tracker-ops.md`](../../knowledge/execution/tracker-ops.md) §0 governs; never
post a second comment for the same round. `--artifact` = the `artifact` field of the `--json` output.
- **ai-tools repo:** `npm run tracker:comment -- --ticket <KEY> --artifact "<artifact>" --body-file <comment>`
  (+ `--attach <shot>` per screenshot when `wiki`; + `--attach-file <page.html>` for a client-project page;
  `--amend <id>` when an id is already recorded; an `--iterate` amend is `--amend <id> --artifact "<round build>" --same-round "<reason>"`, or the helper treats it as a new round). Never upload with raw REST — both flags dedupe, which makes a retry safe.
- **Plugin-only install, Jira:** Atlassian MCP `addCommentToJiraIssue` (pass `commentId` to amend);
  screenshots attach-then-wiki per [`reference.md`](reference.md) §Dialects. **Azure:** `node "$VC_RUN" ado comment --id <n> --text-file <comment.html>` (the token comes from vc-secrets through the bridge).
- Read the posted comment back; a UI claim's images must render ([`../../.claude/rules/reports.md`](../../.claude/rules/reports.md) §5).

## 6. Finish

Print: verdict · comment id (posted / amended / not posted) · page link or local path · `chars/budget` ·
`dropped` lists. Then, as the LAST action:

```bash
node "$pluginRoot/hooks/session-telemetry.mjs" complete --skill "qa-report"
```
