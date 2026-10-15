# BUG: Admin SPA ui-grid Grid Menu button paints over the header label under it (horizontal scroll)
## Status: REPRODUCED
**Found by:** agent — testing VCST-5884 (filed by Kirill Iusupov's run; re-checked by scheduled qa-autofix run 2026-10-15)

- **Tracker:** https://virtocommerce.atlassian.net/browse/VCST-6267
- **Severity:** Low (cosmetic, opt-in scrolled state, readable after scrolling)

## Re-check 2026-10-15 (scheduled /vc-fix:qa-bug, ticket mode)
- Live step on vcst-qa: **BLOCKED — built-in browser signed out of vcst-qa.govirto.com** (redirected to `#!/login`). No live screenshot this run.
- Code-level confirmation on `VirtoCommerce/vc-platform@dev` (bf7dd9f, 2026-10-14):
  - `src/VirtoCommerce.Platform.Web/wwwroot/js/common/uiGridUtils.js:54` — `enableGridMenu: true` for every grid.
  - `src/VirtoCommerce.Platform.Web/wwwroot/css/themes/main/sass/modules/_ui-grid.sass:234-247` — `.ui-grid-menu-button` absolutely placed at right 15px / top 4px, 26×26; nothing in the sheet reserves that strip in the header viewport. Unchanged since 3.1064.0.
- Original evidence (vcptcore_dev, Edge 154 / Firefox 151) is attached to the ticket.

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront | N/A | Admin-only |
| 2. Backend Admin | FAIL (ticket evidence; live re-check blocked) | ticket attachments 86141, 86142 |
| 3. GraphQL xAPI | N/A | CSS |
| 4. Platform REST | N/A | CSS |

**Owning layer:** Layer 2 — Admin SPA (platform theme)

## Auto-fix decision
/qa-fix **not run** (Gate 0, "when in doubt, BAIL"):
1. The ticket states "Whether to fix is a product call — the behaviour is undocumented either way".
2. The fix changes the header layout of **every** Admin SPA grid (shared platform theme), not one blade.
3. G2/G3 for Admin layout bugs want a rendered measurement on the deployed blade; live access was blocked this run.
Needs a human: product decision (fix or accept) — then rerun `/vc-fix:qa-fix VCST-6267`.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 2 — Admin
- **Suggested repo:** VirtoCommerce/vc-platform
- **repoKind:** platform
- **Ownership hint:** platform
- **Component / module:** Platform Admin SPA theme — ui-grid
- **RCA anchor:** `_ui-grid.sass:234-247` (`.ui-grid-menu-button`), `uiGridUtils.js:54`
- **Routing confidence:** MEDIUM (single file; scope is platform-wide visual)
