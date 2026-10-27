---
name: qa-visual-regression
description: "[Testing] Pixel regression (PIXEL) for any web front: shoot the same targets — Storybook stories or app pages with frozen API data — on the base build and the head build in one run, diff them, and triage each change as intended, regression or noise."
argument-hint: "storybook <checkout> <base ref> | pages <targets.json> <base url> <head url>"
---

# /qa-visual-regression — did anything change that should not have?

This skill owns **one** of the four visual instruments, `PIXEL`. Which instrument a risk takes —
`PIXEL`, `DESIGN`, `PROBE`, `CONTENT` — is decided in
[`../qa-test/visual-axis.md`](../qa-test/visual-axis.md) §2a. That is the single source for the
choice. In short: `PIXEL` compares a build with the build before it. It is useless on a new
surface (there is no "before") and blind to defects that predate the change.

**It is not tied to one front.** The engine shoots *targets* and compares two sets of them. A target
comes from one of two sources:

| Source | Targets | Works on | Base vs head |
|---|---|---|---|
| `--storybook` | every story of a Storybook 7+ build | vc-frontend, frontend-next, a customer fork, vc-shell, any framework | two builds from source: the base ref and the head |
| `--pages` | named routes in a targets file | any running web app: the storefront, Admin SPA, a fork's preview | two base URLs, with the API answers replayed from one HAR so data drift is not a diff |

Plan, evidence and later phases: [`docs/superpowers/plans/2026-10-26-visual-regression.md`](../../../docs/superpowers/plans/2026-10-26-visual-regression.md).

**Observed-behaviour base (`kb`): exempt — Mechanic** ([`authoring-standard.md`](../../knowledge/agents/authoring-standard.md) §5.2).
It compares two renders of the same targets and states nothing about how the platform behaves.

## The engine — three scripts, no agent in the loop

| Step | Command | Output |
|---|---|---|
| Scope (Storybook) | `npm run visual:affected -- --repo <checkout> --base <ref> [--roots …] [--global …] --out <file>` | `ALL` / `SUBSET` (changed components + every component that renders one, to a fixed point) / `NONE`, plus `uncovered[]` (rendering files with no story) |
| Shoot | `npm run visual:snap -- (--storybook <dir\|url> \| --pages <targets.json> --base-url <url>) --out <dir>` | one PNG per target per capture set, `snapshots.json` |
| Compare | `npm run visual:diff -- --base <dir> --head <dir> --out <dir>` | per target `same / changed / unstable / size-changed / added / removed / unrendered`, diff PNGs, `visual-diff.json`, `flagged-ids.txt` |

Each script's header documents its flags, exit codes and the measurement behind its defaults. Read
the header, not a copy of it here.

## Procedure

1. **Bind the run folder.** Everything below writes under `{RUN_DIR}/visual/`
   ([`../../knowledge/execution/run-output.md`](../../knowledge/execution/run-output.md)). Evidence rules:
   [`../qa-evidence/evidence-capture-policy.md`](../qa-evidence/evidence-capture-policy.md).

2. **Pick the source and the scope.**
   - **Storybook.** Run `visual:affected` against the head checkout and the base ref.
     - The defaults fit vc-frontend's layout.
     - A fork or frontend-next adds its own component dirs with `--roots` and its own
       restyle-everything files with `--global`.
     - `NONE` → `SKIPPED — no component or global rendering file changed`. That is not a PASS.
   - **Pages.** The scope is the targets file: the routes the risk names, each with a `waitFor`.
     - Selectors that legitimately differ per load (carousels, timestamps, recommendations) go under
       `hide` or `mask`.
     - Keep targets files for a project in its run folder or its knowledge, never hardcoded in a case
       ([`../../rules/test-data.md`](../../rules/test-data.md) THIRD RULE).
     - **Authentication** goes through a Playwright storage state file (`--storage-state`), never a
       credential.
   - **Every `uncovered[]` file** becomes a checklist row on **another** instrument, or on the pages
     source. Never drop one.

3. **Prepare base and head.**
   - **Storybook:** build both from source. Head is the PR checkout, base is a `git worktree` of the
     base ref. Build with the repo's own Storybook build script; read its `package.json`, do not
     retype it.
   - **Pages:** two running instances, for example the stand on the base build and the PR preview.
     Record the API answers **once, on base** (`--record-har <file> --har-url <api glob>`), then
     replay them on both (`--har <file> --har-url <api glob>`).
     - The glob names only the API, such as the GraphQL endpoint. Never put the app's own assets in
       it: base's bundles served to head hide every regression.
     - `visual:snap` refuses `--har` without `--har-url`.
   - A deployed build of unknown commit is never the base. A build that fails is a blocker to
     report, not a reason to compare against something else.

