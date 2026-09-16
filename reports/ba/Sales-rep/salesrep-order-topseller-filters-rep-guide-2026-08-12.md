# Filtering Recent Orders and Top Sellers

### Introduction
Your **Recent orders** and **Top sellers** blocks each carry a row of filter buttons — order statuses above one, product categories above the other. Both rows are built from your own sales, so every button you see returns something: there is nothing to click that comes back empty.

![The Recent orders block with a filter button for each status present in the orders below](sales-rep-hub-dashboard/screenshots/doc-5590-dashboard-status-chips.png)
*Five statuses across the orders listed, five buttons — plus **All**.*

### Prerequisites
- You are signed in to the storefront with a corporate account that has sales rep access.
- Your administrator has linked you to at least one customer organization. If your sidebar has no **Sales Rep hub** section, you do not serve any customers yet.
- At least one of your customers has placed an order — the filter rows come from those orders. If none has ordered yet, there is nothing to filter and neither row appears; see [If no one has ordered yet](#if-no-one-has-ordered-yet) below.

### Filter your orders by status
1. In the account sidebar, under **Sales Rep hub**, click **Dashboard**.
2. Find the **Recent orders** block below the figures at the top of the page.
3. The row above the table starts with **All**, followed by one button per status. Click the status you want.
4. The table narrows to the orders in that status. The button you picked stays highlighted so you can see the list is filtered.

    ![The Recent orders block filtered to a single status](sales-rep-hub-dashboard/screenshots/doc-5590-status-chip-applied.png)
    *A status selected: only the orders in that status remain.*

5. Click **All** to go back to the full list.
6. To see every order rather than the most recent few, click **All orders** in the block header.

!!! note "Why is a status I expected missing?"
    Because none of your orders is in it. The row is not the store's full list of statuses — it is the list of statuses your customers' orders are in right now. If **Completed** is not there, nothing has reached it yet; the button appears on its own as soon as an order does.

!!! tip "Statuses set by your ERP show up too"
    If an order's status came from another system rather than from the store, it is still offered as a filter and still labelled with the value that system set — for example **AwaitingErpSync**. Those labels arrive as-is, so they can look more technical and are not translated.

### Filter your best sellers by category
1. On the same page, find the **Top sellers** block.
2. The chip row above the table starts with **All categories**. Scroll it sideways if there are more chips than fit.
3. Click a category chip. The ranking narrows to that category's products.

    ![Top sellers filtered to one category](sales-rep-hub-dashboard/screenshots/doc-5590-category-chip-applied.png)
    *One category selected: the ranking shows only its products.*

4. Click **All categories** to go back.
5. Click **Units** or **Revenue** in the header to switch what the ranking is based on. These are two different lists, not the same list reversed — your fastest-moving product is often not your highest-earning one.

!!! note "The chips are top-level categories"
    A chip is the top-level catalog section a product sits under, not the narrower sub-category on the product itself, so one chip can cover several sub-categories. The row also lists only the categories you can filter by: a product can be ranked under **All categories** without its category appearing as a chip.

### Filter on a single customer's page
The same two blocks appear on each customer's profile, and they work the same way — but the buttons come from **that customer's** orders only, so the rows are usually shorter than on your dashboard.

1. In the sidebar, under **Sales Rep hub**, click **My customers**.
2. Click the customer's name to open its profile.
3. Use the status buttons and category chips exactly as on the dashboard.

![Recent orders and Top sellers on a customer profile, with shorter filter rows](sales-rep-view-customer-profile/screenshots/doc-5590-customer-page-chips.png)
*The same blocks scoped to one organization — three status buttons here against the dashboard's five.*

!!! note "Nothing carries over between customers"
    A filter you set on one customer is not applied to the next. If you move to a customer that has no orders in the status you had selected, the row returns to **All** and that customer's orders show unfiltered — you are never left with an invisible filter.

When a customer has nothing to narrow by, the row is simply not there. A customer with a single order gets **All** plus one status button, and **Top sellers** appears with no chip row at all — the ranking is still listed.

![A customer profile with one status button and no category chip row](sales-rep-view-customer-profile/screenshots/doc-5590-no-chip-row.png)
*One order, one status button, and Top sellers shown without a chip row.*

### If no one has ordered yet

A newly assigned rep — or one whose customers have not ordered yet — has nothing to filter, and **neither block shows a filter row at all**. **Recent orders** reads **"No orders yet"** and **Top sellers** reads **"No sales in this period"**, each on its own. This is the same rule as everywhere else in this guide: the buttons come from your orders, and with no orders there is nothing to offer. Both rows appear by themselves as soon as your first order lands.

![The dashboard of a rep with 15 customers and no orders: zero figures, both empty states, no filter rows](sales-rep-hub-dashboard/screenshots/doc-5590-empty-dashboard.png)
*15 customers but no orders: both blocks in their empty state, with no status buttons and no category chips above them.*

### Troubleshooting
- **A status or category I saw on another customer is missing here** — expected. Both rows are built from that customer's own orders, so each customer offers a different set.
- **Top sellers has no chip row** — that scope has no categories to filter by. The ranking below it is still complete.
- **An order I just placed is not in the list yet** — the figures and the filter rows refresh periodically rather than instantly. Check back in a few minutes; there is no manual refresh.
- **A status label looks like a code rather than a word** — it was set by an integration and has no store label to show, so the raw value is displayed. Ask your administrator if it should be renamed.
- **Neither block has a filter row** — none of your customers has ordered yet, so there is nothing to filter. See [If no one has ordered yet](#if-no-one-has-ordered-yet).
- **I cannot see the Sales Rep hub at all** — your account is not set up as a sales representative, or the hub is not enabled for your store. Contact your store administrator.

---
*Related: **Read your Sales Rep hub dashboard** · **View a customer profile** · **Customize your Sales Rep hub layout***

<!--
Sources / grounding:
- JIRA VCST-5590 "Define and align display rules for Recent orders and Top sellers blocks on Dashboard and Customer page" (Task, Tested; parent Epic VCST-5142 Sales Rep Hub); design-decision comment 2026-07-30 (render only non-empty statuses and categories; take the status list from the orders, not the settings dictionary); QA verification comment 2026-08-06. Implementation: vc-frontend#2409, vc-module-sales-rep#9.
- Live-verified 2026-08-12 on vcptcore-qa (B2B-store), theme 2.56.0-pr-2409, signed in as the seeded rep @td(SR_REP_PRIMARY.email) — 4 served organizations. Dashboard: All + 5 status buttons (Cancelled, New, Payment required, Processing, AwaitingErpSync), All categories + 3 chips. TechFlow: 3 status buttons / 2 chips. BuildRight: 1 status button / no chip row. Every button, applied, returned at least one row.
- Audience: customer (StorefrontUserGuide skeleton per knowledge/ba/virto-doc-style.md §3) — the actor is the sales rep as a storefront user; no GUIDs, no API, no admin surface.
- The no-orders case re-verified live 2026-08-13 as @td(SR_REP_PAGING.email) (15 served organizations, zero orders): both widgets in their empty state with NO filter row rendered on either. Its screenshot replaces the pre-fix `sales-rep-hub-dashboard/screenshots/doc-empty-dashboard.png`, which was captured on theme 2.55.0-pr-2400 and showed the removed behavior — the full status dictionary (incl. Completed and Pending) and ~60 catalog categories over two empty tables. That older file is still on disk and must not be referenced.
- Screenshots are the ones captured in those sessions, held in the two companion guides' folders (paths verified to resolve from this file's directory). The companion guides themselves are NOT part of this deliverable — they still describe the pre-fix behavior and need their own update pass.
- Deliberately silent on ordering: within the dictionary-known statuses the row comes out alphabetical rather than in the store's curated order (the one unreconciled VCST-5590 acceptance criterion). The guide promises no ordering until that is settled.
- Companion in-place updates of the same date: sales-rep-hub-dashboard/read-your-dashboard.md and sales-rep-view-customer-profile/view-customer-profile.md.
-->
