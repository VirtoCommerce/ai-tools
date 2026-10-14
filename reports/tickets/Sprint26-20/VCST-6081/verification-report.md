# VCST-6081 — Phase B (GREEN) verification, storefront

**Verdict: the fix works. The original defect is gone (8 of 8 uploads made one request each, the page never froze, and failed files stay listed with an error).** Item 5 does not match the checklist as written and needs a decision (see below). One incidental defect.

| | |
|---|---|
| Env / build | vcst · `FRONT_URL` · footer `Ver. 2.60.0-pr-2511-81f1-81f18d01` (confirmed before testing) |
| Browser | playwright-chrome (chromium 150), 1920x1080, signed in as `USER_EMAIL` |
| Window | 2026-10-12 14:35–14:42 UTC |
| Fixtures | Optional: `@td(CFG_FILE_HOODIE)` (AGENT-TEST-Config-FileUpload, section "Design Upload"). Required: **AGENT-TEST-Req-File-Child**, `/products-with-options/cfg-parents/agent-test-req-file-child`, id `84cd45dd-1fd0-4038-be11-a364da1fcf7f`, section "ID Proof *" (required File) plus "Service Plan *". I found it in the PDP's "Customers bought together" block and confirmed it in the UI; xAPI was not used |
| Files | `@td(CFG_TEST_FILES.validPdf.path)`, plus temporary oversize (1.5 MiB), small .pdf/.txt and 0-byte files, all deleted after the run |
| HAR | `test-results/chrome/har/session.har` (gitignored; contains bearer tokens, so it is not copied here) |

## Per-item results

| # | Item | Result | Tally | Evidence |
|---|---|---|---|---|
| 1 | STR: valid PDF → INVALID_SCOPE | **PASS** | 3/3 | green-2..5 |
| 2 | Client-side reject, file >1 MiB | **PASS** | 3/3 | green-10..12 |
| 3 | Root cause: no stuck "uploading" state, heap | **PASS** (heap not sampled) | — | snapshots |
| 4 | Remove the failed file | **PASS** | 1/1 | green-6 |
| 5 | "None" with a failed file present | **FAIL as written — needs a decision** | 1/1 | green-7, green-8 |
| 6 | Configuration checklist text | **PASS** | 3 states | green-1, 3, 6 |
| 7 | Required File section | **PASS**; 0-byte sub-check **BLOCKED** | 1/1 | green-14..16 |
| 8 | Configured add to cart, "None" | **PASS** | 1/1 | green-9 |
| 9 | Two files in one pick | **PASS** | 1/1 | green-13 |
| 10 | File name containing `"` | **SKIPPED** | — | the scope is unregistered on vcst and Windows does not allow `"` in a file name |

### Details

1. **Each run made one `POST /api/files/product-configuration`.** HAR at 14:35:39, 14:36:24 and 14:36:52; the count did not change 8–10 s after the upload settled.
   - **Response (all runs):** `200 [{"succeeded":false,"errorCode":"INVALID_SCOPE","errorMessage":"Unknown scope 'product-configuration'","errorParameter":"product-configuration","name":null,...,"id":null}]`
   - **What the page showed:** the file stayed listed as `test-fixture-1page.pdf`, with the error `Unknown scope ''.` and the size `(611B)`, plus a "Remove file" control and the alert **"Fix file upload errors to continue."** The message is translated (no raw `file_error.*` key on screen) but its parameter is empty — see F1.
   - **Other state:** "None" stayed checked, and Add to cart stayed enabled. The page stayed responsive throughout (every tool call answered within about 1 s).
   - **Compared with RED (red-1..8):** the file no longer vanishes and an error is now shown.
2. **Each run: no request was sent; the file stayed listed with its error and the alert appeared.**
   - **What the page showed:** the chip `oversize-1_5MiB.bin`, the text `File size exceeds the allowed`, the size `(1.5MB)`, and the alert "Fix file upload errors to continue.". The limit value is missing from the message (F1).
   - **Other state:** "None" stayed checked and was not flipped. In RED (red-1..6) the file vanished and no error or alert was shown.
3. **No file showed a spinner or "uploading" state after any upload settled** (snapshots checked for `progressbar`/`uploading`/`spinner`/`loader`: none). Console: 0 errors and 0 warnings on the PDP across all runs.
   - **Heap: not sampled.** Reading `performance.memory` through `browser_evaluate` is blocked by the `enforce-real-user` hook. As a proxy, nothing grew: there were no repeat requests and no stall.
4. **After clicking "Remove file":** the chip and the alert are gone, the drop zone is clean, "None" is checked, the checklist reads "Design Upload — optional", and Add to cart is enabled. No extra request was made.
5. **"None" is already checked while the failed file is listed, so clicking it does nothing.** The chip, the error and the alert all stay (green-7), so "select None → the section resets" cannot happen. The only way to clear the section is the × control. This follows from fix (b) ("None is not flipped"); **the lead needs to decide whether that is the intended UX.**
   - **With "None" and no failed file:** Add to cart is **enabled**. This matches BL-CAT-006, which allows an optional section to be left empty.
   - **With a failed file present:** Add to cart is **enabled**, and clicking it **added a line** (AddItem `configurationSections: []`, no `errors[]`, `validationErrors: []`, cart badge 1→2). This happened while the section still showed "Fix file upload errors to continue." (green-8). That line was removed afterwards.
