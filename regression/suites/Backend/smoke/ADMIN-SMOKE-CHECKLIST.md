# Admin SPA Smoke Checklist

> **Purpose:** Minimal critical-path gate for Admin SPA (admin-frontend) deployments. One happy-path check per area — edge/negative paths belong to full regression. Detail lives in the suite; this is the scannable gate.
>
> **Source:** `078-backend-smoke-tests.csv` (BSM-001 – BSM-111) · **API/GraphQL rows excluded** (BSM-002–004, 016–021, 025, 029, 037, 039, 049–051, 056, 058, 063–067, 069–070, 073–075) — covered by 078's API rows and Suite 049/050.
> **Data:** `{{BACK_URL}}`, `{{ADMIN}}`, `{{ADMIN_PASSWORD}}`, `{{STORE_ID}}`, `{{TEST_SKU}}`, `{{TEST_USER_EMAIL}}`, `@td(ADDR_NY.*)`. No hardcoded IDs, SKUs, prices, or credentials.

## Summary

| # | Area | Items | BSM cases |
|---|------|-------|-----------|
| 1 | Authentication & Dashboard | 1 | BSM-001 |
| 2 | Catalog Admin | 8 | BSM-005–007, BSM-030–031, BSM-057, BSM-059, BSM-072 |
| 3 | Orders Admin | 5 | BSM-008–009, BSM-032–033, BSM-071 |
| 4 | Customers Admin | 4 | BSM-010–011, BSM-034–035 |
| 5 | Pricing Admin | 3 | BSM-012, BSM-036, BSM-079 |
| 6 | Inventory Admin | 2 | BSM-013, BSM-038 |
| 7 | Marketing Admin | 4 | BSM-014, BSM-040–041, BSM-081 |
| 8 | Platform Health & Store | 6 | BSM-015, BSM-022–024, BSM-042–043 |
| 9 | Platform Admin | 3 | BSM-026–028 |
| 10 | CMS Admin | 2 | BSM-046–047 |
| 11 | Notifications Admin | 2 | BSM-044–045 |
| 12 | Assets Admin | 2 | BSM-053–054 |
| 13 | Shipping / White-Labeling / Push / Import-Export / Platform Settings | 8 | BSM-048, BSM-052, BSM-055, BSM-060–062, BSM-068, BSM-084 |
| 14 | Edit Workflows | 8 | BSM-076–083 (079/081 cross-ref §5/§7) |
| 15 | Delete Workflows | 4 | BSM-085–088 |
| 16 | Cross-Blade Navigation | 6 | BSM-089–094 |
| 17 | Search & Filter | 13 | BSM-095–107 |
| 18 | Grid Inline Operations | 4 | BSM-108–111 |

---

## 1. Authentication & Dashboard

- [ ] `{{BACK_URL}}` login form accepts `{{ADMIN}}` / `{{ADMIN_PASSWORD}}`; Admin SPA dashboard loads with main nav sidebar and platform module tiles; no Angular bootstrap error — BSM-001

## 2. Catalog Admin

- [ ] `{{BACK_URL}}/ui#/catalog` blade opens; catalog grid renders ≥1 row with Name + Type columns; Add/Delete toolbar present (BL-CROSS-001) — BSM-005
- [ ] Open first catalog → Products blade: grid renders ≥1 product row with Name, SKU, Is Active; Add Item toolbar present — BSM-006
- [ ] Open first catalog → Categories view: ≥1 category row visible; Add Category toolbar button present — BSM-007
- [ ] Create product via blade (Name + SKU `BSM-TEST-{{TIMESTAMP}}`): success toast; product detail blade opens with correct name/SKU; API confirms product exists — BSM-030
- [ ] Create category → success toast; category appears in grid; delete it → toast + row gone; API confirms deletion (BL-CAT-004) — BSM-031
- [ ] Open product detail → SEO tab: URL slug field non-empty; SEO title/meta/alt fields present — BSM-057
- [ ] `GET /api/catalog/products?productType=Configurable`: ≥0 results; if non-empty, open in blade → Configuration/Sections tab visible with ≥1 section + Required flag (BL-CAT-006) — BSM-059
- [ ] Product detail → Variations tab opens without Angular error; click variation row → variation detail blade opens with SKU and parent product back-link; blade stack preserved (BL-CAT-005) — BSM-072

## 3. Orders Admin

- [ ] `{{BACK_URL}}/ui#/orders` blade opens; grid renders Number, Status, Customer, Date, Total columns; ≥1 order row or empty-state; search/filter toolbar present (BL-ORDER-001) — BSM-008
- [ ] Click first order row: detail blade opens with order number in title, status badge, ≥1 line item, Subtotal/Tax/Total section, customer name and address — BSM-009
- [ ] Order detail → Shipments section: ≥1 shipment row; action buttons match shipment state (e.g. no "Delivered" on "New" shipment); no invalid state-machine transitions (BL-ORD-007) — BSM-032
- [ ] Order detail → Payments section: ≥1 payment row; status badge visible; amount matches order total; action buttons align with payment state (BL-ORD-006) — BSM-033
- [ ] Orders blade toolbar: if Import/Export module present, Export button visible and clickable without Angular error — BSM-071

