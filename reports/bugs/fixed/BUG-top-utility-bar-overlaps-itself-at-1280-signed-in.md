# BUG — Top utility bar overlaps itself at 1280px when signed in

## Status: FIXED

**Severity:** Medium · **Priority:** Medium · **Found:** 2026-09-09
**Provenance:** **OUT-OF-SCOPE / pre-existing** — unrelated to the VCST-5317 PRs. Found incidentally during that run's Step 4.
**Env:** vcst-qa — `FRONT_URL=https://vcst-qa-storefront.govirto.com`. First seen on storefront `Ver. 2.58.0-pr-2469-83d6-83d6e5d5`; **re-confirmed 2026-09-10 on `Ver. 2.58.0-pr-2469-afce-afce27e1`**, so it survives the `878e765a` delta and is not caused by it.
**Oracle:** `BL-UI-004` — **content boundary**. (Round 2 cited `BL-UI-002` *spacing grid*; that is wrong — the measured overlap is 3 x **18px**, and 18px is an on-grid step (`extend.spacing 4.5`), so the spacing scale is not violated. Corrected 2026-09-10 and independently reached by the 5b verifier.)

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

Reproduced independently across two rounds and three lane-runs: `playwright-chrome` (Round 2 Step 4), `playwright-edge` (Round 2 C1), and `playwright-edge` again (Round 3 visual lane, 2026-09-10 — measured `Select address` overlapping `Call us:` by **3 x 18px**). The Round-3 anonymous control at 1280 and 1920 was clean, and 1920 signed-in was clean, so the signed-in-at-1280 combination is the discriminator.

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

## Resolution

- **Fixed in:** vc-frontend PR #2534 (`fix/VCST-5945`, head `e1271b10`, theme `2.59.0-pr-2534-e127-e1271b10`) — still open at verification time. Names wrapper `xl:inline` → `xl:flex` so `truncate`/`max-width` apply; names capped at `max-w-32` between `xl` and `2xl` when org + user both show; ship-to placeholder gets `truncate`.
- **Tracker:** VCST-5945 → Tested (2026-10-05). Comment 111367.
- **Verified:** 2026-10-05 via `/qa-test VCST-5945 localhost` → `/qa-verify-fix`, local storefront proxied to vcst-qa. RED on vcst-qa `2.59.0-pr-2524` (31.8 × 18 px overlap; 8.2 × 18 px with an address selected) → GREEN 3/3 on the PR build, checklist 10/10.
- **Open questions from this report, now answered:** production-length names do not trigger it (PR author, on `dev`); the failing range with the QA names was 1280–1499 (PR author); the QA badge is an environment artefact.
- **Evidence:** `reports/tickets/Sprint26-20/VCST-5945/evidence.html`, `verification-summary.json`, `screenshots/`.
