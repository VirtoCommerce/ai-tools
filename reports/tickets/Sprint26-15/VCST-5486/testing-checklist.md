# VCST-5486 — Testing Checklist (Artifact B) + Results

**Ticket:** VCST-5486 — Code Review [vc-platform]: Fix: User cache corruption on update
**Type/Status:** Review task (canonical Task) · Ready for test → Testing · P2/Medium
**Flow/Path:** feature-test · FULL
**PR:** [vc-platform#3077](https://github.com/VirtoCommerce/vc-platform/pull/3077) — open, APPROVED. Head **`82959df2`** after a branch update onto dev; `build-artifacts` + `test / test-and-sonar` pass, `ci` pending, `auto-tests` ×3 pending
**Env:** vcst-qa @ platform **3.1058.0-pr-3077-8295** · storefront theme `2.55.0-pr-2423-a4e7`
**Date:** 2026-08-06 · **Checklist status: COMPLETE — 0 FAIL.** Change-scoped regression (042/078/020/031) still to run.

> Persisted at the operator's explicit request; `.claude/rules/reports.md` §1 normally makes this terminal-only.
> **Owner: `test-management-specialist`** (Artifact B). Written by the orchestrator only because it was
> requested mid-run; results below are folded in from the Step-4 execution agents.

## Scope note — what this can and cannot prove

The defect has **no black-box reproduction path** on this deployment: the platform's own `PUT /api/platform/security/users`
passes a detached JSON-bound user (never exposed), and `vc-module-sales-rep` still carries its own `CloneTyped`
workaround. So every live check is a **regression** check. The repair itself is proven only by the PR's 5 unit
tests (`CustomUserManagerCloneOnReadTests`, green under `test / test-and-sonar`).
Docs axis (1c): `PlatformDeveloperGuide` documents the natural `Find → mutate → Update` pattern with **no**
detachment warning ⇒ a genuine **undocumented platform defect**, not modules violating a documented contract.

## A. Platform security API probe — 17/17 PASS

Re-run against `3.1058.0-pr-3077-8295`. (An earlier 16-check run against `pr-3077-6478` was **discarded** — that
image was built behind dev and will never ship.)

| # | Check | Result |
|---|---|---|
| C0 | Build under test | PASS — `3.1058.0-pr-3077-8295` |
| C1 | Admin sign-in (`FindByNameAsync`, auth hot path) | PASS |
| C2 | `FindByNameAsync` — `GET users/{userName}` | PASS |
| C3 | `FindByIdAsync` — `GET users/id/{id}` | PASS |
| C4 | `FindByEmailAsync` — `GET users/email/{email}` | PASS |
| C5 | `FindByLoginAsync` miss → `CloneUser(null)` doesn't throw | PASS — 200, `null` |
| C6 | 3× repeated reads byte-identical (no cache corruption) | PASS |
| C8/C9 | `CreateAsync` with role → read back role present | PASS |
| C10 | Role CHANGE applied + old role removed | PASS — `[Warranty Specialist]` → `[VCST-3759 Role]` |
| C11 | `DeleteAsync` — no EF identity-map conflict, user gone | PASS |
| C13 | `/locked` false (BL-AUTH-012) | PASS |
| C14 | Unauth `/api` → 401, no redirect (BL-AUTH-014) | PASS |
| C15/C16 | Wrong password rejected, then correct accepted | PASS |
| **C17** | **Storefront catalog GraphQL healthy** (XCatalog↔`JsonHashExtensions` pairing intact) | PASS — `products.totalCount=4523` |

**C10 caveat:** exercises `PUT /users`, the *detached* path — it worked pre-fix too. Regression evidence, **not** proof of repair.
**C17 was added after an incident** (§E) and is the cheap guard that would have caught it in seconds.

## B. Admin SPA UI — `qa-backend-expert` (playwright-edge) — 6/6 PASS

| # | Check | Result |
|---|---|---|
| 1 | Create user with role | PASS — 200, no error toast/console/4xx-5xx |
| 2 | Read back role in blade | PASS — `roles:[Store manager]` **with expanded `permissions[]`** ⇒ the `CloneTyped()` copy is **not** stripping navigation data (BL-AUTH-005 intact) |
| 3 | **Add + remove role in ONE save** (`PLAT-025`) | PASS — after a **full page reload**: exactly `[Catalog manager]`, Store manager gone. **Both directions asserted** — not a silent no-op |
| 4 | **Delete via UI** (the changed `LoadExistingUser(user) ?? user` path) | PASS — 200 on both users; **no 500, no "another instance with the same key value is already being tracked"**; re-read by name *and* id → `null` |
| 5 | Lockout threshold (BL-AUTH-003, `PLAT-066`/`PLAT-093`) | PASS — threshold **measured at 5** (not assumed); 4 fails + correct password succeeds and resets counter; generic failure copy (no account-existence disclosure); admin unlock clears it. Fixture left **unlocked** |
| 6 | Org lock ≠ global lock (BL-AUTH-012/013, `PLAT-084`) | PASS — membership `isLocked=true` while global `/locked`(by id)=`false` and `lockoutEnd` null; refusal carried exactly one `code: user_is_locked_in_organization`, never a global code. Restored |

Threshold note: not exposed by the settings API (scanned all installed modules for `lockout|failedaccess|attempt` → 0 matches; it lives in `IdentityOptions:Lockout` in appsettings), so it was **measured empirically**.

## C. B2B invite acceptance — `qa-frontend-expert` (playwright-chrome) — PASS

The highest-value path: `RegisterByInvitationCommandHandler` = `FindByIdAsync → ResetPasswordAsync → SetLockoutEndDateAsync → SetUserNameAsync → UpdateAsync`. **Not** in the regression selection, so this is its only live coverage.

- `securityAccounts[0].id` **identical to the invitation link's `userId`** ⇒ the pre-created account was mutated **in place** through the whole chain on a now-detached copy, and every link persisted.
- New member signed in, **then signed in again after an intervening different-user session** ⇒ password persisted durably, not just in a cached instance. Cache invalidation also correct (post-mutation read saw the new password + cleared lockout).
- BL-AUTH-003 ✓ (invitee not locked) · BL-B2B-013 ✓ (`statusInOrganization: Approved`) · BL-B2B-009 ✓ (`rolesInOrganization` populated while `securityAccounts[0].roles: []` — global roles untouched).
- 0 console errors, 0 4xx/5xx, no GraphQL `errors[]`. 8 screenshots.

## D. Documented gaps — stated, not papered over

| Gap | Disposition |
|---|---|
| `FindByLoginAsync` real hit | **Not black-box verifiable** — no external-login provider on this env; covered by the PR's unit tests |
| Object-identity / aliasing half of cache-non-corruption | **Not black-box verifiable** over HTTP; `CustomUserManagerCloneOnReadTests` covers it |
| Storefront email change (`UpdatePersonalDataCommandHandler`) | **Open coverage gap.** `PRF-GQL-083` was authored into `050d` then reverted at the Step-3 gate (out of selection ⇒ unexecutable `Draft`; it mutated `USER2`'s login email, a fixture shared by 7 suites incl. `050i`'s 251 cases). Re-author against a dedicated disposable account. The `email` field is a scalar surviving both pre- and post-fix ⇒ regression value only |
| Admin Users **grid/search** | `UserSearchService.SearchUsersAsync` uses raw `userManager.Users` and calls no `Find*` ⇒ `PLAT-007` **dropped** from coverage credit |

## E. Findings & risks carried to the verdict

- **Incidental bug (Medium, OUT-OF-SCOPE, not attributable to PR 3077):** `GET /api/platform/security/users/{key}/locked` returns `200 {"locked":false}` for **any key it cannot resolve** — a userName, a zero GUID, a nonsense string — instead of 404/400. A **false negative on a security-state read**, and exactly the trap BL-AUTH-012 documents. Confusing because the sibling `GET users/{key}` *does* accept a userName. Not a bypass (the lock enforces correctly; the Admin SPA uses the by-id form). Verified with 5 probes.
- **R3 — perf, open:** every `Find*` now pays a `CloneTyped()` deep clone incl. `Roles → Permissions`, on the per-request auth path. PR ships `CloneUser` as the override seam. Recommend `/qa-perf-measure` before a high-traffic deployment. Not a blocker.
- **Residual aliasing gap, open:** the PR's self-declared `userManager.Users` gap is live-reachable in 4 deployed places (`vc-module-pages` `PageDocumentSeoResolver`, `vc-module-x-cms` `GetPageDocumentQueryHandler`, `profile-experience-api` uniqueness handlers, platform `UserSearchService`). **All read-only today** ⇒ future risk, not an active bug.
- **G5 incomplete:** `ci` pending on the new head; `auto-tests` ×3 pending.
- **Incident (self-inflicted, resolved):** the first repin used PR 3077's original image, built **behind dev**, which removed platform PR 3095's `JsonHashExtensions` from under the env's pinned `XCatalog_3.1016.0-pr-106` — the *other half of VCST-5637*, which calls `searchRequest.GetJsonSha256Hex()`. Result: `System.TypeLoadException` at `XCatalog…BuildSearchCacheKey` and 500s on `SearchProducts`/`GetProduct`/`GetCategory`/`GetShortCart`/`GetFullCart` from 14:50:48. Caught by `/qa-monitoring`, fixed by updating PR 3077's branch onto dev and redeploying `3.1058.0-pr-3077-8295`. **Same-ticket paired prereleases must deploy together — `/qa-deploy-pr`'s dry-run gave no warning; worth its own ticket.**
- **Secret-hygiene note (tooling, not storefront):** the Playwright MCP redactor prefix-matched `ADMIN_PASSWORD_VCPTCORE` against `DEFAULT_TEST_PASSWORD` and left a trailing character unredacted in the transcript. Tighten `.env.playwright.local` (longest-match, or distinct values).
- **Test data left for teardown:** two `AGENT-TEST-`-prefixed invitees in `AGENT-TEST-Org-TechFlow-20260310`; `npm run seed:b2b:teardown` sweeps the prefix. Both agents' own throwaway users were deleted and verified gone.
