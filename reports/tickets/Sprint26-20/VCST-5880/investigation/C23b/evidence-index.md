# C23b — Evidence index: "Clear all" text contrast (#f99e24 on #fff)

**Verdict:** REPRODUCED 2/2 builds (BASELINE + PR, identical values). PRE-EXISTING, OUT-OF-SCOPE for VCST-5880. **Scope: SYSTEMIC** (shared ui-kit button token + shipped preset colour).

**Env:** TEST_ENV=vcst (stand `vcst_qa`), guest, Edge via playwright-edge, 1280x900, 2026-10-12.
**Builds:** BASELINE `https://vcst-qa-storefront.govirto.com`, theme `2.60.0-pr-2511-81f1-81f18d01` · PR `http://localhost`, theme `2.60.0-pr-2518-ee98-ee98adbd` (vc-frontend PR #2518, head `fix/VCST-5880` @ `ee98adbd`; API proxied to vcst-qa). Source also read on `dev` @ `f60ab8d6`.
**Data:** `@td(PROD_CMP_A)`, `@td(PROD_CMP_B)`, `@td(PROD_LONGNAME)` (Group A) + `@td(PROD_CMP_C)` (Group C), added with each card's "Add to Compare" button. `compareProducts` was empty on both origins before adding.
**Server-side layer:** none. This is a storefront CSS token defect, so the trace ID and App Insights rows do not apply.

## STR
1. As a guest, add the 4 fixtures above to compare, then open `/compare` at 1280 px.
2. Read the "Clear all" button in the page header (top right).

## Measurements (getComputedStyle)
| Surface | Build | Control (classes) | Text | Background | Font | Ratio |
|---|---|---|---|---|---|---|
| `/compare` "Clear all" | BASE + PR | `vc-button--outline--primary` sm | `rgb(249,158,36)` #f99e24 | #ffffff | 14px / 700 | **2.11:1** |
| catalog card "4 variations" (`/seed-compare-fixtures/…-group-a`) | BASE + PR | `vc-button--outline--primary` sm | #f99e24 | #ffffff | 14px / 700 | **2.11:1** |
| `/cart` empty state: "Continue shopping", "Add with bulk order" | BASE | `vc-button--solid--primary` md | #ffffff | #f99e24 | 16px / 700 | **2.11:1** |
| `/compare` compact header "Add to cart" | BASE + PR (seen) | `vc-button--solid--primary` | #ffffff | #f99e24 | — | **2.11:1** |
| header Compare count badge "4" (every page) | BASE | — | #ffffff | #f99e24 | 12px / 700 | **2.11:1** |

These are WCAG 1.4.3 AA failures: 4.5:1 is required, and the 3:1 large-text bar also fails, since 14 px and 16 px bold are not large text. Icon-only orange controls show the same pair: the card "+" and the cart buttons fail 1.4.11 (3:1) for non-text contrast.

Token chain, read live on the button: `--text-color` → `--vc-button-outline-primary-text` = `#f99e24` → `--color-primary-500` = `#f99e24`. `--color-primary-600` = `#a25c27`, which gives 5.13:1.

## Artifacts
- `../../screenshots/inv-base-1280-compare-header.png`: BASELINE `/compare` header with "Clear all", the "Group A" tab and the orange cart buttons.
- `../../screenshots/inv-pr-1280-compare-header.png`: the same view on the PR build.
- `../../screenshots/inv-pr-1280-catalog-primary-secondary-tokens.png`: catalog card "4 variations" (outline primary), orange "+" buttons, "Show in stock" chip.
- `network-catalog-pr.txt`: request list for the PR catalog page. No 4xx/5xx on API calls, only image 404s.
- Source: listed in `root-cause.md` §3.

## kb
- `KB-4EF50E94` **confirmed**. It records the same pair under the coffee preset on `/company/tasks`, `/company/calendar` and `/account/lists`. The confirmation adds the `/compare`, catalog and `/cart` surfaces.
- `KB-5E82BC11` **captured**: the BASELINE `/compare` observation and its token chain. It overlaps KB-4EF50E94 (found only after the capture), so a curator may merge the two.
