# Choosing which parts of a configurable product to buy

> **Status: Coming soon.** The cart engine supports this feature starting with build `VirtoCommerce.XCart 3.1013.0` (PR #114). The storefront user interface that lets you interact with it is being built in a follow-up release. This article describes how the feature will work once it reaches the B2B-store.

---

## What's a configurable product?

A configurable product is a single item in the catalog that is built from separate, individually priced parts called **sections**. For example, a custom workstation bundle might include a base unit (required), a RAM upgrade, a storage upgrade, a custom engraved nameplate, and an uploaded logo file for the engraving. Each of those parts is its own section. When you add the bundle to your cart, all configured sections come with it — the product stays as one cart item, but the price you see is the sum of whichever parts you have included.

---

## What you'll be able to do

- **Include or exclude individual sections** before you check out — for example, skip the engraving if you decide you don't need it this order.
- **"Include all" and "Exclude all" shortcuts** at the top of the section list, so you can toggle everything with one click.
- **See the price update immediately** as you include or remove sections — no page reload needed.
- **Keep your configuration intact** even when you exclude a section — the details you filled in (custom text, uploaded files, chosen variations) are preserved on the item, so you can re-include the section later without re-entering everything.
- **Compare "fully loaded" vs. "base bundle" pricing** instantly by toggling all sections off and then back on.
- **Combine with your B2B contract pricing** — any negotiated prices or tiered discounts you have with the store still apply to the sections you include.

---

## How it will look in the cart

When you expand a configurable line item on the cart page, you will see each section listed with a checkbox:

```
+----------------------------------------------------------+
| [x] Custom Workstation Bundle                            |
|     Qty: 1                                               |
|                                                          |
|     [ Include all ]   [ Exclude all ]                    |
|                                                          |
|     [x]  Base Unit — Intel Core i9                $1,200 |
|     [x]  RAM — 32 GB DDR5                          $180  |
|     [ ]  Storage — 2 TB NVMe  (excluded)           $220  |
|     [x]  Engraving — "Marketing Dept"               $45  |
|     [ ]  Logo File Upload  (excluded)               $30  |
|                                                          |
|     Line total:                              $1,425.00   |
+----------------------------------------------------------+
|  Cart subtotal:                              $1,425.00   |
+----------------------------------------------------------+
```

- A checked box means that section **is included** in your price.
- An unchecked box means that section **is excluded** — its cost is not counted.
- The line total at the bottom of the item updates as soon as you check or uncheck a section.
- **"Include all"** selects every section for this item at once.
- **"Exclude all"** removes every section from the price at once (the line stays in your cart at $0 until you re-include sections).

---

## What stays the same

- **One cart item.** The bundle still counts as a single line in your cart regardless of how many sections you include or exclude. Quantity, product name, and order reference all stay the same.
- **Your configuration is preserved.** Excluding a section does not erase what you configured. Your custom text, uploaded files, and chosen variation options are all saved on the item. If you change your mind, just check the section again and the details come back.
- **Coupons, taxes, and shipping recalculate automatically.** When a section is excluded the price drops, and discounts, taxes, and shipping costs recalculate against the updated total — there is nothing extra to do.
- **Other items in your cart are not affected.** Changing which sections are included on one configurable product has no effect on any other line in your cart.

---

## Common scenarios

### Buying the basic bundle without the optional add-ons

You add a configurable workstation bundle to your cart. It arrives with all sections included. You decide you want only the base hardware — no custom engraving, no logo file. You uncheck "Engraving" and "Logo File Upload." The line price drops immediately to reflect the base hardware only. You proceed to checkout with that leaner configuration.

### Removing a custom-engraved part you decided you don't want

Your cart has a configurable item with an engraving section you filled in earlier. You've changed your mind about the engraving but not about the rest of the bundle. You uncheck the "Engraving" section. The custom text you typed is still saved on the item — if you check it again the text is still there. You complete your order without the engraving. The saved text is not charged and does not appear on the invoice.

### Quickly comparing base price vs. fully-loaded price

You want to know the cost difference between the stripped-down bundle and the full version. Click **"Exclude all"** — the line total drops to reflect only the sections whose price floor is still included. Then click **"Include all"** — the total jumps back to the fully configured price. No items were removed and nothing was re-entered.

### Reordering from order history with fewer sections

You open a previous order, reorder the configurable bundle, and it lands back in your cart with all sections selected (the same state as when you last ordered). This time you don't need the extended storage. Uncheck that section, confirm the updated price, and check out. Your next order only charges for the sections you selected.

---

## Frequently asked questions

**Can I remove a section and still keep my configuration for next time?**
Yes. Unchecking a section only removes it from the price — it does not delete your configuration. Your custom text, uploaded files, and variation choices are all still there on the item. If you check the section again before checking out, everything is exactly as you left it.

**Does the price update right away?**
Yes. The moment you check or uncheck a section the line price, cart subtotal, and totals all update automatically. You do not need to refresh the page or click a "Recalculate" button.

**Can I save a partially configured cart and come back later?**
Yes. Your cart is saved with your account, and the section inclusion state is saved with it. If you log back in later, the same sections will be checked or unchecked as you left them.

**What if a section I want is unavailable?**
If a section's product becomes unavailable (for example, it goes out of stock), the storefront will indicate that. You can still keep your selection, but the cart will alert you before checkout that one or more sections cannot be fulfilled. You may need to either deselect that section or wait until it is back in stock.

**Does this work on mobile?**
Yes, once the storefront feature ships it will work on mobile browsers just as it does on desktop.

**Will my B2B contract pricing still apply?**
Yes. Section prices are governed by the same price lists and contract agreements that apply to standard purchases. If your account has a negotiated price for a particular product variant in a section, that price is used when summing the included sections. Excluding a section simply removes its contribution from the line total; it does not affect the prices of the sections you keep.

**What happens at checkout?**
Only the sections you have checked are charged. Sections you excluded do not appear on your invoice or order confirmation. The configurable product is placed as a single order line, and only the included sections are listed under it.

**Can I include or exclude sections after I have placed the order?**
No. Once the order is placed, the selection is locked in. If you need to change the configuration after ordering, you will need to contact the store or request a cancellation and reorder. Use the cart page to review your included sections carefully before clicking **Place Order**.

---

## Need help?

If you have questions about configurable products or need help adjusting your cart, please contact your account manager or reach the support team through the **Help** link in the storefront navigation.
