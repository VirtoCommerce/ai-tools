# Triage — VCST-6232 round 2 (ticket mode)

**Run:** /qa-test FULL · vcst · 2026-11-02 · build vc-frontend#2600 @ a4f29534 (unchanged since round 1)
**Non-passing rows:** 11 (9 FAIL, 2 BLOCKED) · **real bugs:** 3 roots · **test-defects:** 1 (C-14, re-run) · **dismissed:** 1 (C-15, ENV) · **below floor (P2):** 2 roots
`--fix` ignored in ticket mode. Packet: `node plugins/vc-test/lib/triage-collect.mjs --ticket VCST-6232` (unresulted `[]` after C-3 was given a readable verdict).

## 1. Confirmed real bugs

| Rows | Severity | Repo | Root cause | Evidence |
|---|---|---|---|---|
| C-1, C-5, C-6, C-7, C-8, C-9, C-10 | P2 Medium | vc-frontend | **AC-2 not met.** Soft sets only `--vc-radius`, `--vc-base-font-family`, `--vc-heading-font-family` (+ footer title case); shadow, size + line height, weight, letter spacing, italic/case and dark values resolve to classic. The ticket's own acceptance failure ("Blocked by (design)"), not a separate defect | reproduced live in three lanes on this build: 3x Firefox (1196/1177 DOM pairs), 4a Chromium (C-1, C-5..C-10), 4v Edge (C-2n); source `client-app/designs/soft/_tokens.scss`; KB-9BCB34C7. No separate investigation package: the run's own measurements are the repro |

Root A is routed as the ticket verdict (FAIL → Reopen), not as a new tracker item — it is AC-2 itself.

## 2. Test-case fixes

| Row | Class | Fix |
|---|---|---|
| C-14 | TEST_STEPS_DEFECT | cold half was reachable: the lane is `isolated: true`, so `browser_close` → `browser_navigate` is a cold context. Re-run dispatched; row updated by it |

## 3. Dismissed

| Row | Class | Reason |
|---|---|---|
| C-15 | ENV | no request interception in the Playwright lanes (no `browser_route`; real-user hook refuses `page.route`; ad-hoc scripts forbidden by `.claude/rules/vc-browser.md`). Carry-forward evidence on this exact build: KB-6E8D796E (stylesheet held 6 s → rendered by 3.6 s, swap CLS 0.0013 home / 0.0019 PDP; aborted → full Arial render, no overflow). Unthrottled CLS > 0.1 is pre-existing (KB-0AF3B0BB) |

## 4. Below floor (P2) — not investigated, not drafted

| Rows | Severity | Root cause | Evidence |
|---|---|---|---|
| C-4 | P3 Low | Uneven soft radius: only `var(--vc-radius)` readers turn 16/14px; `rounded-*` utilities and literals stay classic → 4px coupon cards and 3px CyberSource fields inside 16px widgets on /cart, 6px active nav item in a 16px widget on /account/orders | `screenshots/4a-C-4-soft-cart-coupons-radius-light-chromium.png`, `screenshots/4a-C-4-soft-cart-cybersource-radius-light-chromium.png`, 3x `screenshots/x-soft-*-radius-dark-1920.png` |
| C-16 (F8) | P3 Low | BL-UI-004: soft Inter widens the disabled email on /account/profile (scrollWidth 369 in a 306 px box, overflow clip, no ellipsis, not scrollable) at 375 and 1024; classic Lato fits | `screenshots/4v-C-16-soft-profile-input-clip-375.png` |

Also below floor, not this ticket's: B-3 coloured shadows ignore design shadow tokens (latent, C-12) · pre-existing on both builds: home and /company/members scroll horizontally at 1024, header search decorator 32 vs 38 px, "Customize" ellipsis, axe critical/serious on /cart and home (C-29, BL-A11Y — standalone, never blocks this ticket).

**After triage (5-file, operator decision):** the pre-existing /company/members sideways scroll and the unnamed cart address button were reproduced on their own and filed at **Medium** as VCST-6652 and VCST-6653 (raised from the below-floor listing above after reproduction; not caused by VCST-6232). The cart selector/placeholder a11y findings were linked to the existing VCST-5711. Pre-existing Lows not drafted: home sideways scroll at 1024 (Builder.io content), header search decorator 32 vs 38 px, cart "Customize" ellipsis.

Triage itself filed nothing and triggered no fix.
