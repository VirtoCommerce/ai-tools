# VCST-4846 — Storybook Deprecation Markers — Testing Checklist

**PR:** https://github.com/VirtoCommerce/vc-frontend/pull/2231
**Artifact:** `vc-theme-b2b-vue-2.47.0-pr-2231-4703-47032789.zip` (deployed to vcst-qa)
**Storybook URL:** https://vcst-qa-storybook.govirto.com
**Ticket:** https://virtocommerce.atlassian.net/browse/VCST-4846

## Scope

This PR adds two Storybook-level deprecation signals plus a developer guide:
1. **Sidebar badge** "deprecated" — via `storybook-addon-tag-badges` addon + `tags: ["deprecated"]` on story meta
2. **Docs page banner** — orange warning banner reading `parameters.deprecated` message at top of Docs tab
3. **Dev-only `console.warn`** in deprecated component `<script setup>` (only fires in `import.meta.env.DEV` — NOT in prod build)
4. **JSDoc `@deprecated`** on index.ts exports + types.d.ts entries (IDE strikethrough)
5. **ESLint `vue/no-restricted-html-elements`** warning for deprecated tags in templates
6. **DEPRECATION.md** — process guide in `client-app/ui-kit/`

**3 components marked deprecated (all claimed "not used in application"):**
- `VcLineItemProperty` (atom) → use `VcProperty` or `VcProductProperties`
- `VcPriceDisplayCatalog` (atom) → use `VcPriceDisplay` or `VcProductPrice`
- `VcItemPriceCatalog` (molecule) → use `VcProductPrice`

**Non-scope:**
- Deprecated components are NOT removed — still compile and render
- No customer-facing storefront behavior change (production build does not emit warnings)

## Acceptance Criteria (inferred from PR title + description)

