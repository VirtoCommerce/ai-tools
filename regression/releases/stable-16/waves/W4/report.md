# stable-16 W4 — Returns, B2B, accounts

**Owner:** Aleksandra Mitricheva · **Sub-task:** VCST-6408 · **Run:** REG-2026-11-09-1635-W4 · **Env:** vcptcore_regression · **Status:** TRIAGED

**Build.** Pre-flight Platform 3.1076.8 / theme 2.59.0. **Redeployed mid-run** ≈13:50–14:05Z 2026-11-09 to Platform 3.1076.13 with 38 modules one patch up (Customer 3.1029.1, Return 3.1004.1, Orders 3.1018.1, XOrder 3.1014.2, Store, Core, Notifications). The machine lanes of 027, 027b, 050d, 050o and 073a ran on the old build; 073b ran inside the deploy window; everything else on 3.1076.13 (re-checked 2026-11-10, unchanged). No failure traced to the deploy.

**Seeded for this wave:** `seed:returns:org` (ORG_RET_*), RETURNS_AGENT_NO_AUTHORIZE (password reset, boundary 200/403 verified), PERSONAL_USER_VIRTO → `agent-test-personal-virto-20260811@test-agent.com` (`seed:edge-cases personal`).

## Results per suite

| Suite | Cases | PASS | FAIL | BLOCKED | SKIPPED |
|---|---|---|---|---|---|
| 006 B2B Organization | 71 | 55 | 7 | 8 | 1 |
| 008 B2B Members | 40 | 7 | 4 | 23 | 6 |
| 014b Orders — Returns, Documents & Dates | 50 | 26 | 14 | 5 | 5 |
| 014c Orders — buyer's own returns | 46 | 20 | 0 | 24 | 2 |
| 026 Customer Contacts | 74 | 55 | 6 | 13 | 0 |
| 027 Customer Orgs & Invites | 71 | 45 | 9 | 17 | 0 |
| 027b Customer Org-Scoped Roles | 20 | 1 | 8 | 11 | 0 |
| 031 Auth Login & Register | 37 | 18 | 3 | 5 | 11 |
| 033 Auth Company & Account Menu | 15 | 3 | 0 | 6 | 6 |
| 050d GraphQL xProfile | 60 | 35 | 11 | 14 | 0 |
| 050o GraphQL xAPI — Returns | 63 | 25 | 34 | 3 | 1 |
| 073 Returns | 23 | 19 | 1 | 0 | 3 |
| 073a Returns — Authorize & Notifications | 37 | 12 | 22 | 3 | 0 |
| 073b Returns — Admin SPA Decisions | 17 | 8 | 0 | 9 | 0 |
| **Total** | **624** | **329** | **119** | **141** | **35** |

## Ledger verdicts (296 rows, untriaged 0)

| Verdict | Rows | What |
|---|---|---|
| NOT_TESTABLE | 90 | Organization returns (VCST-5884) need Return ≥ 3.1005.0 — not in this bundle (014c 21, 050o 16, 073a 6, 073b 5, 073 1); manual/deprecated cases; lane limits (network interception, CDP, zoom) |
| ENV_CONFIG | 80 | FileUpload scope `return-attachments` not configured (INVALID_SCOPE); store `Customer.MembershipRolesWhitelist` override empty → org-scoped invites RoleNotAllowed (KB-68D63D8C); no mandatory email verification; env-wide cases left for WX |
| DATA | 60 | **Organization maintainer membership points at a role id that does not exist here (14 rows, below)**; 073a cases sign in as USER instead of RETURNS_AUTH_BUYER (13); USER2 / MULTI_ORG_USER / MULTI_ORG_TF_BR (password expired) unusable; aged window fixture; missing reason translations |
| TEST_DEFECT | 42 | 027b unresolved `{{TIMESTAMP}}` in org names and `[?…]` vs `[*?…]` length; 401 not 302 for anonymous calls; stale UI expectations (invoice download, Continue shopping, dual-month picker); API cases with prose steps routed to the browser lane |
| REAL_BUG | 22 | 18 distinct defects (below) |
| PENDING_DECISION | 2 | CUST-112 (organization_id substitution vs refusal), CUST-056 (confirmation email for Admin-created accounts) — product owner |

## Real bugs (DRAFT, not filed)

new_in_release is `no` where the stable-15 code or stand was checked; `unknown` elsewhere (no stable-15 stand).

