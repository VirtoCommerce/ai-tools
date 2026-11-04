# VCST-5690 — Fix verification (Phase B, GREEN) — storefront

**Verdict: PASS.** STR 3/3 GREEN. On `/account/profile` and in the `/account/addresses` dialog, a rejected name or line is now shown on its own input, and nothing is saved. One observation for the PR owner is listed under Deviations. It is not a regression.
Date 2026-10-27 07:17–07:24 UTC · Verifier `qa-frontend-expert` · Lane `playwright-chrome` (Chromium 155, 1920x1080) · Account: `{{USER_EMAIL}}` (personal contact "SmokeTest Runner"), signed in through the storefront form.

## Build strip
| Layer | Version | How it was read |
|---|---|---|
| Theme | `2.61.0-pr-2597-372a-372a1bfd` | storefront footer "Ver. …" on the profile page |
| ProfileExperienceApiModule | `3.1022.0-pr-150-afd6` | backend verifier's `/api/platform/modules` read (`verification-report.md`) |
| Env | vcptcore-qa (`TEST_ENV=vcptcore`) | `FRONT_URL` / `BACK_URL` from the layered loader |

No white screen and no chunk 404 were seen, so the deploy race did not affect this run.

## Checklist
| # | Check | Result | Evidence (observed) |
|---|---|---|---|
| 1 | STR: Last name `Runner2` → Update | **PASS 3/3** | Each run: Last name `[invalid]`, red border, "Contains invalid characters" under the input. No toast. After a reload Last name was `Runner` (3/3). `updateContact` → `field:"lastName"`, `errorCode:"InvalidCharacters"` |
| 2 | `Smoke7` / `Runner_` | **PASS** | Both inputs `[invalid]`, each with "Contains invalid characters" |
| 3 | Error clears; valid save | **PASS** | Editing a flagged input removes its error at once, and the other flagged field stays flagged. Update stays disabled while any server error is still shown. `O'Connor` saved → "Profile update" dialog with "Profile successfully updated!", and the header name changed. `Runner` restored the same way |
| 4 | Address dialog, First name `Jane2` | **PASS** | "New address" dialog stays open. First name `[invalid]` "Contains invalid characters". Create disabled. `UpdateMemberAddresses` → `field:"addresses[0].firstName"`, InvalidCharacters, data null. Table still 1 row |
| 5 | Address line1 `<b>x</b>` | **PASS** | Address input `[invalid]` "HTML tags are not allowed". Response `addresses[0].line1` / `HtmlTagsNotAllowed`. Nothing created |
| 6 | Edit existing Jane Doe, no false error | **PASS (adapted)** | A literal no-change save is not possible: Save is **disabled** until the form is dirty, and that is by design. Done instead: line2 `Apt 4B`→`Apt 4C` Save → 200, data, no error, dialog closed. Then `Apt 4C`→`Apt 4B` Save → 200. The address id is unchanged |
| 7 | Toast on a non-profile flow | **PASS** | Header "Ship to" → "Add new" → `Jane2` → Create. Toast **"Some of the addresses are not valid"**, not the generic one. The dialog stays open. Response `addresses[1].firstName` (this flow sends the existing address plus the new one). No inline field error in this dialog (see Deviations) |
| 8 | Network `field` / `errorCode` | **PASS** | `api/fe-i1-updateContact-Runner2-storefront.json`, `api/fe-i4-updateMemberAddresses-Jane2-storefront.json`. Every error kept `code:"VALIDATION"` |
| 9 | Console | **PASS** | 0 errors and 0 warnings across sign-in, profile, addresses and home. Only info logs (ProductGuide, WebSocket, Apollo DevTools). The App Insights noise did not appear |
| 10 | Locale | **PASS** | All messages are human text ("Contains invalid characters", "HTML tags are not allowed", "Some of the addresses are not valid"). No raw i18n key was seen |

## STR tally
Run 1 PASS · Run 2 PASS · Run 3 PASS → **3/3**. Before the fix this showed only the generic "Something went wrong" toast.

## Deviations / observations
1. **Ship-to (header) new-address dialog: toast only, no inline field error.** The same address-form dialog flags the field on `/account/addresses` but not when it is opened from the header selector. There the error path is `addresses[1].firstName`, because the existing address is sent as index 0. This matches the PR wording ("toast on other pages"), so it is not a FAIL. It is a UX inconsistency for the PR owner to confirm as intended. If it is not intended, the index mapping (`addresses[N]` → the new address) is the likely cause.
2. **Incidental, cosmetic:** on `/account/profile` the **Last name** and **Email** inputs both use the placeholder "Enter your first name". This was seen today, and the change history of the label was not checked.
3. The OK button of the "Profile successfully updated!" dialog reloads the page. This is noted only and not judged.

## Screenshots (`screenshots/`)
- `fe-i1-profile-lastname-inline-error-run1.png`: item 1
- `fe-i2-profile-both-names-inline-error.png`: item 2
- `fe-i3-valid-save-oconnor.png`: item 3, valid save
- `fe-i4-address-dialog-firstname-inline-error.png`: item 4
- `fe-i5-address-dialog-line1-html-error.png`: item 5
- `fe-i7-shipto-new-address-toast.png`: item 7, the toast

HAR: lane config `recordHar` → `test-results/chrome/har/session.har`, written when the context closes.

## Data restore
Final xAPI `me` read: names **SmokeTest / Runner**, **1** address (Jane Doe, 456 Oak Avenue, Apt 4B, New York), the same address id as at the start. No address was created. The temporary profile value (`O'Connor`) and line2 (`Apt 4C`) were reverted through the UI. Because the line2 edit was round-tripped, the address `modifiedDate` has moved.
