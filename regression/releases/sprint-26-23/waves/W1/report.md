# W1 — Security & sign-in · REG-2026-11-26-0300-W1

Owner Elena Kutasina · vcst · Platform 3.1101.0 · ProfileExperienceApi 3.1028.0 · theme 2.63.0-alpha.2681 · persona set S1.

| Suite | Planned | Pass | Fail | Blocked | Skipped |
|---|---|---|---|---|---|
| 031 Auth Login & Register | 37 | 20 | 3 | 3 | 11 (manual) |
| 032 Auth Session & RBAC | 20 | 5 | 1 | 11 | 3 (manual) |
| 033 Auth Company & Account Menu | 23 | 2 | 0 | 15 | 6 (manual) |
| 044 Security Tests | 34 | 17 | 4 | 9 | 4 (deprecated) |

## Before morning triage (owner) — 46 FAIL/BLOCKED without a ledger row
- **Likely real (High):** SEC-PCI-007 — `authorizePayment` replay with a tampered / re-signed CyberSource token returns `isSuccess:true` instead of a refusal (KB-C41F690F).
- **Incidental:** checkout address dialog on `/cart` stores a `<script>` payload (KB-968F2E06); `/account/profile` Last name / Email placeholders say "Enter your first name".
- **Probably stale cases:** AUTH-009, AUTH-054, AUTH-069, AUTH-048, SEC-AUTH-001, SEC-AUTH-003, SEC-XSS-004.
- **VCST-7006/6974/6970 not exercised:** 032 has no case for the mutations; 033 AUTH-036/037 blocked — B2B-store member-role whitelist is empty (KB-68D63D8C). GAP-01..03 still open.
- **Environment:** persistent token validation off on vcst (6 cases); AUTH-057/058/062–065/074–077 need signed-in API calls the runner may not script; AUTH-049 needs two sessions; AUTH-078..082 are vc-frontend-next cases; AUTH-083/084 `/compare` 404 — **VirtoCommerce.ProductComparison is not installed on vcst while theme alpha.2681 already dropped its own `/compare` route (VCST-5918) — compare is broken on vcst for every user**.
- Cleanup left: one empty anonymous cart (AGENT-TEST id, 032 AUTH-059 retry).

## Triage (2026-11-26) — ledger: 46 rows, untriaged 0
- **REAL_BUG:** SEC-PCI-007 → **VCST-7034** (CyberSource accepts tampered/forged/alg:none/expired tokens; every replay opens a new gateway payment; present since 3.800.0).
- **TEST_DEFECT, fixed in ai-tools#709:** AUTH-009, AUTH-054, AUTH-069, AUTH-043, SEC-AUTH-003, SEC-AUTH-005 — re-run green (REG-2026-11-26-0900-W1F, REG-2026-11-26-1000-RB) and Automated. AUTH-048, SEC-AUTH-001, SEC-XSS-004 rewritten, still Draft (simple-product data, runner JWT grammar, persona last name).
- **ENV_CONFIG still open:** B2B-store role whitelist empty (AUTH-036/037, VCST-7006 unverified) — restore after W5; mandatory email verification and persistent token validation off — run those cases in the WX window; ProductComparison installed 2026-11-26 (vc-deploy-dev#7159) — re-run AUTH-083/084.
- **NOT_TESTABLE here:** vc-frontend-next cases (AUTH-078..082), storage/integrity reads (SEC-PCI-005/006), App Insights half (SEC-SENSITIVE-001), two-context AUTH-049.
- Lockout message wording: docs are silent; product left as is (owner, 2026-11-26).
