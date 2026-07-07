# Using Commands & Skills

How to *drive* the VC QA plugin once it's installed. If you've just finished `/qa-onboarding`,
this is the doc it pointed you at. For **which** tool to reach for, see the decision tree in
[`.claude/ROUTING.md`](../.claude/ROUTING.md); this page is about **how** to invoke them.

---

## The mental model: command, skill, agent

- **Command** — you type a slash and a testing **workflow runs now**. `/qa-smoke`, `/qa-regression`,
  `/qa-test`, `/qa-bug`. These are the verbs of the plugin: "go do this test thing."
- **Skill** — a packaged **methodology or knowledge reference** Claude pulls in. Some skills also run
  work (`/qa-seed-data`, `/qa-review-tests`); some just inform a task you're already doing
  (`/qa-checklist`, `/vc-docs`). Mechanically, *a skill is a slash command with supporting reference
  files* (see [`.claude/rules/skills-commands.md`](../.claude/rules/skills-commands.md)) — so you
  invoke it the same way you invoke a command.
- **Agent** — a **specialist Claude delegates to** for multi-step work (e.g. `qa-frontend-expert`,
  `regression-orchestrator`). You rarely call these directly; commands dispatch them for you. You
  *can* name one explicitly — "Use qa-backend-expert to test the orders API" — when you want a
  specific specialist.

You don't need to memorize which is which. Type `/` in Claude Code and the menu shows every
command and skill with a one-line description and a `[Category]` tag.

---

## Two ways to invoke

**1. Type the slash explicitly.** This is required for anything with side effects — running tests,
filing bugs, editing code. That's the large majority of the toolkit. Example:

```
/qa-smoke storefront
```

**2. Describe the task in natural language.** This only works for the handful of **read-only** tools
that are safe to auto-trigger: `/qa-status`, `/qa-env-check`, and `/vc-docs`. Saying *"show me the QA
dashboard"* will run `/qa-status`; saying *"run the smoke suite"* will **not** auto-run `/qa-smoke` —
you have to type it.

Why the split? Side-effect commands carry `disable-model-invocation: true` in their frontmatter, a
deliberate guard so Claude never kicks off a test run, a bug filing, or a code change on its own. Only
the read-only three opt back in.

---

## Anatomy of an invocation

Every command/skill advertises its arguments via an `argument-hint` (shown in the `/` menu and in the
command's own doc). Read it like this:

| Hint notation | Means | Example |
|---------------|-------|---------|
| `[a\|b\|c]` | pick **one** of these | `/qa-regression critical` |
| `VCST-XXXX` | a literal JIRA ticket id | `/qa-test VCST-1234` |
| `PR #NNN` | a pull-request reference | `/qa-test-lifecycle PR #129` |
| `<description>` | free text | `/qa-bug "cart total wrong on B2B order"` |
| *(no argument)* | runs the command's default / interactive mode | `/qa-status` |

So `/qa-regression`'s hint `[smoke\|critical\|sprint\|full\|frontend\|backend\|IDs]` tells you it
takes one selection — `/qa-regression smoke` or `/qa-regression 042,049` both work.

---

## Worked example: `/qa-smoke`

1. You type `/qa-smoke` (optionally `storefront` or `admin` to scope it).
2. The smoke orchestrator dispatches the canonical P0 suite across **both surfaces** — storefront
   (`FRONT_URL`) and Admin SPA (`BACK_URL`) — in isolated browser sessions.
3. It captures evidence as it goes: HAR files, console/network errors, and screenshots of any failure
   (per [`.claude/rules/reports.md`](../.claude/rules/reports.md)).
4. Any confirmed defect is written to `reports/bugs/` in the standard format.
5. You get a **GO / NO-GO verdict**: pass rate, and whether anything Critical blocks a deploy.

That's the shape of every command — you supply intent, the orchestrator dispatches specialists,
evidence and a verdict come back. `/qa-regression`, `/qa-test`, and `/qa-exploratory` follow the same
pattern at larger scope.

---

## Finding the right tool

Don't guess — use the **"I want to…" decision tree** in
[`.claude/ROUTING.md`](../.claude/ROUTING.md). It maps every intent
("run smoke tests", "verify a bug fix", "get a test checklist for a domain") to the exact
command/skill and tells you whether it's a Command, Skill, or Agent. The full catalogs live in
[`.claude/rules/skills-commands.md`](../.claude/rules/skills-commands.md) and
[`skills/README.md`](../skills/README.md).

---

## Common chains

Tools are designed to hand off to each other. A few you'll use often (the full cross-reference table
is in [`.claude/ROUTING.md`](../.claude/ROUTING.md#L115)):

- **Bug → fix → verify:** `/qa-bug` files the ticket → `/qa-fix` triages, reproduces, fixes, and
  opens a PR (it never auto-merges — stops for human review) → after merge, `/qa-verify-fix` closes
  the loop.
- **Keep tests current:** `/qa-test-lifecycle PR #NNN` (or `module <name>` / `diff`) syncs stale test
  cases, analyzes coverage gaps, and runs a quality review when code changes.
- **Investigate before testing:** `/qa-checklist <domain>` and `/qa-plan <feature>` give you the
  checklist and scenario catalog before you run `/qa-test`.

---

*New here?* Run `/qa-onboarding` for the guided, hands-on walkthrough — it runs a real command with
you so the model above clicks by doing.
