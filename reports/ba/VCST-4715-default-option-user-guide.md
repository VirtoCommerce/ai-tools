# Default Options for Configurable Products

**Feature:** Default option support in product configuration (VCST-4715)
**Applies to:** Merchandisers / Catalog Managers (Admin SPA) and Shoppers (storefront)
**Available from:** Catalog module `3.1025.0-pr-880` · Theme `2.50.0-pr-2278`

---

## Overview

Configurable products let shoppers pick options inside one or more sections (for example, **Frame Material** with choices Aluminum / Carbon / Steel). Until now, every section started empty and the shopper had to make a choice before the price would settle.

You can now mark **one option per section as the default**. When a shopper opens the product page, that option is already selected, the price already includes any surcharge it carries, and dependent sections show their own defaults too. Shoppers can still override the choice — defaults are a starting point, not a lock.

This guide covers both sides of the feature: how a merchandiser sets a default in the Admin SPA, and what shoppers will see on the storefront.

---

# Part 1 — For Merchandisers

## Setting a Default Option

1. In the Admin SPA, open **Catalog → Products** and select your configurable product.
2. Go to the **Configuration** tab. You will see one or more **Sections** (Product-type or Text-type).
3. Inside a section, locate the **Options** grid. There is a new **Default** column with a checkbox next to every option.

   [screenshot: CFG-CA-027-default-column-initial.png]

4. Tick the **Default** checkbox on the option you want pre-selected.
5. Click **Save** on the product blade.

The selected option is now the section's default. The next time a shopper opens this product, that option will be preselected on the storefront.

> **One default per section.** If you tick **Default** on a second option, the Admin UI automatically clears the previous one — only one option per section can ever be the default.
>
> [screenshot: CFG-CA-027-single-default-enforced-carbon.png]

---

## Clearing a Default

1. Open the same Configuration → Section → Options grid.
2. Untick the **Default** checkbox on the option that is currently the default.
3. Save.

The section now has no default. Shoppers will see all options unselected when they open the product, and the displayed price will be the base price only (no option surcharge added until the shopper chooses).

---

## Default Options in Text Sections

Text-type sections (where shoppers pick from a list of predefined text labels — e.g. **Engraving style** with Classic / Modern) support defaults the same way. The **Default** column appears on the Text section's option grid, and the rules above apply identically.

[screenshot: CFG-CA-028-text-section-default-column.png]

---

## Defaults in Dependent (Conditional) Sections

If a section is **conditional** — meaning it only appears when a parent section has a certain value — its default still works. When the parent reveals the dependent section, the dependent section opens with its own default already selected.

**Example:** Base Choice = Standard (default) reveals an Add-on section, where Warranty is the default. The shopper sees both defaults preselected on load.

If a shopper changes the parent to another value that still keeps the dependent section visible, the dependent section's selection is **retained** — its default is not re-applied on top of the shopper's existing choice.

---

## Tips and Limitations

- **A default is optional.** Existing products with no default option keep working exactly as before — no preselection, no surcharge added until the shopper picks something.
- **Pricing.** The default option's surcharge is added to the displayed price on the product page from the moment the page loads. Make sure your pricing reflects this — the shopper's first impression of the price will include the default option.
- **Inventory.** Marking an out-of-stock option as the default is not blocked by the platform. Check stock before assigning defaults so shoppers don't see a preselected option they cannot buy.
- **Seed scripts (advanced).** If you build products via REST `POST /api/catalog/products/configurations`, the server normalises to "one default per section" automatically: when two options come in with `isDefault=true`, the first stored option wins (no error is returned). To land a default on a specific option, either create the options in the desired-default-first order, or set the default in a follow-up API call / via the Admin UI.

---

# Part 2 — For Shoppers

## What You Will See

When you open a configurable product page (for example, a bike), the configuration sections at the top of the page now arrive with **one option already chosen for you** in each section. The choice is marked with a filled radio button, the section header shows its name, and the price displayed on the page already includes any extra cost that option adds.

[screenshot: CFG-PDP-040-PASS-carbon-preselected-300.png]

You do **not** have to keep this choice. Click any other option in the section to change it — the radio button moves, the section header updates, and the price recalculates immediately.

---

## Adding the Pre-selected Choice to Your Cart

If the default selection is what you want, just click **Add to cart**. Your cart line item will show:

- The product with the price you saw on the page (base price + default option surcharge).
- The **Components** list naming the option that was preselected (e.g. *"Frame Material: Carbon"*).
- An **Edit configuration** link so you can come back later and change your selection.

[screenshot: CFG-E2E-070-PASS-cart-carbon-default-300.png]

---

## Changing Your Mind Later

From the cart, click **Edit configuration** on the line item to reopen the product page in edit mode. Your cart's saved choice is shown — not the original default. Update what you need and click **Update cart**; the line item refreshes with the new selection and recalculated price.

If you simply refresh the product page (instead of editing from cart), the default is shown again, replacing any choice you made on the page. To keep a non-default choice, add the item to your cart first.

---

## Products with No Default

Some configurable products still arrive with no preselection — every option is empty, and a generic "Personalize your selection further (optional)" hint shows in each section header. That is intentional, not a bug. The price you see is the base price; it will go up when you make a choice.

---

# Troubleshooting

| Symptom | What's happening | What to do |
|---|---|---|
| I selected a default in Admin and saved, but the shopper still sees no preselection. | The product configuration cache or search index may be stale. | Reload the storefront page (hard refresh). If still wrong, ask a platform admin to reindex the catalog. |
| I checked a second **Default** box and the first one cleared by itself. | Working as designed — only one default per section. | If you wanted both, you can't. Pick the one you really want as default. |
| The storefront price on load looks higher than I expect. | The default option's surcharge is now included on page load. | Either lower the option's price modifier, or remove the default so the page loads at base price. |
| A shopper says they edited from cart and the original default came back. | Make sure they used the **Edit configuration** link on the cart line, not a fresh page refresh. Editing from cart restores the saved selection; a plain refresh re-applies the default. | Reach out to support if Edit configuration is missing on the line item. |

---

## Related

- Configurable products overview — Platform User Guide → Catalog → Products → Configurable Products
- Conditional sections — Platform User Guide → Catalog → Products → Configurable Products → Conditional sections
- Test evidence and verification: `tests/Sprint-current/VCST-4715/`
