# VCST-4400 — VcIcon (outline/solid) QA Summary

**PR:** [vc-frontend#2382](https://github.com/VirtoCommerce/vc-frontend/pull/2382) · **Build:** vcst-qa @ theme `2.54.0-pr-2382-100c-100cbb5e` · **Date:** 2026-07-20
**Scope:** full per-page VcIcon verification (67-row checklist, 14 sections, guest + B2B + personal, 375/768/1280) + design audit.

## Verdict: ✅ PASS — feature works. 2 items to fix (both call-site/SCSS, not VcIcon core).

| PASS | FAIL | BLOCKED | N/A |
|---|---|---|---|
| 53 | 1 | 0 | 12 |

## What to fix

**1. `credit-card.vue` icon renders dark, not primary — P3 (visual)**
On `/account/saved-credit-cards` the active card icon is neutral-900 instead of `text-primary` red.
- *Cause:* SCSS scoping — `$disabled` is `""` inside `&__icon` (reassigned only in `&--disabled`, not `!global`), so `#{$disabled} &` compiles to an **unconditional** `.credit-card__icon { color: inherit }` that overrides `text-primary`.
- *Fix (1 line):* scope the disabled rule → `&--disabled & { @apply text-inherit; }`.
- *Provenance:* likely pre-existing (same structure pre-PR with `fill-inherit`); PR touched these lines, so cheap to fix in-PR.
- *Evidence:* `exec-B-creditcard-vue-not-primary.png`.

**2. Icon non-text contrast 2.52:1 < 3:1 — P2 (High under EAA) — WCAG 1.4.11**
The **enabled** "Add to Compare" (`git-compare-arrows`) and resting "not-favorited" **wishlist heart** render neutral-400 `#a3a3a3` on white = 2.52:1.
- *Cause:* the `text-neutral-400` call-site token chosen in the `fill-*`→`text-*` migration (VcIcon core is fine).
- *Fix:* use a ≥3:1 neutral token (e.g. `text-neutral-500/600`) on the resting state of the compare + wishlist-toggle call sites. (Favorited/active state already passes at 3.68:1.)
- *Evidence:* `13-wishlist-compare-contrast-catalog.png`, `vcicon-compare-contrast-1280.png`.

## Verified PASS (highlights)
Icon-alias migration (~80 remapped names, no load errors) · outline default + solid overrides · sizing token-equality (0 non-square) · focus rings (real Tab) · BOPIS map-pin direct import · cart occlusion (0 overlaps) · order-status chip · pencil edit icon · review "thanks" check-circle (green, purchase-gated, verified on a Completed order) · personal `/account/addresses` delete (text-danger).

## Screenshot evidence (attached)
| File | Shows |
|---|---|
| `exec-B-creditcard-vue-not-primary.png` | FAIL #1 — dark card icon |
| `13-wishlist-compare-contrast-catalog.png` | FAIL #2 — faint compare + wishlist icons (2.52:1) |
| `vcicon-compare-contrast-1280.png` | FAIL #2 — compare-icon close-up |
| `exec-B-address-favorite-star.png` | favorited star passes 3.68:1 (distinct from the resting fail) |
| `exec-A-review-thanks-check.png` | PASS — green check-circle after feedback |
| `exec-A-personal-addresses.png` | PASS — personal addresses delete (red) |

## Detail (repo)
`vcicon-verification-checklist.md` (per-page checklist) · `vcicon-verification-results.md` (row-by-row) · `qa-design-vcicon.md` (design audit) · `vcicon-exec-A/B-*.md` (per-agent runs). 1 pending-moderation review created on Emily's account (authorized). Note: default-address `text-neutral-400` variant not observed (single non-default address on the test account).
