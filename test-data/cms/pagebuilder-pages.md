# PageBuilder Test Pages — Test Data

**Module:** CMS (PageBuilder)
**Suites:** 059-cms-page-management, 060-cms-design-content
**Date:** 2026-03-26
**Prerequisites:** Admin logged in; CMS module installed; PageBuilder shell accessible at `${BACK_URL}/apps/page-builder-shell/?storeId=B2B-store`

---

## Available Blocks (Designer Library)

16 block types available in the PageBuilder designer. Each block has **Content** and **Settings** tabs in the "Edit current section" panel. Click a block in the library (+ icon) to add it; click an existing block on the canvas to edit it.

**How agents interact with blocks:**
1. Click **Add block** (left panel) → click block name in library → block appears on canvas
2. Click the block on canvas → "Edit current section" panel opens on the left
3. Switch between **Content** tab (block-specific fields) and **Settings** tab (common: spacing, visibility, CSS)
4. Fill in fields as specified below → changes auto-save or click **Save** in top bar

---

### Content Blocks

#### 1. Title
| Field | Type | Description |
|-------|------|-------------|
| Title | Text input | Heading text displayed on the page |

#### 2. Text
| Field | Type | Description |
|-------|------|-------------|
| Description | Rich text editor | HTML content with formatting toolbar (bold, italic, lists, links, headings) |

---

### Media Blocks

#### 3. Image
| Field | Type | Description |
|-------|------|-------------|
| Image | File upload / URL | Image source (upload or paste URL) |
| Alt text | Text input | Accessibility alt attribute |

#### 4. Slider
| Field | Type | Description |
|-------|------|-------------|
| Slides | Repeater (+ Add item) | Each slide has: **Image** (file upload/URL), **Title** (text), **Link** (URL) |

---

### Conversion Blocks

#### 5. Call to Action
| Field | Type | Description |
|-------|------|-------------|
| Title | Text input | Heading above the button |
| Subtitle | Text input | Descriptive text below heading |
| Button text | Text input | Label on the CTA button |
| Button link | URL input | Navigation target when button clicked |

#### 6. Call to Action with Image
| Field | Type | Description |
|-------|------|-------------|
| Title | Text input | Heading text |
| Subtitle | Text input | Descriptive text |
| Button text | Text input | CTA button label |
| Button link | URL input | Navigation target |
| Image | File upload / URL | Image displayed alongside the CTA |

---

### Catalog Blocks

#### 7. Category
| Field | Type | Description |
|-------|------|-------------|
| Title | Text input | Section heading |
| Subtitle | Text input | Section description |
| Card type | Dropdown (`Full` / `Short`) | Card layout style |
| Category count | Number | How many categories to display |

#### 8. Products
| Field | Type | Description |
|-------|------|-------------|
| Title | Text input | Section heading |
| Subtitle | Text input | Section description |
| Card type | Dropdown (`Full` / `Short`) | Product card layout style |
| Products count | Number | Number of products to display in grid |
| Columns count | Number | Grid columns (e.g., 4) |
| SKUs | Repeater (+ Add item) | Hand-pick specific products by SKU |
| Keyword | Text input | Search products by keyword filter |

#### 9. Products carousel
| Field | Type | Description |
|-------|------|-------------|
| Title | Text input | Section heading (e.g., "Top 4 products") |
| Subtitle | Text input | Section description (e.g., "Customers favorits") |
| Card type | Dropdown (`Full` / `Short`) | Product card layout style |
| Products count | Number | Total products to load in carousel |
| Slides per view | Number | Products visible at once on desktop |
| SKUs | Repeater (+ Add item) | Hand-pick specific products by SKU |
| Keyword | Text input | Search products by keyword filter |

#### 10. Predefined products
| Field | Type | Description |
|-------|------|-------------|
| Title | Text input | Section heading |
| Subtitle | Text input | Section description |
| Card type | Dropdown (`Full` / `Short`) | Product card layout style |
| SKUs | Repeater (+ Add item) | **Required** — specific product SKUs to display |

