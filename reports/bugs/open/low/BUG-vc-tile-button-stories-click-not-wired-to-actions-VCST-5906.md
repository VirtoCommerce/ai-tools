# BUG: VcTileButton stories do not wire `click` to the Actions panel

- **Severity:** Low (below the 5-file floor — not filed) · **Provenance:** IN-SCOPE (VCST-5906, vc-frontend PR #2575 @ `2024d7ad`, `vc-tile-button.stories.ts`)
- **Found:** 2026-10-16, `/qa-test` 4a (qa-frontend-expert, playwright-chrome) · **Env:** vcptcore-qa1 Storybook image `2.61.0-alpha.2589-vcst-5906-vc-tile-button-2024d7ad`

## Steps
1. Open `{STORYBOOK_URL}/?path=/story/components-molecules-vctilebutton--basic`, open the **Actions** tab.
2. Click the tile (or Tab to it and press Enter / Space).
3. Control: do the same on VcButton → Basic.

## Expected
Each click is logged (`VcTileButton click: PointerEvent`), as VcButton's story logs `VcButton click`. A disabled tile logs nothing.

## Actual
Nothing is logged for the enabled tile, so the component's `click` contract — and "no click while disabled" — cannot be demonstrated in Storybook. VcButton's story declares `argTypes.onClick: { action: "VcButton click" }` and binds `@click="args.onClick"`; the VcTileButton stories declare neither.

## Also (trivial, same file)
- `target` has no `argTypes` entry, so Controls shows a raw object editor instead of a `_self` / `_blank` radio.
- `Basic`'s template hardcodes `Send email`, so the default-slot control has no effect.

## Fix
Add `onClick: { action: "VcTileButton click" }` to `argTypes` and `@click="args.onClick"` to the templates; add `target: { control: "radio", options: ["_self", "_blank"] }`.

## Evidence
`reports/tickets/Sprint26-20/VCST-5906/screenshots/fe-09-actions-after-mouse-click.png`, `fe-09-control-vcbutton-actions.png`
