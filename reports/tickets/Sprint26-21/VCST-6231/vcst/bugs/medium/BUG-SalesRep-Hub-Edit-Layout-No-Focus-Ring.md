# Sales Rep Hub: layout cards have no visible focus ring in Edit layout (CSS layers)

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-6231

**Severity:** Medium · **Provenance:** IN-SCOPE (caused by VCST-6231 / PR vc-frontend#2577) · **Oracle:** BL-A11Y-001, WCAG 2.4.7, VCST-6231 AC-8

## Steps
1. vcst storefront 2.61.0-pr-2577-4c17-4c171a96, sign in as SALES_REP_EMAIL.
2. Open `/company/dashboard` → **Edit layout**.
3. Press Tab until a KPI card (`.layout-block--whole`, tabindex 0) is focused.

## Expected
- The focused card shows the theme focus ring (2px solid #3b82f6, 2px offset), like every other control.

## Actual
- The focused card (`:focus-visible` true) computes `outline: 1px dashed` neutral-300 — the same as unfocused cards; no visible indicator. Same on the "My customers" card. The card's reorder handle button does get the ring.
- Screenshot: `bugs/screenshots/SalesRep-Hub-Edit-Layout-No-Focus-Ring/R2-3-FAIL-focused-block-no-ring.png`

## Root Cause Analysis
- On the stand the hub is rendered by the VirtoCommerce.SalesRep module-federation plugin (`/modules/$(VirtoCommerce.SalesRep)/plugins/vc-frontend/…`, plugin built from vc-module-sales-rep, PR #13). Its stylesheet is **unlayered** and has no `.layout-block--whole:focus-visible` rule.
- #2577 moved the theme ring (`body *:focus-visible`) into `@layer base.tw`. Unlayered CSS beats every layer, so the plugin's `.layout-block--editing` outline now wins; before #2577 the ring (0,1,1) beat it (0,1,0) by specificity.
- #2577 adds a `:focus-visible` ring to the in-repo copy (`client-app/modules/sales-rep/components/layout-block.vue:110`), which this stand does not render.
- Wider: any unlayered module-plugin CSS overrides every theme layer until plugin CSS moves into the `plugins` layer (accepted in VCST-6231 "Fork impact").

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront | FAIL | computed outline + screenshot |
| 2. Admin | N/A | CSS only |
| 3. xAPI | N/A | CSS only |
| 4. REST | N/A | CSS only |

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 1 — Storefront (module-federation plugin)
- **Suggested repo:** VirtoCommerce/vc-module-sales-rep (the plugin build the stand serves); alternatively the vc-frontend #2577 branch if the plugin is meant to load into the `plugins` layer
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** Sales Rep Hub dashboard layout (layout-block)
- **RCA anchor:** vc-frontend `client-app/modules/sales-rep/components/layout-block.vue:110` (the fix not present in the plugin)
- **Routing confidence:** MEDIUM — the fix can land in the plugin or in how the host layers plugin CSS