## 4. Customers Admin

- [ ] `{{BACK_URL}}/ui#/customerDetails` Contacts view: grid renders Name, Email, Organization columns; ≥1 contact row; Add + search present (BL-CROSS-006) — BSM-010
- [ ] Switch to Organizations view: ≥1 org row; Add + search present; org row shows Name + member count (BL-B2B-001) — BSM-011
- [ ] Create contact (First `BSM`, Last `Contact`, email `bsm-contact-{{TIMESTAMP}}@example.com`): toast; contact blade opens; API confirms contact by email — BSM-034
- [ ] Click first org row: org detail blade shows name, Members/Contacts section with count > 0, org properties, and Invite/Add Member action (BL-B2B-001) — BSM-035

## 5. Pricing Admin

- [ ] `{{BACK_URL}}/ui#/pricing` blade opens; price list grid renders Name, Currency, Assigned Catalogs; ≥1 row; Add/Delete/Export toolbar present (BL-PRICE-001) — BSM-012
- [ ] Open first price list: detail blade shows Prices section; Add Price button opens product picker; existing price entries show List Price, Sale Price, Min Qty columns (BL-PRICE-007) — BSM-036
- [ ] Edit first price entry → set List Price to `9999.00` → toast; grid row updates; API confirms `list = 9999.00` and `modifiedDate` updated (BL-PRICE-001) — BSM-079

## 6. Inventory Admin

- [ ] `{{BACK_URL}}/ui#/inventory` blade opens; fulfillment centers grid renders Name, Code, Address; ≥1 row; Add/Delete toolbar present (BL-CROSS-002) — BSM-013
- [ ] Open first FFC: inventory grid shows SKU, In Stock, Available, Reserved columns; ≥1 product row; edit control available on rows (BL-CAT-007) — BSM-038

## 7. Marketing Admin

- [ ] `{{BACK_URL}}/ui#/marketing` → Promotions: grid renders Name, Store, Priority, Active; ≥1 row or empty-state with Add Promotion button; no Angular error (BL-PROMO-001) — BSM-014
- [ ] Marketing → Coupons: grid renders Code, Usage Count, Max Usage, Promotion, Valid Until; Add Coupon button present (BL-PROMO-001) — BSM-040
- [ ] Marketing → Content Items: blade opens; list renders (may be empty); Add button present; no Angular error — BSM-041
- [ ] Open first promotion → toggle Active state → Save → toast; grid row reflects new state; API `isActive` matches toggled value; `modifiedDate` updated (BL-PROMO-001) — BSM-081

## 8. Platform Health & Store

- [ ] `{{BACK_URL}}/ui#/stores` blade opens; ≥1 store row; Name, URL, Language, Currency columns; store with `{{STORE_ID}}` present (BL-CROSS-011) — BSM-015
- [ ] `GET {{BACK_URL}}/api/search/indexes` + `{{BACK_URL}}/ui#/search-index` blade: Product/Category/Member/CustomerOrder index types present; no error indicators (BL-CROSS-003) — BSM-022
- [ ] `{{BACK_URL}}/hangfire` loads; job stats visible (Enqueued, Scheduled, Succeeded, Failed); Failed < 5; ≥1 server active (BL-CROSS-011) — BSM-023
- [ ] `{{BACK_URL}}/ui#/settings` blade opens; settings sections/tabs visible; Name + Value entries render; Save button present — BSM-024
- [ ] Open first store detail → Settings tab: email settings group (SMTP, sender email, notifications) visible; Save button present — BSM-042
- [ ] Store detail → Tax/Rounding section: rounding method selector visible; currency field present (BL-PRICE-003) — BSM-043

## 9. Platform Admin

- [ ] `{{BACK_URL}}/ui#/security/users` blade opens; Login, Email, Account Type, Status columns; ≥1 row (admin account); New User button present (BL-AUTH-005) — BSM-026
- [ ] `{{BACK_URL}}/ui#/security/roles` blade opens; ≥2 default roles (Administrator etc.); role row clickable to permissions blade; Add Role button present (BL-AUTH-005/006) — BSM-027
- [ ] `{{BACK_URL}}/ui#/dynamicProperties` blade opens; entity types list renders; clicking type opens its properties list blade (BL-CROSS-011) — BSM-028

## 10. CMS Admin

