# OTP sign-in when the requested organization is blocked — Developer Guide (VCST-6132)

The `otp_email` grant on `POST /connect/token` now resolves the organization the same way the password grant does. When `organization_id` names an organization the user can no longer use, the token is issued for another organization they can use instead of failing. This guide covers what the token endpoint returns in each case. For requesting the code and the base grant, see [vcst-5748-otp-sign-in-guide.md](./vcst-5748-otp-sign-in-guide.md).

## Prerequisites
- Module **VirtoCommerce.OTP** and **Customer** module build that includes vc-module-customer PR #321.
- A store with OTP sign-in enabled, and a user who is a member of two or more organizations.
- No new setting, permission or configuration key is involved.

## Quick Start

### Step 1: request a code (anonymous)
```bash
curl -s -X POST "{{BACK_URL}}/api/otp/request" \
  -H "Content-Type: application/json" \
  -d '{"storeId":"{{STORE_ID}}","email":"buyer@example.com"}'
```

### Step 2: exchange the code, naming the last-used organization
```bash
curl -s -X POST "{{BACK_URL}}/connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "grant_type=otp_email" \
  --data-urlencode "scope=offline_access" \
  --data-urlencode "storeId={{STORE_ID}}" \
  --data-urlencode "email=buyer@example.com" \
  --data-urlencode "code=<code from the email>" \
  --data-urlencode "organization_id=<blocked-org-id>"
```
Response when `<blocked-org-id>` is blocked and the user has another accessible organization:
```json
HTTP 200
{ "access_token": "<jwt>", "token_type": "Bearer", "expires_in": 1800, "refresh_token": "<token>" }
```
Decode the access token: its `organization_id` claim is the id of an accessible organization, not the one you sent.

## Outcomes of `otp_email` with a blocked `organization_id`

| User state | HTTP | Result |
|---|---|---|
| Another organization is accessible | 200 | `organization_id` claim = an accessible organization |
| Locked in every organization | 200 | no `organization_id` claim |
| Removed from one organization and rejected/locked in the rest | 200 | no `organization_id` claim (same as the password grant) |
| Rejected in every organization | 400 | `invalid_grant`, one `errors[]` entry, code `user_is_rejected_in_organization` |
| Invited in every organization | 400 | `invalid_grant`, one entry, code `user_invitation_pending_in_organization` |
| Deleted in every organization | 400 | `invalid_grant`, one entry, code `user_is_removed_from_organization` |

An accessible organization means the user is a member, the membership is not locked, and its status is not Invited, Rejected or Deleted. Error shape for the 400 cases:
```json
HTTP 400
{ "error": "invalid_grant",
  "errorDescription": "<human-readable text>",
  "errors": [ { "code": "user_is_rejected_in_organization", "description": "<human-readable text>" } ] }
```
Branch on `errors[0].code`, not on the description text.

!!! warning "Which organization is chosen"
    The fallback picks an organization the user can use. Do not rely on which one: the selection order is tracked as VCST-6352.

## What stays strict

| Call | Result |
|---|---|
| `grant_type=refresh_token` with `organization_id` of a blocked organization | 400 `user_is_locked_in_organization` or `invalid_organization_id`. No fallback: an explicit switch is refused |
| Login on behalf (impersonation) naming an organization the user is locked in | refused with the organization code; no token for another organization |
| Globally locked-out account | global lockout code (`user_is_locked_out` / `user_is_temporary_locked_out`), no organization fallback |
| Wrong or expired code | `invalid_code`, never an organization code |
| `grant_type=password` | unchanged (it already fell back) |

!!! note
    A membership change made while a session is open can revoke that session's refresh token by design. The refresh then fails with `invalid_grant` ("The specified refresh token is no longer valid.") before any organization check.

## Side effects
- The contact's current organization is set to the organization the token was issued for.
- A membership lock does not set the account's global `locked` flag.
- The storefront keeps sending the remembered organization, so after an administrator restores it, the next `otp_email` call lands in it again.

## Not covered
MFA sign-in (VCST-5904); which organization the fallback picks (VCST-6352); organization columns in the sign-in log (VCST-6438).

Sources: evidence of real requests (secrets redacted) in `reports/tickets/Sprint26-21/VCST-6132/screenshots/4a-api-token-requests.jsonl`; vc-module-customer PR #321.
