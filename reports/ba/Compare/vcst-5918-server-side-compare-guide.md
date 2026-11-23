## Documentation — VCST-5918: Product compare saved to the buyer's account

### What's new
Product comparison now lives in its own module, Product Comparison, and the compare list is stored on the server. A signed-in buyer sees the same list on every device and browser, and each organization the buyer works for keeps its own list. A guest can compare too: the guest list joins the account list at sign-in. You switch comparison on or off, set the limit per category and allow or block guests per store, in the back office.
Shipped in: VirtoCommerce.ProductComparison@3.1000.0-pr-1-7403 · vc-frontend theme@2.63.0-pr-2635-8318-83187397
Release: VirtoCommerce.ProductComparison 3.1000.0 is released; the storefront part (vc-frontend #2635) is merged to dev and ships with the next theme release.

Slide for the sprint presentation: VCST-5918-product-compare-slide.pptx (attached to this ticket; one slide, the demo video embedded).

![VCST-5918 slide: product compare saved to the buyer's account, with the release status](../../tickets/Sprint26-22/VCST-5918/vcptcore/screenshots/docs-00-slide-pptx.png)

### How to set it up
1. Install the **Product Comparison** module (`VirtoCommerce.ProductComparison`). Without it the storefront shows no compare buttons, no **Compare** link and no compare page.
2. In the back office, go to **Configuration › Stores**, open your store and click the **Settings** widget.
3. Open the **Product Comparison** group and set:
   - **Enable product comparison** — on by default. Off hides every compare button and link, and the compare page is not found.
   - **Products per category** — 5 by default. How many products a buyer can compare in one category.
   - **Allow guests to compare** — on by default. Off asks a guest to sign in when they add a product.
4. Click **Save**. Shoppers see the change after they reload the page.

![Store settings blade with the Product Comparison group: Enable product comparison, Products per category, Allow guests to compare](../../tickets/Sprint26-22/VCST-5918/vcptcore/screenshots/docs-01-admin-settings.png)

!!! note "Guest lists are cleaned up"
    A daily job deletes guest lists that have not changed for 48 hours (module setting `ProductComparison.AnonymousListLifetimeHours`), lists of deleted users and lists for organizations a user has left.

!!! warning "Theme settings no longer apply"
    The theme settings `product_compare_enabled` and `product_compare_limit` are not read any more. If your store turned comparison off or changed the limit in the theme, set the store settings above again.

### How it works

#### Add products to compare
1. Open a category, for example **Virto Start Electronics › Computers & Laptops › Business laptops**.
2. Click **Add to Compare** (the arrows icon under the heart) on a product card. A message confirms the product is added and shows how many more you can add in this category. Click **Compare** in the message to open the compare page.
   ![A product card after Add to Compare: the icon turns orange and a message reads "is added to compare list (items left - 4)"](../../tickets/Sprint26-22/VCST-5918/vcptcore/screenshots/docs-02-card-added.png)
3. On a product page, click the compare icon in the **Price and delivery** block.
   ![Product page after clicking the compare icon: "Product is added to compare list"](../../tickets/Sprint26-22/VCST-5918/vcptcore/screenshots/docs-03-pdp-added.png)
4. The **Compare** link in the header shows how many products you are comparing. Click it again on a card to remove the product.

#### Compare products
1. Click **Compare** in the header. Each category you added products from has its own tab with a count, and the line under the title reads, for example, **3 of 5 added in Computers & Laptops**.
   ![The compare page: tabs Computers & Laptops 3, Monitors & Displays 2, Audio & Video Conferencing 3; three laptops side by side](../../tickets/Sprint26-22/VCST-5918/vcptcore/screenshots/docs-04-compare-laptops.png)
2. Click **Differences** to hide the rows that are the same for every product. **Differ: 9 of 18 rows** tells you how many rows differ.
   ![Differences mode: only processor, storage, touchscreen, warranty and other rows that differ](../../tickets/Sprint26-22/VCST-5918/vcptcore/screenshots/docs-05-differences.png)
3. Click another tab to compare that category.
   ![The Monitors & Displays tab: two Dell UltraSharp monitors differ by price, SKU and screen size](../../tickets/Sprint26-22/VCST-5918/vcptcore/screenshots/docs-06-monitors.png)
4. Click the cart button under a product to add it to the cart. The minimum order quantity is respected.
   ![A headset added to cart from the compare table: "Added … to cart"](../../tickets/Sprint26-22/VCST-5918/vcptcore/screenshots/docs-07-add-to-cart.png)
5. Use the trash icon on a product to remove it, **Clear category** to empty the tab, or **Clear all** to empty the list. When the list ends up empty, the page offers to restore it right away.

#### Your list follows you
- Sign in on another device or browser: **Compare** shows the same products.
- Switch to another organization: you see that organization's list. Each organization keeps its own.
- Compare as a guest, then sign in: the guest products are added to your account list.
- On a phone, **Compare** is in the main menu. Signed-in buyers also find it in **My Account › Purchasing › Compare**.
  ![My Account › Purchasing with the Compare link](../../tickets/Sprint26-22/VCST-5918/vcptcore/screenshots/docs-08-account-compare.png)

Video: VCST-5918-product-compare.mp4 (attached to this ticket).

Not documented: compare lists saved in browsers before the upgrade (not tested; they are not imported — decision 112644) · sign-in on behalf of a buyer (no operator account on the stand) · reordering products (API only; the page has no drag-and-drop yet)
Verified on vcptcore · run VCST-5918 rounds 1–2 · verdict PASS WITH NOTES (round 2 fixes: PASS) · captured 2026-11-19 · versions capture

Sources: module README at PR #1 head 74033987 (`README.md` §Settings, §Storefront plugin, §Cleanup) · https://docs.virtocommerce.org/storefront/user-guide/shopping/compare-products · Jira 112644 (implementation decisions)
