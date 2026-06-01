# Persona-Driven Exploration

The other heuristics in this skill (CRISP, SFDPOT, Whittaker tours, FAILURE) ask *"what should I test?"*. Personas ask *"who am I right now?"*. Same feature, different lens, different bugs.

A 30-minute session uses **one persona**. Switching personas mid-session dilutes both the mindset and the findings.

---

## How to use this file

1. Pick a persona that matches the risk you're targeting (see the **Use when** column below)
2. Read its mindset section — internalize it before opening the browser
3. Run the starter test ideas as a checklist
4. Pair it with one heuristic from `adversarial-heuristics.md` (recommended pairings listed per persona)

| Persona | Use when | Pairs with |
|---------|----------|------------|
| [Impatient Buyer](#1-impatient-buyer) | Validating a high-traffic flow (cart, checkout, search) | Obsessive-Compulsive Tour + FAILURE-F |
| [Screen-Reader User](#2-screen-reader-user) | Accessibility pre-release; component-library changes | Tourist Tour + HICCUPPS-F (Standards) |
| [Malicious User](#3-malicious-user) | Auth, permissions, multi-tenancy, admin endpoints | Antagonistic + Saboteur Tour + FAILURE-A |
| [Slow-Network User](#4-slow-network-user) | After a refactor that touches network/cache; mobile QA | Saboteur Tour + FAILURE-E |
| [B2B Procurement Officer](#5-b2b-procurement-officer) | Quote/approval/org-switch flows; multi-user workflows | Scenario Tour + Soap Opera Testing |
| [Session-Corrupted User](#6-session-corrupted-user) | Apollo cache changes; auth/session refactors; multi-tab features | All-Nighter Tour + FAILURE-F |

---

## 1. Impatient Buyer

### Mindset
Wants to finish in 90 seconds. Clicks faster than the UI can keep up. Double-taps the submit button. Hits back to "check something" and forward again. Opens a second tab to compare. Refreshes when anything takes more than 2 seconds. Trusts nothing — assumes their click was lost and clicks again.

### Test ideas

- Double-click every primary action (Add to Cart, Apply Coupon, Place Order, Save Address) — does the second click create a duplicate, no-op, or error?
- Hit browser Back immediately after a successful action — does the success state survive or revert?
- Refresh the page during a redirect (catch the redirect URL and refresh before the destination loads)
- Open the cart in two tabs, modify in one, place order from the other
- Click Next/Continue before the page has finished rendering (look for skeleton states or spinners and click through them)
- Type into a field that's about to be replaced by a server-driven re-render (e.g., apply coupon while typing in shipping address)
- Use browser autocomplete to fill a form in <500ms — does client-side validation keep up?
- Scroll fast through a long list with lazy-loading and see if scrollbar jitter / position is preserved
- Resize the window from desktop → mobile mid-checkout and see if the form state survives the breakpoint

### What this persona typically finds
Race conditions, double-submit bugs, missing optimistic-UI rollback, scroll jank, lost form state on resize, debounce bugs, stale Apollo cache (cross-ref VC-CART-005 in `vc-bug-catalog.md`).

---

## 2. Screen-Reader User

### Mindset
Cannot see the screen. Navigates with Tab, Shift+Tab, Arrow keys, Enter, Space. Listens to NVDA / JAWS / VoiceOver narration. A button labeled "X" reads as "X button" — meaningless if the X is a close-icon-button with no aria-label. Cannot use drag-and-drop, hover-only menus, or visual-only confirmations.

### Test ideas

- Tab through the entire page — every interactive element must receive focus in a logical order
- Verify focus ring is visible on every focused element (not just `outline: none`)
- Open every modal/dialog/popover — focus must move into it on open and return to the trigger on close
- Press Esc on every modal/popover — must close cleanly
- Navigate the main nav with arrow keys (if it's a `role=menubar`)
- Use a screen reader (or its DevTools emulation) to read every form field — label-input association must be programmatic, not visual
- Submit a form with an invalid field — error message must be announced and focus must move to the first error
- Check the page for ARIA landmarks: `main`, `nav`, `header`, `footer`, `complementary`
- Verify all icon-only buttons have `aria-label` or visible text alternatives
- Check live regions (`aria-live`) for cart count, toast notifications, async updates — silent updates are invisible to AT users
- Run axe-core via `mcp__Chrome_DevTools__lighthouse_audit` or the `/qa-accessibility` skill against the same page

### What this persona typically finds
Missing aria-labels on icon buttons, focus traps, missing focus rings (esp. in Coffee theme — only Coffee passes WCAG per `feedback_a11y_coffee_only`), inaccessible custom dropdowns, modals without focus management, missing live regions, color-only state indicators.

---

## 3. Malicious User

### Mindset
Wants something they're not entitled to: another user's data, a discount they didn't earn, admin functionality from a buyer account, a refund without returning the goods. Reads URL structure looking for patterns to swap. Opens DevTools to bypass client-side restrictions. Knows that the UI is just suggestions — the API is the truth.

### Test ideas

- **IDOR (Insecure Direct Object Reference):** Navigate to `/account/orders/<your-order-id>`, then swap the ID for someone else's. Same for quotes, addresses, lists, members.
- **Privilege escalation via URL:** As a non-admin user, try to access `/admin`, `/api/admin/*`, `/account/company/members/edit/*`
- **Disabled control bypass:** Find a disabled button (e.g., "Add to Cart" when out of stock); use DevTools to remove `disabled` attribute and click it — does the server reject it? (Cross-ref `feedback_no_force_disabled_controls`)
- **Hidden field tampering:** Find hidden form fields (price, productId, quantity), modify via DevTools, submit
- **Header manipulation:** Modify `Authorization`, `X-User-Id`, or store/culture headers via DevTools Network → Replay Request
- **Token replay:** Capture an auth token, log out, try to use the token (should be invalidated)
- **Cross-org access:** As a member of Org A, try to read/write resources owned by Org B via direct API calls
- **Expired-promotion replay:** Capture a coupon-apply request from a previous test; replay after the coupon expired
- **Mass-assignment:** Send extra fields in a `POST /api/customer/members` body (e.g., `role: "admin"`) — does the server accept it?
- **CSRF check:** Submit a state-changing form from a different origin (use a local HTML page with a form pointing at the API)
- **XSS probes:** Reflected (`<script>alert(1)</script>` in search box), Stored (in product reviews, cart notes, address line 2, organization name)
- **SQL/NoSQL injection probes:** `'; DROP TABLE`, `' OR '1'='1`, `{"$ne": null}` in fields that look like they hit a query

### What this persona typically finds
Missing server-side authorization checks, mass-assignment vulnerabilities, IDOR, client-side-only validation, token-lifecycle bugs (logout doesn't invalidate), missing CSRF protection, XSS in unsanitized rich-text fields, role-cache bugs (see `feedback_admin_permissions_via_roles`).

**Important:** Stay within authorized testing scope (vcst-qa, vcptcore, virtostart). Never test production. If you find a real security issue, file via `/qa-bug` with severity Critical and stop publishing details until triaged.

---

## 4. Slow-Network User

### Mindset
On a 3G connection, in a tunnel, or behind a flaky corporate VPN. Every request takes 5+ seconds. Connections drop randomly. Sees half-loaded pages with broken layouts. Waits, sometimes gives up and retries from scratch. Sometimes the request succeeded server-side but the response never arrived — they don't know.

### Test ideas

- Throttle the connection to **Slow 3G** via DevTools Network → Throttling. Load every critical page.
- Throttle to **Offline** mid-request — what does the UI show? Generic "something went wrong" or a usable error with retry?
- Place an order on Slow 3G, then go Offline at the exact moment of the confirmation redirect — was the order created? Refresh and check.
- Apply a coupon on Slow 3G — does the loading state debounce repeated clicks, or does each click queue a request?
- Try lazy-loaded images on Slow 3G — do placeholders show? Is there a layout shift when they load? (Cross-ref `BL-UI-001..006`)
- Cancel an in-flight request (close the tab mid-request) and reopen — is there an orphaned record?
- Test the cart page when the cart query fails (block `/graphql` via DevTools Network → Block request URL) — does the page recover gracefully or stay broken?
- Test the PDP when the inventory check times out — does Add to Cart show a "checking" state or assume in-stock?
- Test the search page when the search API returns 504 — does it show retry UI or a blank page?
- Reload the cart 10 times in quick succession on Slow 3G — any double-cart or stale-Apollo data? (Cross-ref `feedback_apollo_cart_shipment_stale_data`)

### What this persona typically finds
Generic error messages with no recovery, missing skeleton/loading states, double-submit on slow connections, lost orders (placed but no confirmation), layout shift on image load, Apollo cache + slow network = stale data, blocking spinners with no timeout.

---

## 5. B2B Procurement Officer

### Mindset
Buys for a 500-person company. Has authority to request, not approve. Manages a list of recurring orders. Maintains relationships with 4 different sellers across 3 currencies. Negotiated pricing. Multi-step approval for orders over $10k. Hates surprises — every price must be predictable. Spreadsheet-driven; downloads everything.

### Test ideas

- Switch between two orgs that both have the same user (B2B Multi-Org pattern) — verify cart, addresses, prices, and quote history are scoped correctly
- Create a quote with 50 line items; have a manager reject it; modify quantities; re-submit; have it approved; convert to order — does line-item history persist across the entire chain?
- Place an order as a buyer below the approval threshold ($X), one above it — verify routing to approval vs direct order
- As a manager, approve two quotes simultaneously (two tabs, click Approve at the same instant) — any double-approval or race?
- Bulk-add 50 SKUs from a CSV/quick-order pad — verify each SKU resolves to the correct product (including configurable products) and quantity (cross-ref `reference_b2b_lineitem_consolidation`)
- Apply a contract price that overrides the catalog price — verify the contract price wins in cart, quote, and order
- Switch the currency mid-cart — does the cart re-price correctly or break? (Cross-ref ECL category)
- Download an order export (CSV/PDF) — verify all line items, prices, taxes, totals match the on-screen view
- Try ordering an item that's now discontinued (was in a saved list) — clear error or silent skip?
- Use the impersonation feature: support agent impersonates the procurement officer — verify the cart, account, and recently-viewed are the officer's, not the agent's (cross-ref `reference_impersonation_permission_naming`)
- Set up a re-order from a 6-month-old order — verify obsolete SKUs are flagged, prices are refreshed, addresses still valid

### What this persona typically finds
Org-context leak (data from Org A showing up in Org B), approval-chain race conditions, contract-pricing override gaps, bulk-add SKU resolution errors, currency-switch bugs, export/UI mismatches, impersonation-context bugs.

---

## 6. Session-Corrupted User

### Mindset
Their browser state has drifted from server reality. They have a token from yesterday, a cart from 3 hours ago, localStorage from another env, a service worker from an older build. Refreshing helps sometimes, sign-out-sign-in helps usually, but they don't know that. They report "the app is broken" with no reproducible steps.

### Test ideas

- Open the app, sign in. Then open DevTools → Application → Cookies and **delete the auth cookie** without logging out. Refresh — what happens?
- Sign in on Tab A. Sign out on Tab B. Take an action on Tab A (still showing as signed in) — does it 401 cleanly or 500?
- Sign in. Then in DevTools → Application → Local Storage, **modify a stored value** (e.g., change `cartId` to a random GUID). Refresh — graceful recovery or crash?
- Sign in as User A in Tab 1. Sign out, sign in as User B in Tab 2. Switch back to Tab 1 — whose cart shows?
- Set the auth token expiry to be in the past (modify `exp` claim in DevTools), reload — should redirect to sign-in cleanly
- After a deploy, open the app with an older Service Worker still active — does it self-update or serve stale assets? (Cross-ref `feedback_mcp_browser_cache`)
- Stay on the same page for 35 minutes (idle past session timeout). Click any control — error path should be informative, not silent failure
- Switch the storefront environment via env var, then load a URL from the previous env's session — does it reject the cookies?
- Sign in, then load `/account/orders/<order-id>` from a previous user's session (paste a URL from yesterday's session) — should 403 or redirect, not show stale data

### What this persona typically finds
Stale Apollo cache after sign-out, missing 401 → redirect handling, ServiceWorker cache poisoning, localStorage corruption crashes, token-expiry silent failures, multi-tab auth race conditions.

---

## Combining personas with other heuristics

Use the **persona** to set the mindset for the whole 30-minute session. Layer one tour (from `adversarial-heuristics.md` or core SBTM) over it.

| Persona | Recommended tour | Recommended FAILURE letter |
|---------|-------------------|----------------------------|
| Impatient Buyer | Obsessive-Compulsive | F (Flow) |
| Screen-Reader User | Tourist / Garbage Collector | (use HICCUPPS-F Standards instead) |
| Malicious User | Antagonistic + Saboteur | A (Authentication/Authorization) |
| Slow-Network User | Saboteur | E (Errors) |
| B2B Procurement Officer | Scenario | U (User scenarios) — pair with Soap Opera |
| Session-Corrupted User | All-Nighter | F (Flow) |

---

## See also

- [adversarial-heuristics.md](adversarial-heuristics.md) — Whittaker tours, FAILURE, Soap Opera, HICCUPPS-F
- [modern-web-attack-surface.md](modern-web-attack-surface.md) — Browser-specific attack techniques (used heavily by Malicious + Session-Corrupted personas)
- [charter-library.md](charter-library.md) — Ready-to-use charters; many reference a recommended persona
- [../../../agents/knowledge/vc-bug-catalog.md](../../../agents/knowledge/vc-bug-catalog.md) — VC historical bug patterns indexed by domain
- [../qa-risk/SKILL.md](../qa-risk/SKILL.md) — Risk prioritization (use to pick which persona's session to schedule first)