4. **Shoot both in the same run** with `visual:snap`. Same machine, same browser, same scope, same
   `--viewports` (and the same `--globals` for Storybook).
   - A set shot elsewhere is not comparable: fonts and anti-aliasing differ between machines.
   - **Viewports:** desktop plus the narrowest viewport the changed surface supports.
   - **Themes:** the a11y-gated presets ([`../qa-storybook/tooling-stack.md`](../qa-storybook/tooling-stack.md)
     §Project context) when the change touches tokens or colour. A customer fork shoots its own
     theme. Read global values from the build's toolbar.
   - Every axis you add multiplies the run time. Add an axis because the risk needs it, never by default.

5. **Compare in two passes.**
   - **Pass 1:** run `visual:diff` on the one-shot sets. It writes `flagged-ids.txt`.
   - **Pass 2 (confirmation):** shoot only those targets again with
     `--grep-file <pass-1 out>/flagged-ids.txt --repeat 3`, on base and on head, then run `visual:diff`
     again. Pass 2's verdict replaces pass 1's for the targets it re-shot.
   - **Pass 1's `unrendered`, `added` and `removed` rows are not re-shot. They carry forward** into
     the verdict unchanged. They are never dropped because pass 2 did not see them.
   - **Why two passes:** a few targets render one of two layouts at random. With three shots each,
     such a target has a matching base × head pair and comes back `same`, while a real change
     differs on every pair. `unstable` means the target's own shots disagree and it also changed:
     read its diff by eye before calling it anything.
   - Pixel size is never the filter. A real 2 px radius regression moved 12 px, about as much as
     noise (script header).
   - **Exit codes:** `0` means nothing moved. `1` means something moved or did not render. `2` means
     the inputs or the flags are unusable, which makes the instrument `INCONCLUSIVE`, never `PASS`.

6. **Triage each changed component or page group** as intended, regression or noise:
   [`triage.md`](triage.md). Triage is read against the PR diff and the ticket's ACs. Read the diff
   PNG for every flagged target. Never sign off on a percentage alone.

7. **Record.**
   - One checklist row per triaged group, in the row format of [`triage.md`](triage.md) §3.
   - `summary.json.visual.pixel` gets: the source, the scope mode, the counts, the regressions with
     their diff paths, and `unrendered[]`.
   - A tracker comment that claims a visual regression carries the diff and the head shot **inline**
     ([`../../rules/reports.md`](../../rules/reports.md) §5.0).

8. **Clean up once the verdict is recorded.** Delete pass 1's `base/` and `head/` capture sets. Keep the
   diff PNGs, `visual-diff.json`, `flagged-ids.txt` and pass 2's sets, which hold every flagged target.
   - Pass 1 shoots every target in scope; a Storybook run is thousands of PNGs (VCST-6231: 2,834 shots,
     46 MB, against 56 diffs). The shots of `same` targets prove nothing a reader looks at.
   - None of it is committed in any case: images are gitignored repo-wide (`reports-policy.md` §1).

## Where it pays most

- **A shared component, a token or a theme** — the change moves components the ticket never names.
- **A "no visual change" PR** — a refactor, a dependency upgrade or a technical change. Every non-noise
  diff is a regression.
- **An upstream merge into a fork** (`/vc-frontend:merge-upstream`). The fork owns how it looks, so
  the fork before the merge against the fork after it must not move. Shoot the fork's own Storybook,
  or its pages, on both sides of the merge.
- **A release** — the release tag's build against the candidate.

## What the verdict may do

The blocking rule is [`../qa-test/visual-axis.md`](../qa-test/visual-axis.md) §3.

| Outcome | Effect |
|---|---|
| **regression** — an unintended change | An ordinary finding. It is triaged, severity-graded and filed like a `BL-UI` FAIL, and it can fail the ticket |
| **intended** — the change the PR declares | Advisory. The row names the AC or PR line that intends it |
| **noise** — cleared by the confirmation pass | Recorded with its id. It is never silently dropped |
| `unrendered` / `INCONCLUSIVE` | That target was not measured, and it is listed as such. Never fold it into a PASS |

## Limits — report as gaps, never as passes

- **A story renders its own fixtures, and a page renders the recorded data.** A defect that only shows
  on other data (long values, a locale, many currencies) is `PROBE` territory.
- **A HAR freezes the API answers, not the build's server-side rendering.** A route rendered on the
  server shows whatever that server read.
- **A replay answers only the requests it recorded.** A call with no recorded answer is aborted and
  the target comes back `unrendered`, with the missed calls in its note. Two causes:
  - a request body that changes per load, such as a client id or a timestamp in GraphQL variables;
  - a head that changes the query itself, for example a PR that adds a field. Such a page cannot be
    compared on frozen data. Use another instrument for it.
- **Interaction states** (hover, focus-visible, an opened dialog) are shot only when a story or a
  page target renders them. A state no target shows is a gap to list, not a pass.
