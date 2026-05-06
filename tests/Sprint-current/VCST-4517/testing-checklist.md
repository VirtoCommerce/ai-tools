# VCST-4517 — Testing Checklist

**Ticket**: [VCST-4517](https://virtocommerce.atlassian.net/browse/VCST-4517) — TechDebt, Medium
**PR**: [vc-frontend #2201](https://github.com/VirtoCommerce/vc-frontend/pull/2201) (open, deployed to QA)
**Theme deployed**: `vc-theme-b2b-vue-2.49.0-pr-2201-4439-44393039`
**Sprint**: 26-09 (active)
**Test date**: 2026-05-06
**Environment**: https://vcst-qa-storefront.govirto.com / https://vcst-qa.govirto.com

---

## Change summary

Pure refactor: `BREAKPOINTS` constant (and `BreakpointsType`) moved from `@/core/constants/tailwind` to `@/ui-kit/constants/tailwind`. Old location kept with `@deprecated` JSDoc tags. **Values are identical**:

| Token | px |
|-------|-----|
| xs | 480 |
| sm | 640 |
| md | 768 |
| lg | 1024 |
| xl | 1280 |
| 2xl | 1500 |

`tailwind.config.ts` now sources breakpoints from the new ui-kit path.

## Files touched (18)

**Catalog (responsive consumers):** `pages/product.vue`, `shared/catalog/components/category.vue`, `shared/catalog/components/category/category-products.vue`, `shared/catalog/components/image-gallery.vue`, `shared/catalog/components/product/variations.vue`

**Layout / Header:** `shared/layout/components/header/vc-header.vue`, `shared/layout/components/header/_internal/mobile-search-bar.vue`, `shared/layout/components/header/_internal/search-dropdown.vue`, `shared/layout/components/footer/_internal/footer-links.vue`, `shared/layout/components/two-column.vue`

**Static content:** `shared/static-content/components/products-carousel.vue`, `shared/static-content/components/related-products.vue`, `shared/static-content/components/slider.vue`

**UI-kit:** `ui-kit/components/atoms/layout/vc-layout.vue`, `ui-kit/components/atoms/products-grid/vc-products-grid.vue`

**Build:** `tailwind.config.ts`, `tsconfig.node.json`, `client-app/core/constants/tailwind.ts` (deprecation tags only)

---

## Risk profile

| Risk | Likelihood | Severity |
|------|------------|----------|
| Build/runtime error from missed import path | Low | High |
| Stale dual-import (some files keep old path, some use new) — no functional bug because values match | Medium | Low |
| Tailwind config breakage → all responsive utilities broken | Low | High |
| Subtle responsive regression (component re-renders at wrong viewport) | Low | Medium |
| TypeScript build failure (BreakpointsType deprecation) | Low | High |

**This is a low-risk refactor. Primary risk is sweep coverage — verifying every consumer still works after the import-path change.**

---

## Acceptance criteria (derived)

1. AC-1: All 6 breakpoints (xs/sm/md/lg/xl/2xl) trigger their corresponding responsive layouts on storefront.
2. AC-2: No JS errors / Vue warnings in browser console mentioning `BREAKPOINTS`, `core/constants`, or `ui-kit/constants`.
3. AC-3: No 404/4xx/5xx network errors related to module resolution at runtime.
4. AC-4: Touched components render identically before vs after at each breakpoint (visual regression).
5. AC-5: Tailwind utility classes (`sm:`, `md:`, `lg:`, `xl:`, `2xl:`) still apply at correct widths.

---

## Coverage matrix — by component × viewport

Test viewport widths: **Mobile 375px**, **xs 480px**, **sm 640px**, **md 768px**, **lg 1024px**, **xl 1280px**, **2xl 1500px**, **Desktop 1920px**.

### Frontend agent (qa-frontend-expert) — chrome (FRONT_URL = https://vcst-qa-storefront.govirto.com)

| ID | Test | Viewports | Expected | BL/AC |
|----|------|-----------|----------|-------|
| BP-001 | **Header (vc-header.vue)** — navigate to `/`, verify desktop nav vs hamburger toggle at lg breakpoint (1024px) | 768, 1023, 1024, 1280 | Below 1024: hamburger / mobile menu. ≥ 1024: full desktop nav with Mega Menu | AC-1, AC-4 |
| BP-002 | **Mobile search bar** — viewport 375 + 640, click search icon → dropdown opens; viewport 1024+ → desktop search bar visible inline | 375, 640, 768, 1024 | Mobile-only at < 768; desktop-style ≥ 1024 | AC-1 |
| BP-003 | **Footer (footer-links.vue)** — collapse/expand sections on mobile, all open on desktop | 375, 640, 768, 1024 | Accordion below md; flat below `lg` per current behavior; verify no console error | AC-1, AC-4 |
| BP-004 | **Two-column layout (two-column.vue)** — `/account/orders` or any account page | 768, 1024, 1280 | Sidebar collapses below `lg`; renders side-by-side ≥ `lg` | AC-1 |
| BP-005 | **Category PLP (category.vue)** — `/search?q=` or category route | 480, 768, 1024, 1280, 1500 | Filters drawer on mobile; sidebar from `lg`; product grid columns scale | AC-1, AC-4 |
| BP-006 | **Category products grid (category-products.vue + vc-products-grid.vue)** — verify column count at each breakpoint | 480, 640, 768, 1024, 1280, 1500 | Columns increase with viewport; no layout jumps mid-breakpoint | AC-1, AC-4, AC-5 |
| BP-007 | **PDP (product.vue + image-gallery.vue + variations.vue)** — open any product; resize across breakpoints | 480, 768, 1024, 1280 | Gallery: stacked thumbs on mobile, side thumbs on desktop. Variations: dropdown vs grid. No console error | AC-1, AC-2, AC-4 |
| BP-008 | **Search dropdown (search-dropdown.vue)** — type query, verify dropdown sizing on mobile vs desktop | 375, 768, 1024 | Compact on mobile (full-width sheet/dropdown), wider results on desktop | AC-1 |
| BP-009 | **Static content slider (slider.vue) + carousels (products-carousel.vue, related-products.vue)** — `/` home or content page | 375, 640, 1024, 1280, 1500 | Slides/cards visible match breakpoint config; nav arrows show/hide correctly | AC-1, AC-4 |
| BP-010 | **vc-layout (atoms)** — sticky behavior on `/` with header during scroll | 768, 1024, 1280 | Sticky logic toggles correctly at breakpoint boundary | AC-1, AC-4 |
| BP-011 | **Console + network sweep** — DevTools open across full smoke flow (home → catalog → PDP → cart → checkout) | 1280 | Zero `Cannot resolve` errors, zero 404 from broken module imports, zero Vue warnings about `BREAKPOINTS` | AC-2, AC-3 |
| BP-012 | **HAR check** — confirm theme bundle hash served = `44393039` (PR build) | 1280 | Network tab → main JS bundle URL contains `pr-2201-4439-44393039` (or theme version `2.49.0`) | Build verification |

### UI/UX agent (ui-ux-expert) — Chrome DevTools MCP

| ID | Test | Viewports | Expected | AC |
|----|------|-----------|----------|-----|
| UX-001 | DevTools device emulation — iPhone SE (375), iPad (768), Desktop (1920) on home + PDP | 375 / 768 / 1920 | No layout breakage, no clipped content, no horizontal scrollbar | AC-4 |
| UX-002 | Tailwind utility audit — pick 3 elements with `sm:`, `md:`, `lg:` utility classes; verify computed style applies at expected viewport | 640, 768, 1024 | Utilities engage at correct width | AC-5 |
| UX-003 | Console message capture during full storefront smoke flow | — | Capture and tag any error/warning. Filter for `BREAKPOINTS`, `tailwind`, `ui-kit`, `core/constants` keywords | AC-2 |
| UX-004 | Lighthouse mobile + desktop run on `/` and a category page | 375, 1280 | No regression in performance score vs prior baseline (>±10 pts is a flag) | Performance sanity |
| UX-005 | Visual regression — compare key viewports against prior known-good screenshots if available; otherwise capture baseline screenshots | 480, 768, 1024, 1280 | Capture screenshots for record; flag any visible layout difference | AC-4 |

### Cross-browser / exploratory agent (qa-testing-expert) — firefox

| ID | Test | Viewports | Expected | AC |
|----|------|-----------|----------|-----|
| CB-001 | Repeat BP-001, BP-005, BP-007, BP-009 on Firefox | 768, 1024, 1280 | Identical responsive behavior to chrome run | AC-1, AC-4 |
| CB-002 | Edge case — resize browser window slowly across each breakpoint boundary; watch for layout flicker, `useBreakpoints` race conditions | 470→490, 760→780, 1020→1030 | No flicker/double-render at boundary | AC-1 |
| CB-003 | Console check on Firefox during full home → category → PDP flow | 1280 | Same as BP-011: zero BREAKPOINTS-related errors | AC-2 |
| CB-004 | Browser back/forward across breakpoint-sensitive pages; verify state restored at correct layout | 768, 1280 | No stale layout, components re-evaluate breakpoint correctly | AC-1 |

---

## Out of scope

- New responsive features (none introduced — pure refactor)
- Tailwind theme color/spacing changes (none touched)
- Backend / Admin SPA / GraphQL (no backend touched)
- Performance regression beyond ±10 Lighthouse points (Lighthouse is a sanity check only)
- Accessibility deep audit (no a11y-affecting changes)

## Decision rules for the agents

- **PASS** = All AC-1..AC-5 met across viewport matrix; no console errors related to the refactor; visual smoke matches expectations.
- **FAIL** = Any console error mentioning `BREAKPOINTS`/`ui-kit/constants`/`core/constants` resolution; any responsive layout broken at a breakpoint; build-time or runtime module resolution failure; visible layout regression vs reference behavior at any of the 6 breakpoints.
- **PASS WITH NOTES** = AC met but exploratory turns up minor non-blocking visual/UX nits unrelated to the breakpoints refactor itself.

## Evidence requirements

Per `.claude/skills/qa-methodology/qa-evidence/evidence-capture-policy.md`:
- Screenshots: capture each component at the boundary viewports (especially 768/1024 — the lg switch). Focus on header (BP-001), PLP grid (BP-006), and PDP gallery (BP-007).
- Console: full DevTools console export for BP-011 / UX-003 / CB-003.
- Network: HAR file per browser session.
- Theme bundle URL must be captured in BP-012 evidence to confirm correct build.

## Output paths

- `tests/Sprint-current/VCST-4517/test-execution-report.md` (qa-frontend-expert)
- `tests/Sprint-current/VCST-4517/uiux-report.md` (ui-ux-expert)
- `tests/Sprint-current/VCST-4517/exploratory-session.md` (qa-testing-expert)
- `tests/Sprint-current/VCST-4517/evidence/` (screenshots, console, HAR)
- `tests/Sprint-current/VCST-4517/summary.json` (final orchestrator output)
