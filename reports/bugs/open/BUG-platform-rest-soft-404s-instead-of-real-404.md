# Platform REST: missing/deleted resources return `200` (null or empty body) instead of `404`

## Status: CONFIRMED

**Env:** vcst-qa @ Platform `3.1053.0-pr-3093-e27a-vcst-5618-e27ac905`

## Summary

Across at least three Platform REST modules, a `GET` for a well-formed but nonexistent resource ID returns `200 OK` (with a `null` body, or in one case a completely empty 0-byte body) instead of `404 Not Found`. A naive client status-code check cannot detect a missing entity. Same root pattern confirmed on a genuinely-deleted resource, and `DELETE` on an already-gone entity produces a raw SQL parameter error rather than a `404`/no-op — suggesting entities are soft-deleted (`IsDeleted` flag) and reads never check that flag against a `404` response.

## Steps to Reproduce (authenticated as admin, context-free token)

```
GET {{BACK_URL}}/api/order/customerOrders/00000000-0000-0000-0000-000000000000
GET {{BACK_URL}}/api/organizations/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
GET {{BACK_URL}}/api/members/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
```

## Actual Result

| Call | Status | Body |
|---|---|---|
| `GET .../customerOrders/{missing}` | 200 | `null` (4 bytes) |
| `GET .../organizations/{missing}` | 200 | `null` |
| `GET .../members/{missing}` | **200** | **0 bytes, no `content-type` header** — worse than the others |

Confirmed twice independently (regression run + live re-verification) — not transient.

**Related manifestation (`DELETE /api/carts`):** malformed/empty `ids` params produce a raw SQL error instead of a clean `400`/no-op:
- `DELETE /api/carts?cartId=<guid>` (wrong param name → empty ids) → `500 {"message":"Incorrect syntax near ')'.","stackTrace":null}`
- `DELETE /api/carts?ids=` (empty) → `500` leaking the parameterized SQL: `"The parameterized query '(@p0 nvarchar(4000))UPDATE \"Cart\" SET \"IsDeleted\"='1' WHERE \"Id\"' expects the parameter '@p0', which was not supplied."` — confirms carts are soft-deleted (`IsDeleted`), which is also why a deleted cart still resolves as `200 + null` instead of `404`.

**Related manifestation (cart line-item update):** `PUT /api/carts/{cartId}/items?lineItemId=<nonexistent>&quantity=4` and `?quantity=3` (no `lineItemId`) both return `204` — success — instead of `400`/`404` for a missing/unresolvable required parameter. Same "invalid reference silently accepted" family.

## Expected Result

A missing/deleted resource returns `404 Not Found`. An operation targeting a nonexistent/unresolvable entity ID returns `400`/`404`, not a silent `200`/`204` success.

## Root Cause Analysis

Pattern spans Orders, Customer (organizations + members), and Cart modules — the common thread is `ActionResult<T>` handlers that return the raw (possibly-null, possibly-soft-deleted) query result with `Ok(result)` rather than checking for null/`IsDeleted` and returning `NotFound()`. The `DELETE /api/carts` SQL leak confirms the underlying entity model uses `IsDeleted` soft-delete, and reads don't gate on it.

## Severity

**P1** — not itself a security leak, but a real API-contract violation: any client (including internal tooling) that checks HTTP status to detect "does this exist" will silently treat a deleted/missing resource as present-with-no-data. Combined with the soft-delete confirmation, this could mask real data-integrity issues in dependent code.

## Screenshots

N/A (API-only, no UI).

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 4 — REST
- **Suggested repo:** ambiguous — spans `vc-module-order`, `vc-module-customer`, `vc-module-cart`; the status-code decision is likely owned by a shared base-controller/`ActionResult<T>` convention rather than three independent bugs, but each module's controller needs the fix applied
- **repoKind:** module (multiple)
- **Ownership hint:** platform
- **Component / module:** Orders `customerOrders/{id}` GET; Customer `organizations/{id}` + `members/{id}` GET; Cart `DELETE /api/carts` param validation
- **RCA anchor:** not pinned to a specific file — needs source lookup per module's controller `Get(id)` implementation
- **Routing confidence:** LOW — multi-repo, needs human triage to decide whether to fix once per module or centralize
