# Modern Web Attack Surface — Browser-Specific Probes

Most checklists focus on what's in the app. This one focuses on what's **around** the app — the browser, the cache, the network layer, the storage, the history stack — and how to use them as attack tools.

These techniques are how a careful exploratory tester finds the bugs that scripted tests never reach: race conditions across tabs, stale Apollo cache, ServiceWorker poisoning, autofill collisions, history-state races.

Use this as a **probe library**. Pick 3–5 probes per session that match your charter; don't run them all.

---

## How to execute these probes

All probes run via the MCP servers already wired into this repo:

- **Chrome DevTools MCP** (`mcp__Chrome_DevTools__*`) — primary tool. Native DevTools access: network throttling, storage inspection, request manipulation, performance traces, heap snapshots, console eval.
- **Playwright MCP** (`mcp__playwright-chrome__*` / `playwright-firefox` / `playwright-edge`) — for cross-browser execution, programmatic clicks, evaluate-in-page.
- **Browser DevTools UI** (manual) — when the MCPs don't expose the surface (e.g., direct edit of a cookie value, DevTools Sensors panel).

Where a probe uses a specific MCP tool, the example is given inline.

---

## 1. DevTools as an Attack Tool

The user's DevTools is the easiest server-bypass mechanism. Server-side validation is the only real defense; the UI is decorative.

### 1.1 Disabled-control bypass

**Probe:** Find an element with `disabled` attribute (e.g., the "Place Order" button before all required fields are filled). Remove the attribute via DevTools, click it, observe.

```
mcp__Chrome_DevTools__evaluate_script:
  function: () => document.querySelector('[data-test-id="place-order"]').removeAttribute('disabled')
```

**Expected:** Server-side validation rejects the submission with a clear, actionable error.
**Bug:** Server accepts the call → check `feedback_no_force_disabled_controls` to confirm this is a real bug vs validation working as designed.

### 1.2 Hidden field tampering

**Probe:** Find hidden form inputs or React-controlled state holding price, productId, quantity, or role. Modify the value, then trigger submission.

```
mcp__Chrome_DevTools__fill:
  selector: input[name="quantity"]
  value: "-1"
```

**Bug class:** Mass-assignment vulnerabilities, missing server-side bounds checks.

### 1.3 Network request replay with modified payload

**Probe:** In DevTools Network panel, right-click a successful request → "Replay XHR" or "Copy as fetch". Modify the body (e.g., change `totalAmount` or `productId`), resend.

```
mcp__Chrome_DevTools__list_network_requests  # find the request
mcp__Chrome_DevTools__evaluate_script:
  function: () => fetch('/api/cart/items', {
    method: 'POST',
    body: JSON.stringify({ productId: '<another-product>', quantity: 999 }),
    headers: { 'Content-Type': 'application/json' }
  })
```

**Bug class:** Trust-the-client bugs, missing server-side authorization re-checks.

### 1.4 Header manipulation

**Probe:** In Chrome DevTools → Network conditions, override the User-Agent. Or use Replay Request with modified `Authorization`, `X-Store-Id`, `Accept-Language` headers.

**Bug class:** Locale-based bugs, store-context confusion, auth-header weakness.

### 1.5 Console eval as a privilege check

**Probe:** Open the Console and try to call internal functions. Many SPAs expose stores/services on `window` in dev or accidentally in prod.

```
mcp__Chrome_DevTools__evaluate_script:
  function: () => window.__APOLLO_CLIENT__?.cache.extract()
```

**Bug class:** Exposed dev tools in production, accessible secrets in JS bundles, source maps in prod.

### 1.6 Sensors panel (geolocation, timezone, locale)

**Probe:** DevTools → More tools → Sensors. Set geolocation to Antarctica. Set timezone to UTC+14 (Kiritimati). Set locale to `ar-SA` (RTL Arabic, Hijri calendar).

**Bug class:** Timezone-sensitive promotions activating early/late, RTL layout breaks, locale-specific date/currency rendering bugs.

---

## 2. Multi-Tab State Collisions

The single biggest source of "I can't reproduce this" bugs. Apollo Client maintains a cache per tab, but cookies and localStorage are shared. The result: subtly inconsistent UI across tabs.

### 2.1 Same-cart, two-tab edit

**Probe:** Open the cart in Tab A. Open the same cart in Tab B. In Tab A, increase a line-item quantity. In Tab B (without refreshing), apply a coupon. Compare totals across both tabs.

**Bug class:** Stale Apollo cache (cross-ref `feedback_apollo_cart_shipment_stale_data`), missing optimistic-UI invalidation, lost-update on the older tab.

### 2.2 Sign-out propagation

**Probe:** Sign in. Open the account page in two tabs. In Tab A, click Sign Out. In Tab B, click any action (Add to Cart, View Order, Save Address) without refreshing.

**Expected:** Tab B detects the sign-out and either refreshes to the sign-in page or shows an actionable "You've been signed out" message.
**Bug:** Tab B silently sends a 401 request and shows a generic error.