| AC | Description |
|----|-------------|
| AC1 | Storybook sidebar shows "deprecated" badge next to the 3 deprecated components |
| AC2 | Docs tab for each deprecated component renders an orange warning banner at the top with the component-specific migration message |
| AC3 | Docs tab for NON-deprecated components shows NO deprecation banner |
| AC4 | Sidebar badge is NOT shown for non-deprecated components |
| AC5 | Deprecated components still render in Canvas (stories execute, no runtime error) |
| AC6 | Standard Docs blocks (Title, Subtitle, Description, Primary, Controls, Stories) still render correctly under the banner |
| AC7 | a11y addon and other Storybook features still work (custom DocsPage doesn't break other panels) |

## Test Cases

### Sidebar badges (AC1, AC4)
- [ ] TC1.1 — Navigate Components → Atoms. Confirm **VcLineItemProperty** shows "deprecated" badge in sidebar
- [ ] TC1.2 — Navigate Components → Atoms. Confirm **VcPriceDisplayCatalog** shows "deprecated" badge in sidebar
- [ ] TC1.3 — Navigate Components → Molecules. Confirm **VcItemPriceCatalog** shows "deprecated" badge in sidebar
- [ ] TC1.4 — Confirm badge styling is visible (color/position) and readable
- [ ] TC1.5 — Spot-check 3 non-deprecated components (e.g. `VcInput`, `VcLabel`, `VcProductPrice`) — NO badge in sidebar

### Docs page banner (AC2, AC3, AC6)
- [ ] TC2.1 — Open **VcLineItemProperty** Docs tab → banner shows "⚠ Deprecated" + message "This component is not used in the application and will be removed. Use VcProperty or VcProductProperties instead."
- [ ] TC2.2 — Open **VcPriceDisplayCatalog** Docs tab → banner shows message "This component is not used in the application (only inside VcItemPriceCatalog which is also deprecated). Use VcPriceDisplay or VcProductPrice instead."
- [ ] TC2.3 — Open **VcItemPriceCatalog** Docs tab → banner shows message "This component is not used in the application. Use VcProductPrice instead."
- [ ] TC2.4 — Banner is orange/warning-colored (background `#FFCA7A`, text `#3D2500`)
- [ ] TC2.5 — Banner appears BETWEEN Title and Subtitle (per docs-page.ts order)
- [ ] TC2.6 — Standard blocks render below banner in order: Title → Banner → Subtitle → Description → Primary → Controls → Stories
- [ ] TC2.7 — Open 3+ non-deprecated components' Docs tabs (e.g. `VcInput`, `VcLabel`, `VcProductPrice`) — NO banner present

### Canvas rendering (AC5)
- [ ] TC3.1 — `VcLineItemProperty` default story renders in Canvas tab without error
- [ ] TC3.2 — `VcPriceDisplayCatalog` default story renders in Canvas tab without error
- [ ] TC3.3 — `VcItemPriceCatalog` default story renders in Canvas tab without error
- [ ] TC3.4 — Controls panel works for all 3 deprecated components (can change props and re-render)

### Console warnings (dev-only behavior)
- [ ] TC4.1 — Open browser console on Storybook. Navigate to `VcLineItemProperty` Canvas → verify `[VcLineItemProperty] This component is deprecated...` warning (Storybook runs in dev mode, so warn is expected)
- [ ] TC4.2 — Same for `VcPriceDisplayCatalog` and `VcItemPriceCatalog`
- [ ] TC4.3 — Non-deprecated components produce NO such console.warn

### Other Storybook features (AC7)
- [ ] TC5.1 — Accessibility (a11y) addon tab loads and runs checks on a deprecated component story
- [ ] TC5.2 — Controls addon tab still shows prop controls on deprecated components
- [ ] TC5.3 — Addons panel is not visually broken — no layout shifts from the custom DocsPage
- [ ] TC5.4 — Theme switcher / viewport / router decorators (if present) still function

### Regression — other Storybook components
- [ ] TC6.1 — Open 5+ random non-deprecated stories (atoms, molecules, organisms) — verify Docs tab renders normally (no broken DocsPage for any story)
- [ ] TC6.2 — No console errors in Storybook top-level frame

### Storefront sanity (dev-only warn should NOT impact production)
- [ ] TC7.1 — Navigate https://vcst-qa-storefront.govirto.com home page — NO console errors
- [ ] TC7.2 — Grep storefront HTML/console for presence of deprecated components — expected: none used in pages (they're documented as unused; spot-check catalog/product/cart pages)

## Business Rules & Edge Cases

**No BL-* rules apply directly** — this is a dev-experience / design-system change with no runtime business logic impact.

**ECL-relevant patterns:**
- ECL general: visual consistency — banner must not disrupt docs layout on narrow viewports
- Storybook sidebar badge should be visible on mobile/tablet viewports (if Storybook is used responsively)

**Edge cases:**
- Deep-link directly to a deprecated component's Docs tab — banner still shows (not only after navigation)
- Hot-reload / page refresh on Docs tab — banner persists
- Story variant other than default (e.g. Primary, With icon) — banner still shows on the Docs page (banner is per-story meta, but parameters.deprecated inherits from meta)

## Evidence to Capture

1. Screenshot: Storybook sidebar with atoms section open, showing deprecated badges on `VcLineItemProperty` and `VcPriceDisplayCatalog`
2. Screenshot: Storybook sidebar with molecules section open, showing deprecated badge on `VcItemPriceCatalog`
3. Screenshot: Docs page for each deprecated component with banner visible (3 screenshots)
4. Screenshot: Docs page for a non-deprecated component — confirm NO banner
5. Console log: warn messages from deprecated component stories
6. Console log: top-level Storybook page — no errors
7. HAR: Storybook page load

## Verdict Criteria

- **PASS** — all AC pass, sidebar badges + docs banners render on the 3 deprecated components, non-deprecated components unaffected, no Storybook regressions
- **PASS WITH NOTES** — badges/banner work but minor visual issues (e.g. banner color contrast, mobile wrap) exist
- **FAIL** — badge or banner missing on any of the 3 deprecated components, custom DocsPage breaks other components, or Storybook layout broken
- **BLOCKED** — Storybook URL unreachable, build mismatch, or addon install failure
