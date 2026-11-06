# FIX-2026-10-20-1350 — VCST-6375

**Verdict:** PR open, awaiting human review — [vc-frontend#2588](https://github.com/VirtoCommerce/vc-frontend/pull/2588) (not merged). Ticket left at **In progress** by operator choice (no transition); one Jira comment (id 112197).

## Bug
Cart "Price per item" shows the list price on wide containers and the discounted price on narrow ones when the line has `showPlacedPrice = false` (promotion with "Round amount per item" unchecked).

## Route
`VirtoCommerce/vc-frontend` (kind `frontend`), native platform path, branch `claude/qa-autofix/VCST-6375` off `dev` `63e274af`, commit `871e7eb5`.

## Root cause / fix
`client-app/ui-kit/components/molecules/line-item/vc-line-item.vue` — the narrow `.vc-line-item__property-price` slot rendered `actualPrice || listPrice` and ignored `showPlacedPrice`; the wide `.vc-line-item__price` column respects it. Fix: `:list-price="showPlacedPrice ? actualPrice || listPrice : listPrice"`.

## Scope decision (operator)
"Mirror desktop". Side effect: quote and wishlist lines (no `show-placed-price`) show the list price on narrow containers too. Live measurement on vcst-qa: at 1920/1366 containers are 922–1086px (wide column, unchanged); at 1280 they are 835–883px (narrow slot; wishlist $264 sale → $268 list). Follow-up suggested: should quotes/wishlists pass `show-placed-price`.

## Gates
| Gate | Result |
|---|---|
| G0 triage | PASS — localized, template-only, after scope decision |
| G1 route | PASS — vc-frontend, anchor confirmed on `origin/dev` |
| Write preflight | PASS — push=true |
| G2 reproduce | PASS — new `vc-line-item.test.ts` RED: `expected '$90' to be '$100'` |
| G3 fix | PASS — 4/4 green, vue-tsc clean, eslint 0, prettier clean; build/full suite skipped (template-only) |
| G4 review | APPROVE (frontend-reviewer; RED→GREEN reproduced independently) |
| G5 CI | Security/Sonar PASS; `ci` RED on unrelated `sales-rep-tasks-page.test.ts` (8 "Tasks page scope chips" tests) — same failure on `feat/VCST-6231-css-layers` and `fix/VCST-6374` today; pre-existing. `auto-tests` skipped by workflow. |
| G6 E2E | Not run by design — needs deploy verification (`/qa-verify-fix VCST-6375`) |
| G7 | STOP for human review; never merged |

## Open items
- Draft quote RFQ261020-00001 on vcst-qa created during measurement — operator will delete.
- `needs deploy verification` label does not exist in vc-frontend; not applied (`deploy-qa` declined).
- Incidental: quote line remove button is labelled "Remove from cart" (not filed).
- Evidence: `reports/tickets/Sprint26-20/VCST-6375/screenshots/` (cart-1920, wishlist-1920, wishlist-1280, quote-draft-edit-1920).