#### 11. FavoriteProducts
| Field | Type | Description |
|-------|------|-------------|
| Title | Text input | Section heading |
| Subtitle | Text input | Section description |
| Card type | Dropdown (`Full` / `Short`) | Product card layout style |
| Products count | Number | Max products to show from user's wishlist |

---

### Layout Blocks

#### 12. Features
| Field | Type | Description |
|-------|------|-------------|
| Title | Text input | Section heading |
| Subtitle | Text input | Section description |
| Features | Repeater (+ Add item) | Each feature has: **Icon** (file upload/URL), **Title** (text), **Description** (text) |

---

### Form Blocks

#### 13. Subscribe form
| Field | Type | Description |
|-------|------|-------------|
| Title | Text input | Form heading (e.g., "Stay in the Loop") |
| Subtitle | Text input | Form description |

#### 14. Login
| Field | Type | Description |
|-------|------|-------------|
| *(no configurable content fields)* | — | Renders the standard login form. Configuration via Settings tab only (spacing, visibility). |

---

### Common Settings Tab (all blocks)

Every block has a **Settings** tab with shared options:

| Field | Type | Description |
|-------|------|-------------|
| Padding | Spacing controls | Top/right/bottom/left padding |
| Margin | Spacing controls | Top/right/bottom/left margin |
| Background color | Color picker | Block background |
| Visibility | Toggle | Show/hide block |
| CSS class | Text input | Custom CSS class name |

---

## Page Definitions

### PAGE-1: Homepage / Landing Page

| Field | Value |
|-------|-------|
| **Name** | `QA Homepage Spring Sale` |
| **Permalink** | `/qa-homepage-spring-sale` |
| **Language** | English |
| **Status** | Draft → Publish immediately |
| **Scheduling** | StartDate: current date, EndDate: +30 days |
| **Personalization** | Visible to all (no restrictions) |
| **Test Purpose** | Full-width promotional landing page. Tests slider, catalog blocks, CTA, and newsletter. Covers page creation (CMS-001), publish (CMS-006), storefront rendering (CMS-027), search suggestions dropdown (CMS-031). |

**Block Structure:**

| # | Block Type | Field Values |
|---|-----------|-------------|
| 1 | **Slider** | Slides (+ Add item × 3): Slide 1 — Title: `Spring Sale — Up to 30% Off`, Image: upload any banner, Link: `/`. Slide 2 — Title: `New Electronics Arrivals`, Link: `/Alcoholic-Drinks`. Slide 3 — Title: `Free Shipping on Orders $99+`, Link: `/Accessories`. |
| 2 | **Category** | Title: `Shop by Category`. Subtitle: *(empty)*. Card type: `Full`. Category count: `6`. |
| 3 | **Title** | Title: `Trending Now` |
| 4 | **Products carousel** | Title: `Trending Now`. Subtitle: `Most popular this week`. Card type: `Full`. Products count: `8`. Slides per view: `4`. SKUs: *(empty — auto-populated)*. Keyword: *(empty)*. |
| 5 | **Call to Action** | Title: `Shop the Spring Sale`. Subtitle: `Save up to 30% on selected items`. Button text: `Browse Deals`. Button link: `/search?q=sale`. |
| 6 | **FavoriteProducts** | Title: `Your Favorites`. Subtitle: *(empty)*. Card type: `Full`. Products count: `4`. *(Shows empty state for anonymous users; requires logged-in user with favorites.)* |
| 7 | **Subscribe form** | Title: `Stay in the Loop`. Subtitle: `Get the latest deals delivered to your inbox`. |

**Storefront Verification:**
- URL: `${FRONT_URL}/qa-homepage-spring-sale`
- All 7 blocks render in correct order
- Slider shows 3 slides with navigation arrows
- Products carousel shows 4 cards per view, scrolls horizontally
- Category block shows 6 category tiles with links
- CTA button navigates to search page
- Subscribe form displays email input and submit button

