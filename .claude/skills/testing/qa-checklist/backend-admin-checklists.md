# Backend & Admin Module Test Case Writing Checklists

> Reference file for `test-management-specialist` agent and `/qa-checklist` skill. Admin SPA and Platform API checklists aligned with **Bundle v14.0.8** (Platform 3.1007.2, 53 modules).
>
> For storefront-facing checklists, see `domain-checklists.md`.

**27 Admin domains + 2 API domains | 255 checklist items** — every checked item should map to at least one test case.

## Summary

| # | Domain | Module(s) | Items | Related Suites |
|---|--------|-----------|-------|----------------|
| A1 | Catalog Admin | VirtoCommerce.Catalog | 12 | 16 |
| A2 | Pricing Admin | VirtoCommerce.Pricing | 10 | 19 |
| A3 | Inventory Admin | VirtoCommerce.Inventory | 9 | 22 |
| A4 | Orders Admin | VirtoCommerce.Orders | 10 | 20 |
| A5 | Customer Admin | VirtoCommerce.Customer | 10 | 21 |
| A6 | Marketing Admin | VirtoCommerce.Marketing | 10 | 23 |
| A7 | Store Admin | VirtoCommerce.Store | 9 | 18 |
| A8 | Notifications Admin | VirtoCommerce.Notifications | 9 | 24 |
| A9 | Content & Pages (CMS) | VirtoCommerce.Content, Pages, PageBuilderModule | 10 | 25 |
| A10 | Search & Indexing | VirtoCommerce.Search, ElasticSearch8 | 9 | 26 |
| A11 | Assets Admin | VirtoCommerce.Assets, AzureBlobAssets, FileSystemAssets | 8 | 27 |
| A12 | Core Settings | VirtoCommerce.Core | 9 | 28 |
| A13 | Platform Security & Users | VirtoCommerce.Core (Security) | 10 | 17 |
| A14 | CSV Import/Export | VirtoCommerce.CatalogCsvImportModule, Export | 10 | 29 |
| A15 | Shipping Admin | VirtoCommerce.Shipping | 8 | 30 |
| A16 | SEO & Sitemaps | VirtoCommerce.Seo, Sitemaps | 9 | 31 |
| A17 | Image Tools | VirtoCommerce.ImageTools | 8 | 34 |
| A18 | Tax | VirtoCommerce.Tax, AvalaraTax | 7 | — |
| A19 | Subscriptions | VirtoCommerce.Subscription | 8 | — |
| A20 | WebHooks | VirtoCommerce.WebHooks | 7 | — |
| A21 | Customer Reviews | VirtoCommerce.CustomerReviews | 7 | — |
| A22 | Dynamic Associations | VirtoCommerce.DynamicAssociationsModule | 6 | — |
| A23 | Bulk Actions | VirtoCommerce.BulkActionsModule | 6 | — |
| A24 | GDPR | VirtoCommerce.GDPR | 5 | — |
| A25 | Catalog Personalization | VirtoCommerce.CatalogPersonalization | 5 | — |
| A26 | Catalog Publishing (Channels) | VirtoCommerce.CatalogPublishing | 5 | 40 |
| A27 | Payment Admin | VirtoCommerce.Payment, AuthorizeNetPayment | 6 | — |
| **API1** | **Platform REST API** | **Platform** | **10** | **14** |
| **API2** | **GraphQL xAPI** | **Xapi, XCart, XCatalog, XCMS, XOrder, XFrontend** | **12** | **15** |

---

## A1. Catalog Admin
**Module:** `VirtoCommerce.Catalog` (v3.1002.1)
- [ ] Create catalog: name (required), languages, save → appears in catalog list
- [ ] Create category: name, parent category, SEO, properties → appears in catalog tree
- [ ] Create product: fill required fields (name, SKU), assign to category, save
- [ ] Edit product: update name, description, properties, images → changes persist after refresh
- [ ] Product properties widget: view/add/edit properties, property attributes (KeyProperty), dynamic properties
- [ ] Product images: upload, reorder, set main image, delete, multiple image groups
- [ ] Product variations: create variation based on properties (color, size), variation pricing/images
- [ ] Product availability switches: Visible, Can be purchased, Track inventory — toggle and verify storefront behavior
- [ ] Category/product delete: remove with confirmation, cascading behavior for child items
- [ ] Catalog search: search products by name/SKU in Admin, filter by category
- [ ] Virtual catalog: create virtual catalog with linked categories from physical catalogs
- [ ] Bulk product update: select multiple products, bulk edit properties/categories via Bulk Actions

