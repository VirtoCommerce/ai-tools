# VCST-6152 — Fix Verification · VERIFIED

**Env:** vcptcore-qa · Platform 3.1076.0 · XCart 3.1038.0-pr-141-b404 (PR vc-module-x-cart#141 head `b40455e`, contains fix `cd42696`) · Cart 3.1011.0-pr-194-8331 · SalesRep 3.1012.0-pr-21-8964 · 2026-10-06
**Layer:** GraphQL xAPI (`/graphql`) · **Actor:** @td(SR_REP_PRIMARY) · **Targets:** A=@td(ORG_ACME), B=@td(ORG_TECHFLOW), C=@td(ORG_BUILDRIGHT)
**Method:** run inline over xAPI (API-only bug, no browser surface). 3 consecutive runs + 1 order probe. All `AGENT-TEST-VCST6152-*` lists removed after the run.

## Fix
- `WishlistType.ResolveSharingSetting` orders `targets` by `SharedWithId`, so mutation responses and reads share one order.
- `GetLegacyTargetDeltas` treats ANY present target (case-insensitive) as a no-op instead of only the first.

## Baseline (RED)
From `reports/bugs/fixed/BUG-VCST-5925-targets-order-unstable-legacy-sharedWithId-refused.md` (XCart 3.1037.0-pr-141-fb27, 2026-10-01 / 10-02) and kb KB-42230B0A: write order A,B vs read B,A. Re-sending the write-response `sharedWithId` → HTTP 200 + `INVALID_OPERATION`. Pre-fix payloads were not captured to disk.

## Checklist (Phase B, GREEN): 31/31 PASS

| # | Check | Result |
|---|---|---|
| 1 | Reproduce original STR: re-send the `sharedWithId` from the create response | PASS 3/3: no-op, no errors |
| 2 | Write-response target order == read order (2 targets, 2 reads) | PASS 3/3: ACME,TECHFLOW on both |
| 3 | `sharedWithId` identical on write and read | PASS 3/3 |
| 4 | Root cause: a write inserted [C,B,A] comes back sorted, same as the read | PASS: ACME,BUILDRIGHT,TECHFLOW on both |
| 5 | Legacy re-send of the other present target / upper-cased id | PASS 3/3 each: no-op |
| 6 | Legacy re-send of the LAST of 3 targets | PASS 3/3: no-op, 3 targets kept |
| 7 | Legacy NEW served org on a multi-target list is refused and writes nothing (contract 2.3) | PASS 3/3: `INVALID_OPERATION`, set unchanged |
| 8 | Regression: rename response order == read | PASS 3/3 |
| 9 | Regression: `addSharedWithIds` 3rd target, response == read | PASS 3/3 |
| 10 | Regression: `removeSharedWithIds`, response == read, target gone | PASS 3/3 |

Refusals stay HTTP 200 + `errors[]` (no 5xx). No new errors on any non-refusal call.

## Notes
- Not covered: storefront UI (the bug is API-contract only) and the deleted-target-org variant from the bug report.
- kb KB-42230B0A: dispute queued with this observation (second independent session after 2026-10-05).

## Evidence
- `evidence.html`: before/after, tally, captured request/response
- `payloads/phase-b-green-2026-10-06.json`: every request/response of the run (no tokens)
- `payloads/phase-b-results.json`: per-check results
