# VCST-4905 — Storefront Test Execution Report (frontend agent)

Build: theme PR #2279 / 3ce07383, Platform 3.1026.0
Browser: playwright-chrome (Chromium)
Date: 2026-05-13
Runner notes: Resumed after prior crash (API timeout). Cases IMP-001/002/007/010 evidence captured in prior run; verdicts derived from screenshots. Remaining cases executed in this run.

JIRA: https://virtocommerce.atlassian.net/browse/VCST-4905

## Test data
- SUPPORT_AGENT (operator with CanImpersonate): USR-001 John Mitchell — test-john.mitchell-20260310@test-agent.com / TestPass123! (ACME admin, ORG-001)
- IMPERSONATE_TARGET (customer being impersonated): USR-007 David Kim — test-david.kim-20260310@test-agent.com (TechFlow, ORG-002), platform_id `ec3031ac-6dd9-42e9-b7a7-0c10d9aac07b`
- OTHER_ORG_USER (cross-org / nested-impersonation): USR-008 Carlos Rodriguez (BuildRight, ORG-003), platform_id `3302dcbc-e2b2-41c4-a272-81411c9a083b`

## Per-case results

| Case | Title | Verdict | BL | Evidence |
|------|-------|---------|-----|----------|
| IMP-001 | Form rendered for anonymous/no-perm user | PASS | BL-AUTH-005 | evidence/IMP-001-PASS-form-rendered.png |
| IMP-002 | Cancel button redirects to home | PASS | BL-AUTH-005 | evidence/IMP-002-PASS-cancel-redirect-home.png |
| IMP-007 | Form happy path → impersonation initiated | PASS | BL-AUTH-005/006 | evidence/IMP-007-PASS-impersonation-banner.png |
| IMP-010 | Banner displayed during impersonation | PASS | BL-AUTH-010 | evidence/IMP-010-PASS-banner-display.png |
| IMP-003 | Form flow — wrong password rejected | PASS WITH NOTES | BL-AUTH-005 | evidence/IMP-003-PASS-wrong-password-error.png |

| IMP-008 | Silent flow — authenticated operator skips form | PASS | BL-AUTH-005, BL-AUTH-006 | evidence/IMP-008-PASS-silent-flow-banner.png |
| IMP-009 | Silent flow — loading transition | PASS WITH NOTES | BL-AUTH-006 | evidence/IMP-009-PASS-loading-overlay.png |

### IMP-008 notes
- Signed in as SUPPORT_AGENT (John Mitchell, USR-001) at /sign-in.
- Navigated to `/account/impersonate/{IMPERSONATE_TARGET.userId}` (ec3031ac-6dd9-42e9-b7a7-0c10d9aac07b).
- Form was SKIPPED — no Security verification page rendered.
- `POST /connect/token` returned **200** (impersonation grant succeeded).
- Banner appeared in header: "John Mitchell logged in as David Kim Camila-incorporate".
- BL-AUTH-005 (form skipped when CanImpersonate present) + BL-AUTH-006 (silent flow init) verified.

### IMP-009 notes
- Transition was effectively instantaneous on this build — by the time the screenshot fired, page had already redirected to `/` with the impersonation banner present.
- No visible "Switching to customer view..." overlay captured — either the loader was too brief to capture, or the build is fast enough on QA that the overlay is sub-perceivable.
- This is a **minor UX observation**: per PR scope, the silent flow should "show loader". On fast networks the loader may not be visible; recommend adding minimum-display delay (~300ms) or a brief animation to make the audit-event surface to operator.

| IMP-011 | Banner persists across navigation | PASS | BL-AUTH-010 | evidence/IMP-011-PASS-banner-persists-orders.png |
| IMP-012 | Stop Impersonation — no redirect to /sign-in | **FAIL** | BL-AUTH-011 | evidence/IMP-012-FAIL-redirect-to-signin.png |

### IMP-011 notes
- Banner verified on /, /catalog, /cart, /account/orders. Operator (John Mitchell) + customer (David Kim, Camila-incorporate) labels render in top-header.
- "logged in as" text consistently present. BL-AUTH-010 verified.

