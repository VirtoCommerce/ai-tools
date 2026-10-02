# Configuring the Barcode Scanner

The **Barcode scanner** setting controls whether the storefront's barcode scan button is shown to
shoppers, and how a scanned code is matched to a product. It lives alongside **Facets** and
**Sorting** in a store's **Search configuration**.

## Configure barcode matching

To set up how scans are matched for a store:

1. Click **Stores** in the main menu.
2. Select the store, then click **Search configuration** in the store's blade. Three tiles are shown
   — **Facets**, **Sorting**, **Barcode scanner** — wrapping onto a second row rather than scrolling
   horizontally.
3. Click the **Barcode scanner** tile.
4. In the **Barcode scanner** blade, fill in the following:

   | Field | What it does | Example |
   |---|---|---|
   | Enable barcode scanner in the storefront | Shows or hides the scan icon in the storefront search bars | On |
   | Match scanned code by | **Full-text search** treats a scan as an ordinary keyword search (the previous behavior); **Exact match on selected fields** matches only the fields you choose below | Exact match on selected fields |
   | Fields to match | Only shown in Exact match mode. Pick one or more product identifiers a scanned code is matched against: the built-in **GTIN**, **MPN**, and **SKU**, plus any short-text catalog property you've set up to hold a code | GTIN, SKU |

   In **Full-text search** mode (the default) there is no field list — a scan is searched like typed text:

   ![Barcode scanner blade in Full-text search mode](../../tickets/Sprint26-19/VCST-2945/screenshots/doc-admin-barcode-blade-fulltext-blade.png)

   In **Exact match on selected fields** mode the **Fields to match** list appears; tick each field a
   scan should be matched against (here **GTIN** and **SKU**; other rows of the list are omitted from the
   picture):

   ![Barcode scanner blade in Exact match mode with GTIN and SKU selected](../../tickets/Sprint26-19/VCST-2945/screenshots/doc-admin-barcode-blade-exact-crop.png)

5. Click **Save** in the toolbar.

Saved fields are listed checked-first, then alphabetically, the next time you open the blade. **Save**
stays disabled while Exact match mode has no fields selected, and a confirmation prompt appears if you
try to close the blade with unsaved changes.

!!! tip "How to fill barcode data"
    GTIN is the packaging barcode (UPC, EAN, ISBN, JAN); MPN is the manufacturer part number; SKU is
    the product code. For any other code — or several codes of the same kind — create a short text
    catalog property for products or variations (multi-value is allowed, long text is not) and select
    it here. Products must be re-indexed after the values or the property definitions change.

!!! note
    Saving requires the **Update** permission for browse filters. Without it, the blade opens
    read-only and **Save** is not available.

### If a configured field is removed from the catalog

If a category manager deletes or renames the catalog property backing a configured field, the field
is marked **missing from index** in the blade the next time it's opened. Until then, scans no longer
match that field and nothing warns you, so after changing catalog properties, reopen **Barcode scanner**
and check the field list. Changing the mode or any field drops the missing field, and it is not saved again.

---
*Source: this run's own evidence (`reports/tickets/Sprint26-19/VCST-2945/`, field values and hints
captured verbatim from the Admin SPA during testing); PlatformUserGuide "Configure facets"
(https://docs.virtocommerce.org/platform/user-guide/catalog/managing-properties) consulted for the
Search configuration widget's voice and navigation pattern. Screenshots captured 2026-10-01 on
B2B-store without saving (settings GET-confirmed unchanged before and after).*
