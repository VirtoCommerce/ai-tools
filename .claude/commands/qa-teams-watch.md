---
description: "Watch Microsoft Teams group chats for newly reported bugs: read recent messages → classify defect vs ops request → dedup against Jira → file a VCST Bug and label it for /qa-fix. Detect-and-file only; never reproduces, never fixes."
argument-hint: "[--since=HOURS] [--dry-run] [--chats=<id>,<id>]"
disable-model-invocation: true
---

# /qa-teams-watch — Teams Bug Watch

Read the watched **Microsoft Teams group chats**, pick out messages that report broken
product behaviour, and file each one as a **VCST Bug** labelled for the `/qa-fix` queue.
Then STOP. This command does not reproduce, does not route to a repo, and does not fix —
it is the intake stage that feeds `/qa-fix`, the same way `/qa-bug` does for a bug you
reproduced yourself.

> **Sibling to `/qa-monitoring`.** That command watches Application Insights and files
> nothing; this one watches human reports in chat and files. Both stop before any fix.
> Where `/qa-bug` writes a report with a **Fix Routing block** that Gate 1 reads as its
> primary signal, this command deliberately writes **no** routing block — it has not
> reproduced anything and a guess would anchor Gate 1 wrongly. `/qa-fix` derives the
> route itself via `suggestRepo()`, which is the documented path for a ticket filed
> without a local report.

## Usage
```
/qa-teams-watch                      # default 3-hour window over the watched chats
/qa-teams-watch --since=720          # replay the last 30 days
/qa-teams-watch --dry-run            # classify and report; create nothing
```

## Prerequisites

- **Microsoft 365 connector**, and the operator must be a **member of every watched chat** —
  the tools read as the signed-in user. A teammate running this sees only their own chats.
- **Atlassian connector** with write access to the tracker in `project-profile.json`
  (`tracker.kind: jira`, `tracker.projectKey`). Jira cloudId
  `d65ef426-3a47-426a-86ed-c07bb86ae0d7`.
- No repo checkout, no PAT, no local build. This stage is tracker + chat only, which is
  why it runs unattended in the cloud while `/qa-fix` needs the machine.

## Watched chats

Defaults (override with `--chats`):

| Chat | id |
|---|---|
| Platform team | `19:66398891eb3742a39045a290c944c096@thread.v2` |
| Platform Support ↔ QA | `19:6638d7f52da244059505be285e04ba2c@thread.v2` |

Read with `mcp__Microsoft_365__read_resource` on
`teams:///chats/{chatId}/messages` (most recent first), then read each candidate's own
`teams:///chats/{chatId}/messages/{messageId}` for the full body — **`bodyPreview` is
truncated and routinely hides the Jira link that decides whether to file.**

---

## Phase 1 — Collect

Consider messages inside the window (default 3h, deliberate overlap so nothing falls
between scheduled runs). Messages are in Russian and English; treat both equally.

**Screenshot-only reports — a known blind spot.** The M365 connector does **not** return
Teams inline images. A message whose text body is empty or near-empty after stripping HTML
(`<p></p>`, a bare emoji, under ~15 characters of real words) from a human sender is very
likely a screenshot-only bug report whose image is unreadable here. Reporters in these
chats do this often and the picture is frequently the whole report.

Do **not** file for these and do **not** guess at the image. Collect them into a
**"Needs a human look — possible screenshot-only report"** list (chat, sender, UTC
timestamp, message id, any fragment that came through) and treat a non-empty list as a
finding. A human opens Teams and runs `/qa-bug` locally, where the image is reachable and
can be embedded inline per `.claude/rules/reports.md` §5.0.

Exclude conversational filler in an active back-and-forth ("ок", "+1", a bare link already
covered by a neighbour) and system/call event messages.

## Phase 2 — Classify (the filing gate)

File **only** when both hold:

- the message reports broken or incorrect behaviour — an error, a 500, wrong data,
  something not rendering, a regression, unexpected API results; and
- it does **not** already link a Jira issue (a `browse/XXX-NNN` link or an inline key), and
  no reply within ~1h of it links one.

Never file for: operational/service requests (DB export or restore, `.bacpac`, SQL to run,
Redis or cache cleanup, config or subscription changes, credentials, environment access),
how-to and documentation questions, release/version requests, ETA chases on existing
tickets, code review requests, PR links, chit-chat, system events.

> In practice most partner traffic in a support chat already carries a VP ticket by the
> time it is posted, and most of what remains is an ops request. A quiet run is the normal
> outcome — say so plainly rather than reaching for something to file.

## Phase 3 — Dedup (before any create)

1. `searchJiraIssuesUsingJql` — `text ~ "<teamsMessageId>"`. A hit means an earlier run
   already filed this exact message. Skip.
2. `searchJiraIssuesUsingJql` — `created >= -14d AND text ~ "<3-5 distinctive keywords>"
   ORDER BY created DESC`. If an existing issue covers the same defect in **any** status,
   including Done, skip and name the key in the report.