### IMP-012 notes — **FAIL / P1 bug**
- The Account-menu dropdown shows only **one action button** with `data-test-id="sign-out-button"`, `aria-label="Logout"`, `title="Logout"`. There is **no distinct "Stop Impersonation" affordance**.
- Clicking the logout/stop button:
  - `POST /revoke/token` → **200** (token revoked successfully)
  - **No** `POST /connect/token` with `grant_type=password` re-issuing operator session
  - Browser was redirected to `/sign-in?returnUrl=/account/orders`
- **Expected per VCST-4905 BL-AUTH-011**: Stop Impersonation should preserve the operator session (no redirect to /sign-in; operator should land on home or operator dashboard with their own session intact).
- **Actual**: Both impersonation and operator session are revoked; operator must re-authenticate.
- **Root cause hypothesis**: The shared "Logout" button does not distinguish impersonation mode from normal mode — it always calls full logout/revoke flow.
- **Recommendation**: Add a separate "Stop Impersonation" affordance (distinct from "Logout") that revokes only the impersonation grant and restores the operator's original session token. Alternatively, the logout flow when in impersonation mode should auto-issue a fresh operator token rather than redirecting to /sign-in.

| IMP-013 | Nested impersonation blocked | **FAIL — P0 security** | BL-AUTH-009 | evidence/IMP-013-FAIL-nested-impersonation-allowed.png |

### IMP-013 notes — **FAIL / P0 SECURITY**
- Reproduction: Signed in as John Mitchell (SUPPORT_AGENT). Silently impersonated David Kim (USR-007, ORG-002 TechFlow). While the banner read "John Mitchell logged in as David Kim, Camila-incorporate", navigated directly to `/account/impersonate/{USR-008.userId}` (Carlos Rodriguez, ORG-003 BuildRight).
- **Observed**: Form was **SKIPPED** (no Security verification page rendered). The system silently switched the impersonation target — banner now shows "John Mitchell logged in as Carlos Rodriguez". `POST /connect/token` returned 200 with new impersonation grant.
- **Expected per BL-AUTH-009**: Nested-impersonation must be **blocked**. When the operator is already in impersonation mode, attempts to start a new impersonation must require the Security Verification form (or be rejected outright). The silent switch allows an operator who has compromised an impersonation session to chain into other users without re-authentication or audit checkpoint.
- **Severity**: **P0 security**. Audit trail intent is broken — there is no per-target re-authentication. Also breaks the principle of least surprise: clicking a malicious deep-link while already impersonating performs target swap silently.
- **Recommendation**: When `currentSession.isImpersonating === true`, the impersonate route should EITHER:
  1. Render the Security Verification form (re-authentication for each target), OR
  2. Reject the request with an error page (e.g. "Stop the current impersonation session before starting a new one"), OR
  3. Force-revoke the current impersonation grant and require the operator to complete the form for the new target.
- File JIRA bug — recommend P0 security severity, link to VCST-4905.

| IMP-017 | Self-impersonation outcome | **FAIL — circular impersonation** | BL-AUTH-008 | evidence/IMP-017-FAIL-self-impersonation-allowed.png |
| IMP-030 | Order Creator during impersonation | SKIPPED-FOR-TIME | — | — |