---

### PAGE-2: B2B Buyer Guide (Gated Content)

| Field | Value |
|-------|-------|
| **Name** | `QA Wholesale Buyer Guide 2026` |
| **Permalink** | `/qa-wholesale-buyer-guide` |
| **Language** | English |
| **Status** | Draft → Publish |
| **Scheduling** | No date restrictions (StartDate: empty, EndDate: empty) |
| **Personalization** | Visibility: ON, User Groups: `B2B Wholesale` |
| **Test Purpose** | Long-form informational page with user group restriction. Tests personalization gating (CMS-024, CMS-025), rich text rendering, image blocks, feature layout. Verifies anonymous users get 404. |

**Block Structure:**

| # | Block Type | Field Values |
|---|-----------|-------------|
| 1 | **Title** | Title: `Wholesale Buyer Guide 2026` |
| 2 | **Text** | Description: (rich text editor) `<h2>Welcome</h2><p>Welcome to the Virto Commerce wholesale program. This guide covers ordering processes, pricing tiers, payment terms, and fulfillment options available exclusively to our wholesale partners.</p><ul><li>Volume-based pricing tiers</li><li>Net 30/60/90 payment terms</li><li>Dedicated account management</li><li>Priority fulfillment</li></ul>` |
| 3 | **Image** | Image: upload any image from `test-data/uploads/` (e.g., PNG/JPG). Alt text: `Wholesale ordering process overview`. |
| 4 | **Features** | Title: `Why Go Wholesale?`. Subtitle: *(empty)*. Features (+ Add item × 4): (1) Title: `Bulk Pricing`, Description: `Volume discounts starting at 10 units`, Icon: upload any icon. (2) Title: `Net 30 Terms`, Description: `Flexible payment for qualified accounts`, Icon: upload. (3) Title: `Dedicated Rep`, Description: `Personal account manager for your business`, Icon: upload. (4) Title: `Priority Shipping`, Description: `Expedited fulfillment for wholesale orders`, Icon: upload. |
| 5 | **Predefined products** | Title: `Recommended Starter Kits`. Subtitle: *(empty)*. Card type: `Full`. SKUs (+ Add item × 3): add any 3 product SKUs from the catalog. |
| 6 | **Call to Action with Image** | Title: `Ready to Get Started?`. Subtitle: `Contact your account manager today`. Button text: `Contact Us`. Button link: `/contact`. Image: upload any image. |

**Access Control Matrix:**

| User Type | Expected | HTTP |
|-----------|----------|------|
| Anonymous (not logged in) | 404 / not-found page | 404 |
| Personal account (no org) | 404 / not-found page | 404 |
| B2B org member (NOT in Wholesale group) | 404 / not-found page | 404 |
| B2B Wholesale group member | Page renders, all 6 blocks visible | 200 |

---

### PAGE-3: Multi-Language Policy Page

| Field | Value |
|-------|-------|
| **Name (EN)** | `QA Return Policy` |
| **Name (DE)** | `QA Rückgaberichtlinie` |
| **Permalink** | `/qa-return-policy` |
| **Language** | English + German (two language versions) |
| **Status** | Draft → Publish (both languages) |
| **Scheduling** | No date restrictions |
| **Personalization** | Visible to all (no restrictions) |
| **Test Purpose** | Multi-language page. Tests language isolation in search suggestions dropdown (CMS-035), correct language prefix routing (CMS-027), wrong-language 404 (CMS-028), and consistent block structure across languages. |

**Block Structure (English version):**