## Phase 4 — File

`createJiraIssue` — `projectKey` from the profile, `issueTypeName: "Bug"`,
`contentFormat: "markdown"`.

**summary** — a specific one-line defect description in English, component or area first
(`"Notifications: preview does not render interpolated values on OPUS"`). Never the raw
chat text.

**description**, in order:

1. **Reported in Teams** — chat, reporter, UTC timestamp, and the partner/customer named.
2. **Report** — the message translated to English if needed, preserving environment,
   version numbers, URLs and repro steps **verbatim**.
3. **Steps to reproduce / Expected / Actual** — as far as the message supports. Write
   "Not specified in the report" rather than inventing anything.
4. **Needs evaluation** — QA has not reproduced this. If the message appeared to carry an
   unreadable image, say so and point at the original.
5. A final line, exactly: `` Teams message ID: <teamsMessageId> `` — the dedup key every
   later run depends on.

No assignee, no priority, no Fix Routing block.

## Phase 5 — Label (the `/qa-fix` handoff)

Always: `partner-reported`, `teams-monitor`, `needs-triage`.

Add **`qa-autofix`** — the label a `/qa-fix` routine scans for — only when the report would
survive that command's **Gate 0** fix-eligibility triage, i.e. all of:

- concrete reproduction steps: a navigation path, an explicit action sequence, or an API
  call with its inputs; **and**
- an environment and at least one version (PlatformVersion, a module version, storefront
  version, or a named environment such as OPUS / PROD4US / QA / PREP); **and**
- the defect looks simple, localized, non-breaking, code-fixable.

Withhold it for Gate 0's bail cases — no real STR, ambiguous, by-design, config- or
permission-gated, environment/data drift, API-only repro, security disclosure, needs
refactoring, breaking change — and always when the substance was in an unreadable image.
**When in doubt, withhold:** a missing label costs one manual run; a wrong one burns a
`/qa-fix` cycle on a BAIL and leaves an out-of-scope comment on the ticket.

> **Intermittency is not a bail.** "Not always reproducible", or other QA failing to
> reproduce it on their environments, does **not** by itself withhold the label — a flaky
> symptom can have a deterministic code cause. VCST-5940 is the worked example: reported
> as *«не всегда срабатывает»* on OPUS, fixed the same day by a single PR
> (`vc-module-notification` 3.1014.0).

## Phase 6 — Report

A run has a **finding** if it filed anything, flagged a possible screenshot-only report, or
has anything else needing a human. Lead with that. Then: each ticket (key, URL, whether it
got `qa-autofix` and why not if it didn't); the screenshot-only list; each candidate
skipped and why (already linked / duplicate of KEY / ops request). Filed nothing? Say so
plainly — that is a normal outcome, not a failure.

Never run `/qa-fix` from here.

---

## Unattended — the two-scheduler split

This command is the **intake** half. It needs no machine, so it runs in the cloud on a
schedule; `/qa-fix` needs a checkout, `project-profile.json` and a write credential, so it
runs as a Claude Code Routine on the operator's machine. They share one queue in Jira and
know nothing about each other.

| | Intake (cloud) | Fix (local machine) |
|---|---|---|
| Runs | hourly, business hours | hourly |
| Reads | the watched Teams chats | `labels = qa-autofix` |
| Writes | VCST Bug + labels | branch + PR, ticket transitions |

**Cloud side** — a Cowork scheduled task carrying this command's Phase 1-6 logic as its
prompt. Each teammate creates their own; scheduled tasks are per-account and run as their
owner, using that person's connectors and chat membership. **Only one person should run
the intake half** — two concurrent runs share a window and can race between the dedup
search and the create.

**Local side** — `/schedule`, hourly:

```
project = VCST AND labels = qa-autofix AND statusCategory = "To Do" ORDER BY created ASC
```

Take the oldest, run `/qa-fix <KEY>`, report the terminal outcome. The ticket falls out of
the query by itself once Gate 1 moves it to in-progress — no cursor, no shared state.

> **Use `statusCategory`, not a named status.** A VCST Bug created through the API lands in
> **`Draft`**, not `To do` (verified 2026-09-14). A `status = "To do"` filter matches
> nothing and the routine reports "no eligible tickets" forever while the intake half keeps
> filing. `statusCategory = "To Do"` covers Draft, To do and REFINEMENT; since only the
> intake half applies `qa-autofix`, the broader filter cannot over-select.

## Rules

- Detect and file only. Never reproduce, never route, never open a PR.
- Never invent a fact absent from the message. Genuinely ambiguous ⇒ do not file; list it
  as needing a human look.
- Never post into a watched chat. These are live channels with partners in them.
- Comment and body style follows `knowledge/execution/tracker-ops.md` §2 — Markdown, brief,
  outcome-first.
