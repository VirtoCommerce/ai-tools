# Comparing Products Side by Side

### Introduction
Line up up to five products from the same category — price, specs, and stock — on one page, so you can
decide before you buy.

![The compare table with several products from one category open side by side](../../vc/shared/archive/sprints/Sprint26-17/VCST-5735/screenshots/CMP-001-compare-table-all.png)
*The compare page after adding products from the catalog — one column per product, one row per attribute.*

### Prerequisites
- No account or sign-in is required — you can start comparing right away.
- Add at least one product before opening the compare page; there's nothing to show until you do.
- You can compare up to **5 products per category**. Products from a different category open on their
  own tab, so they never mix into the same table.

### Building your comparison
1. Browse any category and click **Add to Compare** on each product card you want to line up.
2. Click **Compare** in the header. On desktop, a badge next to it shows how many products you've added.
   ![The header Compare link with its item-count badge, alongside the per-tab row counter](../../vc/shared/archive/sprints/Sprint26-17/VCST-5735/screenshots/CMP-020-counter-vs-badge.png)
   *The badge counts everything you've added across all categories; the counter above the table counts
   only the tab you're viewing.*
3. You land on the compare page, already open to the tab for the category you were just browsing.
4. Switch on **Differences** in the segmented control above the table to hide every row that reads the
   same for all your products. A line above the table reads **"Differ: N of M rows"**, so you always know
   how many rows are actually different.
5. Remove a single product at any time from its own column — the rest of your comparison stays exactly
   as it was.

!!! note "Why can't I add a sixth product?"
    Each category holds up to 5 products. Trying to add a sixth shows **"Only 5 products from the same
    category can be compared"** and the product isn't added — your existing 5 stay untouched.

    ![The over-limit message shown when a sixth product is added to a full category](../../vc/shared/archive/sprints/Sprint26-17/VCST-5735/screenshots/CMP-004-limit-refusal-toast.png)

!!! note "I opened the compare page in a second tab — will it match?"
    Yes. Adding or removing a product in one browser tab updates any other open compare page live, with
    no reload needed.

### Clearing your list
1. Click **Clear category** to empty only the tab you're viewing, or **Clear all** to empty every tab.
2. **Clear all** opens a confirmation dialog. Click **Cancel** to keep your list unchanged, or **OK** to
   confirm.
   ![The Clear all confirmation dialog with OK and Cancel](../../vc/shared/archive/sprints/Sprint26-17/VCST-5735/screenshots/CMP-005-clear-all-dialog.png)
3. If you clear by mistake, click **Restore products** — it's offered right after a clear, on the same
   page load — to bring back the exact list you had. **Clear all** stays disabled while your list is
   already empty.

### Comparing configurable products
1. For a product you configure before buying (choosing options like memory or size), the compare table
   shows a **customize** link in place of an add-to-cart button.
2. You can add the *same* product configured two different ways, and each configuration gets its own
   column — its own price, its own set of configuration rows, and its own **customize** link that reopens
   exactly that configuration.
   ![Two columns for the same configurable product, each holding a different memory configuration](../../vc/shared/archive/sprints/Sprint26-17/VCST-5735/screenshots/CMP-033-two-config-columns.png)
3. A product that instead offers variations (for example, different colors) shows a **variations** link
   with a count of how many variations it has, rather than an add-to-cart button.

### Adding to cart from the table
1. For a standard product, add it to your cart directly from its column.
2. When a product has a minimum order quantity or is sold in fixed packs, the table shows it in the
   **Min. order qty** row — the quantity added to your cart matches what that row shows.
   ![Adding a product with a minimum order quantity and pack size straight from the compare table](../../vc/shared/archive/sprints/Sprint26-17/VCST-5735/screenshots/CMP-014-cart-moq7-pack12.png)

### Comparing on your phone
On a narrower screen, the product name column stays locked in place as you scroll the table sideways, so
you never lose track of which row is which.

![The compare table at phone width — the label column stays fixed while the rest scrolls](../../vc/shared/archive/sprints/Sprint26-17/VCST-5735/screenshots/CMP-009-375px-label-column-locked.png)

!!! note "Starting with nothing to compare?"
    You'll see **"Your compare list is empty"** with a note that you can add products from the catalog
    to compare their characteristics side by side, up to 5 per category.

    ![The compare page with no products added yet](../../vc/shared/archive/sprints/Sprint26-17/VCST-5735/screenshots/CMP-022-empty-state.png)

### Troubleshooting
- **I can't find Clear all, Clear category, or the pin button** — on a phone-width screen these controls
  aren't available yet (tracked as VCST-5871). Use a tablet or desktop screen in the meantime.
- **Someone else on this computer can see products I compared** — your compare list is stored in the
  browser, not on your account, so it's still there after you sign out. Avoid comparing anything sensitive
  on a shared or public computer.
- **A variations product's price looks lower than I expected** — for a product offering variations (like
  different colors), the price row shows the lowest price among its variations, not a single fixed price —
  useful for a quick comparison, but confirm the exact price after picking a variation.
