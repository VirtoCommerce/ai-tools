# Frontend Test Cases: Catalog & Product Discovery

> Extracted from qa-frontend-expert agent. Read on demand during catalog/search/PDP testing.

---

## TC_HOMEPAGE_001 — Homepage Verification

```markdown
Steps:
1. Navigate to storefront homepage
   Expected:
   - Page loads < 3s
   - No console errors
   - Header: logo, nav, search, cart icon, account icon
   - Hero section: banner/carousel (auto-rotates if carousel)
   - Featured products section
   - Category navigation
   - Footer: links, social media, copyright

2. Test Navigation Menu:
   - Hover/click main categories
   - Verify subcategories appear
   - Click through to category page
   - Verify breadcrumb trail

3. Test Search Bar:
   - Click search icon/bar
   - Type 3+ characters
   - Verify autocomplete suggestions
   - Press Enter or click suggestion

4. Test Cart Icon:
   - Shows count badge (0 if empty)
   - Click → navigates to cart

5. Test Account Icon:
   - Not logged in: shows Login/Register
   - Logged in: shows account menu

Mobile Testing:
- Hamburger menu works
- Logo visible, tappable
- Search accessible
- Cart accessible
- Footer stacks vertically
- No horizontal scrolling
```

---

## TC_CATEGORY_001 — Category Browsing

```markdown
Steps:
1. Navigate to category page (e.g., /category/electronics)
   Expected:
   - Category title displayed
   - Product grid displays (12-24 products)
   - Product cards show: image, name, price, rating (if applicable)
   - Breadcrumb: Home > Category

2. Test Filters (Left Sidebar or Top Bar):
   - Price range filter (slider or min/max)
   - Brand/manufacturer filter (checkboxes)
   - Size/Color/Other attribute filters
   - In-stock filter
   Expected per filter:
   - Products update (AJAX, no full reload)
   - Count updates
   - Filter chips/tags appear showing active filters
   - URL updates with filter params
   - Can remove individual filters
   - "Clear All Filters" button works

3. Test Sorting:
   - Sort by: Price Low→High, Price High→Low, Name A→Z, Newest, Best Selling, Rating
   Expected: Products reorder correctly, sort selector shows current selection

4. Test Pagination:
   - Products per page selector (12, 24, 48)
   - Page navigation (numbered or infinite scroll)
   - Navigate pages, verify different products
   - "Items X-Y of Z" count

5. Test Product Card Interaction:
   - Hover: quick view button or animation
   - Click image → Product Detail Page
   - Click name → Product Detail Page
   - Quick add to cart (if available)

Mobile Testing:
- Filters accessible via "Filter" button (drawer/modal)
- Product grid: 2 columns on mobile, 1 on small
- Sort dropdown works on touch
- Pagination works
- Product cards appropriately sized
```

---

## TC_SEARCH_001 — Product Search

```markdown
Steps:
1. Click search bar
   Expected:
   - Search input focuses
   - Placeholder text: "Search products..."
   - Recent searches appear (if feature exists)

2. Type "laptop" (slowly, character by character)
   Expected:
   - Autocomplete/suggestions after 2-3 chars
   - Product suggestions with images and prices
   - Category suggestions
   - Highlights matching text in suggestions
   - Debounced (not firing on every keystroke)

3. Press Enter (full search)
   Expected:
   - Search results page loads
   - Shows "X results for 'laptop'"
   - Products displayed in grid
   - Filters available (same as category)
   - Sorting available

4. Test "No Results":
   - Search: "xyznonexistentproduct123"
   Expected:
   - "No results found" message
   - Suggestions: "Did you mean..." or popular products
   - Search box still visible to try again
   - No broken layout

5. Test Special Characters:
   - Search: "laptop & accessories"
   - Search: "<script>alert('xss')</script>"
   - Search: "café" (accented chars)
   - Search: "   laptop   " (extra spaces)
   Expected: All handled gracefully, no errors/XSS

6. Test Search Filters:
   - After search, apply price filter
   - Apply category filter
   Expected: Results narrow correctly

Mobile Testing:
- Search icon expands to full-width input
- Autocomplete suggestions scrollable
- Keyboard doesn't obstruct suggestions
- "X" button clears search
- Results display properly
```

---

## TC_PDP_001 — Product Detail Page

