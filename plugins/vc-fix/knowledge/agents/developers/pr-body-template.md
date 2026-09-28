# PR body template — every auto-fix PR (single source of truth)

This is the **one** PR body template for every auto-fix PR opened by `/qa-fix`
(`fullstack-backend`, `fullstack-frontend`). The agents cite this file and keep no copy of their own, so change the
template **here**. Write the filled body to the `PR_BODY.md` path your assignment gives you.

**Upstream shape.** The skeleton follows Virto's general PR-description guide,
`VirtoCommerce/vc-platform` → `docs/prompts/pr-description-guide.md` (synced at `05b48b01`, 2026-08-14). Its
rationale is not restated here — read it there. This file keeps only the skeleton, the per-kind slots and
what differs for an auto-fix PR. When the guide changes, re-sync this file and bump the commit above.

Related rules, not restated here:
- **PR title** `fix(<KEY>): <summary>` — `shared-instructions.md` §PR title — Conventional Commits, ticket key as scope.
- **Ticket key format** follows the tracker (`VCST-1234`, or a bare Azure Boards id) —
  `shared-instructions.md` §Ticket key format follows the tracker (not always `VCST-`).
- **Key-shaped tokens** in the body can turn the module's `ci` job red — `commands/qa-fix.md`, the
  *Tracker-key hygiene* bullet. Scan the body before writing it.

## Four rules the skeleton depends on

1. **Write `None`; never drop a section.** `None` is a claim that you checked. A missing section reads
   as a section nobody considered.
2. **Phrase for the consumer, not the reviewer.** Say what a caller or upgrader now sees or may do, not
   what you did to the code.
3. **No internal pointers.** No gate numbers, no `/qa-*` commands, no run ids, no `reports/` or
   `.fix-workspace/` paths, no "the pipeline step". An upstream reader cannot resolve them — state the
   fact itself.
4. **No client identifier in an upstream PR.** When the target is a `VirtoCommerce/*` repo (direct or
   fork-PR), grep the body for the client org, client repo, client domain and customer names before
   writing it. The ticket key is fine; everything else about the client stays out.

## Skeleton

Fill every `<…>` placeholder. The `{SLOT}` markers are filled from §Slots for the fix's kind; a slot whose
value is *omit* leaves no line and no heading behind. `{SECTIONS}` is the consumer-question block for the
kind (§Consumer sections).

```markdown
## Description
<What was wrong and what now happens instead, in domain terms, for someone upgrading. 1–3 sentences.>
<Root cause, one sentence.>{SUB-APP SCOPE}

{NO-NEW-SURFACE}
<Link to a companion PR in another repo, if one exists.>

{SECTIONS}

> **Note** — <why this is the minimal fix, alternatives rejected, residual risk, {REVIEWER FOCUS}.
> Tag the original assignee if known.>

<details><summary>Auto-fix evidence (red → green)</summary>

- Reproduction: {TEST} — <assertion>. Fails on the base commit, passes with this fix.
{HARNESS EVIDENCE}
- Local checks:
{CHECKLIST}

{DEPLOY WARNING}
</details>

{REFERENCES}

> 🤖 Opened by the /vc-fix:qa-fix. **Human review{DEPLOY GATE} required before merge — do not auto-merge.**
```

### Consumer sections

**backend** (platform repo — `vc-platform` / `vc-module-*` on `VirtoCommerce`):

```markdown
## New GraphQL queries and mutations
None.

## Changes to existing GraphQL queries and mutations
None.

## New public services / interfaces / methods
None.

## New protected methods (extensibility)
None.

## Breaking changes
- Compile (signature change / removed member): None.
- Package upgrade (removed or renamed published surface): None. No `[Obsolete]` introduced — nothing was removed.
- Runtime behaviour: <old → new observable behaviour a caller could have relied on>

## New dependencies
None.
```

**storefront** and **sub-app** — the upstream guide covers platform and modules only, so the backend-API
sections do not apply; keep the same rules with these sections:

```markdown
## Breaking changes
- Component contract (props / events / slots): None.
- GraphQL operations the client sends (fields, variables): None.
- Settings (`$cfg` keys, theme settings): None.
- Runtime behaviour: <old → new observable behaviour a user or theme customisation could have relied on>

## New dependencies
None.
```

**Client repo** (any kind): the upstream guide says not to carry the GraphQL sections into client
projects. Use the storefront block above for a frontend fix, and for a backend fix only `## Breaking
changes` (the three lines of the backend block) + `## New dependencies`.

**The Breaking changes lines.** An auto-fix never ships a compile, package-upgrade or contract break —
that is a STOP (`shared-instructions.md` §Hard rules, rule 4), so those lines are always `None`. The
**runtime behaviour** line is never a bare `None`: every bug fix changes runtime behaviour, and this is the
break no compiler catches. Name the old → new change (e.g. «`GetModules` returned 500 when an icon file was
missing; it now returns the module without an icon»), or say why no caller could observe the old
behaviour.

## Slots

