# /qa-design — VcIcon (VCST-4400 outline/solid)

**Scope:** VcIcon (off critical-ui-scope matrix → heuristic fallback) · **Env:** Storybook (isolated) + storefront PR build `vc-theme-b2b-vue-2.54.0-pr-2382` · Chrome DevTools MCP · 375/768/1280
**Verdict:** PASS with **1 filing-grade contrast finding** (call-site token, not VcIcon core).
Size token scale (from PR source `vc-icon.vue`): xxs=10 xs=14 sm=20 md=24(default) lg=40 xl=48 xxl=64.

## 1. Sized-Control Pass — PASS (no VCST-5413-class drift)
Oracle = token-equality + square + cross-surface.

| size | token | Storybook | Storefront | aspect |
|---|---|---|---|---|
| xxs/xs/sm/md | 10/14/20/24 | exact | exact | 1:1 ✓ |
| lg/xl/xxl | 40/48/64 | exact | (n/a on sampled pages) | 1:1 ✓ |
| numeric 16 | 16 | — | 16×16 | 1:1 ✓ |

Storybook == storefront for every size present. **0 non-square** across 2689 Storybook + 402 integrated glyphs. No cascade override. Evidence: `vcicon-storefront-home-integrated-1280.png`.

## 2. Non-text contrast (WCAG 1.4.11 / PROPOSED-BL-UI-008) — 1 FAIL
**F-1 (filing-grade, P2/Medium; High under EAA):** "Add to Compare" (`git-compare-arrows`) icon on product cards renders neutral-400 `#a3a3a3` on white = **2.52:1** (< 3:1). Verified **enabled** (`disabled:false`, `cursor:pointer`) → not exempt. Root cause = call-site color token (`text-neutral-400`, chosen in this PR's `fill-*`→`text-*` migration), **not** VcIcon core (VcIcon faithfully renders currentColor). This is the outline-first thin-low-contrast risk. Evidence: `vcicon-compare-contrast-1280.png`.
- **Needs re-check (auth-gated):** authenticated resting "not-favorited" wishlist heart uses the same neutral-400 → likely also 2.52:1. As a guest it's `disabled` (exempt).
- Correctly NOT filed (WCAG 1.4.11 exempts inactive): disabled qty steppers (2:1), guest wishlist heart (2.52:1).
- All other ENABLED icons ≥ 3.86:1 (header chevron 3.86, stock chip 4.05, search-on-red 4.59, dark glyphs 17–19:1).

## 3. Focus indicators (WCAG 2.4.7 / PROPOSED-BL-UI-009) — PASS
Real keyboard Tab → 2px solid brand-red outline on links + icon buttons. (Programmatic audit over-reported 29 disabled/`:focus-visible` artifacts — disproved by real Tab.) Evidence: `vcicon-focus-ring-1280.png`.

## 4. State-Stress
| State | Result |
|---|---|
| Disabled/inactive (steppers, guest wishlist) | PASS — exempt, handled correctly |
| Hover/active icon buttons | PASS |
| Dark theme | N/A via OS `prefers-color-scheme` (Coffee presets are store-config-selected; only Coffee-light is WCAG-tuned). Header is dark-by-default → chevron 3.86:1 PASS. |
| Occlusion PROPOSED-BL-UI-007 (F-CART-006 pattern) | **NOT REACHED** — needs authenticated + seeded unavailable-product cart; Chrome DevTools MCP can't safely type storefront passwords. → hand to qa-frontend-expert on Playwright. |

## 5. Responsive & UX heuristics
- Mobile 375: icons square, on-size, no overflow (`vcicon-storefront-mobile-375.png`).
- Nielsen 0–4: icon-only buttons carry accessible names (aria-label present) → Recognition/4.1.2 = 0–1; glyph semantics + solid/outline usage consistent → 0–1. No severe (≥3) heuristic findings. (The 1 unnamed icon button on Company/members from the functional pass is auth-gated → re-verify logged in.)

## Filing recommendation (awaiting user decision — nothing filed)
- **1 bug:** "VcIcon outline-first: 'Add to Compare'/wishlist icon fails WCAG 1.4.11 non-text contrast (2.52:1)" — PROPOSED-BL-UI-008, P2 (bump High for EAA). Call-site token fix (compare/wishlist buttons), not VcIcon core. Acceptance items: authenticated-wishlist heart + company/members unnamed-button re-checks; occlusion re-check on /cart.
- Sized-control / focus / aspect / responsive: all PASS — no filings.