- [ ] `{{BACK_URL}}/ui#/cms` → Pages: grid renders Title, URL, Status; ≥1 page; Add Page + Delete toolbar present (BL-CROSS-011) — BSM-046
- [ ] CMS → Menus: list renders (may be empty); Add Menu button present; clicking entry opens menu detail with menu items — BSM-047

## 11. Notifications Admin

- [ ] `{{BACK_URL}}/ui#/notifications` blade opens; ≥3 built-in template types listed; clicking a template opens detail blade with Subject and Body fields (BL-CROSS-011) — BSM-044
- [ ] Notifications → Notification Log/Send History tab: grid renders Type, Sent Date, Recipient, Status; Retry action available for failed entries — BSM-045

## 12. Assets Admin

- [ ] `{{BACK_URL}}/ui#/assets` blade opens; folder tree visible; Upload/New Folder/Delete toolbar present; root GET returns 200 (no 403) (BL-CROSS-011) — BSM-053
- [ ] Create folder `bsm-smoke-test` → appears in tree; upload 1×1 PNG → file visible in folder listing with name and size; API confirms file at `/bsm-smoke-test/` — BSM-054

## 13. Shipping, White-Labeling, Push, Import-Export, Platform Settings

- [ ] Search Index blade → click Product index row: detail blade opens; Index All/Rebuild button present; last indexed date shown; API `/api/search/indexes/Product` returns `documentType` and `count` — BSM-048
- [ ] Import/Export blade opens (if module present): job type sections visible; Create Export/New Export button present; API `/api/import/runs` returns 200 — BSM-052
- [ ] Store detail → Shipping Methods tab: ≥1 method (e.g. FixedRate); Name, Priority, Is Active columns; Add/Edit controls present; API returns methods array — BSM-055
- [ ] `{{BACK_URL}}/ui#/white-labeling` blade opens: Logo URL, Theme Preset, Primary Color fields visible; Organization Overrides section accessible; Save Changes button present (BL-B2B-006) — BSM-060
- [ ] White Labeling → Organization Overrides section: renders without error; list (may be empty); Add Override button present; API `/api/whitelabeling/organizations` returns 200 — BSM-061
- [ ] Push Messages: `GET /api/push-messages/messages` returns 200 (or 404 → SKIP); if 200, Push Messages/Notifications nav item visible in Admin left nav — BSM-062
- [ ] `GET /api/platform/settings?keyword=lockout`: returns lockout-related settings (MaxFailedAccessAttempts etc.) with name/value/valueType; Admin settings blade security section shows matching entries (BL-AUTH-003) — BSM-068
- [ ] Edit store Description/Display Name to `BSM-Store-{{TIMESTAMP}}` → toast; API `GET /api/stores/{{STORE_ID}}` reflects updated field; `modifiedDate` updated (BL-CROSS-011) — BSM-084

## 14. Edit Workflows

- [ ] Open first product → append `-Edited-{{TIMESTAMP}}` to Name → Save → toast; blade reflects new name; API `name` field updated; `modifiedDate` changed (BL-CAT-005) — BSM-076
- [ ] Open first contact → set phone to `+1-555-{{TIMESTAMP}}` → Save → toast; API `phones[]` contains the new value; `modifiedDate` updated (BL-CROSS-006) — BSM-077
- [ ] Open first org → set Description to `BSM-Org-Desc-{{TIMESTAMP}}` → Save → toast; API `description` reflects new value; `modifiedDate` updated (BL-B2B-001) — BSM-078
- [ ] Open first price list → edit first entry List Price to `9999.00` → save → grid updates; API confirms `list = 9999.00` *(see §5 item 3 — BSM-079)*
- [ ] Open first order → add note `BSM-Note-{{TIMESTAMP}}` → visible in Comments/Notes section with timestamp + author; order status unchanged; API `comment`/notes contains the note (BL-ORD-008) — BSM-080
- [ ] Open first promotion → toggle Active → Save → toast; grid Active column reflects toggle; API `isActive` = toggled value *(see §7 item 4 — BSM-081)*
- [ ] Open first notification template → set Subject to `BSM-Subject-{{TIMESTAMP}}` → Save → toast; API `subject` field reflects new value (BL-NOTIF-002) — BSM-082
- [ ] Open first CMS page → append `BSM-{{TIMESTAMP}}` to content body → Save → toast; API page content contains the marker — BSM-083

## 15. Delete Workflows

- [ ] Create disposable product (SKU `BSM-DEL-{{TIMESTAMP}}`) via API → select row in grid → click Delete → confirmation dialog appears with Confirm + Cancel buttons → Confirm → row gone; API returns 0 results for SKU after 2s (BL-CROSS-007) — BSM-085
- [ ] Create disposable contact via API → search by email → select → Delete → confirmation dialog → Confirm → row gone; API search returns empty results after 2s (BL-CROSS-007) — BSM-086
- [ ] Create price list `BSM-Del-PL-{{TIMESTAMP}}` via API → select in grid → Delete → confirmation dialog → Confirm → row gone; API returns 404 after 2s (BL-PRICE-006) — BSM-087
- [ ] Create folder `bsm-del-{{TIMESTAMP}}` via Assets API → select in tree → Delete → confirmation dialog with irreversibility warning → Confirm → folder absent from tree; API returns empty/404 after 2s (BL-CROSS-007) — BSM-088

