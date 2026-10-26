# Component acceptance — a component under review against its reference

**Read when a `DESIGN` risk** ([`../qa-test/visual-axis.md`](../qa-test/visual-axis.md) §2a) compares a rendered
component with its reference: prod, QA or a fork's preview against Storybook, or a new component against the
design system. The engine is `npm run visual:design` (`plugins/vc-frontend/visual/design.mjs`; its header documents
the spec file, the output and the exit codes). It complements
[`claude-design-verification.md`](claude-design-verification.md), which diffs the *declared* tokens, geometry and
icons of a design project. This file diffs what the browser *rendered*.

The criteria, the tolerances and the source model come from the `design-review` skill's acceptance catalog v1.0
(Virto Design System). The tolerances live in **one place**, `design.mjs` `THRESHOLDS`, and are not restated here.

## 1. Which reference is right

| The component under review is… | Its reference | A difference means |
|---|---|---|
| an existing component (it has a story) | **Storybook**: the same code base as prod | an implementation or theme defect on the reviewed side |
| new (no story yet), or a whole screen's composition | **the design system** (Claude Design) | drift from the design. A difference the design system records as a deliberate innovation is `KNOWN_DIVERGENCE` ([`claude-design-verification.md`](claude-design-verification.md)) |
| a customer theme or a fork | Storybook, on the **same preset** if the fork ships one | a colour that the same token names on both sides is `theme`, not a defect (§3) |

Storybook and prod share component code. So prod-vs-Storybook catches a theme, an override or a composition
defect, **never a regression of the component itself**. A component regression is `PIXEL`'s job: base build vs
head build.

## 2. What `visual:design` judges, and what it leaves to its owner

| AC | Judged by `visual:design` | Owner when not |
|---|---|---|
| AC-CMP anatomy | visible descendants per tag; an instance not found | a home-made duplicate of a library component — a human call |
| AC-LAY, AC-SPC | box size; padding and gap | — |
| AC-TYP | family and weight exact; size, line-height, letter-spacing within tolerance; transform, decoration | — |
| AC-CLR, AC-BRD | colour by CIEDE2000; opacity; border width, colour, radius | — |
| AC-ELV | box-shadow layers and offsets | — |
| AC-PIX | the element's own pixels, at DPR 2 | never across two presets |
| AC-THM | the theme tokens that differ between the two pages, listed for confirmation | — |
| AC-STA | one spec entry per state (`hover` / `focus` on a target, or the state's story) | — |
| AC-A11Y | — | `qa-accessibility`, `measure-layout.ts` contrast (our thresholds, BL-A11Y) |
| AC-RSP, AC-CNT | — | `layout-runner` `[PROBE:OVERFLOW]` / `[PROBE:TOUCH]` / `[PROBE:CONTENT]` and its stress data |
| AC-TOK | — | `tokens:check`, [`design-system-consistency.md`](design-system-consistency.md) |

**Thresholds the catalog states differently from ours: ours win.** Touch targets are BL-UI-006 / WCAG 2.5.8 —
24 px AA, 44 px AAA, `measure-layout.ts`. The catalog's "44 px at 390" is a design-system guideline, judged against
the design project only. The spacing grid is the generated token scale (`tokens:sync`), not a fixed 4/8.

## 3. Theme normalisation

Both pages' theme tokens (`--color-*`, `--vc-radius`, `--font*`) are read. A colour difference whose reference
value **and** tested value resolve to the **same token name** on their own pages is `theme`: the component is right,
the preset differs. The tokens that differ go to the report's *Theme baseline*. Confirm with the user that the
preset is intended — `visual:design` cannot know. A colour that resolves to **different** tokens on the two sides
is a defect, because the component uses the wrong token.

## 4. What a finding may do

The catalog's verdict — FAIL / PASS WITH ISSUES / PASS — is the report's. **What it does to the ticket** is
[`../qa-test/visual-axis.md`](../qa-test/visual-axis.md) §3, unchanged:

- A P2 or P3 is `vs. DESIGN` DRIFT: it goes to `visual.advisory[]` and is not blocking.
- A clipped, overlapping or hidden element (the catalog's P1) is a `BL-UI` invariant FAIL. It blocks through
  `layout-runner`, not through this report.
- `theme` is never a defect. It goes to the Theme baseline for confirmation.

A `ui-kit` ticket ([`../qa-test/ui-kit-class.md`](../qa-test/ui-kit-class.md)) is the exception the carrier matrix
already makes: there the rendered surface is the deliverable, so its own component's P2 is triaged as a finding.
