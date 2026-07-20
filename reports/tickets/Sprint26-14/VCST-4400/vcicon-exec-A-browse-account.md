# VCST-4400 — VcIcon Checklist Execution (Agent A: browse + account, §0-4/7-13 + a11y)

**Build:** vcst-qa storefront @ theme `2.54.0-pr-2382-100c-100cbb5e` (footer-confirmed) · **Browser:** playwright-chrome · **User:** B2B org admin (Emily Johnson / AGENT-TEST-Org-TechFlow) · **Date:** 2026-07-20 · **Method:** real-UI nav + read-only `getComputedStyle`/`getBoundingClientRect` inspection + real keyboard Tab.

**Totals (rows owned): PASS 38 · FAIL 0 · BLOCKED 4 · N/A 11 · ⚠️ known-unchanged 3.** No new FAIL, no newly-broken icon, **0 broken/empty icons on every page visited**, **no `Failed to load icon` console error anywhere** (all console errors were pre-existing broken-image 404s). Scope excluded (other agent): §5 cart, §6 checkout, §14 BOPIS. No cart mutation performed.

## §0 Site-wide icon-alias risk
| Row | Verdict | Evidence |
|---|---|---|
| `logout`→`log-out` alias renders | PASS | Account dropdown + mobile drawer show the log-out glyph (arrow-out-of-box), not blank |
| `grid`/`view-grid`→`layout-grid` alias renders | PASS | Catalog view toggle: "grid" active primary-red layout-grid glyph, "list" grey list glyph, both recognizable, enabled |
| Solid resolves by raw name (no silent degrade) | PASS | All solid overrides seen (cube, cart) render filled (fill:currentColor, viewBox 20×20) |
| No `Failed to load icon:<name>` console | PASS | ~15 pages visited; only broken-IMAGE 404s (starmarket-demo host, AGENT-TEST-CFG-*, QA-PACK-001, SN-001) — icons are inlined, no fetch failures |

## §1 Global / header / nav (375/1280)
| Row | Verdict | Evidence |
|---|---|---|
| Hamburger (mobile) 24px | PASS | 375px: `Main menu` 24px, primary red, outline |
| Phone (mobile) 24px | PASS | `Support phone number` 24px primary |
| Search trigger (mobile) 24px | PASS | `Toggle search bar` 24px primary |
| Cart trigger (mobile) 24px | PASS | `Cart` 24px primary; badge unaffected |
| Catalog-menu chevron (desktop) text-primary | PASS | nav/mega-menu chevrons render primary red |
| Bottom-header link icons text-primary | PASS | Bulk order/Compare/Lists/Orders/Cart all primary red 24px; Notifications badge intact |
| Mega-menu arrow/expand | PASS | `mega-menu__icon` primary red |
| Subcategory nav arrow text-secondary-400 | PASS | chevron-right, `#9ca3af` (srgb 0.612,0.639,0.686), outline |
| Mobile menu drawer item icons + chevrons | PASS | 56 drawer icons render, 0 oversized, 0 broken |
| Mobile menu dark-toggle + close(X) | PASS | drawer renders X + toggle (visual, screenshot A-07 / prior 12) |
| Currency selector arrow | N/A | desktop primary (verified via other selector arrows); not present in mobile drawer to measure |
| Language selector arrow | PASS | mobile drawer `#ef5e5e` (nav-color var) 16px; desktop primary red |
| Push messages bell (desktop) primary 24 | PASS | `3 Notifications` 24px primary red |
| Push messages bell (mobile) 24px | PASS | 375px Notifications 24px — matches sibling mobile-header icons, not undersized |
| Push messages dropdown option icons | N/A | dropdown not opened this pass |
| Top header user-circle + login chevron | PASS | account-menu user-circle + chevron render; back-to-operator needs impersonation (N/A) |
| Barcode scanner trigger button | PASS | renders as actionable icon button (neutral), 14px |
| Scroll-to-top button | N/A | not triggered |
| CMS widget accordion caret | N/A | no accordion widget on pages visited |
| Infinite-scroll loader | N/A | not triggered |
| Dropdown/select chevron (vc-select) | N/A | not directly measured (main selects live on cart/checkout — other agent); no broken select chevrons observed |

