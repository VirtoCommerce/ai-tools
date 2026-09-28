# PR body template — every auto-fix PR (single source of truth)

This is the **one** PR body template for every auto-fix PR opened by `/qa-fix`
(`fullstack-backend`, `fullstack-frontend`). The agents cite this file and keep no copy of their own, so change the
template **here**. Write the filled body to the `PR_BODY.md` path your assignment gives you.

Related rules, not restated here:
- **PR title** `fix(<KEY>): <summary>` — `shared-instructions.md` §PR title — Conventional Commits, ticket key as scope.
- **Ticket key format** follows the tracker (`VCST-1234`, or a bare Azure Boards id) —
  `shared-instructions.md` §Ticket key format follows the tracker (not always `VCST-`).
- **Key-shaped tokens** in the body can turn the module's `ci` job red — `commands/qa-fix.md`, the
  *Tracker-key hygiene* bullet. Scan the body before writing it.

## Skeleton

Fill every `<…>` placeholder. The `{SLOT}` markers are filled from §Slots for the fix's kind; a slot whose
value is *omit* leaves no line and no heading behind.

```markdown
## Summary
<2–3 sentences: what was broken, what this changes.>  Fixes **<KEY>**.{SUB-APP SCOPE}

## Root cause
<1–2 sentences.>

## Fix
<File-level description; minimal-diff rationale; {CONTRACT CHECK}.>

## Test (red → green)
- Added {TEST}: <assertion>. Fails on the old code, passes with this fix.
{HARNESS EVIDENCE}

## Verification
{CHECKLIST}
- [ ] SonarCloud quality gate green (no new bug/vuln/hotspot; new-code coverage + duplication within thresholds)
<one-line pass result of each check you ran>

{DEPLOY WARNING}

## Reviewer notes
<Risks, {REVIEWER FOCUS}, anything needing human eyes. Tag the original assignee if known.>

> 🤖 Opened by the QA auto-fix pipeline. **Human review{DEPLOY GATE} required before merge — do not auto-merge.**
```

## Slots

**Kind** is the developer agent's route: **backend** = a `vc-module-*` / `vc-platform` repo, including
the module's AngularJS Admin SPA; **storefront** = `vc-frontend`; **sub-app** = a module repo's declared
embedded frontend sub-app (`moduleFrontendSubApps`).

| Slot | backend | storefront | sub-app |
|---|---|---|---|
| `{SUB-APP SCOPE}` | omit | omit | ` Fix is scoped to \`<repo>\`'s \`<subApp.path>\` sub-app.` |
| `{CONTRACT CHECK}` | contract/field verified | GraphQL field / prop contract verified; `$cfg` flag ruled out | GraphQL field / prop contract verified |
| `{TEST}` | `` `<TestClass.Method>` in `<test project>` `` (xUnit) | `` `<path/to.spec.ts>` `` (vitest) | `` `<path/to/test>` `` (the sub-app's own `tsx --test`, or the ephemeral vitest harness) |
| `{HARNESS EVIDENCE}` | see §Harness evidence | omit | see §Harness evidence |
| `{CHECKLIST}` | `- [ ] dotnet build -c Debug`<br>`- [ ] dotnet test (affected project)` | `- [ ] vue-tsc --noEmit (typecheck)`<br>`- [ ] lint`<br>`- [ ] vitest (new + affected)`<br>`- [ ] build` | the same four as storefront, run in `<subApp.path>` with the sub-app's own scripts |
| `{DEPLOY WARNING}` | **always** — §Deploy verification | **only if the bug has a visual aspect** — §Visual / E2E verification | same as storefront |
| `{REVIEWER FOCUS}` | migration notes | BL-UI cells touched | BL-UI cells touched |
| `{DEPLOY GATE}` | ` + deploy verification` | omit | omit |

### Harness evidence

Add a line only when the proof needed a throwaway harness. The harness itself is never committed; only its
evidence goes in the body.

- **Admin SPA logic** (backend) — the Node scratch harness's red and green output
  (`skills/angular-admin/scratch-harness-patterns.md`).
- **Admin SPA layout / CSS** (backend) — a `## Visual proof (render harness)` section right after the test
  section, with `before.png` (HEAD, red) and `after.png` (fixed, green), plus the measured `overlapPx` pair
  where the harness took one (`skills/angular-admin/visual-render-harness.md`).
- **Ephemeral sub-app harness** (sub-app) — both runs' output (`skills/vc-shell-fix/SKILL.md`).
- **Trivial fix, no dedicated repro test** (any kind) — replace the `Added …` line with
  `Trivial — covered by existing suite: <why>` (Gate 2 via skip).

### Deploy verification

```markdown
## ⚠ Needs deploy verification
Statically verified only. The live symptom from <KEY> must be re-confirmed after this module is built
and deployed to QA (regression pipeline + `/qa-verify-fix <KEY>`).
```

### Visual / E2E verification

```markdown
## ⚠ Needs visual / E2E verification
Logic is unit-proven. Layout / CLS / visual behaviour of <KEY> must be re-confirmed on a real deploy
(Storybook + storefront; for a sub-app, the deployed module) via `/qa-verify-fix <KEY>`.
```
