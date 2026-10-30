---
name: qa-docs
description: "[QA Method] Use when a ticket has reached status Tested and needs its documentation: ONE document — What's new, How to set it up, How it works — built from the run's PASS rows and real stand screenshots, posted as ONE Jira comment, plus a ≤30 s Motion film a person exports and attaches. Called by /qa-test FULL and its technical-change flow at 5-docs; run by hand after the /qa-test FAST path or /vc-test:qa-ticket. `release` mode aggregates the What's new sections of a sprint or version. Not for BA analysis or user stories (/ba-analyze) or bug reports (/vc-fix:qa-bug)."
argument-hint: "<TICKET> [--video [<file.mp4>]] | release --sprint <SprintXX-XX> | release --version <X.Y.Z>"
---

# /qa-docs — the documentation of one tested ticket

One ticket, one document, one comment. The document has three parts — **What's new**, **How to set it
up**, **How it works** — and is written for everyone who reads the ticket; there are no audience
variants. Its shape is [`template.md`](template.md); what may go into it is [`rules.md`](rules.md); the
screenshots, GIFs and the film are [`media.md`](media.md); the release aggregate is
[`release.md`](release.md). The design and its reasons:
[`docs/superpowers/specs/2026-10-30-qa-docs-design.md`](../../../docs/superpowers/specs/2026-10-30-qa-docs-design.md).

**Runs in the main session and dispatches no subagent**: it needs a browser lane, the Artifact tool and
the tracker in one place. It is an Observer and a Judge under
[`authoring-standard.md`](../../knowledge/agents/authoring-standard.md) §5.2 — it walks the stand and
states how the platform behaves — so it carries the `kb` read step (2) and write step (7).

## Invocations

| Form | Does |
|---|---|
| `/qa-docs <TICKET>` | steps 1–8 below |
| `/qa-docs <TICKET> --video [<file.mp4>]` | attach the exported film and amend the comment: [`media.md`](media.md) §Hand-off |
| `/qa-docs release --sprint <S>` · `--version <V>` | the aggregate: [`release.md`](release.md) §Aggregate |

`/qa-test` FULL and its technical-change flow call `/qa-docs <TICKET>` at their 5-docs step, after
5-status; on `--iterate`, once, at loop exit. The `/qa-test` FAST path and `/vc-test:qa-ticket` do not
call it — QA runs it by hand when the ticket needs documentation.

## Steps

1. **Read the run and the ticket.** Bind the run folder (`npm run --silent run:dir -- --ticket <TICKET>`,
   [`run-output.md`](../../knowledge/execution/run-output.md)). Input, either kind:
   - a `/qa-test` run — `summary.json` + `testing-checklist.md`;
   - a `/vc-test:qa-ticket` run — `verdict.json` + `testing-checklist.md` (no `summary.json`, no probed
     versions: §Shipped in in [`rules.md`](rules.md) takes them at capture time).

   Read the ticket's **status live** from the tracker ([`tracker-ops.md`](../../knowledge/execution/tracker-ops.md) §2).
   Refuse, write nothing, and say why, when:

   | Refusal | When |
   |---|---|
   | `no-run` | the bound folder lacks `testing-checklist.md` plus `summary.json` or `verdict.json` — pruned by `reports:prune`, or the folder of another env. Name the folder read |
   | `not-tested` | the status is anything but **Tested** — earlier (In Testing, Reopened) **and later** (Done, Closed): documentation is written at the Tested moment, from that run. Say which status was read |
   | `not-deployed` | the probed versions do not carry the change ([`rules.md`](rules.md) §Shipped in). A run that probed no versions (a `/vc-test:qa-ticket` run) is judged right after the capture probe (step 1 of [`media.md`](media.md) §Capture), before any frame is taken |
   | `not-user-visible` | no `PASS` row a person can act on ([`rules.md`](rules.md) §Evidence bar) |
   | `build-changed` | the stand runs another build than the run tested, and the person declines to document from it (step 1 of [`media.md`](media.md) §Capture) |

   A refusal is an outcome: no guide and no comment — only `documentation.json` (step 8) records it; then stop.

