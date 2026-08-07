# VCST-5519 — Testing Checklist (vcptcore-qa)

Storefront: `https://vcptcore-qa-storefront.govirto.com` · Store `B2B-store` · theme `pr-2394` (VCST-5519)
Scope: dependency major-version upgrade retest. **Test observable behavior, not versions.** A diff-only suspicion is not a bug — confirm live.

## Split across two agents
- **qa-frontend-expert** (playwright-chrome): C1–C4 (SEO/favicons), C10–C11 (formatted content), C12–C13 (file upload + cart→checkout→place order)
- **qa-testing-expert** (playwright-firefox): C5–C9 (pop-up positioning) + exploratory charter (scroll/resize/mobile, adjacent surfaces)

---

### A. SEO meta / title / favicons — `@unhead/vue` v3  → qa-frontend-expert
- [ ] **C1 Brand page** — open a brand page (find a real brand via the storefront "All popular brands" / `/brands`). In DevTools inspect `<head>`: **`<meta name="keywords">` must contain the brand name** (this is the specific fix — it was missing before). Also confirm `<title>`, `<meta name="description">`, and OG/`twitter:` tags present. Capture the head snippet.
- [ ] **C2 Product page** — open any PDP. Confirm `<title>`, description, keywords, and `og:image`/social preview all present & sane.
- [ ] **C3 Favicons** — check `<link rel="icon">`: on an org **with** custom white-labeling favicons the custom icon is served; a store/org **without** falls back to default; verify a page with an incomplete/broken favicon config still renders (no crash). (If only one org is reachable, verify the default path + note coverage.)
- [ ] **C4** — spot-check Home, a Category page, a News article, and one Static/landing page: title + meta render, no `<head>` errors in console.

### B. Formatted (markdown / HTML) content — renderer upgrade  → qa-frontend-expert
- [ ] **C10 Rich** — PDP → Description tab / Properties (or any rich block): headings, links, tables render correctly (no raw markdown, no broken HTML, no XSS-escaping regressions).
- [ ] **C11 Simple** — one simple formatted block (checkout pickup-location working hours, or a branch description). Renders correctly. *(All other formatted spots share the renderer — one rich + one simple is sufficient.)*

### C. File upload + cart — internal ID-gen lib  → qa-frontend-expert
- [ ] **C12 Upload** — My Account → Company → Company Info: upload a logo/file. Upload succeeds, no console error, file persists on reload.
- [ ] **C13 Cart→Order** — add a product to cart → checkout → **place an order**. Use a sandbox payment card (`@td()` / `.env.defaults`). Order confirmation renders with an order number. Capture confirmation.

### D. Pop-up positioning — floating-ui upgrade  → qa-testing-expert
- [ ] **C5 Tooltip** — hover a tooltip (header theme toggle sun/moon, order/quote status badge, or price-info tooltip). Appears anchored correctly.
- [ ] **C6 Dropdown** — open header **language** or **currency** selector, or a ⋮ menu on an address/wishlist row. Positions under/over its trigger correctly.
- [ ] **C7 Upward flip** — open a select near the **bottom** of the viewport (checkout Country/State, catalog **Sort by**, or items-per-page). Menu must open **upward** and stay on-screen.
- [ ] **C8 Date picker** — My Account → Orders date filter (or a checkout/quote date field). Calendar opens anchored, not clipped.
- [ ] **C9 Robustness** — re-check a couple of the above **while scrolling**, **after window resize**, and at a **mobile viewport** (≤414px). Pop-ups reposition/stay anchored, don't detach or clip.

---

## Env notes (vcptcore-qa)
- Store = `B2B-store`. Some storefront accounts are in a blocked state; usernames may carry a literal leading `+`.
- Working B2B logins for live testing: `belovedushka@gmail.com` / `Password1!` (populated org) — see memory `reference_sales_rep_storefront_login`. Browser session may already be authenticated as an org user.
- App Insights console noise: `dc.services.visualstudio.com/v2/track` 400 "Invalid workspace" is **env noise, not an app bug** — ignore.
- vcptcore has **no loyalty module** — irrelevant here.
- Payment: use a sandbox card resolved via `@td()` (CyberSource/Skyflow sandbox in `.env.defaults`); `allowCartPayment=true` renders the card form on the cart page.

## Evidence
Per `skills/qa-evidence/evidence-capture-policy.md`: capture failures + the head-snippet for C1/C2, favicon `<link>` for C3, one screenshot per pop-up type (C5–C8), order confirmation (C13). Skip passing-navigation shots. Output → `reports/tickets/Sprint26-15/VCST-5519/`.