**Kind** is the developer agent's route: **backend** = a `vc-module-*` / `vc-platform` repo, including
the module's AngularJS Admin SPA; **storefront** = `vc-frontend`; **sub-app** = a module repo's declared
embedded frontend sub-app (`moduleFrontendSubApps`).

| Slot | backend | storefront | sub-app |
|---|---|---|---|
| `{SUB-APP SCOPE}` | omit | omit | ` Fix is scoped to the \`<subApp.path>\` sub-app.` |
| `{NO-NEW-SURFACE}` | `No schema change · no migrations · no new settings · no new dependencies.` | `No new props / events / slots · no new GraphQL fields · no new settings · no new dependencies.` | same as storefront |
| `{SECTIONS}` | §Consumer sections — backend | §Consumer sections — storefront | same as storefront |
| `{TEST}` | `` `<TestClass.Method>` in `<test project>` `` (xUnit) | `` `<path/to.spec.ts>` `` (vitest) | `` `<path/to/test>` `` (the sub-app's own `tsx --test`, or the ephemeral vitest harness) |
| `{HARNESS EVIDENCE}` | see §Harness evidence | omit | see §Harness evidence |
| `{CHECKLIST}` | `  - dotnet build -c Debug — <result>`<br>`  - dotnet test (affected project) — <result>` | `  - vue-tsc --noEmit — <result>`<br>`  - lint — <result>`<br>`  - vitest (new + affected) — <result>`<br>`  - build — <result>` | the same four as storefront, run in `<subApp.path>` with the sub-app's own scripts |
| `{DEPLOY WARNING}` | **always** — §Deploy verification | **only if the bug has a visual aspect** — §Visual verification | same as storefront |
| `{REVIEWER FOCUS}` | migration notes | BL-UI cells touched | BL-UI cells touched |
| `{DEPLOY GATE}` | ` + deploy verification` | omit | omit |
| `{REFERENCES}` | §References | §References | §References |

`{NO-NEW-SURFACE}` lists only clauses you actually checked. If one is false, drop that clause and describe
the change under its section instead.

### References

Copy the `## References` block **verbatim from the checkout's own `.github/pull_request_template.md`**
(its headings differ per repo — `vc-frontend` has no `QA-test`, a client repo has its own). Never type the
headings from memory. Fill them like this:

- `### Jira-link:` — the tracker link for `<KEY>` (Azure Boards: `AB#<id>`). The heading keeps its name
  whatever the tracker.
- `### QA-test:` — leave empty; the QA team fills it.
- `### Artifact URL:` — **leave the line after it empty.** CI's `publish-artifact-link` action replaces the
  one line after this heading with the package URL; any text on that line is overwritten, and a missing
  heading makes CI append the URL at the very end of the body.

No `.github/pull_request_template.md` in the checkout → omit `{REFERENCES}` and put the tracker link on
its own line at the end of `## Description`.

### Harness evidence

Add a line only when the proof needed a throwaway harness. The harness itself is never committed; only its
evidence goes in the body.

- **Admin SPA logic** (backend) — the Node scratch harness's red and green output
  (`skills/angular-admin/scratch-harness-patterns.md`).
- **Admin SPA layout / CSS** (backend) — `before.png` (base commit, red) and `after.png` (fixed, green),
  plus the measured `overlapPx` pair where the harness took one (`skills/angular-admin/visual-render-harness.md`).
- **Ephemeral sub-app harness** (sub-app) — both runs' output (`skills/vc-shell-fix/SKILL.md`).
- **Trivial fix, no dedicated repro test** (any kind) — replace the `Reproduction:` line with
  `Reproduction: trivial — covered by the existing suite: <why>`.

### Deploy verification

```markdown
**⚠ Needs deploy verification.** Verified by unit test only. The live symptom from <KEY> must be
re-confirmed on a QA environment after this package is built and deployed.
```

### Visual verification

```markdown
**⚠ Needs visual verification.** Logic is unit-proven. The layout / visual behaviour from <KEY> must be
re-confirmed on a real deployment (for a sub-app, the deployed module).
```

## The body has other writers — editing a live PR

CI rewrites the `Artifact URL` line after every build, and review bots (Cursor Bugbot, Sonar) append their
own blocks. A whole-body update built from your local `PR_BODY.md` silently deletes them — `gh pr edit`
returns success anyway. So every edit after the PR is open:

1. Read the live body: `gh pr view <pr> --json body --jq .body > <scratch>/live-body.md`.
2. Change only your own lines in that copy; leave the Artifact URL line and every bot block untouched.
3. `gh pr edit <pr> --body-file <scratch>/live-body.md`, then read the body back and confirm both survived.

## Keep it true after every push

Each re-push in the CI fix loop (`shared-instructions.md` §After the PR) can make the body wrong. After
every push, re-read the body against the diff and fix (per the section above):

- an identifier renamed in the code but not in the text;
- a claim that a later commit made untrue;
- an absolute word — «none», «all», «every» — that nobody actually enumerated;
- a claim about a group of items checked only on the first one.
