# BUG-044-001 — Cart `comment` field accepts XSS payload without server-side rejection

**Run:** REG-2026-05-04-1527 (Suite 044 — Security Tests)
**Test case:** SEC-VALIDATION-002 (Script Injection Validation in Free-Text Fields)
**Related:** BL-SEC-003, ECL-5.1, EnableScriptInjectionValidation feature flag
**Severity:** Medium (defence-in-depth gap; not currently exploitable)
**Priority:** P2
**Date filed:** 2026-05-04
**Reporter:** qa-backend-expert (autonomous regression run)
**Environment:** vcst-qa-storefront (storefront xAPI)
**User:** test-carlos.rodriguez-20260310@test-agent.com (slot 3, BuildRight org)

## Summary

The `changeComment` GraphQL mutation on the storefront xAPI persists raw `<script>alert(...)</script>` payloads into a cart's `comment` field without server-side validation rejection. Sibling input types (`InputUpdateContactType`, `InputAddOrUpdateCartShipmentType`) correctly reject the same payload with a `VALIDATION` extension code. The `comment` validator appears to be missing from `InputChangeCommentType`.

The injected payload is **not currently executed** in the rendered storefront DOM — Vue.js binds the value into a `<textarea>` element where script tags are inert by HTML semantics. However, this represents a defense-in-depth gap and an inconsistency with adjacent fields that *are* validated.

## Steps to Reproduce

1. Authenticate as a storefront user (Carlos Rodriguez / BuildRight, slot 3).
2. Add at least one item to the cart (e.g., Coca Cola Regular 6x330ml).
3. Capture the JWT from `localStorage.auth.access_token`.
4. Send the following GraphQL mutation directly to `/graphql`:

```http
POST https://vcst-qa-storefront.govirto.com/graphql
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "operationName": "ChangeComment",
  "variables": {
    "command": {
      "storeId": "B2B-store",
      "userId": "3302dcbc-e2b2-41c4-a272-81411c9a083b",
      "currencyCode": "USD",
      "cultureName": "en-US",
      "comment": "<script>alert(\"XSS-COMMENT\")</script>"
    }
  },
  "query": "mutation ChangeComment($command: InputChangeCommentType!) { changeComment(command: $command) { id comment } }"
}
```

## Actual Result

```json
{
  "data": {
    "changeComment": {
      "id": "3149c4ac-4b81-4e6c-843d-31697917da7a",
      "comment": "<script>alert(\"XSS-COMMENT\")</script>"
    }
  }
}
```

The payload is persisted verbatim and returned in subsequent `cart.comment` reads.

## Expected Result

GraphQL response should match the behaviour of `updateContact` and `addOrUpdateCartShipment`:

```json
{
  "errors": [{
    "message": "Error trying to resolve field 'changeComment'.",
    "extensions": { "code": "VALIDATION", "codes": ["VALIDATION"] }
  }],
  "data": { "changeComment": null }
}
```

## Comparable (correctly-rejecting) Mutations

For reference, both of these were tested in the same session and *did* reject the same XSS payload:

| Mutation | Field | Result |
|----------|-------|--------|
| `updateContact` | `firstName: '<script>alert("XSS-FN")</script>'` | `errors[0].extensions.code: "VALIDATION"`, `data: null` |
| `addOrUpdateCartShipment` | `deliveryAddress.line1: '<script>...'` | `errors[0].extensions.code: "VALIDATION"`, `data: null` |
| `changeComment` | `comment: '<script>...'` | **Persisted as-is, no error** |

## Risk Assessment

**Currently:**
- The `comment` value is rendered in the cart UI inside a `<textarea>` element. HTML parsing rules make `<script>` tags inert inside `<textarea>` content, so the payload does not execute in this surface.
- No alert dialog triggered during DOM rendering. `document.querySelectorAll('script')` filtered for the payload returned 0 matches.

**Future risk (defence-in-depth):**
- Any new UI surface that renders `cart.comment` outside a `<textarea>` (e.g., admin order review, email notification, PDF receipt, GraphQL subscription consumer) without explicit escaping would execute the payload.
- The Order Confirmation email template and admin Orders blade are the most likely consumers — these need to be audited.
- Backend logs/audit trails containing the comment may be displayed in admin SPA grids that *do* render HTML.

## Evidence

- Live mutation response captured during execution (above).
- Render verification: `reports/regression/REG-2026-05-04-1527/evidence/` (cart screenshot post-injection shows no script execution; activeScriptInjections=0).
- Cleanup confirmed: comment was reset to empty string after testing.

## Suggested Fix

Add the same `EnableScriptInjectionValidation` validator (or equivalent) to `InputChangeCommentType.Comment` that already gates `InputUpdateContactType` and `InputAddOrUpdateCartShipmentType` address fields. Confirm via the same automated test that the `VALIDATION` extension code is returned.

## Cross-Reference

- BL-SEC-003 — Server-side input validation
- ECL-5.1 — Stored XSS prevention
- Audit needed: any other free-text mutation inputs (PO number, gift message, organization description, product reviews) for the same gap.
