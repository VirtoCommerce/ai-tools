# VCST-4767 — Fix Verification Report

**Verdict: PASS — fix resolves the bug.** | STR: **3/3 PASS** | Checklist: **10/10 PASS, 0 FAIL, 0 BLOCKED** | No regression, no side effects.

## Environment
vcst-qa Admin SPA @ platform shell `3.1035.0-pr-3051-23c3`, Marketing module deploy `3.1005.0-pr-268-f9dd`. Browser: playwright-edge (fresh isolated context — empty cache, so the loaded module bundle is the deployed build; cache-bypass requirement satisfied). Promotion used: **QA Category Percent Special** (B2B-store) → Coupons → Add Coupon.

## Summary
The coupon **Code** field now enforces `ng-pattern="/^[a-zA-Z0-9]+$/"` at field level. Non-alphanumeric input (special chars, space, hyphen, underscore, unicode) and empty input mark the form `ng-invalid` / `ng-invalid-pattern` and keep the **Create button DISABLED** — the coupon cannot be created. Alphanumeric codes enable Create and create the coupon successfully. Root cause (field-level validation, not just the hint) is addressed.

## STR — `TEST@#$%!` (expiration date + max uses set), run 3 consecutive times
| Run | Input | Create button | Result |
|-----|-------|---------------|--------|
| 1/3 | `TEST@#$%!` (fill) | **DISABLED** | PASS |
| 2/3 | `TEST@#$%!` (clear → fill) | **DISABLED** | PASS |
| 3/3 | `TEST@#$%!` (clear → slow per-char type) | **DISABLED** | PASS |

Coupon NOT created in any run. (Previously: coupon was created → would be FAIL.) Evidence: `screenshots/run1-special-chars-create-disabled.png`, `screenshots/run3-special-chars-create-disabled.png`.

## Verification checklist
| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | STR run 1/3 — special chars → Create disabled, not created | PASS | run1 screenshot |
| 2 | STR run 2/3 — same | PASS | snapshot |
| 3 | STR run 3/3 — same (slow typing) | PASS | run3 screenshot |
| 4 | Positive control `SUMMER2026QA4767` → Create **enabled**, coupon created & in list | PASS | `positive-control-alphanumeric-create-enabled.png`, `positive-control-coupon-created-in-list.png`; `POST coupons/add → 204` |
| 5 | Boundary rejections (Create disabled): space `CODE 1`, hyphen `SALE-1`, underscore `A_B`, unicode `naïve` | PASS (4/4) | snapshots, all Create DISABLED |
| 6 | Empty code → Create disabled (required) | PASS | observed on blade open + after clearing |
| 7 | Regression — edit/save existing coupon CAT20 (max-use 0→25) persists; expiration + max-use fields function | PASS | grid showed CAT20 max=25 after save; `POST coupons/add → 204` |
| 8 | No new console errors on coupons blade | PASS | only 2 pre-existing unrelated 404s (page-builder-shell logo, push-messages logo); no JS/Angular errors |
| 9 | Root cause addressed — field-level validation, not just hint text | PASS | form element carries `ng-invalid ng-invalid-pattern` while hint still shown; Create gated off `!isValid()` |
| 10 | Loaded bundle is the new one (cache bypass) | PASS | fresh isolated browser context (empty cache) + behavioral proof: `ng-pattern` gate present and active |

## Regression / side effects
None. Existing coupon edit + save works and persists; expiration date and max-use fields function normally; coupon delete (confirmation dialog) works. No unexpected 4xx/5xx — all `coupons/add` returned 204 and `coupons/search` returned 200.

## Teardown
Test coupon `SUMMER2026QA4767` deleted; CAT20 Maximum use number reverted 25→0. Promotion restored to original 1-coupon state.

## Evidence paths
`tests/Sprint26-11/VCST-4767/screenshots/`:
- `run1-special-chars-create-disabled.png`
- `run3-special-chars-create-disabled.png`
- `positive-control-alphanumeric-create-enabled.png`
- `positive-control-coupon-created-in-list.png`
