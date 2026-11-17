# BUG — Address with a long Line 1 cannot be saved: the derived address name exceeds the xAPI 256-character limit although Line 1/Line 2 allow 2048

## Status: READY_TO_SUBMIT
**Tracker:** VCST-6857 (Relates VCST-6841, VCST-6698)
**Found by:** agent — testing VCST-6841

**Severity:** Medium (P2) · Functional · Storefront address forms → xAPI `updateMemberAddresses`

## Env
- Stand: vcst-qa (B2B-store); storefront vc-frontend-next 3.3.0-pr-23-7be3-7be3dfdd (also the theme vcst-qa deploys); Platform 3.1097.0
- Modules: ProfileExperienceApiModule 3.1024.0, Customer 3.1033.0, Xapi 3.1031.0, XFrontend 3.1010.0 — all match the deployed `vc-deploy-dev` vcst-qa manifest
- Repro rate: 4/4 (two accounts, account and company address forms, Edge and Chrome)
- Trace ID: none — the stand sends neither `Request-Id` nor `traceparent`; App Insights: N/A for this env (no telemetry in the last hour), fallback = the server's validation response

## Summary
Since VCST-6698 the address form accepts Line 1 and Line 2 up to 2048 characters, but the storefront still builds the address **Name** as "country, region, city, line1" and the xAPI address validator still caps **Name** at 256. Any address whose Line 1 makes that string longer than 256 characters is rejected with the generic toast "Some of the addresses are not valid".

## Steps to reproduce
1. Sign in to the storefront as a B2B buyer of store B2B-store.
2. Open **Company info** → **Add new address** (or **Account → Addresses → Add new address** for a personal account).
3. Country "United States of America", State "New York", ZIP 10001, City "AGENT-TEST-City".
4. **Address** (Line 1): a 301-character text; **Apt., suite…** (Line 2): a 301-character text.
5. Click **Save**.

## Actual
- Toast **"Some of the addresses are not valid"**; the dialog stays open; nothing is saved.
- `UpdateMemberAddresses` → `VALIDATION`, `addresses[0].name`, `MaximumLengthValidator`: "The length of 'Name' must be 256 characters or fewer. You entered 333 characters."
- Line 1 of 231 characters (derived name exactly 256) with Line 2 of 300 saves and reads back 231/300 — Line 2 is not involved.

![](../../screenshots/Address-Name-Over-256-Rejects-Long-Line1/failure-company-address.png)

## Expected
- An address with Line 1 / Line 2 up to 2048 characters saves, as VCST-6698 intended ("increase Line1/Line2 max length … according to backend max length increase"); storage allows Name 2048.

## Layer Validation
| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | FAIL | package `screenshots/failure.png`, `screenshots/dom-failure.txt` |
| 2. Backend Admin | N/A — not probed by the investigation | — |
| 3. GraphQL xAPI | FAIL | package `network/failing-updateMemberAddresses.response.json` |
| 4. Platform REST API | N/A — not probed by the investigation | — |

**Owning layer:** Layer 3 — xAPI (`AddressValidator`)

## Root Cause Analysis
- Client: `vc-frontend` `client-app/shared/common/components/address-form.vue:309` sets `name: getAddressName(address)`; `client-app/core/utilities/address/index.ts:17-20` joins `[countryCode, regionName, city, line1]`. Line 1/Line 2 max raised to 2048 by #2642 (VCST-6698).
- Server: `vc-module-profile-experience-api` `…/Validators/AddressValidator.cs:25` `RuleFor(x => x.Name).MaximumLength(256)`; `:28-29` Line1/Line2 raised to 2048 by #151 (VCST-6698) — Name untouched.
- Storage: `vc-module-customer` `AddressEntity.cs:12-13` `[StringLength(2048)] Name`.
- Ruled out: by-design (VCST-6698's stated goal; no setting), data drift (validation before persistence, two accounts), flaky (4/4, exact 256 boundary), version skew (both VCST-6698 halves deployed).
- Detail: `.vc-fix/vc-test/VCST-6841/vcst/goal/20261116T103947Z/bugs/F-2/` (`root-cause.md`, `source/findings.md`).

## Regression
- Introduced with VCST-6698: vc-frontend e29cf501d (#2642, 2026-11-11) + vc-module-profile-experience-api f5d6d1854 (#151, 2026-11-09). Before, Line 1 was capped at 128 in the form, so the name rarely passed 256 (still possible with a long City + Line 1).

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 3 — xAPI
- **Suggested repo:** VirtoCommerce/vc-module-profile-experience-api
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** xProfile — address validation
- **RCA anchor:** `src/VirtoCommerce.ProfileExperienceApiModule.Data/Validators/AddressValidator.cs:25` `RuleFor(x => x.Name).MaximumLength(256)` → 2048 (alternative: vc-frontend `address-form.vue:309` stop deriving Name from the full Line 1)
- **Routing confidence:** MEDIUM (no server trace on this stand; the deployed 3.1024.0 behaves exactly as the source line says)
