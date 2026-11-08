## Documentation — VCST-6158: Sales reps see the store's coupons on a customer profile

### What's new
A sales rep now sees the store's available coupons while working with a customer.
The customer profile in the Sales Rep Hub has an **Available coupons** widget, and an **All promotion coupons** page lists every coupon, ten per page.
You can copy a code with one click and see how many uses it has left, so you can hand a customer a working code during a call.
Shipped in: VirtoCommerce.SalesRep@3.1017.0-pr-30-1e10 · vc-theme-b2b-vue@2.62.0-pr-2596-e749-e749b47f (tested with VirtoCommerce.Marketing@3.1010.0, platform@3.1093.0-pr-3154-4607)

### How to set it up
- **Modules:** the Sales Rep module and the Marketing module are installed.
- **Who sees it:** a user who is a sales rep and serves the customer organization. Open it from **Sales Rep Hub** → **My customers**.
- **Which coupons are listed:** promotions of the current store that are active, have started, are public and have exactly one coupon.
- **Widget size:** the widget shows 5 coupons by default. The row count is a setting of the widget's block on the profile layout (1–20).

!!! note
    The list is the store's coupon list, not a per-customer one: every customer you serve shows the same coupons.

### How it works

#### See a customer's coupons on the profile
1. In the account menu, open **Sales Rep Hub** → **My customers**, and click the customer's name.

   ![The My customers page of the Sales Rep Hub](../../tickets/Sprint26-22/VCST-6158/vcst/screenshots/docs/sr-coupons-1-my-customers.png)

2. Scroll the customer profile to **Available coupons**. Each card shows the discount label, the promotion name and description, the uses line, the **Expires** date and the code.

   ![The Available coupons widget on the customer profile](../../tickets/Sprint26-22/VCST-6158/vcst/screenshots/docs/sr-coupons-2-widget.png)

3. Click a code. It is copied to your clipboard, and **Coupon copied successfully** appears.

   ![The Coupon copied successfully notice after clicking a code](../../tickets/Sprint26-22/VCST-6158/vcst/screenshots/docs/sr-coupons-3-copied.png)

![Walkthrough: from My customers to a copied coupon code](../../tickets/Sprint26-22/VCST-6158/vcst/screenshots/docs/sr-coupons-widget-walkthrough.gif)

#### Browse all promotion coupons
1. On the **Available coupons** widget, click **All promotion coupons**. The page **Promotion coupons for <customer>** opens, ten coupons per page.

   ![The Promotion coupons page for the customer, first page](../../tickets/Sprint26-22/VCST-6158/vcst/screenshots/docs/sr-coupons-4-page.png)

2. Use the page numbers or **Next** to see the rest. A coupon with a use limit shows the uses it has left, for example *3 uses left out of 5*; one without a limit shows **Unlimited**.

   ![A capped coupon's uses line and the pager on page 2](../../tickets/Sprint26-22/VCST-6158/vcst/screenshots/docs/sr-coupons-5-uses-and-pager.png)

![Walkthrough: the coupons page and its second page](../../tickets/Sprint26-22/VCST-6158/vcst/screenshots/docs/sr-coupons-page-walkthrough.gif)

**What the list leaves out and how it is ordered:**
- Not listed: coupons past their own expiry, coupons that reached their use limit, coupons issued to a specific customer, and private, inactive, not-yet-started or multi-coupon promotions.
- Order: the soonest end first; coupons with no end come last.
- Reloading the page, or opening another customer's coupons, starts again on page 1.

!!! tip
    A coupon whose last use is spent disappears from the list on the next page load.

Video: VCST-6158-customer-coupons.mp4 (attached to this ticket).

Not documented: the **Expires** date itself — it can show the day after the code stops working (VCST-6677, failed in this run), and which time zone defines it is an open PO question · whether the list should equal the buyer's own **Coupons & promotions** page (AC-11 spec conflict, VCST-6675) · the wording of the uses line and its number format (open PO questions) · a cancelled order not giving a use back (open PO question) · the widget and page without the Marketing module (not tested: no stand without it) · the compact card on narrow widths (only partly verified).

Verified on vcst · run REG-2026-11-03-1732 · verdict PASS WITH NOTES · captured 2026-11-03 · versions run

Sources: [Storefront user guide — Sales Rep Hub](https://docs.virtocommerce.org/storefront/user-guide/account/sales-rep-hub) · [Storefront user guide — Coupons and Promotions](https://docs.virtocommerce.org/storefront/user-guide/account/coupons) · assignee scope comment on VCST-6158 (2026-10-22) · run checklist `reports/tickets/Sprint26-22/VCST-6158/vcst/testing-checklist.md` rows C-01–C-05, C-06–C-09, C-11, C-15, C-16, C-18–C-20 · kb KB-F37AB317, KB-B1DBAD5D
