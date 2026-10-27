# MFA wrong-code attempt limiter is held per platform instance, so the documented 3-attempt cap is not enforced across a multi-instance deployment

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-5904
**Tracker:** VCST-6506 (Bug, High) · **Severity:** High · **Layer:** Platform REST (module) · **Parent story:** VCST-5904 (MFA by email)

**Provenance:** Live-reproduced in a colleague's `/qa-test-fast` round 2 on this build (4 wrong codes on `grant_type=mfa` answered `invalid_code`, then the correct code returned tokens; `code_attempts_exceeded` never appeared). Corroborated by this run's checklist C-8 (codes 1–4 `invalid_code`, the 5th `user_is_temporary_locked_out`). Mechanism confirmed by read-only source review at the deployed commit. **Not independently live-reproduced in this session** — the multi-connection wrong-code sequence was declined by a safety classifier; this report rests on the colleague's live round + C-8 + source.

**Env:** vcst-qa, build MFA `3.1000.0-pr-1-cf83` (vc-module-mfa PR #1 @ cf830c0), Platform `3.1090.0-pr-3133-8b4a`, OTP `3.1001.0-pr-3-d978`, theme `2.61.0-pr-2570-2fc9`.

## Summary
The MFA module caps wrong code attempts (default `MaxCodeAttempts = 3`) in a **per-process, in-memory** limiter. On a deployment with more than one platform instance and no instance affinity, requests spread across instances each get a fresh count, so an attacker gets ~3 guesses *per instance* before `code_attempts_exceeded`. The module's own README states this is intended ("kept in the memory of the platform instance … counted on each platform instance"). The persisted ASP.NET Identity account lockout (`AccessFailedCount`) is the real shared backstop — a wrong MFA code increments it on every attempt, and it locks the account after its own threshold (observed at the 5th attempt in C-8, 900 s). So the exposure is bounded by the Identity lockout, not unbounded; the MFA-specific cap simply does not bind globally.

## Steps to reproduce (colleague's live round; API)
1. Global MFA on. Trigger an MFA challenge for a user (password grant → `two_factor_required` + `twoFactorToken`).
2. Submit wrong codes on `grant_type=mfa`, each on a fresh connection without the instance-affinity cookie.
3. Observe: wrong attempts keep returning `invalid_code` past the configured cap of 3 (no `code_attempts_exceeded`), until the persisted Identity lockout trips.

## Actual
`code_attempts_exceeded` is not returned at attempt 4 when requests spread across instances; the correct code still succeeds afterward. The only enforced global limit is the Identity account lockout.

## Expected
The documented per-user attempt cap holds regardless of which instance serves each request (a shared/distributed counter), so `code_attempts_exceeded` binds globally.

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront Frontend | N/A | server-side limiter |
| 2. Backend Admin | N/A | — |
| 3. GraphQL xAPI | N/A | password/mfa grant is REST OpenIddict |
| 4. Platform REST API | FAIL | `grant_type=mfa` responses (colleague's round); C-8 sequence |

**Owning layer:** Layer 4 — module (vc-module-mfa).

## Root Cause Analysis (source @ cf830c0)
- `src/VirtoCommerce.MFA.Data/Services/MfaCodeAttemptLimiter.cs:11-14` takes `IMemoryCache`; `:17` key `VirtoCommerce.MFA.CodeAttempts:`; `:44` `memoryCache.Set(prefix + userId, window, lifetime)`; `:52` `Attempts++`. No distributed/DB store. Keyed on **user id, not the twoFactorToken**.
- `src/VirtoCommerce.MFA.Web/Module.cs:54` registers the limiter as a **singleton** (so is `TwoFactorTicketStore`, also `IMemoryCache`).
- `src/VirtoCommerce.MFA.Data/Services/MfaService.cs:118` `TryConsumeAttemptAsync(user.Id)`; `:187-198` `FailCodeAsync` calls `userManager.AccessFailedAsync` (persisted Identity lockout) on every wrong code, then returns `InvalidCode` / `AccountLocked`.
- Cap defaults: `src/VirtoCommerce.MFA.Core/Models/MfaOptions.cs:7-11` — `MaxCodeAttempts` 3, `TwoFactorTokenLifetime` 10 min, `CodeResendInterval` 30 s. Bound from appsettings `MultiFactorAuthentication:*` at `Module.cs:36`.
- The README at cf830c0 declares the in-memory behaviour intended and notes the interfaces can be swapped for a shared (e.g. Redis) implementation.

**Not established without a live test:** that the stand runs more than one instance, the deployed `MaxCodeAttempts`, and that the platform `IMemoryCache` is the plain in-process cache. C-8's four `invalid_code` fits either per-instance spread or a configured cap above 3; source alone cannot distinguish.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 4 — module
- **Suggested repo:** VirtoCommerce/vc-module-mfa
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** MFA code-attempt limiter (`MfaCodeAttemptLimiter`, DI registration in `Module.cs`)
- **RCA anchor:** `src/VirtoCommerce.MFA.Data/Services/MfaCodeAttemptLimiter.cs:44` (in-memory `Set`) + `src/VirtoCommerce.MFA.Web/Module.cs:54` (singleton registration)
- **Routing confidence:** MEDIUM — the module author states the in-memory design is intentional and swappable, so whether this is a bug or a documented limitation + a config/infra decision (shared cache, or rely on the Identity lockout) is a PO/architecture call, not a mechanical fix. Also touches a security-sensitive path.