| # | Block Type | Field Values (EN) |
|---|-----------|-------------------|
| 1 | **Title** | Title: `Return & Refund Policy` |
| 2 | **Text** | Description: `At Coffee Shop, we want you to be completely satisfied with your purchase. If you are not happy with your order, you may return eligible items within 30 days of delivery for a full refund or exchange.` |
| 3 | **Text** | Description: (rich text) `<h3>Eligibility</h3><ul><li>Items must be unused and in original packaging</li><li>Electronics must include all accessories</li><li>Perishable goods are non-returnable</li><li>Custom/personalized items are final sale</li></ul>` |
| 4 | **Text** | Description: (rich text) `<h3>How to Return</h3><ol><li>Log in to your account</li><li>Navigate to Orders</li><li>Select the order and click Return</li><li>Choose items and reason</li><li>Print the prepaid shipping label</li><li>Ship within 7 business days</li></ol>` |
| 5 | **Image** | Image: upload any image from `test-data/uploads/`. Alt text: `Sample return shipping label`. |
| 6 | **Call to Action** | Title: *(empty)*. Subtitle: *(empty)*. Button text: `Start a Return`. Button link: `/account/orders`. |

**Block Structure (German version):**

| # | Block Type | Field Values (DE) |
|---|-----------|-------------------|
| 1 | **Title** | Title: `Rückgabe- & Erstattungsrichtlinie` |
| 2 | **Text** | Description: `Bei Coffee Shop möchten wir, dass Sie mit Ihrem Einkauf vollkommen zufrieden sind. Wenn Sie mit Ihrer Bestellung nicht zufrieden sind, können Sie berechtigte Artikel innerhalb von 30 Tagen nach Lieferung zurückgeben.` |
| 3 | **Text** | Description: (rich text) `<h3>Voraussetzungen</h3><ul><li>Artikel müssen unbenutzt und in Originalverpackung sein</li><li>Elektronik muss mit allem Zubehör zurückgeschickt werden</li><li>Verderbliche Waren sind nicht rückgabefähig</li><li>Individualisierte Artikel sind vom Umtausch ausgeschlossen</li></ul>` |
| 4 | **Text** | Description: (rich text) `<h3>So senden Sie zurück</h3><ol><li>Melden Sie sich in Ihrem Konto an</li><li>Navigieren Sie zu Bestellungen</li><li>Wählen Sie die Bestellung und klicken Sie auf Rückgabe</li><li>Wählen Sie Artikel und Grund</li><li>Drucken Sie das vorfrankierte Versandetikett</li><li>Versenden Sie innerhalb von 7 Werktagen</li></ol>` |
| 5 | **Image** | Image: same file as EN version (shared asset). Alt text: `Beispiel Rücksendeetikett`. |
| 6 | **Call to Action** | Title: *(empty)*. Subtitle: *(empty)*. Button text: `Rückgabe starten`. Button link: `/account/orders`. |

**Language Verification Matrix:**

| URL | Expected | Test Case |
|-----|----------|-----------|
| `${FRONT_URL}/en/qa-return-policy` | EN content renders. Title: "Return & Refund Policy" | CMS-027 |
| `${FRONT_URL}/de/qa-return-policy` | DE content renders. Title: "Rückgabe- & Erstattungsrichtlinie" | CMS-027 |
| `${FRONT_URL}/fr/qa-return-policy` | 404 — French not published | CMS-028 |
| Type "Return Policy" in search bar (EN storefront) | Page appears in search suggestions dropdown | CMS-031, CMS-035 |
| Type "Return Policy" in search bar (DE storefront) | NOT in suggestions (English term in German context) | CMS-035 |
| Type "Rückgaberichtlinie" in search bar (DE storefront) | Page appears in search suggestions dropdown | CMS-035 |
| Type "Rückgaberichtlinie" in search bar (EN storefront) | NOT in suggestions (German term in English context) | CMS-035 |

---

### PAGE-4: Scheduled Promo Page (Future Launch)

| Field | Value |
|-------|-------|
| **Name** | `QA Summer Collection Preview` |
| **Permalink** | `/qa-summer-collection-preview` |
| **Language** | English |
| **Status** | Draft → Publish with scheduling |
| **Scheduling** | StartDate: +7 days from creation, EndDate: +60 days from creation |
| **Personalization** | Visible to all (no restrictions) |
| **Test Purpose** | Scheduled page with future start date. Tests scheduling logic: not accessible before StartDate (CMS-033), accessible within range (CMS-034), Pending filter (CMS-019), counter updates (CMS-021). After EndDate passes, verifies automatic archival behavior (CMS-030). |