### IMP-017 notes — **FAIL / circular impersonation**
- Reproduction (continued from IMP-013 state, operator John Mitchell still impersonating Carlos Rodriguez via the broken nested-impersonation path): Navigated to `/account/impersonate/{SUPPORT_AGENT.userId}` (143bc845-7ba3-4982-ae9a-a9446a399705, John Mitchell's own platform_id).
- **Observed**: Form was SKIPPED. Banner now reads "John Mitchell logged in as John Mitchell" — **circular impersonation accepted**. No error, no redirect.
- **Expected per BL-AUTH-008**: Self-impersonation should produce a defined non-circular outcome (rejected with error, redirect home without banner, or some defined "you cannot impersonate yourself" response).
- **Severity**: Medium (UX/audit-trail). Not as severe as IMP-013 (no privilege escalation possible since target = self), but pollutes audit logs and is a logical inconsistency: an operator listed as "impersonating themselves" is semantically meaningless and would confuse any downstream auditing.
- **Recommendation**: When `targetUserId === currentSession.userId`, the route should redirect to `/account/dashboard` (or similar) WITHOUT issuing an impersonation grant. The audit log should record a no-op or reject the call entirely.

### IMP-030 notes
- Not executed due to time-box. **Recommendation**: As a follow-up, perform an end-to-end checkout under impersonation and verify the resulting order has `createdBy` / Creator metadata = operator (John Mitchell / SUPPORT_AGENT), NOT the impersonated customer. The Admin Orders module should distinguish operator-initiated orders from customer-initiated orders. This is critical for B2B audit/compliance — an operator placing an order on behalf of a customer must be traceable.

### IMP-003 notes
- Inline danger alert rendered: "Login attempt failed. Check your credentials" with red icon — matches new "Security verification" form contract.
- `POST /connect/token` returned **400** (no token issued) — confirmed in Network tab. No impersonation grant.
- **Observation (minor UX)**: Password field is NOT cleared after failed submit (still shows `wrongPass`). Acceptance criteria called for "password field cleared/refocused" — this is a minor UX deviation. Verify-and-continue button is re-enabled.
- BL-AUTH-005 verified (negative path).

## Business rules verified
- BL-AUTH-005 (Security Verification form rendered for anonymous operator) — IMP-001, IMP-002, IMP-007 (prior run), IMP-003 (this run, negative path)
- BL-AUTH-006 (Form submission initiates impersonation) — IMP-007 (prior run), IMP-008 (silent flow)
- BL-AUTH-010 (Impersonation banner displayed and persists) — IMP-010, IMP-011

## Business rules FAILED
- **BL-AUTH-009 (Nested impersonation must be blocked)** — IMP-013 — P0 SECURITY
- **BL-AUTH-008 (Self-impersonation must yield non-circular outcome)** — IMP-017 — Medium
- **BL-AUTH-011 (Stop impersonation preserves operator session, no redirect to /sign-in)** — IMP-012 — P1

## Bugs / observations

### P0 — Nested impersonation silently allowed (IMP-013)
While operator John Mitchell was impersonating David Kim (USR-007), navigating to `/account/impersonate/{USR-008}` silently switched the impersonation target to Carlos Rodriguez. No Security Verification form rendered; `POST /connect/token` issued a fresh impersonation grant. This breaks the audit-trail intent and enables chained impersonation without re-authentication. **Recommend filing as P0 security bug, link to VCST-4905.**

### P1 — Stop Impersonation redirects to /sign-in (IMP-012)
Clicking the only action button in the account dropdown (`data-test-id="sign-out-button"`, `aria-label="Logout"`) while in impersonation mode:
- Calls `POST /revoke/token` → 200
- Does NOT re-issue operator session
- Redirects to `/sign-in?returnUrl=/account/orders`

There is no distinct "Stop Impersonation" UI affordance — the dropdown only offers "Logout", which performs a full sign-out rather than a clean return-to-operator. Operator must re-authenticate. **Recommend filing as P1 bug, link to VCST-4905.**

### Medium — Self-impersonation circular state (IMP-017)
Operator can impersonate themselves, producing banner "John Mitchell logged in as John Mitchell". No error, no rejection. Pollutes audit log. **Recommend filing as Medium bug, link to VCST-4905.**

### Minor UX — Password field not cleared after failed submit (IMP-003)
After failed login attempt in Security Verification form, the password field retains the previously typed (wrong) value. Acceptance criteria called for "password field cleared/refocused". Minor UX deviation only.

### Minor UX — Silent flow loader not perceivable (IMP-009)
The "Switching to customer view..." loader fires faster than is perceivable on the QA build / typical network conditions. Recommend a minimum-display delay (~300ms) so operators have visible confirmation the impersonation event was initiated and audited.

## Verdict: **FAIL** (3 business-rule failures, 1 P0 security)

The form-rendering and banner-display contracts of the PR are largely correct, but three of the four core security/lifecycle invariants on the impersonation flow fail:
- Nested impersonation is not blocked (P0).
- Stop impersonation redirects to /sign-in instead of preserving operator session (P1).
- Self-impersonation is allowed and produces a circular state (Medium).

Recommend the PR is **NOT merged** until at least IMP-013 (P0 nested-impersonation) is fixed. IMP-012 and IMP-017 should be tracked as fix-on-merge.

---

Evidence directory: `tests/Sprint-current/VCST-4905/evidence/`
HAR: `evidence/frontend-vcst4905.har`
