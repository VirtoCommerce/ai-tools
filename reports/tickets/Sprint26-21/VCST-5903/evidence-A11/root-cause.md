# Root cause: VCST-5903 A11, VcStatWidget figure paints past the card border

**Status:** REPRODUCED at a supported viewport: 1024px, Colors and DeltaColors stories. 3 of 3 attempts.
**Confidence:** HIGH. **Owning layer:** UI-kit component CSS. **Repo:** `vc-frontend` (repoKind `frontend`).

## Symptom
At 1024px the Colors grid is 4 columns with 236px cards, so each card has a 196px budget before the border. The figure `$123,456,789.00` is 229px of 30px bold Lato on one line, and it paints **13.1px past the right border** of every card, into the 16px grid gap. No document scroll appears at 1024: the rightmost card's ink ends at 1021 of 1024. That is the case only because the overflow is still smaller than the 16px body padding. A figure about 3px wider at that slot, or a 10-digit figure, crosses into the neighbouring card or scrolls the document (evidence-index rows 2, 5, 6). The same overflow happens at 480 (2 columns) with an 8-digit `$12,345,678.90`: +15.7px, ending 0.3px short of the next card.

Rule violated: **BL-UI-004** {BL}: "stay inside their container at every supported viewport … wrap, truncate with ellipsis, or scroll — never overflow silently". The PR #2568 claim "Figures never wrap mid-number" {SPEC} holds. The figure does stay on one line. It has no fallback once it no longer fits.

## Mechanism (cited source, `vc-stat-widget.vue` @ 3f8af63a)
- **L137–145** `&__value { @apply text-3xl font-bold leading-tight … }`: no `min-w-0`, no `overflow-wrap`, no `truncate`/`overflow`, no size clamp. The computed style confirms `white-space: normal; overflow-wrap: normal; overflow: visible`. A digit-group string has no break opportunity, so its min-content width is the whole figure.
- **L109** root `flex flex-col … p-4` with `overflow: visible`. A flex-column child is stretched to the card's content width but does not grow past it. Its text overflows visibly instead.
- **L28–32**: the value text and the suffix sit in the same block, so only the suffix can wrap (KB-527B0F06).
- The card can only widen in a parent whose item sizing follows min-content. That is the Row story's flex `grow basis-44` (KB-527B0F06). A CSS-grid track `1fr` also has a min-content floor, but in the story `grid-cols-4` resolves to `repeat(4, minmax(0, 1fr))` in Tailwind, so the track is allowed to be narrower than the figure. That is why the grid cards stay at 236px while the figure overflows.

## Alternatives ruled out
| Alternative | Ruled out by |
|---|---|
| By design (figure must never wrap) | The spec forbids a mid-number **wrap**, not a fallback. BL-UI-004 requires wrap, ellipsis or scroll, and the component offers none of the three. No doc exists for this NEW component (Context7: VcStatWidget absent), so nothing declares overflow acceptable |
| Story/test-harness artefact | The story only supplies a standard 4-column grid, which is a plausible consumer layout (dashboard KPI row). The overflow is the component's own rule set reacting to a 236px slot. The 375 Basic and 1280/768 Colors controls show the same CSS fitting when the slot is wide enough |
| Unrealistic data | A 9-digit currency figure ($123M) is an ordinary B2B yearly-revenue or spend total. The prop doc already shows `$12,480.00`-style pre-formatted strings, and longer locale formats (e.g. `123.456.789,00 €`) are as wide or wider |
| Data drift / env / flaky | No server data is involved (Storybook args only). Deterministic: identical 229.1px ink and +13.1px on all 8 cards across 2 runs plus a 3rd story |
| Browser-specific | Measured on Edge/Chromium. The earlier Firefox run (KB-2C889DD2) found the same no-shrink behaviour. Inference: font metrics move the threshold by a few px, not the mechanism |

## Fix routing
- **Repo:** `VirtoCommerce/vc-frontend`. **File:** `client-app/ui-kit/components/organisms/stat-widget/vc-stat-widget.vue`, the `&__value` rule at L137–145 (the anchor is L140).
- **Shape (for the dev, not prescriptive):** pick one of three. (a) Add `min-w-0` plus `truncate` with a `title` holding the full figure. (b) Use fluid sizing (`text-[clamp(…)]` or a container-query font step-down). (c) Allow a break only before the decimal or suffix. Any of them must keep "no mid-number wrap" true.
- **Severity (per /qa-defect):** **Low / P3**, confirmed and not raised. It is a visual defect in a UI-kit organism with no storefront consumer yet. It needs a ≥9-digit figure at 1024–1075 (4 columns) or ≥8 digits at 480–511 (2 columns), and the text stays legible in the gap. Escalate to **Medium** if a consumer page places it in a 4-column grid with yearly totals, because overlap of the neighbour card or document scroll is then one more digit away.
