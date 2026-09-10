# BUG — Top utility bar overlaps itself at 1280px when signed in

## Status: CONFIRMED

**Severity:** Medium · **Priority:** Medium · **Found:** 2026-09-09
**Provenance:** **OUT-OF-SCOPE / pre-existing** — unrelated to the VCST-5317 PRs. Found incidentally during that run's Step 4.
**Env:** vcst-qa — `FRONT_URL=https://vcst-qa-storefront.govirto.com`, storefront `Ver. 2.58.0-pr-2469-83d6-83d6e5d5`
**Oracle:** `BL-UI-002` (content stays within its container; no overlap)

## Summary

At **1280×1024 signed in**, the top utility bar's `Ship to: Select address` wraps to two lines inside a 40 px (`h-10`) bar and its glyphs **overlap** `Call us: +1 (213) 603 3536`. The `Dashboard` link is additionally occluded by the QA environment badge. **Clean at 1920×1080.**

1280 is the viewport the regression suite mandates, so this is visible on the standard test width.

## Steps to reproduce

1. Sign in to the storefront as any organization member.
2. Set the viewport to **1280×1024**.
3. Inspect the top utility bar on any page.

**Actual:** `Ship to:` / `Select address` wraps and collides with `Call us: +1 (213) 603 3536`; `Dashboard` is partly occluded.
**Expected:** the bar lays out on one line, or wraps without overlap, at every supported width.

## Why the signed-in leg is the one that matters

It **did not reproduce anonymously** at 1280 — `scrollWidth 1265 ≤ innerWidth 1280`, clean single-line render. The authenticated bar is what overflows it, because it adds the `Dashboard` link plus a long organization/user chip (`AGENT-TEST-Org-BuildRight-20260310 / AGENT-TEST-MultiOrgAlt FE`). An anonymous check would wrongly clear this.

Reproduced independently on two lanes: `playwright-chrome` (Step 4 frontend) and `playwright-edge` (C1).

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **FAIL** | `S4-FE-INCIDENTAL-top-utility-header-overlap-1280.png`, `C1-utility-bar-1280x1024-signedin.png` |
| 2–4 | N/A | pure layout |

## Impact

Cosmetic but on the mandated test width and on every page, signed in, both organizations. It degrades the "Call us" number's legibility, and it will produce visual-diff noise for any suite that baselines the header at 1280.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront · **Suggested repo:** `VirtoCommerce/vc-frontend` · **repoKind:** frontend · **Ownership hint:** platform
- **Component / module:** top utility bar (`top-header.vue` and its utility row)
- **RCA anchor:** the `h-10` fixed-height utility row — **not pinned to a file:line this run**
- **Routing confidence:** **MEDIUM** — reproduction and layer are certain; the exact element was not isolated.

## Evidence

- `reports/tickets/Sprint26-18/VCST-5317/screenshots/S4-FE-INCIDENTAL-top-utility-header-overlap-1280.png`
- `reports/tickets/Sprint26-18/VCST-5317/screenshots/C1-utility-bar-1280x1024-signedin.png`
- Control, clean: `reports/tickets/Sprint26-18/VCST-5317/screenshots/C1-utility-bar-1920-signedin-clean.png`

## Not claimed

- The breakpoint at which it starts and stops was **not** bisected — only 1280 (fails) and 1920 (clean) were measured.
- Whether the long `AGENT-TEST-…` fixture names are load-bearing was not isolated; a production-length org name may not overflow. **This should be checked before the fix is sized** — it may be fixture-amplified rather than a general defect.
- The QA environment badge occluding `Dashboard` may be a non-production artefact.