## A2. Pricing Admin
**Module:** `VirtoCommerce.Pricing` (v3.1000.0)
- [ ] Create price list: name (required), currency, description → appears in price lists grid
- [ ] Add product prices: assign product to price list, set list price and sale price
- [ ] Tier pricing: configure quantity-based price tiers (qty 1→$10, qty 10→$8, qty 100→$6)
- [ ] Price list assignment: assign price list to store, catalog, or customer segment with priority
- [ ] Edit prices: modify existing prices, save → verify changes in storefront via price evaluation
- [ ] Delete price list: remove price list → confirmation → verify products revert to other available pricing
- [ ] Price calendar: start/end dates on price list assignments, time-bound pricing
- [ ] Price list search and filter: search by name, filter by currency, store
- [ ] Price export: export price list data for external use
- [ ] Price evaluation troubleshooting: Admin pricing debug tool to trace which price list applies for a product/customer

## A3. Inventory Admin
**Module:** `VirtoCommerce.Inventory` (v3.1000.0)
- [ ] View fulfillment centers list: grid with Refresh, Add, Search, table of FFCs
- [ ] Add fulfillment center: name (required), location, outer ID, description, address widget → save
- [ ] Edit fulfillment center: update name, address, description → changes persist
- [ ] Delete fulfillment center: remove FFC → confirmation → removed from grid
- [ ] Product inventory: set stock quantity per product per fulfillment center
- [ ] Stock adjustment: increase/decrease stock quantity, verify `InStockQuantity` updates
- [ ] Preorder/backorder flags: toggle `AllowPreorder` and `AllowBackorder` per product per FFC
- [ ] Inventory search: find products by SKU in inventory module
- [ ] Multi-FFC product: same product with different stock levels across multiple fulfillment centers

