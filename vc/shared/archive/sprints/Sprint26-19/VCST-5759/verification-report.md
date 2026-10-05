# VCST-5759 — Fix Verification

**Verdict: VERIFIED WITH NOTES** · 2026-09-28 · Sprint26-19

Bug: *Sales rep with not set first name or last name can't login to storefront*
PR: [vc-module-sales-rep#17](https://github.com/VirtoCommerce/vc-module-sales-rep/pull/17) — **open, approved**, Sonar gate passed

## Build under test

| | |
|---|---|
| Environment | vcptcore-qa (`https://vcptcore-qa.govirto.com`) |
| Platform | 3.1072.0 |
| Theme | vc-theme-b2b-vue-2.59.0-pr-2458-61e8 |
| Module | **VirtoCommerce.SalesRep 3.1011.0-pr-17-47fb** |
| PR artifact | `VirtoCommerce.SalesRep_3.1011.0-pr-17-47fb.zip` (head `47fb02ad`) |

Deployment was confirmed two ways, not assumed: the `vc-deploy-dev@vcptcore-qa` manifest pins that exact
blob, **and** the live `/api/platform/modules` reports `3.1011.0-pr-17-47fb` installed with no validation
errors. Running version == PR artifact ⇒ DEPLOYED.

## RED → GREEN

The reproduction was run on a genuine pre-fix build, not inferred.

| | Phase A — RED | Phase B — GREEN |
|---|---|---|
| Stand | vcptcore-qa1 | vcptcore-qa |
| SalesRep build | `3.1009.0-pr-16-b624` | `3.1011.0-pr-17-47fb` |
| `POST /api/sales-rep`, no names | **200** — rep persisted with `firstName:null, lastName:null` | **400** — `'First Name' must not be empty.` |
| `GetPageContext` → `pageContext.user.contact.lastName` | **`INVALID_OPERATION`**, `contact: null` | resolves — **no `errors` key** |

Phase A reproduces the ticket's reported error **verbatim** — same query name, same
`path: ["pageContext","user","contact","lastName"]`, same `extensions.code`.

## Results

**STR: 3/3 consecutive.** The identical nameless-create request returned the identical 400 on all three runs.

**Checklist: 20/20 passed, 0 failed.**

Backend / API (13) — evidence `evidence/phaseA-red-prefix.md`, `evidence/phaseB-green-fixed.md`:
whitespace-only names rejected (trim runs first) · 129-char name rejected at the 128 cap · 257-char
salutation rejected at the new 256 cap · create without a login email rejected · incomplete address
rejected per-field · edit clearing names rejected with stored values **unchanged** · valid rep still
saves and `fullName` derives correctly · padding stripped on save · duplicate email, unknown id and null
body all now **400 + reason** instead of 500 · a refused save leaves **no orphan** account or contact
(verified on the late-failure path, where rollback actually has to work).

Admin SPA blade (7) — `admin-ui-verification.md`, screenshots `evidence/U*.png`, run on `playwright-edge`:
`First name *` / `Last name *` carry required markers and `Middle name` does not · Save disabled with
either name empty · inline error on touch-then-clear · Save enables once both are filled · the same
gating applies when editing an **existing** rep · **0 console errors**, all XHRs 200/204.

**Key regression check.** The PR renames the prop `:max-length` → `:maxlength` on three fields. Had
`VcInput` declared it as `maxLength`, the new spelling would silently fall through as a native attribute.
Verified with real keystrokes (not a programmatic `fill`, which bypasses native `maxlength`):
First name accepted **exactly 128** of 220 typed, Salutation **exactly 256** of 300. No regression.

## Notes (none blocking)

1. **The two limitations the PR declares are real, and were exercised rather than taken on trust**
   (`evidence/boundary-and-limitations.md`). On the *fixed* build, `PUT /api/members` still clears a rep's
   names at **204**, and the storefront then fails with `INVALID_OPERATION` again. The validator guards only
   the `/api/sales-rep` aggregate path — the Contacts blade, `/api/members`, customer import and the
   storefront's `updatePersonalData` remain uncovered. **The root cause — non-null xAPI fields over nullable
   Contact columns — is untouched and still reachable.** This is scoped out deliberately and is not a defect
   in this PR, but it means the bug class is not closed.
2. Incidental, same probe: `/api/members` does **not** recompute `fullName`, so a contact can hold a stale
   `fullName` while both name parts are null. Pre-existing, unrelated to this PR.
3. Existing nameless reps are not repaired — as documented. Not exercisable on vcptcore-qa: all 22 reps
   there have both names.
4. Cosmetic (P3): the blade's validation copy prints the raw model key — *"The **firstName** field is
   required"* — next to a label reading "First name".
5. Environment, not product: on vcptcore-qa the classic AngularJS manager (`/#!/`) forces `admin` to
   `#!/changepassword` ("password has expired"). The VC-Shell app is not gated by it, so verification was
   unaffected — but the password needs rotating before any classic-blade work on this stand.

## Test data

All fixtures created for this run were removed. `agent-test-sr5759-*` reps deleted on both stands
(HTTP 204); vcptcore-qa back to **22** reps, vcptcore-qa1 back to **14**, **0 nameless on either**.
One incidental write: an existing qa1 fixture (`agent-test-sr-qa1-vcst5097`) was re-`PUT` with
`storeId: "B2B-store"` — the value it and every sibling fixture already held, so a no-op; its names were
never touched.