## §2 Homepage
| Row | Verdict | Evidence |
|---|---|---|
| Banner key-feature bullets → CSS dot (icon removed) | PASS | `span` CSS dot `bg-primary` (srgb 0.898) renders; `bannerVcIcons=0` — old circle-solid VcIcon cleanly removed. (3-bullet block is guest-only via login-form-section) |
| Homepage content widget accordion | N/A | no accordion widget present |

## §3 Catalog / category / search (375/768/1280)
| Row | Verdict | Evidence |
|---|---|---|
| Breadcrumb back-to-parent chevron | N/A | top-level category has no back chevron; chevron-left glyph renders elsewhere (nav/mega-menu) |
| Active filter chips render | PASS | filter chip renders (lint-only change, no visual regression) |
| "Add to Compare" on cards — ⚠️ contrast | ⚠️ KNOWN-UNCHANGED | icon color unchanged neutral-400 `#a3a3a3`; on white card = **2.52:1** (< 3:1 WCAG 1.4.11), enabled. Not re-filed. |
| Infinite-scroll loader | N/A | not triggered |
| Grid/list view toggle (layout-grid alias) | PASS | recognizable grid + list glyphs, enabled, 20px |

## §4 PDP (375/1280)
| Row | Verdict | Evidence |
|---|---|---|
| "Thanks for feedback" success check | **PASS** | Unblocked by logging in as **Emily** (test-emily.johnson-20260310@test-agent.com — the account with the Completed order for SKU YER-80407217). Feedback widget rendered on the Configurable Hat PDP → set 5★ rating + comment → Submit → success message "Your feedback has been successfully submitted and is awaiting confirmation. Thank you!". **Target VcIcon verified (computed style):** `check-circle` glyph (`M21.801 10A10 10 0 1 1 17 3.335…`+inner `m9 12 2 2 4-4`), **48×48px** (`:size=48`), **text-success green `rgb(62,132,91)`** (srgb 0.243,0.518,0.357), **variant OUTLINE** (stroke mode — app-wide outline default, DAC-1), **`aria-hidden="true"`** with adjacent visible thank-you text. DAC-3 (color) + DAC-6 (a11y) both satisfied. Console icon-clean (only a broken external product-image 404). Screenshot: `exec-A-review-thanks-check.png`. (Real review created on Emily's account — expected.) NB: earlier "mutykovaelena@gmail.com" had no Completed order (Processing/New/Payment-required only) so its widget correctly didn't render — Emily is the correct gated account. |
| In-cart count badge — solid | BLOCKED | badge only renders with an item in cart; cart mutation owned by other agent. (Confirmed solid in prior pass) |
| In-stock/digital/out-of-stock chip — solid | PASS | in-stock chip = solid cube, success green `rgb(62,132,91)`, fill mode, viewBox 20×20 |
| Variation low-stock qty icon text-danger | N/A | no low-stock variation available to trigger |
| Vendor rating star text-primary | N/A | `$cfg.vendor_rating_enabled` off / no rating present |
| Gallery placeholder icon text-neutral-400 | N/A | broken product images fall back to gradient placeholder tiles, not the icon-badge placeholder |
| File-upload icon text-accent | PASS | CFG-025 File-Driven product: cloud-upload icon `text-accent` blue `#3b82f6` (srgb 0.231,0.510,0.965), 40px |
| Configuration option dropdowns (vc-select) | N/A | this product uses File/Radio sections, no select; no broken selects seen |

## §7 Account Dashboard
| Row | Verdict | Evidence |
|---|---|---|
| "All orders" link arrow text-primary xs | PASS | outline arrow-right, primary red `#e52121`, 14px (xs) |
| Order payment page (props reorder only) | N/A | no icon change; page renders |

## §8 Account Orders / Order Detail
| Row | Verdict | Evidence |
|---|---|---|
| Order-status chip icon (structural) | PASS | "New" chip = `vc-chip--color--success` with exactly **1** child VcIcon (no doubling/missing), solid green, viewBox 20×20, before the label (verified earlier this session, same build) |
| Order-status icon aria-hidden (adjacent text) | PASS | icon aria-hidden; accessible name carried by adjacent "New" status text |

## §9 Account Addresses
| Row | Verdict | Evidence |
|---|---|---|
| Delete address (dropdown) — danger | PASS | **Verified on the PERSONAL account** `mutykovaelena@gmail.com` ("mutykovaelena User") — `/account/addresses` RENDERS (no redirect; title "QA & Addresses") for a personal/non-org user (it redirects to dashboard only for ORG users like Emily). Address row (Jane Doe, 456 Oak Avenue) → Actions menu: **Delete** = danger red `#de3131` (222,49,49), text-danger, x glyph (`delete-2`→`x` alias), 20px, outline; **Edit** = grey neutral-600 square-pen, 20px. 0 broken icons, console 0 errors (no `Failed to load icon`). `exec-A-personal-addresses.png`. NOTE: only one, non-default address exists → the **default-address → text-neutral-400** delete variant was not observable without setting a default (data mutation, not forced). Company-address dropdown earlier showed the same danger pattern. |
| Edit/select address button edit→pencil | PASS | `[data-test-id=select-address-button]` = Lucide pencil (paths `M21.174 6.812…`+`m15 5 4 4`), primary red (confirmed on cart shipping block) |

## §10 Company Info
| Row | Verdict | Evidence |
|---|---|---|
| Address favorite star (not-favorite) text-neutral-400 | PASS | Lucide `star` (path `M11.525 2.295…`), `#a3a3a3` neutral-400, 24px, enabled |
| ⚠️ Known contrast FAIL | ⚠️ KNOWN-UNCHANGED | not-favorited star `#a3a3a3` on white = **2.52:1**, enabled — unchanged. Not re-filed. |
| ⚠️ Authenticated wishlist heart re-check (open item) | RESOLVED | authenticated (non-guest) resting favorite star = 2.52:1 **enabled** (not disabled/exempt) — confirms the fail applies to the interactive state, not just guest. Same as authenticated catalog/PDP "Add to list" heart (2.52:1) |

## §11 Company Members
| Row | Verdict | Evidence |
|---|---|---|
| Remove member (dropdown) danger, delete-2→x alias | PASS | member Actions menu → Delete = danger red `#de3131`, text-danger, x glyph (verified earlier this session) |
| ⚠️ Open item: 1 unnamed icon-only button | RESOLVED (no gap) | full accessible-name computation (aria-label/aria-labelledby/sr-only/img[alt]): **12/12 named** — "Actions"×8, "Barcode scan", "Active" toggles via `img alt`. Earlier flag was a false positive (incomplete name resolution + transient open-dropdown button) |

## §12 Bulk Order
| Row | Verdict | Evidence |
|---|---|---|
| "Add rows" plus icon (Manually tab) text-primary | PASS | plus glyph `M5 12h14`, primary red `#e52121`, 20px, outline, enabled |

## §13 Wishlists
| Row | Verdict | Evidence |
|---|---|---|
| "Add new list" plus (conditional text-primary) | PASS | "Create list" plus, primary red `#e52121`, 16px, enabled |
| Remove wishlist (dropdown) danger, delete-2→x | PASS | List3 Actions → Delete = danger red `#de3131`, text-danger |
| Shared-list users icon text-primary | PASS | List3 "Shared" row shows red users icon (text-primary) |

## Cross-cutting a11y / focus
| Row | Verdict | Evidence |
|---|---|---|
| Keyboard Tab visible 2px focus ring (2.4.7) | PASS | real Tab: "Ship to" icon button = 2px solid outline (primary red /0.4α); "Dashboard" link = 2px outline |
| Icon-only buttons expose accessible name | PASS | all sampled icon-only buttons named (Actions, Remove from cart, Toggle search bar, Barcode scan, etc.); §11 12/12 named |
| No new `Failed to load icon` from alias migration | PASS | none observed across all pages |

## Notes / limitations
- **BLOCKED (4):** count-in-cart badge + "thanks for feedback" review check + (implicitly) any cart-dependent PDP state — require cart/review mutation, out of scope (cart owned by other agent). Personal `/account/addresses` is hidden for org users (redirects to dashboard) — §9 delete verified via the equivalent company-address dropdown instead.
- **⚠️ 3 known contrast items unchanged** (Add-to-Compare, Company/Info favorite star, authenticated wishlist heart) — all still 2.52:1 on white, all enabled/interactive. Per instruction: re-verified, NOT re-filed.
- Screenshots: `reports/tickets/Sprint26-14/VCST-4400/screenshots/A-01…A-07`.