### 2.3 Cross-tab sign-in with different user

**Probe:** Sign in as User A in Tab A. Sign out, then sign in as User B in Tab B. Switch back to Tab A. Click anything.

**Bug class:** Whose data shows? Whose context applies? Cross-account data leak if Tab A's actions act on User B's data.

### 2.4 Concurrent admin edits

**Probe:** Open the same product in two admin tabs. Edit different fields in each. Save both. Last-write-wins is acceptable if intentional; silent overwrite without warning is a bug.

**Bug class:** Missing optimistic-concurrency check (ETag, version field), silent data loss.

---

## 3. Storage & Cache Drift

The browser caches more than you think. After a deploy, three layers can be stale: ServiceWorker (assets), Apollo Client (in-memory data), HTTP cache (CDN/browser).

### 3.1 Stale ServiceWorker

**Probe:** Note the current build version (see `agent-dispatch.md` Build Verification). Force-refresh (Ctrl+Shift+R) — does the version change? If the page still shows the old build after Ctrl+Shift+R, ServiceWorker is serving stale.

**Recovery:** DevTools → Application → Service Workers → Unregister, then reload. Cross-ref `feedback_mcp_browser_cache`.

### 3.2 LocalStorage / sessionStorage corruption

**Probe:** In DevTools → Application → Local Storage, modify a stored value to garbage (`cartId: "xxx"`, `userId: null`, `lastViewed: "{broken json"`). Reload.

**Expected:** App detects the corruption, logs a warning, and recovers (e.g., re-fetches the cart by user, clears the corrupt key).
**Bug:** White-screen crash, JS exception in console, infinite loop.

### 3.3 Apollo cache inconsistency after mutation

**Probe:** Perform a mutation (e.g., `addItem`). Check the Apollo DevTools cache. Then perform a related query (e.g., `cart`). Does the cache update? Cross-ref `reference_additem_async_settle` — known case where `addItem` response is empty due to async settle.

### 3.4 IndexedDB stale data

**Probe:** Some features use IndexedDB (e.g., offline draft orders, queued mutations). DevTools → Application → IndexedDB. Modify a record, reload, see if the app trusts the modified data.

### 3.5 Cookie tampering

**Probe:** Delete the auth cookie without logging out. Reload. Should redirect to sign-in. Modify the cookie value to a garbage string. Reload. Should reject the token gracefully.

### 3.6 HTTP cache forcing stale data

**Probe:** Use `Cache-Control: no-cache` override via DevTools → Network → Disable cache (and the inverse: enable cache, see if a 304 response handles correctly).

---

## 4. History & Router Races

SPA routers are stateful. `history.pushState` / `replaceState` interact with `popstate`, `beforeunload`, redirects, and form submissions in subtle ways.

### 4.1 Back button after payment

**Probe:** Place an order. On the confirmation page, click browser Back. Click "Place Order" again on the previous page.

**Expected:** Either the cart is empty (the order cleared it) and the button is disabled, OR the system rejects the duplicate by orderToken/idempotency key.
**Bug:** Duplicate order created (cross-ref Charter A "Checkout Edge Cases" in `charter-library.md`).

### 4.2 Deep-link to a step that requires prior steps

**Probe:** Sign out. Paste a URL like `/checkout/payment` (which requires a cart). What happens — redirect to cart, redirect to sign-in, blank page, JS crash?

### 4.3 Forward button after redirect

**Probe:** Trigger a redirect (e.g., `/account` → `/sign-in` when logged out). Sign in, navigate elsewhere, then click Forward.

**Bug class:** Forward navigates to an old in-flight URL that's now stale.

### 4.4 Race: refresh during redirect

**Probe:** Click "Place Order" which triggers a redirect to `/checkout/confirmation`. Press F5 the instant the redirect starts.

**Bug class:** Order submitted twice, or order half-submitted then form re-rendered.

### 4.5 Hash-change interference

**Probe:** Some PDP tabs use `#tab-description` etc. Click between tabs rapidly, then use Back/Forward — does the tab state match the URL hash?

---

## 5. Browser-Feature Attack Surface

Modern browsers ship features that interact with the page. Each is an attack surface.

### 5.1 Autofill

**Probe:** Save a credit card / address in Chrome autofill. Open the checkout page. Let autofill populate the form. Check:
- Does autofill populate all expected fields?
- Are any read-only or hidden fields populated (suggesting wrong `autocomplete` attributes)?
- Are validation events fired by the autofill (or skipped, leading to "submit" with empty validation state)?

**Bug class:** Forms that depend on `onChange` events miss autofill's bulk-populate; required-field validation passes for empty fields.

### 5.2 Password manager (LastPass / 1Password / Bitwarden)

**Probe:** Same as autofill, but for credentials. Check that the password manager recognizes the sign-in form and doesn't trip on hidden second sign-in forms or unusual `name=` attributes.

### 5.3 Reduced-motion / dark-mode

**Probe:** DevTools → Rendering → "Emulate CSS media feature `prefers-reduced-motion: reduce`" and `prefers-color-scheme: dark`. Reload the page.