```markdown
Steps:
1. Navigate to a product detail page
   Expected:
   - Product image(s) — large, zoomable
   - Product name
   - Price (and sale price if discounted)
   - SKU/Product code
   - Availability (In Stock / Out of Stock)
   - Description (full text or expandable)
   - Specifications/attributes
   - Quantity selector
   - "Add to Cart" button (prominent)
   - Breadcrumb: Home > Category > Product

2. Test Image Gallery:
   - Multiple images displayed
   - Thumbnails clickable
   - Main image changes on thumbnail click
   - Zoom on hover (desktop) or pinch-to-zoom (mobile)
   - If video exists: plays embedded
   - Images load progressively (not all at once)

3. Test Variant Selection (if applicable):
   - Select color → image updates
   - Select size → price may update
   - Unavailable variant → grayed out or marked "Out of Stock"
   - All combinations valid (no broken combos)
   - URL updates with variant params (shareable link)

4. Test Quantity Selector:
   - Default quantity: 1
   - Increment button (+)
   - Decrement button (-), minimum 1
   - Manual input: type number
   - Boundary: 0 → show error or stay at 1
   - Boundary: very large number → cap at stock limit
   - Decimal → reject or round

5. Test "Add to Cart":
   - Click → success confirmation (toast/modal/animation)
   - Cart icon count increments
   - Continue browsing (don't force redirect to cart)
   - Product with options: must select options first
   - Out of stock: button disabled or shows "Notify Me"

6. Test Product Tabs/Sections:
   - Description tab → full product info
   - Specifications → table of key-value attributes
   - Reviews → star rating, review list
   - Q&A → questions and answers (if feature exists)

7. Test Breadcrumb:
   - Each level clickable
   - Returns to correct page

8. Test Related/Recommended Products:
   - Section shows relevant products
   - Products clickable, navigate to their PDPs
   - Carousel/grid works (arrows, dots)

Mobile Testing:
- Image gallery: swipe between images
- All tabs accessible
- "Add to Cart" button always visible (sticky bottom)
- Variant selectors easy to tap (44x44px minimum)
- Quantity selector usable
- Long descriptions don't break layout
- "Share" button works (native share API)
```

---

## TC_CART_001 — Shopping Cart

```markdown
Steps:
1. Navigate to Cart Page (click cart icon or "/cart"):
   Expected:
   - Cart page displays
   - OR empty cart: "Your cart is empty" + "Continue Shopping" link
   - Cart shows: product image, name, variant, quantity, price, subtotal per item
   - Cart total (subtotal + shipping estimate + tax)
   - "Checkout" / "Proceed to Checkout" button

2. Test Quantity Update:
   - Change quantity from 1 to 3
   Expected:
   - Line item subtotal updates (price x 3)
   - Cart total updates
   - No page reload (AJAX update)
   - Loading indicator during update

3. Test Remove Item:
   - Click "Remove" or trash icon
   Expected:
   - Item removed from cart
   - Cart total updates
   - Cart count in header updates
   - If last item removed: empty cart state

4. Test Multiple Items:
   - Add 3+ different products
   Expected:
   - All items display
   - Cart total = sum of all line items
   - Can update each independently
   - Scroll if many items

5. Test "Continue Shopping":
   - Click "Continue Shopping" link
   Expected: Returns to catalog/previous page

6. Test "Save for Later" (if feature exists):
   - Click "Save for Later" on cart item
   Expected:
   - Item moves to "Saved" section
   - Removed from cart total
   - Can move back to cart

7. Test Promo Code:
   - Enter valid promo code
   - Click "Apply"
   Expected:
   - Discount applied and shown
   - Total reduced by discount
   - Success message: "Promo code applied"
   - Enter invalid promo code: "INVALID"
   Expected:
   - Error message: "Invalid promo code"
   - No discount applied

8. Test Cart Persistence:
   - Add items, navigate away and back → items present
   - Refresh page → items present
   - Close browser, reopen → items present (cookie/localStorage)

9. Test Out-of-Stock:
   - Item goes out of stock while in cart
   Expected:
   - "Out of Stock" warning
   - Checkout disabled or warning shown
   - Option to remove

10. Test Cart Limits:
    - 1000 of same item → inventory/limit warning
    - 50 different products → handles gracefully

Mobile Testing:
- Cart items stacked vertically
- Quantity selector easy to use
- Remove button easy to tap
- Promo code field accessible
- "Checkout" button prominent
- Sticky cart summary (if implemented)

Performance:
- Cart updates < 500ms
- No page reload on quantity change
- Optimistic UI updates
```
