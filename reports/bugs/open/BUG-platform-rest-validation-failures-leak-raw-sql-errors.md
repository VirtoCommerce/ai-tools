# Platform REST: validation failures on write endpoints leak raw SQL Server errors naming the live database/schema/table

## Status: CONFIRMED

**Env:** vcst-qa @ Platform `3.1053.0-pr-3093-e27a-vcst-5618-e27ac905`

## Summary

Several Platform REST write endpoints let a client-input validation failure fall all the way through to an unhandled `DbUpdateException`, returning `500` with the **raw SQL Server error message verbatim** — including the live database name, schema, table name, and (for one variant) the exact SQL statement text. This is an information-disclosure defect (internal infrastructure naming exposed to any authenticated caller) as well as a wrong-status-code defect (should be `400 Bad Request`).

## Steps to Reproduce (authenticated as admin)

```
POST {{BACK_URL}}/api/pricing/pricelists
Content-Type: application/json

{ "currency": null, ...other required fields... }
```
(also reproduces with `currency` omitted entirely)

## Actual Result

`500 Internal Server Error`:
```json
{
  "message": "Cannot insert the value NULL into column 'Currency', table 'vcst-qa-platform_restored.dbo.Pricelist'; column does not allow nulls. INSERT fails.\nThe statement has been terminated.",
  "stackTrace": null
}
```

**Confirms the live database name (`vcst-qa-platform_restored`), schema (`dbo`), and table (`Pricelist`)** — exact SQL Server constraint-violation text, not sanitized.

**Related manifestation** — `DELETE /api/carts?ids=` (empty) also leaks the parameterized SQL statement text itself: `"The parameterized query '(@p0 nvarchar(4000))UPDATE \"Cart\" SET \"IsDeleted\"='1' WHERE \"Id\"' expects the parameter '@p0', which was not supplied."` (see the companion soft-404 bug report for the DELETE-side finding — same information-disclosure class, different endpoint).

**Related but distinct — do not merge:** `POST /api/catalog/products` with an empty body `{}` also returns `500`, but with FluentValidation detail (`"CatalogId: 'Catalog Id' must not be empty..."`), not a raw SQL/schema leak — this is a wrong-status-code bug only (should be `400`), no infrastructure disclosure. Worth fixing in the same pass (both stem from missing validation before the DB write), but keep the two symptom classes distinct in the fix.

## Expected Result

A client-input validation failure (null required field) returns `400 Bad Request` with a clean, generic validation message — never the underlying database error text.

## Root Cause Analysis

No server-side validation runs before the EF Core `SaveChanges()` call for these write paths; the `DbUpdateException`'s inner SQL exception message propagates unmodified into the HTTP response body. This is the same defect **class** already tracked as **[VCST-5314](reports/bugs/open/BUG-org-membership-create-no-input-validation-VCST-5028.md)** on the Customer module's `organization-memberships` endpoint (confirmed still open, re-verified 2026-07-30) — that ticket's own re-test found the identical DB-name-leak shape. This report covers the **same class recurring in Pricing and Catalog**, different modules/controllers. **Link, do not merge** — the fix is likely a shared platform-level validation/exception-handling pattern (e.g. a global exception filter that catches `DbUpdateException` and maps it to `400` with a sanitized message) rather than three separate module fixes.

## Severity

**P1** (information disclosure — internal DB schema/naming exposed to any authenticated caller; also a wrong-status-code API contract violation). Not P0: requires authentication, and no row-level data is exposed, only infrastructure naming.

## Screenshots

N/A (API-only, no UI).

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 4 — REST
- **Suggested repo:** VirtoCommerce/vc-platform (if a shared exception-handling filter is the fix) — or `vc-module-pricing` + `vc-module-catalog` individually if no shared filter exists
- **repoKind:** platform (or module, multiple — human should confirm which)
- **Ownership hint:** platform
- **Component / module:** Pricing `POST /api/pricing/pricelists`; Catalog `POST /api/catalog/products`; Cart `DELETE /api/carts` (related)
- **RCA anchor:** not pinned — needs source lookup for the shared exception-handling middleware (if any) vs per-controller validation
- **Routing confidence:** LOW — multi-module; related to already-filed VCST-5314, recommend the same assignee/team triage both together
