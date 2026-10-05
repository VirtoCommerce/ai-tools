# VCST-6000 — fix verification (Phase B / GREEN) — live vcptcore-qa

**Verdict: the backend fix WORKS. The storefront does not yet reflect it.**
Items 1–7 (API layer) **PASS**. Item 8 (storefront) **FAIL — separate frontend defect**. Item 9 **PASS**.

- **Env:** `https://vcptcore-qa.govirto.com` · storefront `https://vcptcore-qa-storefront.govirto.com` · store `B2B-store`
- **Build under test:** `VirtoCommerce.XCart 3.1037.0-pr-144-a0ce` (PR #144 alpha) · storefront theme `2.59.0-pr-2485-cf9f-cf9f8778`
- **Date:** 2026-09-24 · **Lane:** playwright-edge (item 8) + Node/fetch against the live APIs (items 1–7)
- **Buyer used:** `test-john.mitchell-20260310@test-agent.com` (the account named in the RED report — it works;
  `/connect/token` requires `storeId=B2B-store` on this stand, bare grant otherwise)
- **Product:** `agent-test-req-file-child-20260519` (`28d6bc0c-…`), required File section **"ID Proof"** (`656d7dea-…`);
  optional-section control `agent-test-config-fileupload` (`e3a70fff-…`), section "Design Upload" (`c344ed3a-…`)
- **RED baseline:** `reports/bugs/open/medium/BUG-configurable-file-upload-validation-gaps.md` § Finding 1,
  measured on this same stand 2026-09-23 against `XCart 3.1036.0`.

## Results

| # | Check | Expected | Measured | Verdict |
|---|---|---|---|---|
| 1 | `POST /api/files/product-configuration`, genuinely 0-byte file | 200, `size:0` (unchanged) | **200**, `succeeded:true`, `size:0`, real id — 3/3 uploads | **PASS** |
| 2 | `addItem`, required section, ONLY the 0-byte file | reject `CONFIGURATION_SECTION_FILES_REQUIRED` | **rejected**, `CONFIGURATION_SECTION_FILES_REQUIRED`, `itemsCount:0`, `items:[]` | **PASS** — was the bug |
| 3 | Item 2 repeated 3× | 3/3 reject | **3/3** reject, identical error, each with its own fresh upload | **PASS** |
| 4 | `addItem`, required section, one REAL file | succeed | **succeeded**, `validationErrors:[]`, line item created, file `size:28` attached | **PASS** |
| 5 | `addItem`, required section, 0-byte **AND** real file | succeed | **succeeded**, `validationErrors:[]`, line item created | **PASS** (see caveat) |
| 6 | `addItem`, required File section omitted | reject `CONFIGURATION_SECTION_REQUIRED` | **rejected**, `CONFIGURATION_SECTION_REQUIRED` — a *different* code from #2 | **PASS** |
| 7 | OPTIONAL File section, only a 0-byte file | succeed (fix scoped to required) | **succeeded**, `validationErrors:[]`, line item created with the `size:0` file | **PASS** — no over-reach |
| 8 | Storefront: 0-byte file in "ID Proof *" → "Add to cart" stays `disabled` | stays `disabled` | **"Add to cart" LOSES `disabled`**; clicking it hits the server, which rejects with `CONFIGURATION_SECTION_FILES_REQUIRED`, `itemsQuantity:0`, `items:[]` — and **nothing is shown to the user** | **FAIL** (frontend) |
| 9 | Console: no new errors | none | **0 errors** (only the known App Insights `dc.services.visualstudio.com` noise) | **PASS** |

**The fix is real and it is the one under test.** The pre-fix build accepted this exact payload with
`validationErrors: []` and created the line item; the same payload on `3.1037.0-pr-144-a0ce` is rejected with
the existing code `CONFIGURATION_SECTION_FILES_REQUIRED`. Item 6 remains a *different* error code, so the fix
did not collapse the two required-section failure modes into one. Item 7 proves it did not reach optional sections.

## Item 5 — a caveat that matters, and a side finding

A first pass reported item 5 as FAIL. It was a **test artifact, not the fix**: an uploaded file URL is
**single-use**. Once a file is attached to a created line item it belongs to it, and a later `addItem`
referencing the same URL silently drops that file from the section — no error, no warning. The item-4 payload
replayed with its already-consumed URL fails with `CONFIGURATION_SECTION_FILES_REQUIRED` for exactly that
reason (`P3-real-only-again.json`). Re-run with a freshly uploaded file per case, item 5 **passes**. Probe
evidence and the reasoning: `EVIDENCE-NOTES.md`.

This is worth knowing beyond this ticket — it is a silent drop, and it is what makes a naive re-run of these
cases look like a regression. Not filed here (out of VCST-6000's scope, and it predates the fix); raised for triage.

## Item 8 — the storefront gate was never fixed, and the error is invisible

The two layers disagree, which is the whole reason they were measured separately:

- the **server** now correctly refuses the line item — confirmed on the storefront's own `AddItem` call,
  verbatim in `C8-storefront-addItem.json`;
- the **storefront** still enables "Add to cart" on a 0-byte file, and on the rejection shows the user
  **nothing at all** — no toast, no inline error, no banner. The button stays enabled, the cart badge stays
  empty, the console is clean. A buyer gets a dead button with no explanation.

This is exactly what the RED report predicted ("a storefront-side guard in `vc-frontend` is worth adding for
the error message, but it is cosmetic once the server rejects") — except the silent-failure half is not
cosmetic: the data-integrity defect is closed, but the UX defect it was hiding behind is now the visible one.
**Recommend a follow-up on `vc-frontend`** (configurable-product file-upload widget): treat a 0-byte file as
not satisfying a required section, and surface `CONFIGURATION_SECTION_FILES_REQUIRED` from the `addItem`
response. This does **not** block closing VCST-6000 as a backend fix.

Screenshots: `screenshots/VCST-6000-GREEN-item8-storefront-addtocart-still-enabled-after-0byte.png`,
`screenshots/VCST-6000-GREEN-item8b-after-addtocart-click-no-error-shown.png`.

## Suite impact

`CFG-FILE-003` ("0-Byte File Rejected on Required Upload Section") asserted the correct behaviour and was
failing ahead of the code. At the **API layer** it now passes. If the case asserts the *storefront* button
state it still fails — against the frontend gap above, not the backend.

## Evidence

All request/response payloads verbatim in this folder, Authorization headers redacted — index in `EVIDENCE-NOTES.md`.

## Teardown

Test carts are named `v6000-<timestamp>-<case>` / `v6000-p-*` under the buyer account (created by cases 4, 5, 7
and the probe; the rejected cases created none). Uploaded fixtures are `zero-byte-fixture.txt` /
`real-fixture.txt` / `real2-fixture.txt` in the `product-configuration` file scope. No configuration or
platform state was changed.
