# Visual Regression Testing — moved to `/qa-visual-regression`

> Reference file for ui-ux-expert agent. Read when someone asks for "visual regression" on Storybook.

Pixel regression of the UI kit is the `PIXEL` instrument, owned by
[`../qa-visual-regression/SKILL.md`](../qa-visual-regression/SKILL.md). It is a script pipeline
(`visual:affected` → `visual:snap` base + head → `visual:diff`) followed by a triage step.
It does not hand an agent screenshots to compare.

What this file used to prescribe — an agent capturing "baselines" through an MCP browser and
comparing them by eye — is retired, for three reasons:

- **No comparator.** "Compare new vs baseline" had no tool behind it. A 2 px padding change is not
  visible by eye on a full-page shot, and the 2026-10-23 spike moved 59 stories with two such
  edits.
- **No determinism.** An MCP screenshot runs at the browser's own DPR, fonts and animation state.
  Two captures of the same build differ, so every diff is suspect.
- **Wrong baseline.** A baseline captured "on demand" in an earlier session is a build of unknown
  commit on another machine. `/qa-visual-regression` shoots the base build and the head build in
  one run instead.

Which visual instrument a risk takes (`PIXEL` / `DESIGN` / `PROBE` / `CONTENT`):
[`visual-axis.md`](../../../plugins/vc-test/skills/qa-design/visual-axis.md) §2a. Chromatic and the other hosted
services are still an option for vc-frontend's own CI ([`tooling-stack.md`](tooling-stack.md)
§Decision). That is a frontend-team decision and Phase 6 of the plan, not something this repo runs.
