# Component acceptance — a component under review against its reference

**Read when a `DESIGN` risk** ([`visual-axis.md`](visual-axis.md) §2a) compares a rendered
component with its reference: prod, QA or a fork's preview against Storybook, or a new component against the
design system. The engine is `node <vc-frontend>/visual/design.mjs` — `<vc-frontend>` is the vc-frontend plugin's root,
which vc-test's `lib/capabilities.mjs` `pixelProbe` finds beside this plugin (in this repository: `npm run visual:design`, `plugins/vc-frontend/visual/design.mjs`); its header documents
the spec file, the output and the exit codes. The engine is optional: **with no vc-frontend plugin, this check is
`SKIPPED — no vc-frontend`**, never a PASS. It complements
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

**Both sides must show the same content.** The engine compares what is rendered, so a different label, or an
icon-only twin of a text button, comes out as a width, an anatomy and a pixel difference that says nothing about
the design. Point each target at the instance with the story's text and variant. A selector that matches several
visible elements is compared on the first and reported as `info` with the count; `nth` picks another.

## 2. What `visual:design` judges, and what it leaves to its owner

| AC | Judged by `visual:design` | Owner when not |
|---|---|---|
| AC-CMP anatomy | visible descendants per tag; an instance not found | a home-made duplicate of a library component — a human call |
| AC-LAY, AC-SPC | box size; padding and gap | — |
| AC-TYP | family and weight exact; size, line-height, letter-spacing within tolerance; transform, decoration | — |
| AC-CLR, AC-BRD | colour by CIEDE2000 as shown (transparency counts); opacity; border width, colour, radius | — |
| AC-ELV | box-shadow layers and offsets | — |
| AC-PIX | the element's own pixels, at DPR 2 | never across two presets (a token both pages define differs) |
| AC-THM | the theme tokens that differ between the two pages, listed for confirmation | — |
| AC-STA | one spec entry per state (`hover` / `focus` on a target, or the state's story) | — |
| AC-A11Y | — | the a11y axis ([`wcag-accessibility-checklist.md`](../../knowledge/wcag-accessibility-checklist.md); in this repository: `qa-accessibility`), `measure-layout.ts` contrast (our thresholds, BL-A11Y) |
| AC-RSP, AC-CNT | — | `layout-runner` (in this repository: `scripts/layout/layout-runner.ts`) `[PROBE:OVERFLOW]` / `[PROBE:TOUCH]` / `[PROBE:CONTENT]` and its stress data |
| AC-TOK | — | `tokens:check` (in this repository: `npm run tokens:check`), [`design-system-consistency.md`](design-system-consistency.md) |

**Thresholds the catalog states differently from ours: ours win.** Touch targets are BL-UI-006 / WCAG 2.5.8 —
24 px AA, 44 px AAA, `measure-layout.ts`. The catalog's "44 px at 390" is a design-system guideline, judged against
the design project only. The spacing grid is the generated token scale (`tokens:sync`), not a fixed 4/8.

## 3. Theme normalisation

Both pages' theme tokens (`--color-*`, `--vc-radius*`, `--font*`) are read. A colour, a font family or a corner
radius whose reference value **and** tested value resolve to the **same token name** on their own pages is `theme`:
the component is right, the preset differs. A box that is wider or taller only because the font is a theme font is
`theme` too. The tokens **both** pages define whose values differ (`.5rem` and `0.5rem` are one value; a token only
one page defines, such as a storefront-only `--color-header-*`, is not a preset difference) go to the report's
*Theme baseline*. Confirm with the user that the preset is intended — `visual:design` cannot know. A value that
resolves to **different** tokens on the two sides is a defect, because the component uses the wrong token.

## 4. What a finding may do

The catalog's verdict — FAIL / PASS WITH ISSUES / PASS — is the report's. **What it does to the ticket** is
[`visual-axis.md`](visual-axis.md) §3, unchanged:

- A P2 or P3 is `vs. DESIGN` DRIFT: it goes to `visual.advisory[]` and is not blocking.
- A clipped, overlapping or hidden element (the catalog's P1) is a `BL-UI` invariant FAIL. It blocks through
  `layout-runner`, not through this report.
- `theme` is never a defect. It goes to the Theme baseline for confirmation.
- `INCONCLUSIVE` (exit 2) is not a result: a page did not load, or one side matched nothing at all. Fix the spec or
  the stand and run again. Never report it as a pass or as advisory drift.

A `ui-kit` ticket ([`ui-kit-class.md`](../../knowledge/ui-kit-class.md)) is the exception the carrier matrix
already makes: there the rendered surface is the deliverable, so its own component's P2 is triaged as a finding.
