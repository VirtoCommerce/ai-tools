# QA result — the tracker comment a tested ticket earns

Fill-in shape for the ONE comment posted when testing of a ticket finishes. Two variants below:
**PASSED** (covers `PASS` and `PASS WITH NOTES`) and **FAILED / BLOCKED**. Pick one; never post both.

**This file is the SHAPE. The rules that govern it live elsewhere and are cited, never restated:**

| What | Where |
|---|---|
| One comment per ticket per run; a correction is an edit, not a second comment | [`../../knowledge/execution/tracker-ops.md`](../../knowledge/execution/tracker-ops.md) §0 |
| Body dialect — Markdown for Jira, HTML for Azure Boards, never Jira wiki | [`../../knowledge/execution/tracker-ops.md`](../../knowledge/execution/tracker-ops.md) §5a |
| Screenshots: attach first, then wiki markup — **which turns the whole body wiki** | [`../../knowledge/execution/tracker-ops.md`](../../knowledge/execution/tracker-ops.md) §5c |
| Size cap, and the mandatory `Not filed` / `Release note` lines | [`../../knowledge/execution/reports-policy.md`](../../knowledge/execution/reports-policy.md) §2 · [`../../skills/qa-test/close-out.md`](../../skills/qa-test/close-out.md) §5-file |
| Which verdict transitions the ticket where | [`../../knowledge/execution/ticket-status-transitions.md`](../../knowledge/execution/ticket-status-transitions.md) |

Post it with the helper, which keeps the one-comment-per-run ledger for you:

```bash
npm run tracker:comment -- --ticket VCST-XXXX --body-file body.md \
  --attach reports/tickets/{SPRINT}/VCST-XXXX/testing-checklist.md \
  --attach reports/tickets/{SPRINT}/VCST-XXXX/evidence.html
```

---

## The four rules this shape exists to enforce

1. **Write sentences, not labels.** `Tested on vcst-qa as the B2B buyer` — not `Env: vcst-qa. User: b2b`.
   A field list is faster to write and slower to read, and the reader is the one on a deadline. The only
   places a bare value is allowed are the table cells and the footer.
2. **The comment is short; the full report is an ATTACHMENT.** Target 15–35 lines, cap 60. The checklist,
   `summary.json` and `evidence.html` go on the issue as files — never pasted into the body, and never
   replaced by a repo path, which resolves for nobody but the author.
3. **More than three findings become a table.** Prose that lists six defects is a wall of text; six rows
   are scannable. Below four, plain sentences read better than a two-row table.
4. **Every filed ticket is named with what it is about.** A key alone (`VCST-6101`) makes the reader open
   it to find out whether it matters.

---

## Variant A — PASSED / PASSED WITH NOTES

```markdown
## QA — PASSED WITH NOTES

I tested **{TICKET}** on **{env name}** ({FRONT_URL}), running Platform `{platform version}` and
Theme `{theme version}` {from PR #NNNN | as deployed}, signed in as **{role}** (`{@td alias or login}`).

{One to three sentences: what the run covered and what it concluded. Name the surface the reader
cares about, not the code site. Present tense for what now works, past tense for what was done.}

### What was tested

| Area | Cases | Result |
|---|---|---|
| {area, in the reader's words} | {case ids, or "checklist C1–C7"} | {N} passed |
| {area} | {ids} | {N} passed, {M} failed |

Change-scoped regression covered suites {ids} at {pass rate} ({RUN_ID}).
The business rules verified were {BL-* ids}, all holding.

### New regression coverage

I added {N} cases to `{suite path}` — {PR link}.
<!-- or, when nothing was added: -->
No new cases were needed; the existing suite already covers this flow.

### Findings

{Under four: one sentence each, naming the ticket.}
{Four or more: the table.}

| # | What is wrong | Severity | Ticket |
|---|---|---|---|
| 1 | {one clause — what a user sees, not what the code does} | {Critical/High/Medium} | {KEY} |

Not filed (below severity floor): {N} Low — {one clause each} · or **None**.

---
*Release gate: {GO / CONDITIONAL GO / NO-GO} · Release note: {layer/audience, or "none — {refusal}"} ·
Full report attached: `testing-checklist.md`, `evidence.html` · Evidence: `reports/tickets/{SPRINT}/{TICKET}/`*
```

## Variant B — FAILED / BLOCKED

Same head. What changes is that **the failure is the first thing after it**, and the ticket list is
mandatory rather than conditional.

```markdown
## QA — FAILED

I tested **{TICKET}** on **{env name}** ({FRONT_URL}), running Platform `{platform version}` and
Theme `{theme version}` {from PR #NNNN | as deployed}, signed in as **{role}** (`{@td alias or login}`).

{One or two sentences: what fails, in the words of someone using the product.}

### What fails

| # | Step | Expected | Actual | Ticket |
|---|---|---|---|---|
| 1 | {the action} | {what should happen} | {what happens} | {KEY} |

{Screenshot per failing row, embedded inline — attach the file, then reference it as
`!name.png|width=700!`, which makes this whole body wiki markup (tracker-ops.md §5c).
A UI claim with no visible image is not delivered.}

### What passed

{One or two sentences, so the ticket does not read as wholly broken: which areas were clean,
and which were never reached because the failure blocked them.}

### Tickets raised

- **{KEY}** — {what it is about, one clause}
- **{KEY}** — {…}

Not filed (below severity floor): {N} Low — {one clause each} · or **None**.

---
*Release gate: NO-GO · Release note: none — {refusal} ·
Full report attached: `testing-checklist.md`, `evidence.html` · Evidence: `reports/tickets/{SPRINT}/{TICKET}/`*
```

**BLOCKED is variant B with one change**: the heading reads `## QA — BLOCKED`, the `What fails` table is
replaced by a paragraph naming the blocker (environment, data, dependency, not-deployed), what it stops,
and that the ticket is waiting for a re-run. **BLOCKED transitions the ticket nowhere** — the comment is
what makes the state readable, which is why it is mandatory rather than optional.

---

## Filling it in

Everything the shape asks for already exists in the run's own artifacts — nothing here is re-derived:

| Placeholder | Read it from |
|---|---|
| verdict, counts, `layer`, release block, `RUN_ID` | `reports/tickets/{SPRINT}/{TICKET}/summary.json` |
| per-area results | `reports/tickets/{SPRINT}/{TICKET}/testing-checklist.md` |
| platform / theme versions | `summary.json` → `build.deployed` — **probed, never declared** |
| filed tickets + severities | `summary.json` → `bugs_filed[]`, `bugs_not_filed[]` |
| new-coverage PR | the branch that added the rows to `regression/suites/**` |

A version that cannot be resolved is written `UNKNOWN`. A guess is not an option: the footer is what a
reader trusts when they later ask which build this was.
