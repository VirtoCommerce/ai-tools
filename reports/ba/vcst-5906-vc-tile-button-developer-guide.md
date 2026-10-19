## Documentation — VCST-5906

Theme developers can now build a quick-action grid from one UI-kit component, `VcTileButton`: a tile with an icon above a short label that acts as a button, an in-app link or an external link.

### For developers

`VcTileButton` lives in the UI kit's molecules (`@/ui-kit/components`). It is not exported from the `@vc-frontend/core` facade.

```vue
<div class="grid auto-rows-fr grid-cols-2 gap-3">
  <VcTileButton icon="shopping-bag" @click="startOrder">Order on behalf</VcTileButton>
  <VcTileButton icon="mail" variant="outline" :to="{ name: 'Quotes' }">Quotes</VcTileButton>
  <VcTileButton icon="external-link" variant="outline" external-link="https://example.com" target="_blank">Help</VcTileButton>
  <VcTileButton icon="calendar" variant="outline" disabled>Schedule call</VcTileButton>
</div>
```

| Prop / slot / event | What it does |
|---|---|
| `icon` | Name of the icon shown above the label. The `#icon` slot replaces it, for example to add a badge. |
| `variant` | `solid` (default): the tile is filled with `color`. `outline`: neutral surface and text, and only the icon takes `color`. |
| `color` | One of the eight main colours. The default is `primary`. Solid tiles use the same palette keys as a solid `VcButton`, so the two match. |
| `to` | Renders a router link. |
| `externalLink` | Renders a plain link. `target="_blank"` adds `rel="noopener noreferrer"`. |
| `disabled` | Always renders a disabled button, even when `to` or `externalLink` is set. The tile is faded, skipped by Tab, and emits no `click`. |
| `@click` | Emitted with the `MouseEvent`. It is not emitted while the tile is disabled. |
| `title`, `aria-label` | Passed through to the control as plain attributes. |

- **Sizing:** the tile is at least `--vc-tile-button-min-height` tall (6rem) and grows with a long label. Add `auto-rows-fr` to the grid to keep its rows equal.
- **Theming:** `--vc-tile-button-radius` falls back to `--vc-radius`, and `--vc-tile-button-icon-size` is 1.5rem. Per variant and colour, override `--vc-tile-button-{solid|outline}-{color}-{bg|border|text|icon}`.
- **Dark mode:** solid tiles use the same dark shades as `VcButton`. Keep the two in sync.
- **Focus:** the focus ring comes from the theme's global focus style. The component has no focus style of its own.
- **Accessibility:** the label is the accessible name. On a light surface, `outline` + `warning` gives a low-contrast icon (2.09:1), so pair it with a clear label.

---
*VCST-5906 · verified on vcptcore-qa1 (Storybook + storefront) · verdict: PASS WITH NOTES ·
Not documented: shopper and administrator guides — no storefront page or Admin blade uses the component yet (the Quick actions widget migrates in a follow-up); live `click` emission — the stories do not wire it to Actions ·
Evidence: `reports/tickets/Sprint26-20/VCST-5906/` · Audiences derived from layer `storefront` (ui-kit: developer surface only)*
