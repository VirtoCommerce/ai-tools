# Member/contact write validation returns no field-level detail — `[Medium]`

## Status: CONFIRMED

**Env:** vcst-qa @ platform `3.1058.0-pr-3077-8295`, ProfileExperienceApi `3.1015.0-pr-141-d7d8`, theme `2.55.0-pr-2423-a4e7`
**Ticket:** VCST-5690 · **Investigated:** 2026-08-06 (Layer-3 live probe)

> **This report was rewritten after investigation.** The original filing claimed member/contact
> **writes are broken** (`Critical`/High) and blamed a regression window. That is **refuted below**:
> both mutations work on valid data, and nothing regressed. The surviving defect is the missing
> field-level error detail. Original claims are kept in §Refuted so the ticket can be corrected.

## Summary

`updateContact` / `updateMemberAddresses` reject a **name containing a digit** (or `_`, `@`) — correct
per the module's name whitelist — but return a **bare `VALIDATION` code with no field detail**. The
storefront can therefore only show *"Something went wrong. Please try again later."*, so a user who
types `Anna2` cannot tell which field is wrong or how to fix it. Valid writes succeed normally.

## STR

1. Sign in to the storefront, go to `/account/profile`.
2. Set **Last name** to a value containing a digit (e.g. `Runner2`). Click **Update**.
3. Observe: generic *"Something went wrong. Please try again later."*; no field is flagged.

Equivalent at Layer 3 — `POST {{BACK_URL}}/graphql`:
`updateContact(command:{id:<contactId>, firstName:"mutykovaelena", lastName:"Tester2"})`
→ HTTP 200, `errors[0].extensions.code = VALIDATION`, `data.updateContact = null`, **no `field` / message**.

## Expected vs Actual

| | |
|---|---|
| **Expected** | The rejection names the offending field and rule (e.g. `lastName: contains invalid characters`), and the storefront renders it inline on that input |
| **Actual** | `errors[0].extensions` carries only `{code:"VALIDATION", codes:["VALIDATION"]}`; the storefront falls back to a generic toast. No client-side rule mirrors the pattern either, so nothing is caught before submit |

## Root cause

`InputValidationOptions.NameValidationPattern` defaults to `^[\p{L}\p{M}\s'\-\.]+$` — letters, marks,
whitespace, apostrophe, hyphen, period; **no `\p{N}`**, so digits are excluded. (`OrganizationNameValidationPattern`
deliberately *does* include `\p{N}` — the person/org distinction is intentional.) Applied via
`MatchesNamePattern` in `NewContactValidator` (FirstName/LastName) and `AddressValidator`
(address FirstName/LastName). `ValidateAndThrowAsync` surfaces as a GraphQL `VALIDATION` error, and the
per-failure detail is **dropped** rather than mapped into `errors[].extensions`.

**Character sweep, live (`updateContact.lastName`):**
ACCEPT `User` · `O'Connor` · `van der García` · `Müller-Test` · `Test.`
REJECT `Tester2` (digit) · `Test_` · `Test@`

So the *validation* is by design — the **missing detail** is the defect. It is the unfinished half of
**VCST-4819**'s own suggested fix ("Surface field-level validation errors", Done 2026-03-24).

## Refuted by live probe (corrections to the original filing)

