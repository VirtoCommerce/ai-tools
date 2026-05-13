# VCST-4905 — Backend / Admin SPA Test Execution Report

Build: Platform 3.1026.0, theme PR #2279 (3ce07383)
Browser: playwright-edge + Node fetch (no curl/PS — Node was available)
Env: vcst-qa (`BACK_URL=https://vcst-qa.govirto.com`, store=`B2B-store`)
Date: 2026-05-13
Tester: qa-backend-expert (resumed after prior crash)

Test data (resolved via @td):
- SUPPORT_AGENT (USR-001 John Mitchell): id `143bc845-7ba3-4982-ae9a-a9446a399705` / `test-john.mitchell-20260310@test-agent.com` / `TestPass123!`
- IMPERSONATE_TARGET (USR-007 David Kim): id `ec3031ac-6dd9-42e9-b7a7-0c10d9aac07b` / `test-david.kim-20260310@test-agent.com` / `TestPass123!`
- OTHER_ORG_USER (USR-008 Carlos Rodriguez): id `3302dcbc-e2b2-41c4-a272-81411c9a083b`

---

## A. Admin SPA Login On Behalf button (IMP-014, IMP-022)

The button lives on the **Account-detail blade** (the 4th blade in the Contact → Accounts → Account stack), NOT on the Contact blade itself.

| Probe | Verdict | Evidence |
|---|---|---|
| A1 Customer-typed contact (USR-007 David Kim) — toolbar shows `Login on behalf` button when account blade is opened (`Save / Reset / Change password / Lock account / Login on behalf`). Icon = `fa-key`. Button visible, enabled. | **PASS** | `evidence-backend/vcst-4905-A1-david-kim-account-blade.png`, contact blade `vcst-4905-A1-david-kim-contact-blade.png` |
| A2 Click button → opens NEW TAB to storefront `/account/impersonate/{userId}`. Resolved URL: `https://vcst-qa-storefront.govirto.com/account/impersonate/ec3031ac-6dd9-42e9-b7a7-0c10d9aac07b` (matches `IMPERSONATE_TARGET.userId`). Storefront page title: "QA & Security verification". | **PASS** | `evidence-backend/vcst-4905-A2-storefront-impersonate-page.png` |
| A3 Administrator-type user (`admin`, type=`Administrator`, accessed via Security → Users → admin) — toolbar shows `Save / Reset / Change password / Lock account / **Login on behalf**`. Button is **PRESENT**, visible, enabled. Account-type label confirms "Administrator", "Is administrator" flag is set. | **FAIL** vs. IMP-022 expected ("button absent for Administrator-type") | `evidence-backend/vcst-4905-A3-admin-user-blade-loginonbehalf-check.png` |

**A3 caveat — not necessarily a code regression:** The story expects IMP-022 to hide the button for Administrator-type users. The current build still renders the button regardless of `userType`. Note however that *exercising* the button against an Administrator user would still fail at the storefront layer (`reference_admin_backoffice_only` — Administrator-type users cannot authenticate against the storefront). So the practical security boundary is preserved by a different layer, but the UI invariant claimed by IMP-022 is violated. File as **UI-side scope gap**, severity Medium.

---

## B. /connect/token impersonation probes

All five probes hit `${BACK_URL}/connect/token` with `storeId=B2B-store` body parameter. Full evidence (JSON bodies + decoded JWTs) at `evidence-backend/probes-tokens-evidence.json`.

| ID | grant_type / actor → target | HTTP | sub (issued) | Verdict | Notes |
|---|---|---|---|---|---|
| B0 | password / SUPPORT_AGENT | 200 | `143bc845…05` (SUPPORT) | PASS | Operator token issued; role=`__customer`; permissions include `storefront:user:*`, `storefront:organization:*` |
| B1 | impersonate / SUPPORT → IMPERSONATE_TARGET | 200 | `ec3031ac…7b` (TARGET) | PASS (control) | Issued token's `sub` switches to David Kim; permissions are TARGET's (`storefront:organization:view, storefront:user:view`). No `act` / `amr` claim present indicating impersonation context. |
| **B2** | impersonate / SUPPORT → SUPPORT (self) | **200** | `143bc845…05` (SUPPORT) | **FAIL** | **BL-AUTH-008 VIOLATION.** Self-impersonation returns a fresh access token with `sub=SUPPORT.userId`. No rejection, no warning. |
| **B3** | impersonate / TARGET_TOKEN (already-impersonated) → OTHER_ORG_USER | **200** | `3302dcbc…3b` (OTHER) | **FAIL — P0-security** | **BL-AUTH-009 VIOLATION.** Nested/chained impersonation succeeds — TARGET (Customer, viewer in another org, `__customer` role) can be used to *further* impersonate USR-008 in a third org. Token chain extends without bound; no `act` claim in either token to enforce the "single-hop" invariant. |
| B4 | impersonate / TARGET (own credentials, no CanImpersonate role) → OTHER_ORG_USER | 403 | — | PASS | Permission gate works at the role/permission layer (RBAC enforced for users without `CanImpersonate`). |