## 16. Cross-Blade Navigation

- [ ] Order detail → click customer name link → Contact detail blade opens stacked right; contact name matches order customer; order blade remains left; API contact name matches blade title (BL-CROSS-006) — BSM-089
- [ ] Product detail → click category link → Category detail blade opens stacked right; category name matches product assignment; product blade remains left; blade stack preserved (BL-CAT-002) — BSM-090
- [ ] Order detail → Payments section → click payment row → payment detail opens; method name, status badge, and amount visible; API `inPayments[]` entry matches (BL-ORD-006) — BSM-091
- [ ] Contact detail → click organization name link → Org detail blade opens stacked right; org name matches contact's org field; Members section shows count > 0; contact blade remains left (BL-B2B-001) — BSM-092
- [ ] Org detail → Members/Contacts tab → click first member → Contact detail blade opens stacked right; `organizationId` on contact references parent org; org blade remains left (BL-B2B-001) — BSM-093
- [ ] Product detail → Variations tab → ≥1 variation row → click row → variation detail blade opens with SKU + parent product back-link; `mainProductId` = parent product id; blade stack preserved (BL-CAT-005) — BSM-094

## 17. Search & Filter

- [ ] Products blade search: type first word of known product name → grid filters to matching rows only; search term retained in input; API `totalCount` matches grid count — BSM-095
- [ ] Products blade search by `{{TEST_SKU}}`: ≤2 rows; visible SKU column matches `{{TEST_SKU}}`; API `code` field matches — BSM-096
- [ ] Orders blade search by order number: exactly 1 row matches; Number column = searched value; all others filtered — BSM-097
- [ ] Orders blade filter by Status = "New": all visible rows show "New" badge; active filter indicator present; API search with `statuses: ["New"]` confirms consistency — BSM-098
- [ ] Orders blade date range filter (last 30 days): row count ≤ baseline; all visible orders within range; active filter indicator visible — BSM-099
- [ ] Contacts blade search by name (≥3 chars): grid shows only matching contacts; search term retained; API `totalCount` matches — BSM-100
- [ ] Contacts blade search by `{{TEST_USER_EMAIL}}`: only contacts associated with that email visible; API results match UI — BSM-101
- [ ] Organizations blade search by name (≥3 chars): grid shows only matching orgs; API `totalCount` matches — BSM-102
- [ ] Pricing blade search by price list name: only matching price lists visible; API `keyword` filter returns consistent results — BSM-103
- [ ] Inventory blade search FFC by name: only matching FFC rows visible; API `searchPhrase` filter consistent — BSM-104
- [ ] Promotions blade search by name: only matching promotions visible; API `keyword` filter consistent — BSM-105
- [ ] CMS Pages blade search by title: only matching pages visible; API `keyword` filter consistent — BSM-106
- [ ] Users blade search by `{{ADMIN}}` username: admin user row visible; unrelated users filtered; API `keyword` filter returns admin account (BL-AUTH-005) — BSM-107

## 18. Grid Inline Operations

- [ ] Products grid: check row 1 → highlighted; check row 2 → bulk Delete button activates; selection count "2 selected" shown; no API calls triggered by checkbox selection alone (BL-CROSS-007) — BSM-108
- [ ] Products grid: click Name column header → ascending sort indicator; names alphabetical ascending; click again → descending; API `sort=name:asc` confirms order — BSM-109
- [ ] Orders grid: click Created Date header → ascending (earliest first) → click again → descending (latest first); sort indicator toggles; API `sort=createdDate:asc` first result = earliest date (BL-ORD-005) — BSM-110
- [ ] Products grid with > 20 products: pagination controls visible; navigate to page 2 → different products; navigate back to page 1 → original products; `totalCount` consistent across API page calls (BL-CAT-005) — BSM-111

---

## GO / NO-GO

| Status | Criteria |
|--------|----------|
| **GO** | All 83 cases checked (85 boxes — §14 repeats BSM-079/081 as cross-references) |
| **GO WITH RISK** | ≤3 unchecked in §13 (optional modules — BSM-052, BSM-062 are SKIP-eligible if module not installed), §17–18 (search/grid); all revenue-flow sections §1–12, §14–16 pass; risk noted in run report |
| **NO-GO** | Any item in §1–12 (core blades, CRUD, workflows, navigation) fails; any Critical-priority case fails; any delete workflow lacks confirmation dialog (BL-CROSS-007) |