**Block Structure:**

| # | Block Type | Field Values |
|---|-----------|-------------|
| 1 | **Slider** | Slides (+ Add item × 2): Slide 1 — Title: `Summer Collection 2026 — Coming Soon`, Image: upload any banner, Link: `/`. Slide 2 — Title: `Beat the Heat — New Arrivals`, Image: upload, Link: `/`. |
| 2 | **Title** | Title: `Summer Collection 2026` |
| 3 | **Text** | Description: `Get ready for the hottest deals of the season. Our summer collection features the latest in electronics, accessories, and home essentials. Pre-order now and be the first to receive these items when they launch.` |
| 4 | **Products carousel** | Title: `Preview Collection`. Subtitle: *(empty)*. Card type: `Full`. Products count: `6`. Slides per view: `3`. SKUs: *(empty)*. Keyword: *(empty)*. |
| 5 | **Call to Action with Image** | Title: `Be the First to Know`. Subtitle: *(empty)*. Button text: `Pre-Order Now`. Button link: `/search?q=summer`. Image: upload any image. |
| 6 | **Subscribe form** | Title: `Get Launch Notifications`. Subtitle: `Be the first to know when we go live`. |

**Scheduling Verification Matrix:**

| Timing | Storefront URL | Expected | Admin Tab | Test Case |
|--------|---------------|----------|-----------|-----------|
| Before StartDate (now) | `${FRONT_URL}/qa-summer-collection-preview` | 404 — page not yet active | Pending tab (CMS-019) | CMS-033 |
| Within StartDate–EndDate | `${FRONT_URL}/qa-summer-collection-preview` | 200 — all 6 blocks render | Active tab (CMS-018) | CMS-034 |
| After EndDate | `${FRONT_URL}/qa-summer-collection-preview` | 404 — page expired | Archived tab (CMS-020) | CMS-030 |

**Counter Check (CMS-021):** Note Draft/Pending/Active counter values before and after publishing with schedule. After publish: Draft counter −1, Pending counter +1.

---

### PAGE-5: Organization-Restricted Support Page

| Field | Value |
|-------|-------|
| **Name** | `QA Partner Portal Support` |
| **Permalink** | `/qa-partner-portal-support` |
| **Language** | English |
| **Status** | Draft → Publish |
| **Scheduling** | No date restrictions |
| **Personalization** | Visibility: ON, Organization restriction: Emily Johnson's org (TechFlow Solutions — see `test-data/b2b/organizations.csv`) |
| **Test Purpose** | Organization-restricted page. Tests org-level personalization (CMS-025/026), visibility toggle (CMS-024). Verifies anonymous, personal, and other-org users all get 404. Also tests archive lifecycle — after archiving, even authorized users should see 404 (CMS-030). |

**Block Structure:**

| # | Block Type | Field Values |
|---|-----------|-------------|
| 1 | **Title** | Title: `Partner Support Portal` |
| 2 | **Text** | Description: `Welcome to the TechFlow Solutions partner support hub. Here you'll find resources to help resolve issues, submit support tickets, and connect with our dedicated partner team.` |
| 3 | **Features** | Title: `How Can We Help?`. Subtitle: *(empty)*. Features (+ Add item × 3): (1) Title: `Knowledge Base`, Description: `Search our library of technical articles and how-to guides`, Icon: upload. (2) Title: `Submit a Ticket`, Description: `Create a support request and track its progress`, Icon: upload. (3) Title: `Live Chat`, Description: `Connect with a support agent in real time (business hours)`, Icon: upload. |
| 4 | **Image** | Image: upload any image from `test-data/uploads/`. Alt text: `Partner support process overview`. |
| 5 | **Text** | Description: (rich text) `<p><b>Q: How do I reset my password?</b><br/>A: Navigate to Account Settings > Security > Change Password.</p><p><b>Q: What are support hours?</b><br/>A: Monday–Friday, 8 AM – 6 PM EST.</p><p><b>Q: How do I escalate a ticket?</b><br/>A: Reply to any open ticket with ESCALATE in the subject.</p><p><b>Q: Can I manage multiple users?</b><br/>A: Yes, org admins can add/remove users from the Organization Members page.</p><p><b>Q: Where do I find invoices?</b><br/>A: Orders > select order > Download Invoice.</p>` |
| 6 | **Login** | *(No content fields — renders standard login form. No configuration needed.)* |
| 7 | **Call to Action** | Title: `Need More Help?`. Subtitle: *(empty)*. Button text: `Contact Support`. Button link: `/contact`. |