**Expected:** Animations are reduced or disabled. Dark theme variant (if any) loads.
**Bug class:** Animation-blocked interactions (carousel only advances via the animation completing), white-on-white text in dark mode.

### 5.4 Browser zoom (50%, 200%, 400%)

**Probe:** Ctrl+- to 50%, Ctrl++ to 200%, then 400%. Walk through the critical pages.

**Bug class:** Layout breakage, text overflow, controls becoming unreachable. (Cross-ref `BL-UI-001..006` layout stability.)

### 5.5 Print stylesheet

**Probe:** Ctrl+P or DevTools → Rendering → "Emulate CSS media type: print".

**Bug class:** Order confirmation prints with nav menus and "Add to Cart" buttons; cart prints unstyled.

### 5.6 Reader mode (Firefox/Safari)

**Probe:** Activate browser reader mode on a PDP, blog post, or terms page.

**Bug class:** Critical CTA stripped from reader view (acceptable for marketing pages, but check if any transactional page is misclassified as readable).

### 5.7 Ad blocker / privacy extension

**Probe:** Install uBlock Origin or use DevTools → Network → Block request URL to simulate. Block `*googletagmanager*`, `*google-analytics*`, `*hotjar*`, `*sentry*`.

**Bug class:** Page breakage because critical functionality was bundled with analytics; GA4 events fire conditional UI that breaks when blocked. Cross-ref the GA4 critical revenue flow in `CLAUDE.md`.

### 5.8 Browser extension conflicts

**Probe:** Honey, Rakuten, Capital One Shopping — coupon extensions auto-apply codes during checkout. Install one and try checkout.

**Bug class:** Auto-applied codes from extensions racing with the user's manually applied code; double-discount or rejection loops.

---

## 6. Network-Layer Probes

Beyond throttling (covered in the Slow-Network User persona), the network layer offers more sophisticated probes.

### 6.1 Block specific request

**Probe:** DevTools → Network → Block request URL — block `*graphql*` to simulate the API being down. Block `*storefrontapi*` to simulate the storefront backend being down. Block `*configurable*` to simulate the configurable-product service being down.

**Expected:** UI shows a meaningful error in the affected area only, rest of the page works.
**Bug:** Whole-page crash, infinite spinner, generic "Network error" with no recovery path.

### 6.2 Slow-response simulation

**Probe:** DevTools → Network → Custom throttling profile with 5000ms latency.

**Bug class:** Loading states timeout silently, double-submit because user assumed click was lost.

### 6.3 Forced 500 response

**Probe:** DevTools → Network → Right-click request → Override response → return `500` with empty body. Reload the page.

**Bug class:** Error pages without retry, blank screens, app-wide crashes from a localized 500.

### 6.4 Forced 401 response

**Probe:** Override the response of any authenticated API call to return `401`.

**Expected:** App detects the 401, signs the user out, redirects to sign-in.
**Bug:** App shows generic error or fails silently.

### 6.5 Malformed JSON response

**Probe:** Override response with `{"data": null, broken json`. Reload.

**Bug class:** Unhandled parse errors crash the page.

---

## 7. Performance & Memory Probes

### 7.1 Memory leak detection

**Probe:** Take a heap snapshot via `mcp__Chrome_DevTools__take_heapsnapshot`. Perform a repeating action (open/close a modal, add/remove a cart item) 50 times. Take another snapshot. Compare.

**Bug class:** Listeners not cleaned up, Apollo queries not unsubscribed, components not unmounted.

### 7.2 Long task detection

**Probe:** DevTools → Performance → Record. Trigger the action under test. Look for tasks >50ms (yellow/red in the flame graph).

```
mcp__Chrome_DevTools__performance_start_trace
# ... perform action ...
mcp__Chrome_DevTools__performance_stop_trace
```

**Bug class:** Main-thread blocking, slow input handlers.

### 7.3 Console flood

**Probe:** Open the console. Walk through 10 pages. Are there more than 5 errors/warnings? Are any of them new since the last build?

```
mcp__Chrome_DevTools__list_console_messages
```

**Bug class:** Console spam masking real errors; new warnings indicating impending breakage.

---

## See also

- [adversarial-heuristics.md](adversarial-heuristics.md) — Heuristics framework these probes plug into
- [personas.md](personas.md) — Malicious User + Session-Corrupted User personas use most of these probes
- [charter-library.md](charter-library.md) — "Cache & State Drift" and "Performance & Resource Stress" charters explicitly use these probes
- [../../../agents/knowledge/vc-bug-catalog.md](../../../agents/knowledge/vc-bug-catalog.md) — VC-specific historical bugs, many of which were found via these probes
- [../../../agents/knowledge/business-logic.md](../../../agents/knowledge/business-logic.md) — BL-UI-001..006 layout-stability invariants relevant to zoom/print/dark-mode probes
- [../../../rules/mcp-browsers.md](../../../rules/mcp-browsers.md) — Chrome DevTools MCP + Playwright MCP setup
