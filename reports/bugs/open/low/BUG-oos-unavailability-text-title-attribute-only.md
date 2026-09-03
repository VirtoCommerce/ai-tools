# Out-of-stock products communicate unavailability only via a `title` tooltip — visible text is the bare digit `0` — P3 (a11y)

**Env:** vcst-qa @ Platform 3.1057.0-pr-3095, Theme 2.55.0-pr-2417

## Summary
For an out-of-stock product, the stock chip's only **visible** content is the digit `0` (red pill + cube icon). The human-readable string "Out of stock" is rendered solely into the chip's `title` attribute, so it is a native tooltip and nothing else. A native `title` is not keyboard-reachable and never fires on touch — so keyboard and mobile customers get **no** unavailability message at all, while the price still reads `$19.99` as though purchasable. Same defect on the PDP and on category listing tiles.

Purchase itself is correctly blocked (qty stepper disabled), so this is a messaging/accessibility defect, not a revenue hole.

## STR
1. Open an out-of-stock product's PDP (fixture `QA-OOS-001`, `/seed-test-fixtures/agent-test-oos-fixture`).
2. Read the stock/availability area — visible text is `0`, nothing more.
3. Scroll the full PDP: no word anywhere states the product is unavailable.
4. Tab to the chip with the keyboard, or view on a touch device: no tooltip, so no message.
5. Repeat on the category listing (`/seed-test-fixtures`) — uncheck the default-on `Show in stock` filter to reveal the fixture. Same `0`-only chip.

## Expected vs Actual
- **Expected:** a visible textual indicator — "Out of stock" / "Sold out" / "Unavailable" — rendered as text, per BL-CAT-001 ("the storefront must show 'Sold out' (or equivalent)"), and available to keyboard and touch users.
- **Actual:** visible text is `0`; the string exists only as `title="Out of stock"`.

Accessibility node observed: `generic "Out of stock": "0"` — accessible **name** `Out of stock` (derived from `title`), text **content** `0`.

![OOS PDP — chip shows only 0](screenshots/BUG-oos-chip-zero-only-pdp.png)
![OOS listing tile — same defect](screenshots/BUG-oos-chip-zero-only-listing.png)

## Root cause (confirmed in source)
`vc-frontend` → `client-app/shared/catalog/components/in-stock.vue`. The out-of-stock branch (the final `v-else` `VcChip`) puts the message in `:title` and renders only `<span>0</span>` as content:

```
:title="!isAvailable ? $t('common.messages.product_no_longer_available') : $t('common.messages.product_out_of_stock')"
…
<span class="inline-block min-w-3 text-center">0</span>
```

The in-stock branch, by contrast, renders a real label (`$t("common.labels.in_stock")` or the quantity). The locale keys resolve correctly (`common.messages.product_out_of_stock` → "Out of stock"), so **the string is right and only its placement is wrong** — a small, contained fix.

Note also: the component declares a **`textEnabled` prop (default `true`) that is never referenced anywhere in the template.** It looks like an intended-but-unfinished switch for exactly this label; worth resolving in the same change rather than leaving dead.

## Severity rationale
P3, not the High originally recorded by the runner. BL-CAT-001's two hard requirements are met — a visual indicator *is* present (red danger chip) and purchase *is* disabled — so no revenue-critical invariant is violated. What fails is text/assistive-tech access to the state (WCAG 1.4.1 use-of-colour, 4.1.2 name/role/value).

## Correction to the originating test cases
`CAT-051` and `CAT-057` reported *"a 'Stock Alert' bell CTA replaces the quantity stepper."* **Refuted on this build:** there is no bell or notify control anywhere on the page, and the stepper is not replaced — it is present and disabled. The sidebar is price · disabled stepper · the `0` chip · Wishlist (disabled, auth-gated) / Add to Compare / Share / Send link by email / Print.

Both cases also cite invariants that do not govern this behaviour — **BL-CAT-006** is *configurable-product section completion* and **BL-CART-002** is *stock hitting 0 mid-session at checkout*. The governing invariant is **BL-CAT-001** (stock zero disables purchase, incl. the "must show 'Sold out'" clause). Recite accordingly.

## Refs
BL-CAT-001. Cases: `CAT-051`, `CAT-057` (suite 002) — one defect, two cases, reproduced on both PDP and listing surfaces.

## Fix Routing
- **Repo:** vc-frontend
- **File:** `client-app/shared/catalog/components/in-stock.vue`
- **Kind:** frontend