2. **Ground what the document will state.** The `PASS` rows give the behaviour and the settings. Before
   the first live check:

   **Ask the base for this run's coordinates** — for each page path / GraphQL operation / endpoint in
   scope: `mcp__kb__kb_ask` (CLI: `npm run kb -- ask "<coordinate> <question>"`). Record hit ids; close
   each list by its handle (`kb_show`/`kb_none`); a miss is not a blocker. Rule: `CLAUDE.md` §Essential
   Rules → *Product context*.

   The documented mechanism comes from [`doc-sources.md`](../../knowledge/execution/doc-sources.md) —
   VirtoOZ through the connector, the module's README at the deployed tag — quoted with its URL.

3. **Capture** on a Playwright lane: build check first, then one full-viewport frame per step of every
   `PASS` scenario — [`media.md`](media.md) §Capture. Build the scenario GIFs — §GIF.

4. **Write the document** from [`template.md`](template.md) under [`rules.md`](rules.md), and save it as
   `reports/ba/<Domain>/<ticket>-<slug>-guide.md`. An existing guide for the ticket is amended in place,
   never forked. Check the size cap (§Size cap) and the payload rules (§Payload hygiene) before step 6.

5. **Make the film** — one Motion artifact, ≤30 s, from the same frames: [`media.md`](media.md) §Film.
   Its `{video_line}` is the before-export one.

6. **Post — ask once.** Show the composed comment and the film link, and ask before posting: the comment
   is an external write, and it is the run's one sanctioned documentation comment
   ([`tracker-ops.md`](../../knowledge/execution/tracker-ops.md) §0 rule 4). A decline posts nothing.

   **The body is wiki markup, not the guide's Markdown.** With screenshots the comment goes through the v2
   API, where the whole body is wiki (tracker-ops.md §5c); a Markdown body shows literal `##` and renders no
   image. Render it, and post THAT file:

   ```
   npm run tracker:wiki -- <guide.md> {RUN_DIR}/documentation.wiki.txt
   npm run tracker:comment -- --ticket <TICKET> --doc --body-file {RUN_DIR}/documentation.wiki.txt \
     --attach <img> …            # one --attach per screenshot and GIF the body names
   ```

   **`--doc`, never a plain post or an amend of the result comment.** It records the documentation comment
   under its own ledger entry, so the run's result comment (5-report) stays the one every later correction
   amends and `summary.json` is not repointed. **A re-run amends** the comment `documentation.json` already
   holds — `… --doc --amend <comment_id> --same-round "documentation re-run"` — and `--doc` refuses a second
   post. The helper verifies the rendered body (one `<img>` per attached image, none left literal,
   [`reports-policy.md`](../../knowledge/execution/reports-policy.md) §5.0) — read its check, not the status
   code. Keep the comment's id. **Azure Boards:** `tracker:comment` is Jira-only — stop and post through
   `ado.mjs` (`upload-attachment`, then an HTML body with `<img src>`), [`tracker-ops.md`](../../knowledge/execution/tracker-ops.md) §5c.

7. **Bank what the run established** — for each platform behaviour the document states: matched ⇒
   `mcp__kb__kb_confirm`, contradicted ⇒ `kb_dispute`, base held nothing ⇒ `kb_capture` (CLI:
   `npm run kb -- capture`). Anchor = the route or request, never a label; contract:
   `.claude/knowledge/execution/kb-capture-contract.md`. Public base. List the ids in your output.

8. **Record** `{RUN_DIR}/documentation.json`:

   | Key | Value |
   |---|---|
   | `published` | `true` when the document was written |
   | `files` | the guide path(s) under `reports/ba/` |
   | `film` | `{ "url": <film artifact URL or null>, "file": "<TICKET>-<slug>.mp4", "exported": false }` — `exported` turns `true` only after `--video` attached it |
   | `comment_id` | the posted comment's id, or `null` |
   | `comment_posted` | `false` when the person declined the post |
   | `refusal` | `no-run` · `not-tested` · `not-deployed` · `not-user-visible` · `build-changed` · `null` |
   | `versions_source` | `run` or `capture` |
   | `aggregated_into` | set later by `/qa-docs release` — the aggregate file that includes this ticket |

   A `null` refusal with `published: false` never happens: either the document exists or the reason does.

Then hand the video to the person ([`media.md`](media.md) §Hand-off) and stop. The skill does not wait
for the export.

## What this skill never does

- Writes documentation for a ticket that is not in Tested, or an instruction with no `PASS` row.
- Creates a video file, or renders stills of the film — the person exports the MP4 from the film page; `--video` attaches it.
- Posts a second documentation comment for the same run — `--video` amends the one there is.
- Drives any browser other than a Playwright lane ([`../../rules/vc-browser.md`](../../rules/vc-browser.md)).