| Case | Defect | Sev | Conf | New |
|---|---|---|---|---|
| CUST-093 | POST /api/customer/organization-memberships, null/missing userId → 500 exposing raw SQL (DB, table, FK). Reproduced 4/4; module has no validation, platform middleware returns the inner exception message | P2 | HIGH | no |
| OBS-CUST-093-EMPTY-USERID | Same endpoint accepts userId "" and saves a membership with an empty user | P2 | HIGH | no |
| AUTH-069 | /account/change-password has no "signs you out of other devices" notice (VCST-4531 AC; KB-4BDF14A7, 4 confirmations) | P2 | HIGH | unknown |
| CUST-002 | Employee created via Contacts › Add › Employee saved with name=null → blank Name cell (KB-8970F253) | P1 | MED | unknown |
| CUST-161 | Export from a group-filtered member blade exports all 336 contacts & 99 orgs (KB-CB6A3FB2) | P1 | MED | unknown |
| CUST-054 (+036) | Member keyword search: `?` and leading `!` return the whole member set (KB-0B2C92E1) | P2 | MED | unknown |
| CUST-172 | Modified Date sort dropped by a keyword search (VCST-4884 is Done — fix absent or regressed on 3.1029.1; KB-7011E90B) | P2 | MED | unknown |
| CUST-090 | inviteUser urlSuffix ignored: link goes to /account/dashboard, not /confirm-invitation | P2 | MED | unknown |
| CUST-079 | Admin Invite customers: manually chosen language not sent (cultureName stays en-US) | P2 | MED | unknown |
| ORD-063 (+064–066) | Orders date presets send bounds one day early in a UTC+3 browser; today excluded, "Last year" hides 26 orders | P2 | MED | unknown |
| ORD-102 | Date field focus ring ≈1.83:1, below BL-UI-007's 3:1 | P3 | MED | unknown |
| ORD-081 | Applied date range lost after Back navigation (VCST-4892 story is Done) | P3 | MED | unknown |
| CUST-084 | inviteUser with an unknown customerOrderId returns succeeded:true and links nothing | P3 | LOW | unknown |
| ORD-075 | Un-applied picker dates kept on reopen | P3 | LOW | unknown |
| PRF-GQL-074 | revokeOrganizationInvite → generic INVALID_OPERATION | P2 | LOW | unknown |
| PRF-GQL-079 | Rejected single-org member still gets a token (check vc-module-customer#312 in 3.1029.1) | P1? | LOW | unknown |
| PRF-GQL-080 | Locked membership grant returns a token instead of invalid_grant (KB-735C7B46 vs BL-AUTH-013) | P2 | LOW | unknown |
| RET-AUTH-035 | Decided return's attachments.0.url null (seeder vs API undecided) | P3 | LOW | unknown |

LOW-confidence rows are re-verified live before any filing (Step 6).

**Not a product bug — the maintainer finding.** 008 B2C-MBR-004/005/008/009 (+5 cascades), 050d PRF-GQL-066..069 and 006 B2C-ORG-034 looked like "maintainer has no permissions". Investigation (evidence/MAINTAINER-PERMS): the membership stores `roleId: org-maintainer`, but this stand's Organization maintainer role id is `668a21cf-…`; `OrganizationIdClaimProvider` skips an unknown role id silently, so the token carries only org-employee permissions. The literal comes from our own test data (`test-data/b2b/roles.csv`, `edge-cases-specs.mjs:117`). Product-improvement candidate (low): the API accepts a non-existent role id.

## BLOCKED causes and their fix

| Cause | Cases | Fix |
|---|---|---|
| Organization returns not in stable-16 | ~49 | none on this bundle; add a Return ≥ 3.1005.0 gate so the planner drops them (014c declares `requiresModules` without a version) |
| FileUpload scope `return-attachments` missing | ~14 | vc-deploy-dev infra key; add to `config/suite-requirements.json` (014c, 050o, 073b) |
| Env-wide (whitelists, member groups, reindex, module install, shared TechFlow memberships) | ~30 | exclusive wave WX |
| Store MembershipRolesWhitelist override empty | 7 | WX: set the whitelist on B2B-store |
| Maintainer role id mismatch | 14 | WX: repoint the memberships to the stand role id; seeders resolve role ids by name |
| Personas: MULTI_ORG_USER (stale password), MULTI_ORG_TF_BR (password expired), USER2 (absent), RETURNS_AUTH_BUYER (cases use USER), BuildRight admin / SUPPORT_AGENT (no secret) | ~35 | re-seed / renew passwords; point 073a at RETURNS_AUTH_BUYER |

## Repairs proposed (not applied — one author per suite)

027b `{{TIMESTAMP}}` → `{{NOW_MS}}` and `[?` → `[*?`; 027 CUST-076/087 expect 401; 050d PRF-GQL-073/075 trailing-comment parse and missing organizationId, 081 error code; 073a role USER → RETURNS_AUTH_BUYER; 014b stale UI expectations (ORD-037/038/040/049/050/074/077, invoice 041–043); 031 AUTH-012 password policy; manifest/requirements gaps above.

## Before the next owner continues

Nothing is left un-run (624/624). Open items: the DRAFT bugs (Step 6), the PENDING_DECISION rows, the WX hand-offs above and the suite repairs. Raw evidence (screenshots, traces, evidence packages) is local to the owner's machine under `reports/regression/REG-2026-11-09-1635-W4/`.
