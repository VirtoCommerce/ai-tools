# Comparing Products Side by Side

### Introduction
Line up to five products from the same category — price, specs, and stock — on one page, so you can
decide before you buy.

![The compare table with two products from one category open side by side](../../vc/shared/archive/sprints/Sprint26-17/VCST-5735/screenshots/compare-1280-all-f5c8.png)
*The compare page after adding products from the catalog — one column per product, one row per attribute.*

### Prerequisites
- No account or sign-in is required — you can start comparing right away.
- Add at least one product before opening the compare page; there's nothing to show until you do.
- You can compare up to **5 products per category**. Products from a different category open on their
  own tab, so they never mix into the same table.

### Building your comparison
1. Browse any category and click **Add to Compare** on each product card you want to line up. The control
   flips to **Remove from Compare** once a product is in your list, so you can always see what you added.
2. Click **Compare** in the header. On a desktop screen a badge next to it shows how many products you've
   added in total.
3. You land on the compare page with one of your category tabs open. Each tab shows its own count, so
   switch tabs to move between the categories you are comparing. Above the table, a line reads
   **"N of 5 added in {your category}"**.
4. Switch on **Differences** in the segmented control above the table to hide every row that reads the
   same for all your products. On a desktop screen a line beside the control reads
   **"Differ: N of M rows"**, so you can see how many rows actually differ.
5. Click the pin beside any row label to lift that row into a block at the top of the table. A pinned row
   stays visible even while **Differences** is hiding the rows that match. Pinning needs a desktop-width
   screen.
6. Remove a single product at any time with **Remove from compare** on its own column — the rest of your
   comparison stays exactly as it was.

!!! note "Why can't I add a sixth product?"
    Each category holds up to 5 products. Trying to add a sixth shows **"Only 5 products from the same
    category can be compared"** and the product isn't added — your existing 5 stay untouched.

!!! note "I opened the compare page in a second tab — will it match?"
    Yes. Adding or removing a product in one browser tab updates any other open compare page live, with
    no reload needed.

### Clearing your list
1. Click **Clear category** to empty only the tab you're viewing, or **Clear all** to empty every tab.
   Both are available on a phone as well as on a desktop screen.
2. **Clear all** opens a confirmation dialog telling you how many products will go — for example
   **"All 2 products will be removed from comparison."** Click **Cancel** to keep your list unchanged, or
   **OK** to confirm.
   ![The Clear all confirmation dialog with its count, Cancel and OK](../../vc/shared/archive/sprints/Sprint26-17/VCST-5735/screenshots/compare-1280-clear-all-dialog-f5c8.png)
3. If you clear by mistake, click **Restore products** — it's offered right after a clear, on the same
   page load — to bring back the exact list you had. **Clear all** stays disabled while your list is
   already empty.

### Comparing configurable products
1. For a product you configure before buying (choosing options like memory or size), the compare table
   shows a **customize** link in place of an add-to-cart button.
2. You can add the *same* product configured two different ways, and each configuration gets its own
   column — its own price, its own set of configuration rows, and its own **customize** link that reopens
   exactly that configuration.
3. A product that instead offers variations (for example, different colors) shows a **variations** link
   with a count of how many variations it has, rather than an add-to-cart button, and its price row shows
   the lowest price among those variations.

### Adding to cart from the table
1. For a standard product, add it to your cart directly from its column with **Add to cart**.
2. When a product has a minimum order quantity or is sold in fixed packs, the table shows it in the
   **Min. order qty** row — the quantity added to your cart matches what that row shows.

### Comparing on your phone
The product name column stays locked in place as you scroll the table sideways, so you never lose track
of which row is which. **Clear all** (the bin icon beside the page title) and **Clear category** are both
available at this width.

![The compare table at phone width, with Clear all and Clear category both reachable](../../vc/shared/archive/sprints/Sprint26-17/VCST-5735/screenshots/compare-375-clear-controls-f5c8.png)

!!! note "Starting with nothing to compare?"
    You'll see **"Your compare list is empty"**, with a note that you can add products from the catalog
    to compare their characteristics side by side, up to 5 per category, and an **Add products** link
    through to the catalog.

    ![The compare page with no products added yet](../../vc/shared/archive/sprints/Sprint26-17/VCST-5735/screenshots/compare-1280-empty-state-f5c8.png)

### Troubleshooting
- **I can't find the row pin on my phone** — pinning needs a desktop-width screen. Everything else,
  including **Clear all** and **Clear category**, works at phone width.
- **Someone else on this computer can see products I compared** — your compare list is stored in the
  browser, not on your account, so it's still there after you sign out. Avoid comparing anything sensitive
  on a shared or public computer.
- **A variations product's price looks lower than I expected** — for a product offering variations (like
  different colors), the price row shows the lowest price among its variations, not a single fixed price —
  useful for a quick comparison, but confirm the exact price after picking a variation.

---
*Verified on vcst-qa, theme `2.57.0-pr-2452-f5c8-f5c80f61`, 2026-09-07: adding from a catalog card,
the header badge, category tabs, the added-count and `Differ:` lines, Differences, pinning, remove,
Clear category, Clear all and its dialog, Restore products, and the empty state. The configurable,
variations and add-to-cart-quantity steps carry their verdicts from the 2026-09-03 run on theme
`2.57.0-pr-2452-d1e4-d1e45b04` and were not re-walked on the current build.*
