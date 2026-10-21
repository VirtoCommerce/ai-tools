# W2 — Catalog & search · Stable 16

**Run:** REG-2026-10-13-W2 · **Owner:** Elena Kutasina · **Env:** vcptcore-regression (Platform 3.1076.1, Theme 2.59.0) · **Plan:** [../../PLAN.md](../../PLAN.md)
**Status:** TRIAGED — every FAIL has a ledger row, repairs merged (ai-tools#449); real bugs from the browser lane are not filed yet, one decision is pending.

## Result
553 of 611 planned cases executed: **445 PASS · 53 FAIL · 51 BLOCKED · 4 SKIPPED**.

| Suite | PASS | FAIL | BLOCKED | Suite | PASS | FAIL | BLOCKED |
|---|---|---|---|---|---|---|---|
| 001 | 20 | 0 | 9 | 064 | 18 | 0 | 0 |
| 002 | 27 | 1 | 4 | 064b | 10 | 0 | 1 |
| 003 | 29 | 0 | 1 | 069 | 24 | 4 | 0 |
| 005 | 32 | 1 | 15 | 076 | 13 | 2 | 0 |
| 050a | 55 | 11 | 0 | 086 | 7 | 9 | 0 |
| 050i | 37 | 22 | 1 | 087 | 12 | 0 | 0 |
| 051 | 48 | 0 | 1 | 088 | 18 | 1 | 9 |
| 052 | 24 | 0 | 7 | 099 | 10 | 0 | 0 |
| 053 | 30 | 2 | 0 | 100 | 3 | 0 | 3 |
| 062 | 20 | 0 | 0 (4 skipped) | 103 | 8 | 0 | 0 |

## What the FAILs were
Verdict per case: [ledger.csv](ledger.csv). In short:
- **Most FAILs were data, not product:** configurable-product and review fixtures that existed only on vcst (050i, 086), orders seeded without an organization (086). Seeders fixed in ai-tools#449.
- **Stale cases** rewritten in ai-tools#449, including CAT-GQL-150 after VCST-6094 was closed as *Works as designed* (barcode search treats `*` and `?` as wildcards).
- **Bugs filed from this wave:** VCST-6332 (empty `configurableProductId` returns another product's configuration), VCST-6333 (`createReview` accepts an empty `entityId`), VCST-6376 (moving a category rewrites the `catalogId` of linked products). Existing VCST-3610 (seoInfo on categories without SEO) linked.

## Open
- **SRCH-009 / SRCH-010** — deprecate or retarget (the bundle deprecates what they assert). Owner: Elena Kutasina.
- **Real bugs not filed yet** (ledger `DRAFT`): `.jpg` originals never thumbnailed (IMGTL-007, one defect behind IMGTL-024/025), channel completeness stays 0% (CHAN-008), stale category after a cascade delete (CATA-011), EUR price 0 on the PDP (CAT-054), search suggestions not a listbox (SRCH-NEW-026), no thumbnail progress (IMGTL-026).
- **Seen during the W2 triage but not tied to a FAIL row, not in the ledger yet:** paging duplicates without a tie-breaker, Assets path traversal returning 500 with the server path, thumbnail run/cancel allowed with only `thumbnail:read`. The next W2 owner adds a row for each (`OBS-…`) after re-checking it.

## BLOCKED — main causes
- **Env config:** Brands not configured on B2B-store (001), no YouTube API key (051), no facet with dictionary-item priority ordering (005).
- **Surface not in theme 2.59:** organization search pages (005, same family as SRCH-009/010).
- **Fixtures missing on this env:** compare variations, org-excluded products (002); fixture products in a catalog the store does not expose (052); review fixtures (088, run on a substitute product).
- **Unsafe on a shared env:** cases that change store-wide settings were not run in parallel with other lanes (002).