| Original claim | Finding |
|---|---|
| "Customers cannot edit profile or add an address"; writes broken 3/3 | **False.** On this build: `updateContact` with identical values → 200 OK; `lastName:"Tester"` → 200 OK; `updateMemberAddresses` echoing the existing 3 addresses → 200 OK; appending a new US address with alpha names → **200 OK, address created** |
| `UpdateMemberAddressesCommandHandler` validates the whole contact via `NewContactValidator`, so an address write is gated on unrelated contact fields | **False.** It injects `AddressValidator` and validates **each submitted address** only. Echoing the existing set back succeeds, so no pre-existing field blocks a write |
| Regression; window = the `3.1057.0→3.1058.0` delta | **Not a regression.** The pattern rules landed **2026-03-17** (PR #130, VCST-4691 XSS hardening) and were last touched 2026-03-25 (PR #132). No commit since has changed these validators — ~5 months stable |
| SMK-017/SMK-025 "PASS" on 2026-08-03 proves prior working behavior | Those two rows in `REG-2026-08-03-1900/suite-042-results.json` are bare `{id,status:"PASS"}` — **no notes, payload or evidence**, unlike every other case in that file. They cannot establish a baseline |
| Suspected `NameValidationPattern` rejecting digits (unconfirmed lead) | **CONFIRMED** — and it is the *sole* trigger for both symptoms |

## The two suite FAILs were test-data defects, not product bugs

Both cases **deviated from their own authored test data** and injected digits into name fields:

| Case | Authored | Runner actually sent | Result |
|---|---|---|---|
| `SMK-025` | `[ACT] fill 'Last name': 'Runner'` | `lastName: "Runner2"` | REJECT (digit) |
| `SMK-017` | `@td(ADDR_NY.first_name)` / `@td(ADDR_NY.last_name)` → **Jane / Doe** | `firstName: "SMK017"`, `lastName: "Runner"` | REJECT (digit) |

Following the authored steps would have passed — `ADDR_NY` is `Jane Doe / 456 Oak Avenue`, and that
address is **already saved on the account**, i.e. the fixture has been written successfully before.
Class per `/qa-triage-results`: **`TEST_DATA_DEFECT`** (runner-introduced), not `REAL_BUG`.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | FAIL | Generic toast only, no inline field error — `SMK-017-FAIL-address-save-something-went-wrong.png`; no client-side pattern rule |
| 2. Backend Admin | N/A | Not exercised |
| 3. GraphQL xAPI | FAIL | `errors[].extensions` = `{code:"VALIDATION"}` with no field detail (live probe, 2026-08-06) |
| 4. Platform REST API | N/A | Validation originates in the xAPI module, not the REST/persistence layer |

**Owning layer:** Layer 3 — GraphQL xAPI.

## Scope

- **Affected:** any storefront member/contact write whose name field falls outside the whitelist — the user gets no actionable message.
- **Unaffected:** all reads; every write with valid names; cart-side address handling; checkout (order `CO260806-00001` completed in the same run).
- No App Insights exception is logged for these rejections (24 h window, telemetry healthy: 17.9k requests / 3.8k GraphQL), so they are invisible to monitoring too.

## Refs

`BL-AUTH-005` · Prior art **VCST-4819** (Done) / VCST-4802 / VCST-4803 · Evidence
`reports/regression/REG-2026-08-06-1803/traces/{SMK-017,SMK-025}-FAIL-trace.json`
Probe data restored: contact name and the original 3 addresses left exactly as found.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 3 — GraphQL xAPI
- **Suggested repo:** `VirtoCommerce/vc-module-profile-experience-api`
- **repoKind:** `module`
- **Ownership hint:** platform
- **Component / module:** ProfileExperienceApi — validation → GraphQL error mapping
- **RCA anchor:** `Data/Configuration/InputValidationOptions.cs:5` (`NameValidationPattern`); rules in
  `Data/Validators/NewContactValidator.cs:22-25` + `Data/Validators/AddressValidator.cs:32-35`; the
  detail is lost where `ValidationException` becomes a GraphQL error (`ValidateAndThrowAsync` call sites
  in `Data/Commands/UpdateContactCommandHandler.cs`, `UpdateMemberAddressesCommandHandler.cs:29`)
- **Routing confidence:** HIGH — reproduced at Layer 3 and isolated to a single character-class rule
- **Ask:** map each FluentValidation failure into `errors[].extensions` (field + rule) so the
  storefront can render it inline. Optionally mirror the pattern client-side in `vc-frontend`.
- **Second, separate action (not /qa-fix):** fix `SMK-017`/`SMK-025` execution to use the authored
  `@td(ADDR_NY.*)` / `'Runner'` values — a name field cannot carry digits.
