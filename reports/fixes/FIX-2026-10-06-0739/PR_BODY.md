## Summary

Fixes [VCST-6176](https://virtocommerce.atlassian.net/browse/VCST-6176): the Returns item in the account menu (desktop and mobile) and the "Request return" button showed the legacy solid 20×20 `receipt-refund` glyph, while the other menu items show outline (Lucide) icons.

## Root cause

`receipt-refund` (added with the Returns module) has no outline asset and no entry in `icon-aliases.ts`, so `resolveIcon()` used the transitional outline→solid fallback.

## Change

- `ui-kit/utilities/icon-aliases.ts`: add `"receipt-refund": "undo-2"`. `undo-2` is the glyph the ticket reporter chose; `outline/undo-2.svg` is already in the kit. One alias line covers all three call sites (desktop menu, mobile menu, "Request return" button).
- `ui-kit/utilities/icons.test.ts`: add `["receipt-refund", true]` to the existing `resolveIcon` `isOutline` table, next to the other alias checks (per review).

## Proof

- With the alias line removed, the new table row fails (`expected false to be true`). With the fix, it passes.
- `icons.test.ts` and `vc-icon.test.ts` pass (35/35).
- `eslint` passes on the changed files.

## Notes

- The sales-rep module has the same fallback for `office-building` and `presentation-chart-bar`. Those are left out of scope.
- **Needs deploy verification:** visually check the icon on vcst-qa after deploy.
- Do not auto-merge. This PR is waiting for human review.

🤖 Generated with [Claude Code](https://claude.com/claude-code)


[VCST-6176]: https://virtocommerce.atlassian.net/browse/VCST-6176?atlOrigin=eyJpIjoiNWRkNTljNzYxNjVmNDY3MDlhMDU5Y2ZhYzA5YTRkZjUiLCJwIjoiZ2l0aHViLWNvbS1KU1cifQ
