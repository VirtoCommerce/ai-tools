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
