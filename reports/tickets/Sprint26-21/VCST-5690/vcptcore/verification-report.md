# VCST-5690 — Fix verification (Phase B, GREEN) — backend / GraphQL xAPI

**Verdict: PASS.** STR 3/3 GREEN on vcptcore-qa, and the vcst-qa RED control still fails in the old way. Two results differ from the PR description (see Deviations). Neither is a regression.
Date 2026-10-27 · Verifier `qa-backend-expert` · Channel: `POST {BACK_URL}/graphql` as a personal storefront contact (bare password grant + `storeId`), Node fetch. No browser was used.

## Build strip
| Env | Role | ProfileExperienceApiModule | Customer | Xapi | Platform | Theme |
|---|---|---|---|---|---|---|
| vcptcore-qa | FIXED | `3.1022.0-pr-150-afd6` | 3.1029.0 | 3.1027.0 | 3.1085.0 | pr-2576 (storefront PR #2597 not deployed) |
| vcst-qa | PRE-FIX control | `3.1021.0` | 3.1030.0 | 3.1027.0 | 3.1090.0-pr-3133-8b4a | — |
Module versions were re-read from `/api/platform/modules` during the run.

## Checklist
| # | Check | Result | Evidence (observed) |
|---|---|---|---|
| 1 | updateContact lastName `Tester2` | **PASS** 3/3 | `field:"lastName"`, `errorCode:"InvalidCharacters"`, message `'Last Name' contains invalid characters.`, `data.updateContact:null`. vcst control: 3/3 returned the old bare error |
| 2 | Rule coverage `Test_`, `Test@`, both names invalid | **PASS** | `Test_` and `Test@` each gave lastName/InvalidCharacters. `First9` + `Last_9` gave **2** errors, `firstName` and `lastName`, both InvalidCharacters |
| 3 | Typed value not echoed | **PASS** | No message contained Tester2 / Test_ / Test@ / First9 / Jane2 / Doe_ / `<b>` / `<script>`. The only value-like text is MaxLength: "You entered 300 characters." (a count, not the value) |
| 4 | updateMemberAddresses, 2 invalid new addresses | **PASS** | 2 errors: `addresses[0].firstName` and `addresses[1].lastName`, both InvalidCharacters, data null, address count unchanged (1). Extra probe with 3 addresses (valid, bad, bad) gave `addresses[1].firstName` and `addresses[2].lastName`, so the indexes are correct and the valid one raised no error. vcst control: one bare error |
| 5 | updatePersonalData firstName `Smoke7` | **PASS** | `field:"personalData.firstName"`, InvalidCharacters, `data.updatePersonalData:null`, name unchanged |
| 6 | HTML / unsafe content | **PASS (deviation)** | On **name** fields, `<b>x</b>`, `<script>…</script>` and `javascript:alert(1)` all give **InvalidCharacters**, never HtmlTagsNotAllowed: the name pattern rejects `<`, `>` and `:` first. HtmlTagsNotAllowed was seen on address fields: `addresses[0].line1` ("'Line1' must not contain HTML tags.") and `addresses[0].city`. **UnsafeContent was not triggered**: `javascript:alert(1)` in address line1 was ACCEPTED (address created, then deleted) |
| 7 | Valid writes | **PASS** | `O'Connor`, `Müller-Test`, `van der García`, `Jean-Luc D'Arcy` all returned 200 with data populated. Original names restored |
| 8 | Cache non-leak after rejection | **PASS** (A/B proven) | vcptcore: after the Tester2 rejection, `me`, `contact(id)` and admin `GET /api/members/{id}` all show the saved `Runner` (checked twice). **vcst control still leaks**: after the same rejection, `contact(id)` and `/api/members/{id}` returned `lastName:"Tester2"` while `me` showed the real value |
| 9 | Valid address + duplicate skip (BL-PROFILE-001) | **PASS** | New valid address created (totalCount 1→2). Echoing an existing address without an id: 200, no error, totalCount stayed 2 (silently skipped). Echoing it with its id: 200. The created address was deleted (`deleteMemberAddresses`), back to 1 address |
| 10 | `extensions.code` back-compat | **PASS** | Every error seen carried `code:"VALIDATION"`, `codes:["VALIDATION"]` |
| — | Storefront /account/profile (optional) | NOT RUN | Out of scope: theme PR not deployed |

Other errorCodes observed (updateContact): `lastName:""` gave `NotEmptyValidator` ("'Last Name' must not be empty."). `firstName` of 300 characters gave `MaximumLengthValidator` ("…must be 128 characters or fewer…"). An address with email `not-an-email` gave `addresses[0].email` / `InvalidEmail` ("Invalid email format in the address").

## RED vs GREEN — identical request `updateContact(command:{id, firstName:<current>, lastName:"Tester2"})`
```
vcst-qa 3.1021.0 (RED):    errors:[{message:"Error trying to resolve field 'updateContact'.",
                            extensions:{code:"VALIDATION",codes:["VALIDATION"]}}], data:{updateContact:null}
vcptcore-qa pr-150 (GREEN): errors:[{message:"'Last Name' contains invalid characters.",
                            extensions:{code:"VALIDATION",codes:["VALIDATION"],field:"lastName",errorCode:"InvalidCharacters"}}],
                            data:{updateContact:null}
```

## Evidence (`api/`; Authorization omitted, emails redacted, responses exactly as returned)
- `i1-updateContact-Tester2-vcptcore-GREEN.json` · `i1-updateContact-Tester2-vcst-RED-control.json`
- `i4-updateMemberAddresses-two-invalid-vcptcore-GREEN.json` (plus the `me` read afterwards) · `i4-…-vcst-RED-control.json`
- `i8-cache-after-rejection-vcptcore-GREEN.json` · `i8-cache-after-rejection-vcst-RED-control.json`

## Data restore
- vcptcore-qa contact: names `SmokeTest Runner`, 1 address (the original id), confirmed by a final `me` read and by REST. The probe addresses (one valid, one `javascript:` line1) were deleted. `about` was briefly set to `<b>x</b>` by a probe. It is now null again, which is the most likely original state (it was not read before the probe).
- vcst-qa contact: the pre-fix cache leak left the cached last name at `Tester2` (REST `modifiedDate` was unchanged, so this was cache, not a DB write). I restored it with a valid updateContact back to the original `User`. `me`, `contact(id)` and REST now all agree.

## Deviations from the PR description / surprises
1. **HtmlTagsNotAllowed / UnsafeContent are unreachable on name fields.** The name character rule fires first, so HTML in a name reports InvalidCharacters. HtmlTagsNotAllowed is reachable on address line1/city. **UnsafeContent was not observed at all**: `javascript:alert(1)` in address line1 is accepted. Clarify which fields and inputs UnsafeContent covers.
2. **`Contact.about` is not validated.** `about:"<b>x</b>"` was saved through updateContact. (It may be outside the PR's scope.)
3. **Incidental, pre-existing on both envs:** reading `contact { about }` when the value is null fails with `Error trying to resolve field 'about'.` (INVALID_OPERATION), and the whole `contact` becomes null. It reproduces on vcst-qa 3.1021.0, so it is not caused by PR #150. Candidate for a separate bug.
4. The pre-fix member-cache poisoning is visible through admin REST as well as xAPI, not only in the storefront.
