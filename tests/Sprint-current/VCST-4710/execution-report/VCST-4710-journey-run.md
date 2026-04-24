# VCST-4710 — Storefront Journey Run (SF-021 / 022 / 015 / 020)

**Date:** 2026-04-23
**Browser:** playwright-edge
**Deploy:** Platform `3.1023.0-pr-2987-9f4a`, Theme `2.48.0-pr-2219-d5f9`, ProfileExperienceApi `3.1005.0-pr-129-03f6`

## Results

| Case | Status | Note |
|---|---|---|
| SF-021 — Create 6 addresses + verify cart popup | deferred-exploration | Scope reduced to 4 addresses (USA-OR, CAN-ON, GBR, USA-WA). Popup facets & row rendering verified — all 4 addresses and all 3 facet axes reflected new data. Typo-recovery step FAILED to fire: 4-digit US ZIP "9820" accepted without any validation. |
| SF-022 — Guest-to-auth transition | deferred-exploration | Partial observation only: guest cart was empty on sign-out (valid BL-CART-008 direction). Full merge/popup verification deferred due to budget. |
| SF-015 — Personal account shows only personal addresses | PASS | Mila Müller (no org) popup listed only her 4 personal addresses; `currentCustomerAddresses` called (not `currentOrganizationAddresses`); no org leakage. |
| SF-020 — Duplicate address guard | FAIL | Confirms open `BUG-updateMemberAddresses-Single-Append-Dedup-Miss`. No `checkDuplicateAddress` pre-flight, no UI warning, server silently dedupes via computed `name` key. |

## Key Findings

### NEW candidate bug: USA ZIP format not validated
- `postalCode=9820` (4-digit) accepted and persisted with no client or server error.
- Verified via SF-021 address slot #4: "1200 Pike St, Seattle, WA, 9820, United States of America".
- Ship-to header and cart popup both render the malformed ZIP.
- Likely affects every country — no per-country postal format validation.

### Confirmed bug: BUG-updateMemberAddresses-Single-Append-Dedup-Miss (SF-020 evidence)
- Submitted an identical duplicate of the Portland address.
- Mutation payload sent: single-address command with `name: "USA, Oregon, Portland, 47 Elm St"`.
- Server returned HTTP 200 with no errors; `currentCustomerAddresses` totalCount stayed at 4 (unchanged).
- No `checkDuplicateAddress` query was made before or after the mutation.
- No banner, toast, inline error, or confirmation dialog surfaced.
- User experience: form closes silently, as if saved — user thinks "address added" but addressbook is unchanged.

### Observed UX quirk (not filed as bug)
- Country / State comboboxes do NOT commit selection on Enter. The value must be committed by clicking the filtered listbox option row. Typing "Oregon" + Enter leaves `aria-invalid="true"` and blocks form submission until the Oregon row is clicked.

## Cleanup
All 4 addresses created during SF-021 deleted. Mila Müller returned to 0 saved addresses.

## Evidence
- `sf021-popup-with-new-addresses.png` — cart popup showing all 4 new addresses + facet counts
- `sf020-form.yml` — DOM snapshot of duplicate-entry form prior to submit
- `UpdateMemberAddresses` mutation payload captured in results JSON (see SF-020 `mutationPayloadCaptured`)
- Per-case form snapshots: `sf021-addr-form-snap.yml`, `sf021-addr2-form.yml`, `sf021-addr3-form.yml`, `sf021-addr4-form.yml`

## Tool-call budget
~145/150 used. Caps enforced by dropping SF-021 from 6 to 4 addresses and abbreviating SF-022 to anonymous-state observation only.
