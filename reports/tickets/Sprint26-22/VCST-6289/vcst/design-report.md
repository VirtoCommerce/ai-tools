# Design report — VCST-6289 · VcWidget soft plate (visual lane 4v)

Lane: playwright-edge (Edge) · SB = hosted QA Storybook (PR build, soft + classic) · PIXEL = Storybooks built from source on this machine (head b47e1167 = PR #2620, base worktree 37cdaf67; chromium 156.0.8078.4) · account: none · 2026-11-06
Oracle: soft values are the PR's tokens ({PR}); no Prototype link on ticket/epic/PR, so **vs. DESIGN = SKIPPED** (never a pass). A soft match means "as implemented, not design-verified". Precedence: BL-UI invariant > design spec > UX heuristic. Accessibility findings are filed separately and do not block (triage.md §7a).
Measurement: read-only `getComputedStyle` / `getBoundingClientRect` / axe snippets; interaction by real clicks, Tab/Enter/Space, `emulate_media`. Each cell polled until `html[data-design]`, `data-preset` and (dark) the page background resolved before any value was read.

## Verdicts per row

| Row | Verdict | Measured (Edge) |
|---|---|---|
| C-01 journey | PASS | In-session toolbar toggle Classic -> Soft -> Classic on PrependIcon: soft = border 0, radius 28, 2 shadow layers, Geologica 600 / none, circle disc; back to classic = 1px, 8px, shadow-md 2 layers, Lato 700 uppercase, polygon, and `--vc-widget-*` / `--vc-shape-mask-image` unset on html (no stale token). Collapsible, Seamless, skeleton With Widget measured in both designs |
| C-03 PIXEL classic | PASS_WITH_NOTES | 0 regressions. See §PIXEL: 80 changed targets, all explained by the PR; 352 unrendered on both builds (gap) |
| C-03n control | PASS | Head classic vs head soft (red, light+dark, 1280+375): 1691 changed of 3052 — VcWidget 80/80 stories, VcShape 20, VcWidgetSkeleton 40, VcCompositeShape 0 and VcShape Mask unchanged (matches the measured polygon / explicit mask). Harness not blind |
| C-04 skeleton deltas | PASS_WITH_NOTES (DRIFT recorded) | Classic md `foot` story, base vs head: root `div.vc-widget-skeleton` -> `section.vc-widget.vc-widget-skeleton`; radius 4 -> 8; border 245 -> 229 (neutral-100 -> 200); footer divider 212 -> 229 (neutral-300 -> 200); footer container 49 -> 53 px (bar 16 -> 20). Also seen, not in the declared list: header-slot story header 56 -> 50 px (body moves up 6 px) = the skeleton now takes the widget's header min-height, the AC-3 intent. AC-1 says "exactly as before": ticket owner to accept |
| C-05 | PASS | 1023 px: radius 22, inset 24; 1024 px: radius 28, inset 32; border 0; shadow `0 1px 2px /.05` + `0 6px 20px /.06`. 24 and 32 are scale steps (BL-UI-002) |
| C-06 | PASS | xs 16/16 (inset 16, title 14), sm 16/16 (inset 16, title 16), collapsed 16 (inset 32), header-only 16, footer-only 16, **header+footer-only 28**, no-shadow: 1px border (rgb 229), radius 28 |
| C-07 | PASS | Real click: radius 28 -> 16 -> 28; header rect 16,16,1248,50 unchanged; title 48,31 unchanged (0 px, BL-UI-003) |
| C-08 | PASS_WITH_NOTES | Soft Geologica 600 none -0.02em at xs 14 / sm 16 / md 18 / **lg 16** (own title only). Classic Lato 700 uppercase 18 unchanged. lg < md: designer question, not a defect |
| C-09 | PASS | header-, default-, footer-container-slot stories: painted children report 28 at the plate's corners (TL/TR, BL/BR as the story paints). Plate is `overflow: visible`, so corner-following depends on the consumer (PR follow-up list) |
| C-10 | PASS_WITH_NOTES | PrependIcon / VcShape Basic -> circle; VcShape Mask keeps its mask; VcCompositeShape keeps the 479-char polygon (same in classic); classic keeps polygon. **Every unmasked VcShape becomes a disc, ticket says "a block opts in; the others keep the plain icon"**: AMBIGUOUS, owner question, not filed |
| C-11 | PASS | Disc 28/32/36/40 for xs..lg, square; centre y equals title centre y at all four sizes (0 px). lg 40 vs design 36 is the PR's known gap |
| C-12 | PASS_WITH_NOTES | Seamless, classic + soft, 1280 and 375: border 0, bg transparent, radius 0, no shadow, no dividers, inline padding 0; nested rows x = parent title x (45 / 48 / 33 / 40). Not exercisable: "<md stays inside container padding" needs a `.vc-container` ancestor, which the story lacks (CSS rule present in source) |
| C-14 skeleton parity | PASS | WithWidget xs/sm/md/lg x classic/soft x red light/dark (4 cells, 12 widgets each): skeleton vs loaded widget (with and without icon) equal to 0 px in radius, border width, header padding-x, header min-height and height, slot and footer container height, total height. Skeleton carries 0 title / icon / shape / button nodes |
| C-15 | PASS | Soft dark: title 18.64 (red) / 17.53 (coffee); disc glyph on disc 3.86 (red) / 3.43 (coffee), both >= 3 |
| C-16 AC-5 matrix | PASS_WITH_NOTES | Soft: Collapsible, PrependIcon, Seamless x red/coffee x light/dark = 12 cells: no empty `--vc-widget-*` or mask token, bw 0, radius 28, 2 shadow layers, 600/none, circle where an icon exists, seamless children plateless. Classic cells measured: PrependIcon red light + coffee dark, Seamless red light/dark + coffee light (1px, 8, Lato 700 uppercase, polygon, no soft token). The other classic cells (Collapsible x4, PrependIcon red dark / coffee light, Seamless coffee dark) are covered by PIXEL equality only |
| C-17 control | PASS (informational) | Soft on mercury measured, not skipped: light title 19.8, glyph 4.05; dark title 18.7, glyph 4.9; plate = page (1.0) |
| C-18 paprika | PASS_WITH_NOTES | Light plate rgb(255,253,249) = `color-mix(additional-50 75%, warning-50 #fff8e5)` = 255,253,248.5; **Firefox lane recorded 248, Edge rounds to 249** (rounding of .5, not a defect). Dark plate = additional-50 rgb(41,32,27) (= page), divider neutral-300 rgb(60,50,44), 1.28 vs plate. Load-scope half WAIVED (W7) |
| C-19 forced-colors | PASS | Soft plate 1px solid rgb(0,0,0) on white; seamless widgets and `:border=false` 0 / `none`, edgeless as {PR} |
| C-20 keyboard | PASS | Soft and classic: first Tab lands on the header button, `:focus-visible` true, 2px solid rgb(59,130,246) offset 2 (3.68:1 on white), ring box inside the viewport, no clipping ancestor; Enter collapses (soft radius 28 -> 16), Space expands |
| C-21 aria-expanded | **FAIL** (pre-existing, a11y, non-blocking) | `button.vc-widget__header-container`: `aria-expanded` and `aria-controls` null expanded and collapsed (QA soft + classic); also null on the **base build from source (37cdaf67)**. BL-A11Y-004 / WCAG 4.1.2. Accessibility snapshot shows plain `button "Widget title"` |
| C-22 dark plate edge | **FAIL** (advisory, design/a11y, non-blocking) | Red, coffee, mercury, paprika: plate bg == page bg (ratio 1.00), border 0; the only edge is the 5 % / 6 % light shadow, about 1.1:1 at the edge and <= 1.28:1 even if both layers were fully opaque. Not a 1.4.11 control boundary, so the oracle is a design question (PR: soft dark = classic dark colours). Screenshot 4v-sb-soft-paprika-dark-plate-edge-1280.png |
| C-23 pill | KNOWN_DIVERGENCE | Basic (body-only) md plate at 1024: 56 px high, radius 28 (= 2r); no-shadow 58 px. PR's declared gap, recorded, not filed. Screenshot 4v-sb-soft-red-light-no-shadow-body-only-pill-1280.png |
| C-31 SB half | INCONCLUSIVE | Print emulation on soft PrependIcon: border 0, 2 shadow layers, disc kept; classic under the same emulation keeps its 1px border, 2 shadow layers and polygon. The app's `@layer vc.print` sheet is not in the Storybook bundle, so neither design shows a print rule here. App half is 4a |

## BL-UI invariants (Storybook, soft + classic)

| Invariant | Result |
|---|---|
| BL-UI-001 CLS | WithWidget soft red light: CLS 0.0054 (one shift) <= 0.1 PASS |
| BL-UI-002 spacing | Insets 16 / 24 / 28 / 32, slot padding 16 / 20, header padding-y 4: scale steps. PASS |
| BL-UI-003 no state shift | Skeleton == widget frame (C-14) and collapse/expand (C-07): 0 px. PASS |
| BL-UI-004 boundary | `documentElement.scrollWidth == innerWidth` at 375, 1023, 1024, 1280. PASS. Plate is `overflow: visible`: observation, not a defect |
| BL-UI-005 alignment | Disc centre == title centre at xs..lg (0 px). PASS |
| BL-UI-006 touch | Collapsible header is full width and 38-70 px high (>= 24). PASS |

## Design-system consistency (live tokens, never transcribed)

- Soft html tokens resolve in all 12+ measured cells (none empty): radius 1.375rem / 1.75rem, border 0, two-layer shadow, padding 1.5rem / 2rem, title 600 / none / -0.02em, mask = circle SVG. Classic: all unset (no leak).
- Sized control (disc): rendered 28/32/36/40 equals `--shape-size` per size; width == height; no oval.
- Forks/other presets: ungated presets are informational (VC-UI-001); measured and recorded, not graded.

## Accessibility (axe 4.12, wcag2a/2aa/21a/21aa/22aa)

0 violations on soft red dark PrependIcon, soft coffee dark Collapsible, soft red light WithWidget. `incomplete`: `aria-prohibited-attr` (the content `div[aria-labelledby]` slot, 1 per widget; present in the base markup) and page-level `bypass`. Findings: C-21 (pre-existing), C-22 (advisory). Skeleton root has no `aria-busy`/status (observation).

## PIXEL — classic, base 37cdaf67 vs head b47e1167

Scope ALL (global surface: `.storybook/preview.ts`, presets, tokens). Sets: classic x red/coffee x light/dark, 1280x800 + 375x812. Commands, diffs and `visual-diff.json`: `visual/pass1/diff`, `visual/pass2/diff`, `visual/control/diff`.

| Pass | Compared | same | changed | unstable | size-changed | added | unrendered |
|---|---|---|---|---|---|---|---|
| 1 (one shot) | 6104 | 5656 | 80 | 0 | 0 | 16 | 352 |
| 2 (`--repeat 3`, 14 flagged ids x 8 sets) | 112 | 32 | 80 | 0 | 0 | 0 | 0 |

Pass 2 kept all 80 changed (none cleared, so none is noise). The 32 `same` are the sets of those 14 ids that pass 1 had already found unchanged (the dark-only stories in light mode); the grep file selects by id across all 8 sets.

| Group | Targets | Outcome | Why |
|---|---|---|---|
| VcWidgetSkeleton (foot, header-slot, basic, head, default-slot, footer-slot, 3 container-slot stories) | 44 | intended | T-03 classic deltas: radius 4 -> 8, border/divider colour, footer bar +4, header = widget header (measured, C-04). Several stories change only in dark because the 0.1 colour threshold hides the light-mode colour step |
| VcExpansionPanel (2 stories), VcExpansionPanels (2 stories) | 32 | intended | The PR edits the stories' paragraph insets (`px-4 pt-4 pb-5 sm:px-6`); the components get only a dev-only warning and a `deprecated` tag. Diff PNG = text moved by the new padding |
| VcWidget `default-container-slot` | 4 (dark only) | intended | The PR adds `rounded-t-[...]` to the story's child (4 corner pixels at y=17). Base child radius 0, head 8; plate unchanged |
| VcWidget `seamless`, VcWidgetSkeleton `with-widget` | 16 | added | New stories, no base |
| 44 story ids x 8 sets (VcDatePicker, VcDateRangePicker, VcDateRangeInput, ReportingPanel no-data, VcIcon all-icons, VcInputDetails single-line, VcPagination one-page, VcQuantityStepper errored) | 352 | **unrendered** | `waitForSelector` timeout on **both** builds; re-shot alone on an idle machine, 43 of 44 failed again. Not measured: a gap, never a pass. Not a PR finding (identical on base) |

**Regressions: 0.** Every classic story that renders VcWidget, VcShape, VcCompositeShape, VcStatWidget or the stories' other consumers is `same`, except the groups above. Limits: the diff colour threshold (0.1) hides sub-threshold colour steps in light mode; interaction states (hover, open overlays) are only what the stories render.

## Screenshots (FAIL / documentation only, `screenshots/4v-*`)

4v-sb-soft-paprika-dark-plate-edge-1280 (C-22) · 4v-sb-soft-red-light-no-shadow-body-only-pill-1280 (C-23) · 4v-sb-soft-red-light-collapsible-focus-1280 (C-20) · 4v-sb-soft-red-light-seamless-375 (C-12) · 4v-sb-soft-red-light-skeleton-with-widget-1280 (C-14). Visual review: no clipping, overlap or stray artefact beyond the findings above.

## Lane disagreements with 3x (Firefox)

Agree: header+footer-only 28, collapsed 16 + inset 32, title sizes 14/16/18/16, disc 28/32/36/40 and 0 px centre, forced-colors 1px / 0, glyph 3.86 / 3.43 (3x ~3.9 / ~3.4), aria-expanded missing. Differ: paprika plate 249 (Edge) vs 248 (Firefox), same source value 248.5.

## Not covered (stated)

Soft in the app (operator waiver), fork override reach (G1), nested plated widget (W10), paprika sheet load scope (W7), print layer in the app (4a), `<md` seamless inside `.vc-container`, 44 unrendered stories, classic cells listed under C-16. Hosted DEV Storybook not used.
