# Root-cause worksheet — X27

## Symptom
A word longer than the free line width in `errorText`, `description` or `delta` stays on one line. It paints
past the card's right border: +82px for errorText, +11px for description, +78px for delta, with a 41-char token
in a 256px card. The same token in `label` wraps inside the card in the same render. Both viewports.

## Lowest failing layer — PROVEN
UI kit CSS in `vc-frontend`, `client-app/ui-kit/components/organisms/stat-widget/vc-stat-widget.vue`.
No network or server is involved: the props are plain strings typed into Storybook Controls.

## Source (at `bfe0b259`)
- `vc-stat-widget.vue:131`: `&__label` has `min-w-0 … [overflow-wrap:break-word]`. Label wrapping is deliberate, which makes it the in-component control.
- `vc-stat-widget.vue:17-23` with `:156-158`: `&__error` is `flex items-start gap-1.5`. The message `<span>` (line 22) is a flex item with default `min-width:auto` and no `overflow-wrap`. Its min-content width is the whole token, so it cannot shrink below the token and overflows.
- `vc-stat-widget.vue:34` with `:152-154`: `&__description` is a block with only `text-xs text-neutral-600`. With `overflow-wrap: normal` the token is unbreakable. Smallest overflow, because the font is 12px.
- `vc-stat-widget.vue:36-42` with `:160-163`: `&__delta` has the same flex + span shape as `__error`. Same mechanism.
- `vc-stat-widget.vue:110`: the card root sets no `overflow` and no `min-w-0`. The ink is not clipped. It paints outside the border.

**Fix shape (for the developer, not prescriptive):** give the three prose holders the same treatment as the
label: `[overflow-wrap:anywhere]` (or `break-word` plus `min-w-0` on the flex-item spans at lines 22 and 41) on
`__error`/`__description`/`__delta`. `anywhere` also lowers the flex item's min-content, so it fixes the flex
cases without a separate `min-w-0`. Leave `__value` alone (VCST-6428: figures must not wrap, by design).

## Alternatives ruled out
1. **Story wrapper, not kit.** The stories render the card in `<div class="max-w-64">`
   (`vc-stat-widget.stories.ts:38`). The wrapper only caps the width, as any real container does. In the same
   wrapper and render the label wraps and errorText does not, so the difference is the per-element kit CSS, not
   the wrapper.
2. **By design (VCST-6428 "figures must not wrap").** That decision covers the figure (`__value`). The props here
   are prose. The kit's own docs call errorText a "Load failure message", description a "Secondary line" and
   delta a "Comparison line". Its sibling prose element, label, is made to wrap explicitly. Nothing in the
   component marks errorText, description or delta as no-wrap.
3. **Data drift or environment.** No data. Deterministic: identical px values across 3 renders and both
   viewports. The 503s at 12:15 came before repro and did not affect it.
4. **Synthetic-only input.** A realistic URL in errorText overflows by +41px. A message with an order number
   (`CO261020-00042`) and a 26-char German compound fit, so the trigger is a token of about 28 or more
   bold-14px characters in a 256px card (less in a narrower Row/grid cell). URLs, emails and opaque ids reach
   that. Ordinary localized prose does not.

## Oracle
`BL-UI-004 Content boundary` (`.claude/knowledge/oracles/bl/ui.yaml`): long content must wrap, truncate or
scroll and must never overflow silently. Violated for three props. Provenance: `{BL}` plus `{OBSERVED}`. A NEW
component with no VirtoOZ page yet, so ground truth is the PR source and the live build.

## Reach
`VcStatWidget` has no storefront consumer at `bfe0b259`. `modules/sales-rep/components/stat-widget.vue` is a
separate, older component. Today the defect shows only in the UI kit and Storybook. Any future consumer that
passes a server message or URL into errorText inherits it.

## Confidence
**HIGH.** Repo `VirtoCommerce/vc-frontend`, repoKind frontend, single file.
