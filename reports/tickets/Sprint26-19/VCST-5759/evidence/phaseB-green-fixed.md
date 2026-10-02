# Phase B — GREEN (fixed build)

Environment: vcptcore-qa · `VirtoCommerce.SalesRep 3.1011.0-pr-17-47fb` (live-confirmed via `/api/platform/modules`)
Platform `3.1072.0` · Theme `vc-theme-b2b-vue-2.59.0-pr-2458-61e8`

## B1. The identical nameless create is now REFUSED — 3/3 consecutive runs

Request — `POST /api/sales-rep` (same shape as Phase A)
```json
{"emails":["agent-test-sr5759-g<n>-<ts>@example.com"],"storeId":"B2B-store","password":"<redacted>","status":"Approved"}
```
Response — **HTTP 400**, identical on runs 1, 2 and 3
```
Validation failed:
 -- FirstName: 'First Name' must not be empty. Severity: Error
 -- LastName: 'Last Name' must not be empty. Severity: Error
```

## B2. A rejected save writes nothing

`GET /api/platform/security/users/<the refused email>` → `null`
(control: the same lookup for the rep that *was* created returns `id 8ce4b77e-…`)
No orphan account, no half-built contact.

## B3. A valid rep still saves, and values are trimmed

Request sent `"firstName":"  Green  "`, `"lastName":"  Verified  "` → **HTTP 200**
```json
{"firstName":"Green","lastName":"Verified","fullName":"Green Verified","salutation":"Dr",
 "storeId":"B2B-store","id":"a42a16b5-fa0a-4fe0-9bca-b6b668cd229b"}
```
Padding is stripped before validation and `fullName` is derived from the parts.

## B4. That rep CAN use the storefront — the bug's actual symptom is gone

Same query as Phase A2, same store, fixed build:
```json
{"data":{"me":{"contact":{"firstName":"Green","lastName":"Verified","fullName":"Green Verified"}}}}
```
No `errors` array. `contact` resolves.

## B5. Rule matrix — every documented rule enforced

| # | Input | Result |
|---|---|---|
| C2 | firstName `"   "`, lastName `"\t "` (whitespace only) | 400 — both `must not be empty` (trim runs before validation) |
| C3 | firstName 129 chars | 400 — `must be 128 characters or fewer. You entered 129 characters.` |
| C4 | salutation 257 chars | 400 — `must be 256 characters or fewer. You entered 257 characters.` |
| C5 | create with `emails: []` | 400 — `A Sales Rep requires a login email (or user name).` |
| C6 | address missing city + postalCode | 400 — `Addresses[0].City` / `Addresses[0].PostalCode must not be empty` |
| C9 | PUT an existing rep clearing both names | 400; re-read confirms the stored names are **unchanged** (`Green` / `Verified`) |

All refusals are **400 with the reason**, never a 500.

## B6. The ticket's exact query path — `GetPageContext` — now clean

The identical request from Phase A3, same variables, run on the fixed build as the rep from B3:
```json
{"data":{"pageContext":{"user":{"contact":
  {"firstName":"Green","lastName":"Verified","fullName":"Green Verified"}}}}}
```
**No `errors` key at all.** The RED→GREEN pair is on the exact path the ticket reported.

## B7. Error shape — refusals that used to be 500 now read 400 + reason

| # | Input | Result |
|---|---|---|
| C11 | create with an email already taken | **400** — `Username '…' is already taken.; Email '…' is already taken.` |
| C12 | `PUT` with an unknown id | **400** — `Sales Rep '00000000-…-999' not found` |
| C13 | `null` request body | **400** — `A Sales Rep is required.` |

## B8. Rollback holds on a late failure

C11 fails *after* the contact write, so it is the case that could leave an orphan. Checked:
`POST /api/members/search {"searchPhrase":"Dup","memberType":"Contact"}` → `totalCount 0`, and the
sales-rep total is still **23**, unchanged from before C11. No orphan contact, no orphan account.