6. **The configuration checklist read the same in all three states** — clean, failed file present, and "None": `Design Upload — optional` + a "Review" link, with the same amber (!) icon. It never says "(completed)", so it does not claim the section is fine. It also does not reflect the error.
   - **Required product:** while the upload had failed, the checklist read `ID Proof — required` + "Upload a file".
7. **Required File section ("ID Proof"):**
   - **Failed upload (1 POST):** the PDF stayed listed with `Unknown scope ''.` and the alert. Add to cart stayed **disabled**, and the header kept "Complete all required options to finalize your selection".
   - **0-byte file: rejected, but not by a size rule.** It was **POSTed** (no client-side guard) and failed on INVALID_SCOPE: the chip read `zero-byte.txt`, `Unknown scope ''.`, `(0B)`, and Add to cart stayed disabled.
   - **Why the 0-byte check is BLOCKED:** the VCST-6000 fix (vc-frontend #2510) gates on `file.size > 0` for a *successfully uploaded* file. On vcst no upload ever succeeds, so the result here comes from INVALID_SCOPE and cannot show whether that gate works. It needs a stand where the scope is registered.
8. **Each "Add to cart" made its own line.** On a fresh PDP with "None", Add to cart created a new line `185f76e9…`, separate from the earlier line `5fd1a91d…` that had the same empty configuration (green-9), which matches BL-CART-007.
   - **Cleanup:** I removed both lines. The cart is back to how I found it: 1 line, "Vintage Wedding cake" `330082f8…`.
9. **Two files picked at once:** `first-small.pdf` (611B) and `second-small.txt` (23B) produced **2 POSTs, one per file** (both 14:40:38.893Z, both INVALID_SCOPE). Both files are listed with `Unknown scope ''.` plus the alert, and the page did not freeze.

## Console / network (whole session, from the HAR)

- **File uploads:** 8 `POST /api/files/product-configuration` in total: 3 (item 1), 1 (item 5), 2 (item 9), 2 (item 7). Each one was HTTP 200 with `INVALID_SCOPE`, and there were no retries. The oversize file made 0 requests.
- **Other errors:** two 404s, for the seed images `cms-content/.../AGENT-TEST-CFG-034-main_md.png` and `.../AGENT-TEST-CMP-VARPARENT-main_md.png`. They appear on the cart page "Recently browsed" block and are a test-data problem, not product. No GraphQL `errors[]` in any 200 response. The PDP console showed no errors or warnings.

## Incidental findings

- **F1 — error messages render with an empty parameter (Low–Medium, UI/i18n).**
  - **What shows:** `Unknown scope ''.` although the response carries `errorParameter:"product-configuration"`, and `File size exceeds the allowed` with no limit value.
  - **Cause (from the source):** `locales/en.json` defines `"INVALID_SCOPE": "Unknown scope '{0}'."` and `"INVALID_SIZE": "File size exceeds the allowed {0}"`. `useFiles.getErrorMessage` passes `errorParameters:[{key:"0",value}]`, and `useErrorsTranslator.getErrorParameters` turns that into a *named* object `{ "0": value }`. Vue-i18n then resolves `{0}` to an empty string, as observed on screen.
  - **Scope:** the translator is outside the PR #2511 diff, so this is most likely a pre-existing defect that the fix exposed — the RED build hid every upload error. It is probably not limited to this section. It is also worth asking whether a buyer should see "Unknown scope" at all.
- **F2 — contradictory messaging in an optional section (UX, observation).** The alert "Fix file upload errors to continue." is shown, yet Add to cart is enabled and adds a line without the file and without telling the buyer (item 5). This is not a BL-CAT-006 violation (optional sections may be empty), but the alert's wording is not enforced. Pass to the lead for a decision, together with item 5.
- **F3 — repo test data.** `test-data/files/test-fixture-1page.pdf` is 611 B on disk (sha256 `5b7e2a0f…`), while `@td(CFG_TEST_FILES.validPdf)` declares 578 B / `3ef1fe5d…`. `git ls-files --eol` shows `i/lf w/crlf` and there are no attributes, so git treats the PDF as text and converts its line endings on a Windows checkout. A `*.pdf binary` rule in `.gitattributes` would fix it.
- **F4 — kb.** `KB-FF711B97`, which the brief cites, is **not in the base index**. `KB-057A596A` states 9.5 MB and a fixed type list, while vcst shows the 1 MB storefront fallback, consistent with the scope being unregistered. I did not dispute or capture anything, per the brief.

## Notes

- **Where the temporary files went:** the Playwright MCP server only accepts upload paths under the repo roots, so it rejected the scratchpad. I put the temporary files in the gitignored MCP output folder `test-results/chrome/green-files/` and deleted them after the run.
- **kb asks:**
  - "POST /api/files/product-configuration INVALID_SCOPE…": opened `KB-E91989D9` (same response shape for the return-attachments scope on vcst).
  - "configurable product File section upload error storefront display…": closed with kb_none.
  - `KB-FF711B97`: not found in the base.
