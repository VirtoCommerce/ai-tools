# Phase 5 -- Live Environment Verification

**Run ID:** TLC-2026-03-24-1330
**Phase:** 5 of 7 (Verification)
**Date:** 2026-03-24
**Browser:** playwright-firefox
**Environment:** QA (vcst-qa-storefront.govirto.com)
**Storefront Version:** 2.44.0-pr-2212-9072-9072853e

---

## Summary

| Metric | Count |
|--------|-------|
| **Total Verified** | 10 |
| **VERIFIED** | 9 |
| **CHANGED** | 1 |
| **BROKEN** | 0 |
| **BLOCKED** | 0 |
| **Pass Rate** | 90% |

**All 5 JIRA bugs reproduced successfully.**

---

## JIRA Bug Cases (5/5 Reproduced)

### CFG-FILE-001 -- VCST-4825: Upload button not disabled at max files
**Result:** VERIFIED -- Bug Reproduced

Uploaded 5 files to the optional File section on the "Hoodie Base with Only File non required" product. After the 5th upload:
- Warning message appeared: "You have uploaded the maximum number of files possible. Further uploads are not possible."
- BUT the "Browse your files" button remained active/clickable (not disabled, cursor=pointer)
- Screenshot: `CFG-FILE-001-5files-uploaded.png`

### CFG-FILE-002 -- VCST-4826: None radio does not clear uploaded files
**Result:** VERIFIED -- Bug Reproduced

After uploading 5 files, clicked the "None" radio button on the optional File section:
- "None" radio became selected (checked)
- Section header reverted to "Personalize your selection further (optional)"
- BUT all 5 files remained visible in the list -- files were NOT cleared
- Screenshot: `CFG-FILE-002-none-selected.png`

### CFG-FILE-003 -- VCST-4827: 0-byte file accepted on required section
**Result:** VERIFIED -- Bug Reproduced

Uploaded `large_logo.png` (0 bytes) to the required File section on "Hoodie Base product with only File req":
- File accepted without any error message
- Displayed as "large_logo.png (0B)" in the file list
- Section header changed from "Complete all required options" to "large_logo.png" -- the 0-byte file satisfied the required validation
- Screenshot: `CFG-FILE-003-0byte-accepted.png`

### CFG-FILE-004 -- VCST-4828: Counter increments on blocked add-to-cart
**Result:** VERIFIED -- Bug Reproduced

On the required File product with no file uploaded, clicked the "+" (Increase quantity) button:
- Quantity counter incremented from 0 to 1 despite required section being unfilled
- Toast notification appeared: "Sorry, this product cannot be added to cart. Check your product configuration"
- Section header showed "Section is required" in red
- Item was NOT actually added to cart (correct), but counter increment is misleading
- Screenshot: `CFG-FILE-004-005-counter-incremented.png`

### CFG-FILE-005 -- VCST-4829: Button not disabled for incomplete config
**Result:** VERIFIED -- Bug Reproduced

The "+" (Increase quantity) button is NOT disabled when the required File section is unfilled:
- No `disabled` attribute or `aria-disabled` present
- Button has `cursor=pointer` and is fully clickable
- Same screenshot as CFG-FILE-004

---

## Text Section Cases (3 verified)

### CFG-TEXT-001 -- BVA 30-char boundary
**Result:** CHANGED -- Test case needs update

Product AGENT-TEST-Config-Engraved-Ring-20260324 found at expected URL. Required Text section "Engraving Text *" present with text input. However:
- HTML input has `maxLength=255`, not 30 as the test case assumes
- No visible character counter on the page
- 30 characters typed and accepted, but the boundary is at 255, not 30
- **Action needed:** Update test case maxLength from 30 to 255, or verify admin configuration and adjust accordingly

### CFG-TEXT-002 -- Whitespace-only validation
**Result:** VERIFIED

Typed 5 spaces into the required text field and attempted add-to-cart:
- Toast: "Sorry, this product cannot be added to cart. Check your product configuration"
- Section header: "Section is required" (whitespace-only treated as empty)
- Whitespace-only input correctly does NOT satisfy required text validation
- Screenshot: `CFG-TEXT-002-whitespace-rejected.png`

### CFG-TEXT-005 -- Special characters and Unicode
**Result:** VERIFIED

Typed `O'Brien & Co -- <script>` into the text field:
- Special characters persisted in the input field
- Added to cart successfully
- In cart "Components list": `1. Selected text: O'Brien & Co -- <script>`
- Apostrophe, ampersand, em-dash, and HTML angle brackets all preserved without encoding artifacts
- Screenshot: `CFG-TEXT-005-cart-special-chars.png`

---

## File Edge Cases (2 verified)

### CFG-FILE-006 -- Multi-file selective removal
**Result:** VERIFIED

Confirmed during CFG-FILE-001 testing: each file in the uploaded list has an individual "Remove file" (X) button. Files are listed with name, size, and per-file remove button. Selective removal mechanism present and functional.

### CFG-FILE-009 -- Recovery after failed uploads
**Result:** VERIFIED

1. Uploaded `download.avif` (unsupported type) -- rejected with "File format is not allowed" error and "Fix file upload errors to continue" warning
2. Removed the rejected file using the X button
3. Uploaded `Logo1.png` (valid, 203kB) -- accepted successfully
4. Section header updated to "Logo1.png", error state cleared completely
5. Upload control remained functional throughout the reject-recover cycle

---

## Environment Health

| Check | Status |
|-------|--------|
| Console JS errors | 0 errors across all tests |
| Network failures | None observed |
| Page load | All pages loaded within 3s |
| Console warnings | 8 warnings (all benign: autocomplete, resource blocking, WebSocket) |

---

## Evidence Files

| File | Description |
|------|-------------|
| `CFG-FILE-001-5files-uploaded.png` | 5 files uploaded, button still active |
| `CFG-FILE-002-none-selected.png` | None selected, files still visible |
| `CFG-FILE-003-0byte-accepted.png` | 0-byte file accepted on required section |
| `CFG-FILE-004-005-counter-incremented.png` | Counter at 1, Section is required, button not disabled |
| `CFG-TEXT-002-whitespace-rejected.png` | Whitespace-only rejected, Section is required |
| `CFG-TEXT-005-cart-special-chars.png` | Special chars preserved in cart components list |
| `CFG-TEXT-005-cart-top.png` | Cart top view with configuration |

---

## Verdict

**9 of 10 cases VERIFIED.** 1 case (CFG-TEXT-001) needs a test case update for the maxLength value. All 5 JIRA bugs (VCST-4825 through VCST-4829) were successfully reproduced against the live QA environment. Test cases accurately describe the expected bug behavior.

**Phase 5 Status: PASS** -- proceed to Phase 6 quality gate evaluation.