### B2 / B3 issued-JWT shape (decoded)

The issued tokens carry **no `act` claim** (RFC 8693 Actor Claim) and no `amr` value indicating that the principal is an impersonated session. Downstream resource servers therefore cannot distinguish a "natural" customer session from an impersonated one, and cannot reject further impersonation calls based on the principal's session class. This is the structural reason B3 chains successfully.

Sample claims for B3 issued token:
```
sub:        3302dcbc-e2b2-41c4-a272-81411c9a083b   (Carlos Rodriguez, USR-008 — OTHER)
email:      test-carlos.rodriguez-20260310@test-agent.com
role:       __customer
act:        (absent)                              ← BL-AUTH-009: no actor claim
amr:        (absent)                              ← cannot detect impersonation
permission: storefront:user:view, storefront:user:create, …
```

### Bugs / observations

- **BUG-VCST-4905-B2** (High / security-hardening): `POST /connect/token` with `grant_type=impersonate` and `user_id=<operator's own id>` returns HTTP 200 and issues a fresh access token (self-impersonation). Expected: 4xx with `invalid_grant` / `target_must_differ_from_operator`. BL-AUTH-008 violation. Repro in `evidence-backend/probes-tokens-evidence.json#B2`.
- **BUG-VCST-4905-B3** (P0 / Security): Nested impersonation is not blocked. After B1 issues an operator→TARGET token, that TARGET token can itself be presented as the bearer of a *further* `grant_type=impersonate` request and successfully obtain an OTHER token. No `act` claim is emitted on impersonated tokens, so the server cannot detect the chained call. **Practical impact**: any user with CanImpersonate can launder their elevated privilege through any intermediate Customer-typed user to reach a third Customer-typed user in any organization (cross-org), defeating both the audit trail and the single-hop expectation. BL-AUTH-009 violation. Repro in `evidence-backend/probes-tokens-evidence.json#B3`.

---

## C. UI error mapping (IMP-026) — skipped

Time-boxed out (8-minute budget consumed by A + B + investigating B2/B3 evidence). Recommend follow-up exploratory session by qa-frontend or qa-testing.

---

## Business rules verified

| Rule | Status | Evidence |
|---|---|---|
| BL-AUTH-005 (RBAC — CanImpersonate enforced at API layer) | PASS | B4 returns 403 |
| BL-AUTH-006 (impersonation requires explicit permission) | PASS | B4 returns 403; B0/B1 (SUPPORT has perm) returns 200 |
| **BL-AUTH-008 (no self-impersonation)** | **FAIL** | B2 issued token, HTTP 200, sub==operator |
| **BL-AUTH-009 (no nested/chained impersonation)** | **FAIL — P0** | B3 issued token, HTTP 200, sub==third party; no `act` claim |

---

## Verdict: **FAIL** (2 bugs found, including 1 P0-security)

| Layer | Verdict |
|---|---|
| Admin SPA — Login on behalf button on Customer (IMP-014) | PASS |
| Admin SPA — Click opens `/account/impersonate/{userId}` storefront (IMP-014 wiring) | PASS |
| Admin SPA — Login on behalf hidden for Administrator-type (IMP-022) | **FAIL** — button still visible for `admin` |
| API — RBAC permission gate (BL-AUTH-005/006) | PASS |
| API — Self-impersonation blocked (BL-AUTH-008) | **FAIL** |
| API — Nested impersonation blocked (BL-AUTH-009 P0-security) | **FAIL — P0** |

### Recommended actions
1. **File BUG-VCST-4905-B3 as P0/Security** — nested impersonation chain extension; involves token issuance contract change (add `act` claim, reject `grant_type=impersonate` when the bearer's token already carries impersonation context).
2. File BUG-VCST-4905-B2 as High — explicit operator≠target check in the impersonation grant handler.
3. File BUG-VCST-4905-A3 as Medium / UI — Login on behalf button visible for Administrator-type users in Security → Users (defense-in-depth; storefront login already blocks Administrator-typed users, but the UI invariant for IMP-022 is violated).
4. IMP-026 storefront error-mapping not exercised — re-test next pass.

### Evidence files
- `tests/Sprint-current/VCST-4905/evidence-backend/probes-tokens-evidence.json` — all 5 token probe bodies + decoded JWT claims
- `tests/Sprint-current/VCST-4905/evidence-backend/vcst-4905-A1-david-kim-contact-blade.png`
- `tests/Sprint-current/VCST-4905/evidence-backend/vcst-4905-A1-david-kim-account-blade.png`
- `tests/Sprint-current/VCST-4905/evidence-backend/vcst-4905-A2-storefront-impersonate-page.png`
- `tests/Sprint-current/VCST-4905/evidence-backend/vcst-4905-A3-admin-user-blade-loginonbehalf-check.png`
- `tests/Sprint-current/VCST-4905/probe-tokens-full.mjs` — reproducible probe script (uses .env)