**Access Control Matrix:**

| User Type | Credentials | Expected | HTTP |
|-----------|------------|----------|------|
| Anonymous | (none) | 404 / not-found page | 404 |
| Personal account (no org) | `qa-agent-slot2@virtocommerce.com` | 404 / not-found page | 404 |
| AcmeCorp org member (wrong org) | John from AcmeCorp (`test-data/b2b/users.csv`) | 404 / not-found page | 404 |
| TechFlow org member (correct org) | Emily Johnson (`test-data/b2b/users.csv`) | Page renders, all 7 blocks visible | 200 |
| TechFlow member — after page archived | Emily Johnson | 404 / not-found page | 404 |

**Archive Lifecycle Test:**
1. Verify Emily can access page (200)
2. Archive page in Admin (CMS-005)
3. Verify Emily now gets 404 (CMS-030)
4. Verify page appears in Archived tab (CMS-020)

---

## Block Coverage Matrix

| Block Type | PAGE-1 | PAGE-2 | PAGE-3 | PAGE-4 | PAGE-5 | Total Uses |
|-----------|:------:|:------:|:------:|:------:|:------:|:----------:|
| Title | x | x | x | x | x | 5 |
| Text | — | x | x(3) | x | x(2) | 8 |
| Image | — | x | x | — | x | 3 |
| Slider | x | — | — | x | — | 2 |
| Call to Action | x | — | x | — | x | 3 |
| Call to Action with Image | — | x | — | x | — | 2 |
| Category | x | — | — | — | — | 1 |
| Products carousel | x | — | — | x | — | 2 |
| Predefined products | — | x | — | — | — | 1 |
| FavoriteProducts | x | — | — | — | — | 1 |
| Features | — | x | — | — | x | 2 |
| Subscribe form | x | — | — | x | — | 2 |
| Login | — | — | — | — | x | 1 |
| **Products** | — | — | — | — | — | **0** |

**Note:** The `Products` block (standalone grid) is not covered. Add it to PAGE-1 or create a dedicated PAGE-6 (e.g., "QA Category Showcase") if grid-specific testing is needed.

---

## CMS Test Case Coverage

| Test Case | PAGE-1 | PAGE-2 | PAGE-3 | PAGE-4 | PAGE-5 |
|-----------|:------:|:------:|:------:|:------:|:------:|
| CMS-001 Create page | x | x | x | x | x |
| CMS-002 Edit page | x | x | x | x | x |
| CMS-003 Preview | x | x | x | x | x |
| CMS-004 Open designer | x | x | x | x | x |
| CMS-005 Archive page | — | — | — | — | x |
| CMS-006 Publish draft | x | x | x | x | x |
| CMS-017 Draft filter | x | x | x | x | x |
| CMS-018 Active filter | x | x | x | x | x |
| CMS-019 Pending filter | — | — | — | x | — |
| CMS-020 Archived filter | — | — | — | x | x |
| CMS-021 Counter updates | — | — | — | x | — |
| CMS-024 Visibility toggle | — | x | — | — | x |
| CMS-025 User group restriction | — | x | — | — | — |
| CMS-027 Published → frontend | x | — | x | — | — |
| CMS-028 Wrong language 404 | — | — | x | — | — |
| CMS-029 Draft not on frontend | x | — | — | — | — |
| CMS-030 Archived not on frontend | — | — | — | x | x |
| CMS-031 Published in search suggestions | x | — | x | — | — |
| CMS-033 Future schedule → 404 | — | — | — | x | — |
| CMS-034 Within schedule → 200 | — | — | — | x | — |
| CMS-035 Language isolation in suggestions | — | — | x | — | — |
| CMS-036+ Designer sections | x | x | x | x | x |

