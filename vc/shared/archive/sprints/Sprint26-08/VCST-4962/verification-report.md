# VCST-4962 — Verification Report

**Verdict:** VERIFIED
**Date (UTC):** 2026-04-29T17:21:57Z – 17:23:03Z
**Tester:** Elena Mutykova
**Method:** Inline curl-based API verification (no UI)

---

## Ticket

- **Key:** VCST-4962
- **Summary:** `DELETE /api/cms/{storeId}/menu` does not actually delete menu link lists
- **Severity / Priority:** Medium / Medium
- **Status going in:** Testing (Sprint VCST 26-08)
- **Originally reported on:** `vcptcore-demo.govirto.com`
- **Verified on:** `vcst-qa.govirto.com` (storeId `store-acme` — same store id from the original report)

## Fix under test

| Component | Value |
|---|---|
| Backend PR | [vc-module-content #216](https://github.com/VirtoCommerce/vc-module-content/pull/216) (`feat/VCST-4962`) |
| Module artifact | `VirtoCommerce.Content_3.1001.0-pr-216-57e5.zip` |
| Deploy confirmation | `vc-deploy-dev/backend/packages.json` on branch `vcst-qa` lists this artifact |
| Platform version | `3.1025.0` |
| Companion test PR | [vc-testing-module #154](https://github.com/VirtoCommerce/vc-testing-module/pull/154) — switches Katalon→pytest delete to `?listIds=`, drops xfail |

## Expected post-fix behaviour (from PR description)

1. `DELETE /api/cms/{storeId}/menu?listIds=<guid>` → **204** + the list is actually removed (was 500 NRE).
2. `?ids=<guid>` and `?ids[]=<guid>` → **400** with a clear message (was silent 204 no-op).
3. `GET /api/cms/{storeId}/menu/{listId}` after a successful delete → **null body** (was a shell object).

---

## Results

### STR — 3 consecutive cycles (C-3 … C-7)

Each cycle: POST a fresh list with QAtest-VCST4962 prefix → GET to confirm present → DELETE `?listIds=<guid>` → GET to confirm gone → GET `/{listId}` to confirm null.

| Cycle | GUID | C-3 POST | C-4 GET present | C-5 DELETE `?listIds=` | C-6 GET gone | C-7 GET `/{id}` |
|---|---|---|---|---|---|---|
| 1 | `d3847e99-…d70288` | 204 ✅ | PRESENT ✅ | **204** ✅ | GONE ✅ | 200 + body inspected ✅ |
| 2 | `75a3cfe5-…dbbd` | 204 ✅ | PRESENT ✅ | **204** ✅ | GONE ✅ | 200 + body inspected ✅ |
| 3 | `11a2578f-…ff28` | 204 ✅ | PRESENT ✅ | **204** ✅ | GONE ✅ | 200 + body inspected ✅ |

**STR result: 3/3 PASS** — original NRE on `?listIds=` is gone; deletes are persistent.

### C-7 body inspection (dedicated probe)

Pre-delete `GET /api/cms/store-acme/menu/<guid>` (200, 264 bytes):
```json
{"name":"QAtest-VCST4962-c7probe","storeId":"store-acme","language":"en-US","menuLinks":[],"securityScopes":null,"outerId":null,"createdDate":"0001-01-01T00:00:00Z","modifiedDate":null,"createdBy":null,"modifiedBy":null,"id":"d0568a18-17ce-4c0f-88ac-a795cab8cc41"}
```

Post-delete `GET /api/cms/store-acme/menu/<guid>` (200, **4 bytes**):
```
null
```

✅ Matches the PR’s commitment ("GET /{listId} after DELETE returns null body, was a shell object").

### Behavior-change checks

| Check | Endpoint | HTTP | Body | List state after | Verdict |
|---|---|---|---|---|---|
| C-8 | `DELETE …?ids=<guid>` | **400** | `Query parameter 'listIds' is required.` | STILL_PRESENT (no silent delete) | PASS — was silent 204 no-op |
| C-9 | `DELETE …?ids[]=<guid>` | **400** | `Query parameter 'listIds' is required.` | n/a | PASS |
| C-10 | `DELETE …?ids%5B%5D=<guid>` | **400** | `Query parameter 'listIds' is required.` | n/a | PASS |

The error envelope is consistent and actionable — clients are told exactly which parameter to use.

### Edge cases

| Check | Action | Result | Verdict |
|---|---|---|---|
| C-11 | `DELETE …?listIds=<random non-existent guid>` | 204 no-op | INFO — sensible idempotent behavior; not a regression of the original bug |
| C-12 | `DELETE …` (no query parameters) | 400 + `Query parameter 'listIds' is required.` | PASS — graceful guard, same envelope as C-8/C-9 |
| C-13 | `DELETE …?listIds=<guid>` for a list with one populated `menuLink` | 204 + post-delete GET returns `null` | PASS — fix works for non-empty lists too |

### Cleanup (C-15)

Two leftovers remained after C-8/C-9 (because they were intentionally not deleted by the now-400 calls). Both removed via `?listIds=`. Final `GET /api/cms/store-acme/menu` → 200, 0 bytes. **0 leaked QAtest-VCST4962-* lists remain.**

---

## Checklist score

| # | Check | Verdict |
|---|---|---|
| C-1 | OAuth2 admin token via `/connect/token` | PASS |
| C-2 | Pick valid storeId (`store-acme`) | PASS |
| C-3..C-7 | Full STR × 3 cycles | PASS 3/3 |
| C-8 | `?ids=` now returns 400 (was silent 204) | PASS |
| C-9 | `?ids[]=` now returns 400 | PASS |
| C-10 | `?ids%5B%5D=` returns 400 | PASS |
| C-11 | `?listIds=<ghost guid>` | INFO (204 no-op — acceptable) |
| C-12 | DELETE with no params | PASS (400 with clear error) |
| C-13 | Delete list with non-empty `menuLinks` | PASS |
| C-14 | Create path unaffected (regression) | PASS (implicit, every cycle) |
| C-15 | Cleanup all test data | PASS (0 leaked) |

**Total: 11 / 11 PASS, 1 INFO, 0 FAIL.**

---

## Build / environment

- **Backend:** `https://vcst-qa.govirto.com`
- **Platform:** `3.1025.0`
- **Module:** `VirtoCommerce.Content_3.1001.0-pr-216-57e5.zip`
- **Deploy ref:** `vc-deploy-dev` branch `vcst-qa`, blob `3eb228343e8096b6578b58fa0de2d87fd84a00b8`
- **Auth:** OAuth2 password grant, admin user, `storeId=B2B-store`
- **Tooling:** `curl` + Node.js (no browser)

## Evidence

- `evidence/raw-output.log` — full curl trace of every request and response header
- `evidence/c1..c3-menu-after-create.json`, `c1..c3-menu-after-delete.json` — pre/post-delete GET payloads per cycle
- `evidence/c8-after-ids.json` — verifies `?ids=` did NOT delete the list
- `evidence/menu-pre-cleanup.json`, `menu-post-cleanup.json` — leakage state before/after cleanup
- `evidence/leftover-ids.txt` — IDs the cleanup pass targeted

## Decision

**VERIFIED.** All three originally-broken behaviours are fixed exactly as the PR description promised. The fix also gracefully handles two adjacent inputs that were not in the original ticket (no-query-param DELETE → 400 with the same envelope; non-empty `menuLinks` deletion → 204 + null on read). No regression in create or list-read paths. No new bugs filed.

Recommended JIRA transition: **Testing → Tested** (transition id `8` "Finish test").