## A4. Orders Admin
**Module:** `VirtoCommerce.Orders` (v3.1000.0)
- [ ] Create order: new order with customer, store, line items → appears in orders grid
- [ ] View order details: blade shows items, quantities, prices, addresses, payment, shipment, status
- [ ] Edit order: modify items, quantities, addresses → save persists changes
- [ ] Order status workflow: New → Processing → Shipped → Completed (or Cancelled), status transitions via dropdown
- [ ] Order payment: view payment details, capture/void/refund payment from order blade
- [ ] Order shipment: create shipment, assign tracking number, update shipment status
- [ ] Order search and filter: search by order number, filter by status, date range, customer
- [ ] Order grid: columns (Order #, Customer, Status, Total, Date), pagination, sorting
- [ ] Delete order: remove order → confirmation → removed from grid (if permitted by status)
- [ ] Order change log: view audit trail of status changes, edits, and who made them

## A5. Customer Admin
**Module:** `VirtoCommerce.Customer` (v3.1000.1)
- [ ] Add organization: name (required), user group, business category, description → Create
- [ ] Add contact: first/last name, email, assign to organization → appears in contacts list
- [ ] Edit contact: update name, email, phone, addresses → save persists
- [ ] Assign roles: assign security roles to contact (Organization maintainer, Purchasing agent, etc.)
- [ ] Block/unblock contact: block user → cannot sign in; unblock → access restored
- [ ] Organization hierarchy: parent/child organizations, member assignment scoping
- [ ] Contact search and filter: search by name/email, filter by organization, role, status
- [ ] Delete contact/organization: remove with confirmation, handle cascading references
- [ ] Customer segments: create/manage segments for targeted pricing, promotions
- [ ] Dynamic properties: add custom properties to contacts/organizations, manage values

## A6. Marketing Admin
**Module:** `VirtoCommerce.Marketing` (v3.1000.0)
- [ ] Content items: create dynamic content item (name, type, HTML body) → appears in list
- [ ] Edit content item: update name, description, type, HTML → save persists
- [ ] Delete content item: remove → confirmation → removed from list
- [ ] Content places: create content placement (name, description) for storefront content zones
- [ ] Content publishing: create publication linking content item to content place with conditions
- [ ] Promotions: create promotion with name, conditions (cart total, product category), rewards (discount %, fixed amount, free item)
- [ ] Coupon management: generate coupons for promotion, set max usage count per coupon and per customer
- [ ] Promotion priority: set priority to control evaluation order when multiple promotions match
- [ ] Enable/disable promotion: toggle active state, disabled promotions excluded from evaluation
- [ ] Marketing search: search promotions and content items by name, filter by type/status

## A7. Store Admin
**Module:** `VirtoCommerce.Store` (v3.1000.0)
- [ ] View store details: blade opens with Settings, Aggregation properties, Assets, SEO widgets
- [ ] Add store: store code (unique), name, catalog assignment, default language and currency → Create
- [ ] Edit store settings: update name, languages, currencies, URLs, operational timezone
- [ ] Store payment methods: activate/deactivate payment methods, configure gateway settings
- [ ] Store shipping methods: activate/deactivate shipping methods, configure rates
- [ ] Store tax providers: assign tax provider (Avalara, fixed rate), configure tax settings
- [ ] Store SEO: configure store-level SEO defaults (meta title, description, slug format)
- [ ] Store features: enable/disable storefront features (quotes, wishlists, bulk order, etc.)
- [ ] Aggregation properties: configure which properties appear as facets in storefront filtering

## A8. Notifications Admin
**Module:** `VirtoCommerce.Notifications` (v3.1001.0)
- [ ] Notification templates list: browse all notification types (order confirmation, registration, password reset, etc.)
- [ ] Edit template: modify email subject, body, HTML template with personalization tokens
- [ ] Template preview: preview rendered email with sample data, verify tokens resolved
- [ ] Enable/disable notification: toggle per event type, disabled notifications not sent
- [ ] Notification activity feed: view sent/pending/failed status per notification instance
- [ ] Failed notification details: view error message, retry failed notification
- [ ] Notification layout: configure shared email layout (header, footer, logo) across all templates
- [ ] Multi-language templates: configure template content per language/locale
- [ ] Test send: send test notification to specific email address for template verification

## A9. Content & Pages (CMS)
**Modules:** `VirtoCommerce.Content` (v3.1000.0), `VirtoCommerce.Pages` (v3.1001.0), `VirtoCommerce.PageBuilderModule` (v3.1000.0)
- [ ] Create page: name, permalink, language, save → appears in pages list with Draft status
- [ ] Edit page: modify name, permalink, content → save persists changes
- [ ] Page Builder editor: visual drag-and-drop editor, add/remove/reorder content blocks
- [ ] Page publishing workflow: Draft → Published → Archived, publish makes page visible on storefront
- [ ] Page preview: preview page as it will appear on storefront before publishing
- [ ] Page SEO: set meta title, description, og:image per page
- [ ] Content themes/menus: manage storefront menus, link structure, footer content
- [ ] Blog/content pages: create blog posts or static content pages (about, contact, FAQ)
- [ ] Page delete: remove page → confirmation → no longer accessible on storefront
- [ ] Multi-language pages: create page versions per language, language fallback behavior

## A10. Search & Indexing
**Modules:** `VirtoCommerce.Search` (v3.1000.0), `VirtoCommerce.ElasticSearch8` (v3.1000.0)
- [ ] Search by full product name: Admin search returns matching product
- [ ] Search by partial input: first 3+ characters return relevant results
- [ ] Search by SKU: exact SKU match returns the correct product
- [ ] Search by keyword across entities: products, categories, orders, customers searchable
- [ ] Index rebuild: trigger full index rebuild from Admin → completes without errors
- [ ] Index status: view indexing status, last rebuild timestamp, document count
- [ ] Search providers: verify configured provider (Elastic/Lucene/Azure) is active and healthy
- [ ] Faceted search configuration: aggregation properties indexed correctly for storefront facets
- [ ] Search performance: Admin search responds within acceptable time under normal catalog size

## A11. Assets Admin
**Modules:** `VirtoCommerce.Assets` (v3.1001.0), `VirtoCommerce.AzureBlobAssets` (v3.1000.0), `VirtoCommerce.FileSystemAssets` (v3.1000.0)
- [ ] Create folder: add new folder in assets root or nested → appears in tree
- [ ] Delete folder: right-click → Delete → confirmation → folder removed
- [ ] Upload file: upload image/document → appears in folder, correct URL generated
- [ ] File preview: click file → preview blade shows image or file details
- [ ] Rename asset: rename file or folder → updated in tree
- [ ] Move asset: drag or cut/paste file between folders
- [ ] Asset URL: uploaded assets accessible via public URL (blob storage or filesystem)
- [ ] Search assets: search files by name within assets module

## A12. Core Settings
**Module:** `VirtoCommerce.Core` (v3.1001.2)
- [ ] Mass units: add/edit/delete mass unit values (kg, lb, oz, etc.)
- [ ] Package types: add/edit/delete package types for shipping calculations
- [ ] Measurement units: add/edit/delete measurement units (cm, in, m, etc.)
- [ ] Currencies: add/edit currencies, set exchange rates, default currency per store
- [ ] Languages: configure available languages, default language
- [ ] Dynamic properties: register dynamic property types for entities (Product, Contact, Order, etc.)
- [ ] Dynamic property values: set/edit dynamic property values on entities, dictionary lookups
- [ ] Platform settings: module-level settings (pagination defaults, cache TTL, feature flags)
- [ ] Settings search: find specific setting by name across all modules

## A13. Platform Security & Users
**Module:** Platform Core (v3.1007.2)
- [ ] Add user: username, email, password, account type (Manager/Administrator) → save
- [ ] Edit user: update profile, email, account type → changes persist
- [ ] Delete user: remove user → confirmation → removed from user list
- [ ] User roles: assign/remove security roles, custom role creation with specific permissions
- [ ] Role permissions: granular permission assignment (catalog:read, orders:manage, pricing:update, etc.)
- [ ] User lockout: lock/unlock user account, lockout after failed login attempts
- [ ] Password policy: enforce password complexity, expiration, history rules
- [ ] API accounts: create API-only accounts for integrations (OAuth2 client credentials)
- [ ] User search: search by name/email, filter by role, account type, status
- [ ] Audit log: view user activity log (login events, entity changes, permission changes)

## A14. CSV Import/Export
**Modules:** `VirtoCommerce.CatalogCsvImportModule` (v3.1000.0), `VirtoCommerce.Export` (v3.1000.0)
- [ ] Import catalog data: upload CSV with categories and products → data imported correctly
- [ ] Import new products: CSV with new items → products created in catalog matching CSV
- [ ] Import update existing: CSV updates existing products (prices, descriptions, properties) → changes applied
- [ ] Import validation: invalid CSV (missing required fields, bad format) → error report with row-level details
- [ ] Import column mapping: map CSV columns to catalog fields, save mapping profile for reuse
- [ ] Export catalog: select catalog/category → export to CSV → file downloads with correct data
- [ ] Export price lists: export price list data to CSV with product codes, prices, tiers
- [ ] Export orders: export order data with filters (date range, status) → CSV with order details
- [ ] Generic export: use Export module for any entity type (contacts, inventory, etc.)
- [ ] Import/export progress: progress bar during long operations, cancel option, completion notification

## A15. Shipping Admin
**Module:** `VirtoCommerce.Shipping` (v3.1000.0)
- [ ] Activate shipping method: select method → activate → available for checkout
- [ ] Deactivate shipping method: deactivate → not available for checkout
- [ ] Configure shipping rates: fixed rate, weight-based, or external provider (FedEx, UPS, etc.)
- [ ] Shipping method per store: assign shipping methods to specific stores
- [ ] Shipping restrictions: configure country/region restrictions per shipping method
- [ ] Free shipping threshold: configure minimum order amount for free shipping
- [ ] Shipping method priority: set display order for shipping methods at checkout
- [ ] Shipping method test: verify calculated rate matches expected amount for given weight/destination

## A16. SEO & Sitemaps
**Modules:** `VirtoCommerce.Seo` (v3.1000.0), `VirtoCommerce.Sitemaps` (v3.1000.0)
- [ ] Product SEO: edit meta title, meta description, URL slug per product
- [ ] Category SEO: edit meta title, meta description, URL slug per category
- [ ] SEO duplicates detection: identify duplicate slugs across products/categories
- [ ] Sitemap generation: generate XML sitemap for store → valid XML with correct URLs
- [ ] Sitemap configuration: include/exclude entity types (products, categories, pages), set change frequency
- [ ] Sitemap download: download generated sitemap file, verify structure
- [ ] SEO-friendly URLs: verify product/category slugs resolve correctly on storefront
- [ ] Canonical URLs: verify canonical link elements are generated correctly
- [ ] Sitemap auto-update: sitemap regenerated after catalog changes (new products, deleted categories)

## A17. Image Tools
**Module:** `VirtoCommerce.ImageTools` (v3.1000.0)
- [ ] Add thumbnail task: create task with name, image resize settings (width, height, method)
- [ ] Run thumbnail task: execute task → thumbnails generated for catalog images
- [ ] Task status: view progress during execution, completion status
- [ ] Thumbnail settings: configure resize method (crop, fit, pad), quality, output format
- [ ] Multiple tasks: create separate tasks for different thumbnail sizes (small, medium, large)
- [ ] Task edit: modify task settings (resize dimensions, quality) → save
- [ ] Task delete: remove task → confirmation → removed from list
- [ ] Generated thumbnails: verify generated thumbnails accessible via URL, correct dimensions

## A18. Tax
**Modules:** `VirtoCommerce.Tax` (v3.1000.0), `VirtoCommerce.AvalaraTax` (v3.1000.0)
- [ ] Tax provider list: view available tax providers in Admin
- [ ] Activate tax provider: assign tax provider to store (Avalara, fixed rate, manual)
- [ ] Fixed tax rate: configure fixed tax rate per jurisdiction/region
- [ ] Tax categories: assign tax categories to products for correct rate calculation
- [ ] Avalara integration: configure Avalara API credentials, test connection
- [ ] Tax calculation verification: place test order → tax amount matches expected rate × subtotal
- [ ] Tax exemption: configure tax-exempt status for specific customers/organizations

## A19. Subscriptions
**Module:** `VirtoCommerce.Subscription` (v3.1000.0)
- [ ] Create subscription plan: define name, interval (daily/weekly/monthly), trial period, pricing
- [ ] View subscriptions list: grid with subscription ID, customer, status, next billing date
- [ ] Subscription status workflow: Active → Paused → Cancelled → Expired
- [ ] Subscription renewal: verify automatic renewal triggers at end of billing period
- [ ] Cancel subscription: cancel → status updated, no further billing
- [ ] Subscription product: assign subscription plan to product in catalog
- [ ] Subscription orders: view child orders generated by subscription renewals
- [ ] Subscription search: search by customer, status, plan name

## A20. WebHooks
**Module:** `VirtoCommerce.WebHooks` (v3.1000.0)
- [ ] Create webhook: define name, target URL, event types (order.created, product.updated, etc.)
- [ ] Edit webhook: update URL, event types, active state → save
- [ ] Delete webhook: remove → confirmation → no longer fires
- [ ] Webhook test: trigger test delivery → verify target receives payload
- [ ] Webhook history: view delivery history (success/failure, response code, timestamp)
- [ ] Retry failed webhook: re-send failed delivery, verify receipt
- [ ] Webhook filtering: configure event filtering (specific store, catalog, order status)

## A21. Customer Reviews
**Module:** `VirtoCommerce.CustomerReviews` (v3.1000.0)
- [ ] View reviews list: grid of submitted reviews with product, customer, rating, status
- [ ] Review moderation: approve/reject pending reviews, rejected reviews not shown on storefront
- [ ] Review details: view full review text, rating, customer info, submission date
- [ ] Delete review: remove review → no longer displayed on PDP
- [ ] Review settings: configure review moderation (auto-approve or manual), rating scale
- [ ] Review search: filter reviews by product, customer, rating, status
- [ ] Review statistics: average rating, review count per product updated after moderation

## A22. Dynamic Associations
**Module:** `VirtoCommerce.DynamicAssociationsModule` (v3.1000.0)
- [ ] Create association rule: define name, type (related/upsell/cross-sell), conditions
- [ ] Association conditions: product in category, product property match, price range, etc.
- [ ] Association preview: verify associated products returned for a given product
- [ ] Edit association: modify conditions, priority → changes reflected in storefront
- [ ] Delete association: remove rule → associated products no longer shown
- [ ] Association priority: set priority when multiple rules match same product

## A23. Bulk Actions
**Module:** `VirtoCommerce.BulkActionsModule` (v3.1000.0)
- [ ] Bulk product update: select multiple products → bulk edit category, properties, availability
- [ ] Bulk price update: select products → apply price change (fixed amount, percentage)
- [ ] Bulk delete: select multiple items → delete with confirmation
- [ ] Bulk action progress: progress bar during execution, cancel option
- [ ] Bulk action result: completion report showing success/failure count per item
- [ ] Bulk category assignment: move/assign multiple products to new category

## A24. GDPR
**Module:** `VirtoCommerce.GDPR` (v3.1000.0)
- [ ] Data export request: export all personal data for a specific customer (GDPR Article 15)
- [ ] Data anonymization: anonymize customer PII (name, email, addresses) upon request
- [ ] Right to be forgotten: delete customer data with cascading cleanup
- [ ] GDPR audit log: log all data access, export, and deletion requests
- [ ] Cookie consent: verify storefront cookie consent mechanism (if managed via platform)

## A25. Catalog Personalization
**Module:** `VirtoCommerce.CatalogPersonalization` (v3.1000.0)
- [ ] Personalization rules: create rules to show/hide products for specific customer segments
- [ ] Tagged products: assign personalization tags to products for segment targeting
- [ ] Segment-based catalog: verify customer segment sees only personalized product set
- [ ] Rule priority: multiple rules resolved by priority when conflicting
- [ ] Personalization disable: deactivate rule → all customers see full catalog

## A26. Catalog Publishing (Channels)
**Module:** `VirtoCommerce.CatalogPublishing` (v3.1000.0)
> See also domain checklist #32 (Channels & Data Quality) in `domain-checklists.md`
- [ ] Channel completeness: product data completeness percentage calculated per evaluator type
- [ ] Evaluator configuration: select which fields contribute to completeness score
- [ ] Channel export: export completeness report for external review
- [ ] Completeness threshold: filter products below a minimum completeness percentage
- [ ] Channel refresh: recalculate completeness after product data updates

## A27. Payment Admin
**Modules:** `VirtoCommerce.Payment` (v3.1000.0), `VirtoCommerce.AuthorizeNetPayment` (v3.1000.0)
- [ ] Payment methods list: view all registered payment methods with status
- [ ] Activate/deactivate payment method: toggle per store
- [ ] Payment gateway configuration: configure API keys, merchant ID, sandbox/production mode
- [ ] Payment capture: capture authorized payment from order blade
- [ ] Payment refund: process full or partial refund from order
- [ ] Payment method test: verify gateway connection with test transaction

---

## API1. Platform REST API
**Suite:** 14 | **Endpoint:** `{{BACK_URL}}/api/*`
- [ ] Authentication: obtain Bearer token via OAuth2 password grant or client credentials
- [ ] Catalog API: GET/POST/PUT/DELETE products, categories, catalogs — correct response structures
- [ ] Pricing API: POST `/api/pricing/evaluate` returns correct prices for product IDs with tier pricing
- [ ] Inventory API: GET availability, POST reserve/release stock — quantities update correctly
- [ ] Orders API: GET/POST/PUT orders — CRUD operations, status transitions via API
- [ ] Customer API: GET/POST/PUT contacts, organizations — CRUD operations
- [ ] Search API: POST `/api/catalog/search/products` with keyword, filters, pagination
- [ ] Error handling: 401 Unauthorized (missing token), 403 Forbidden (insufficient role), 404 Not Found (invalid ID), 400 Bad Request (invalid payload)
- [ ] Pagination: `skip`/`take` parameters work correctly, `totalCount` matches expected
- [ ] API response time: critical endpoints respond within 1000ms under normal load

## API2. GraphQL xAPI
**Suite:** 15 | **Modules:** `VirtoCommerce.Xapi` (v3.1003.0), `XCart`, `XCatalog` (v3.1000.1), `XCMS`, `XOrder`, `XFrontend`
- [ ] xCatalog — products query: `products(storeId, keyword, filter, sort, first, after)` returns correct results with pagination
- [ ] xCatalog — product query: `product(id, storeId)` returns full product detail (images, prices, properties, availability)
- [ ] xCatalog — facets: `products` query with `facet` parameter returns aggregated filter counts
- [ ] xCart — cart mutations: `addItem`, `changeCartItemQuantity`, `removeCartItem` — cart state updates correctly
- [ ] xCart — cart query: `cart(storeId, userId, currencyCode)` returns full cart with items, totals, discounts
- [ ] xCart — checkout: `addOrUpdateCartShipment`, `addOrUpdateCartPayment`, `createOrderFromCart` — full checkout flow
- [ ] xOrder — orders query: `orders(filter, sort, first)` returns order history with correct data
- [ ] xCMS — pages query: content pages accessible via GraphQL
- [ ] Introspection: `__schema` query works, field names and types match documentation
- [ ] Error handling: invalid queries return structured errors with `message` and `path`
- [ ] Authorization: queries respect user permissions — anonymous vs authenticated vs admin scopes
- [ ] FileExperienceApi: file upload/download via GraphQL (`VirtoCommerce.FileExperienceApi`)