---

## Seeding Strategy

CMS pages cannot be seeded via REST API — they require the PageBuilder UI. The strategy is **seed once, verify before each run**.

### Page Roles

| Page | Role | When Created | Seeded? |
|------|------|-------------|---------|
| **PAGE-1** | **Inline creation** — the lifecycle IS the test (CMS-001→006→027→031) | Created during test execution by agent | No — agent creates fresh each run |
| **PAGE-2** | **Precondition** — personalization gating tests need it pre-configured | Seeded once, kept on QA | Yes |
| **PAGE-3** | **Precondition** — multi-language tests need both EN+DE published | Seeded once, kept on QA | Yes |
| **PAGE-4** | **Precondition** — scheduling tests need future StartDate already set | Seeded once, kept on QA | Yes |
| **PAGE-5** | **Precondition** — org restriction tests need it pre-configured | Seeded once, kept on QA | Yes |

### Precondition Verification Gate

**Run this check at the start of suite 059/060 execution, before any test cases.**

The agent navigates to the PageBuilder shell and verifies each seeded page still exists in the expected state. If a page is missing or misconfigured, the agent re-creates only that page before proceeding.

**Verification steps:**

```
1. Navigate to ${BACK_URL}/apps/page-builder-shell/?storeId=B2B-store#/page-builder-all
2. Search for each seeded page by name:

   PAGE-2: "QA Wholesale Buyer Guide 2026"
     ✓ Exists in Active tab (Published status)
     ✓ Has Personalized badge (user group restriction)
     ✗ Missing → re-seed (see Full Seeding Steps below)

   PAGE-3: "QA Return Policy"
     ✓ Exists in Active tab (Published status)
     ✓ Has both EN and DE language versions
     ✗ Missing → re-seed

   PAGE-4: "QA Summer Collection Preview"
     ✓ Exists in Pending tab (Published + future StartDate)
     ✓ Has Scheduled badge
     ✗ Missing or StartDate has passed → re-seed with new future dates

   PAGE-5: "QA Partner Portal Support"
     ✓ Exists in Active tab (Published status)
     ✓ Has Personalized badge (org restriction)
     ✗ Missing → re-seed

3. If all 4 pages pass verification → proceed to test cases
4. If any page fails → re-seed that specific page, then re-verify
```

**PAGE-1 is NOT verified** — it is always created fresh as part of CMS-001 test execution.

### Inline Creation Flow (PAGE-1)

PAGE-1 is created during test execution. The agent uses it across multiple test cases in sequence:

```
CMS-001: Create page → name: "QA Homepage Spring Sale", permalink: "/qa-homepage-spring-sale"
CMS-002: Edit the page (change name or permalink, then revert)
CMS-004: Open in designer → add 7 blocks per Block Structure table
CMS-003: Preview the page
CMS-006: Publish the page
CMS-027: Verify page renders at ${FRONT_URL}/qa-homepage-spring-sale
CMS-031: Type "Homepage Spring Sale" in search bar → verify in suggestions dropdown
CMS-029: (before publish) Verify draft page returns 404 on storefront
CMS-021: Note counter changes during Draft→Published transition
```

After all lifecycle tests complete, archive PAGE-1 (CMS-005/CMS-007) for cleanup.

### Full Seeding Steps (for initial setup or re-seeding)

