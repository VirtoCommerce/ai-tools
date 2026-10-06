# VCST-6176 — Verification report

**Verdict:** VERIFIED — STR 3/3, checklist 9/9 applicable (1 N/A)
**Date:** 2026-10-06 · **QA:** Elena Mutykova (Claude, `/qa-verify-fix`)

## Build
| | |
|---|---|
| Before (RED) | vcst-qa storefront `2.59.0-pr-2524-3069-30691594` |
| After (GREEN) | local frontend-only `fe-ab8c4e3e2c98`, storefront `2.59.0-pr-2544-3504-350418b7`, backend vcst-qa |
| PR | VirtoCommerce/vc-frontend#2544 (open, head `350418b7`) — `icon-aliases.ts` +1 line, `modules/returns/menu.test.ts` new |
| Deploy PR | vc-deploy-dev#6817 (not merged, not needed) |

## Fix
`receipt-refund` had no outline asset and no alias, so `resolveIcon()` fell back to the solid 20×20 glyph. The PR aliases it to Lucide `undo-2`, covering the desktop menu, the mobile menu and the Request return button.

## STR runs (3/3)
| Run | Page | Returns icon | Result |
|---|---|---|---|
| 1 | `/account/orders` desktop sidebar | `vc-icon--outline`, viewBox 24, path `M9 14 4 9l5-5` | PASS |
| 2 | `/account/returns` fresh load | outline, viewBox 24 | PASS |
| 3 | `/account/orders` mobile 375×812 menu | outline, viewBox 24, undo-2 | PASS |

`X-VC-Local-Theme` = `fe-ab8c4e3e2c98` before and after the runs.

## Checklist
| Area | Source | Check | Result |
|---|---|---|---|
| Fix | BF | Original bug reproduced first (RED baseline, `baseline/baseline-2026-10-06.json`) | PASS |
| Fix | BF | Returns sidebar icon is outline Lucide | PASS |
| Fix | BF | Root cause addressed in the alias table, not per call site | PASS |
| Fix | BF | All call sites: desktop menu, mobile menu, Request return button (order AGENT-TEST-ORD-RET-SF039) | PASS |
| Regression | #17 | Account sidebar links correct, active state on Orders | PASS |
| Regression | BF | Other account icons unchanged (outline, same size, x=61, row 40px) | PASS |
| Regression | BF | No new console errors / failed requests (only local FCM service-worker 404s) | PASS |
| Business rule | BL-UI-005 | Request return aligned with Print order (top, 45px height, 24px icon at same offset) | PASS |
| Edge | BF | Dark theme: Returns stroke/fill match Lists and Quote requests | PASS |
| Cross-layer | BF | API / Admin: N/A, icon-only frontend change | N/A |

## Evidence
`baseline/` (RED), `after-desktop-sidebar.jpg`, `after-mobile-menu.jpg`, `after-request-return-button.jpg`, `evidence.html`.

## Process notes
- Step 0.2: `/qa-env-check` not run as a skill; endpoints probed directly instead (vcst-qa storefront 200, localhost 200 + GraphQL data, vcst-qa admin reachable but the built-in browser is signed out of it).
- Step 0.3: duplicate check — this ticket's earlier pass today was this same verification; nothing superseded.
- Step 5: run inline (no agent) — the QA agents use Playwright; this flow is limited to the built-in browser.
- Step 3/6: Jira transitions On QA → Finish test were denied by this session's permission check. Operator applies them.
- Tracker comment: inline screenshots not embedded — `api.media.atlassian.com` is blocked (HTTP 403 from the egress proxy) from both this workspace and the device shell.
