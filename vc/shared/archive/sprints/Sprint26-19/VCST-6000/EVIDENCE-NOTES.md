# VCST-6000 GREEN run — evidence index

Captured 2026-09-24 on vcptcore-qa, `VirtoCommerce.XCart 3.1037.0-pr-144-a0ce` (PR #144 alpha).
All Authorization headers / bearer tokens / passwords redacted on capture.

| File | Item | What it is |
|---|---|---|
| `C1-zero-byte-uploads.json` | 1 | 3 × `POST /api/files/product-configuration` with a genuinely 0-byte file |
| `C2-zero-only-run{1,2,3}.json` | 2, 3 | `addItem`, required File section with ONLY a fresh 0-byte file |
| `C4-real-file.json` | 4 | `addItem`, required section with one real 28-byte file |
| `C5-zero-plus-real.json` | 5 | `addItem`, required section with a fresh 0-byte AND a fresh real file |
| `C6-section-omitted.json` | 6 | `addItem`, required File section omitted (control) |
| `C7-optional-zero.json` | 7 | `addItem`, OPTIONAL File section with only a 0-byte file |
| `C8-storefront-addItem.json` | 8 | The storefront's own `AddItem` request/response, captured live via playwright-edge |

## The `P*.json` probe files — read the caveat

`P1-real-then-zero.json`, `P2-two-real.json`, `P3-real-only-again.json` are an **investigation probe**, not
verdict evidence. A first pass at items 4/5 reused one uploaded file URL across several `addItem` calls and
produced a confusing FAIL on item 5. The probe established why: **an uploaded file URL is single-use** — once a
file is attached to a created line item it is owned by it, and a later `addItem` referencing the same URL
silently drops that file. `P3` is literally the item-4 payload replayed with the already-consumed URL, and it
fails with `CONFIGURATION_SECTION_FILES_REQUIRED` for that reason, not because of the fix.

Every `C*` result above was therefore re-run with a **freshly uploaded file per case**. Those are the verdicts.