Use these steps to create pages from scratch — either for initial QA environment setup or when the verification gate detects a missing page.

#### Seed PAGE-2: B2B Buyer Guide

1. Navigate to `${BACK_URL}/apps/page-builder-shell/?storeId=B2B-store#/page-builder-draft`
2. Click **Add** → Name: `QA Wholesale Buyer Guide 2026`, Permalink: `/qa-wholesale-buyer-guide`, Language: English → **Save**
3. Click **Open Designer** → add 6 blocks per PAGE-2 Block Structure table → **Save** in designer
4. Close designer → open page blade → expand **Personalization** section
5. Set **Visibility**: ON → select **User Groups**: `B2B Wholesale` → **Save**
6. Click **Publish**
7. Verify: page appears in Active tab with Published + Personalized badges

#### Seed PAGE-3: Multi-Language Policy

1. Click **Add** → Name: `QA Return Policy`, Permalink: `/qa-return-policy`, Language: English → **Save**
2. Open Designer → add 6 EN blocks per PAGE-3 Block Structure (English) table → **Save**
3. Close designer → click **Publish** (EN version)
4. Open the page again → switch to **German** language version (or add new language)
5. Set Name: `QA Rückgaberichtlinie` → **Save**
6. Open Designer → add 6 DE blocks per PAGE-3 Block Structure (German) table → **Save**
7. Close designer → click **Publish** (DE version)
8. Verify: page appears in Active tab; both EN and DE language badges visible

#### Seed PAGE-4: Scheduled Promo

1. Click **Add** → Name: `QA Summer Collection Preview`, Permalink: `/qa-summer-collection-preview`, Language: English → **Save**
2. Open Designer → add 6 blocks per PAGE-4 Block Structure table → **Save**
3. Close designer → open page blade → expand **Scheduling** section
4. Set **Start date**: +7 days from today → Set **End date**: +60 days from today → **Save**
5. Click **Publish**
6. Verify: page appears in Pending tab with Published + Scheduled badges

**Important:** PAGE-4 scheduling dates expire. If StartDate has passed, the page moves to Active (or Archived if past EndDate). Re-seed with fresh future dates when detected by verification gate.

#### Seed PAGE-5: Org-Restricted Support

1. Click **Add** → Name: `QA Partner Portal Support`, Permalink: `/qa-partner-portal-support`, Language: English → **Save**
2. Open Designer → add 7 blocks per PAGE-5 Block Structure table → **Save**
3. Close designer → open page blade → expand **Personalization** section
4. Set **Visibility**: ON → select **Organization**: TechFlow Solutions → **Save**
5. Click **Publish**
6. Verify: page appears in Active tab with Published + Personalized badges

### Cleanup

After testing is complete:

1. Archive all test pages (CMS-005) — including PAGE-1 created inline
2. Verify all permalinks return 404 on storefront after archival
3. **Do NOT delete seeded pages (PAGE-2 through PAGE-5)** — leave them in Archived status for future re-use. They can be restored to Draft if needed for the next test run.

### Re-seeding Checklist

| Trigger | Action |
|---------|--------|
| Verification gate finds page missing | Re-seed that specific page using Full Seeding Steps |
| PAGE-4 StartDate has passed | Re-seed with new future dates (+7 / +60 days) |
| QA environment redeployed/reset | Re-seed all 4 pages (PAGE-2 through PAGE-5) |
| Page found in wrong status (e.g., accidentally archived) | Restore to Draft → re-configure → re-publish |
| Page content modified by another tester | Verify block structure matches spec; re-add blocks if needed |

---

## Related Files

- Suite CSV: `regression/suites/Backend/cms/059-cms-page-management.csv`
- Suite CSV: `regression/suites/Backend/cms/060-cms-design-content.csv`
- Prompt: `docs/prompts/How to test Builder.io.md`
- B2B users (for access control): `test-data/b2b/users.csv`
- Agent pool users: `test-data/users/agent-user-pool.csv`
