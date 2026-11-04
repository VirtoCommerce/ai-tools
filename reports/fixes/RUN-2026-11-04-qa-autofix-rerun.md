# qa-autofix run (manual re-run): 2026-11-04

Operator: Elena Mutykova. Env: vcst (https://vcst-qa-storefront.govirto.com / https://vcst-qa.govirto.com).
Jira via the Atlassian MCP connector. The legacy Atlassian Rovo connector returned 403 "app not installed" and has been removed.
The vc-fix commands are not available as skills in Cowork, so the steps were followed from plugins/vc-fix/commands/*.md.

## Processed (2 of 13 candidates)
- **VCST-5711**: PR https://github.com/VirtoCommerce/vc-frontend/pull/2632. Ticket is In review. CI: security and quality checks green, `ci` still running at report time. Report: FIX-2026-11-04-0845/.
- **VCST-6504**: already fixed on dev (PR #2570, `border-neutral-500`). No PR opened. Left in To do for /qa-verify-fix. Comment posted.

## Skipped
- VCST-6506: assigned to Dmitry Grishin.
- VCST-6593, 6599, 6600, 6652, 6653, 6099, 6606, 6610, 6613, 6632: over the 2-per-run limit.

## Blocked
- Built-in browser is signed out of the vcst storefront, so the live /cart check couldn't run.
