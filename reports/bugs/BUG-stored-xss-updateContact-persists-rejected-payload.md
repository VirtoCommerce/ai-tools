# Stored-XSS: `updateContact` persists a payload it reports as rejected `[P1]` `[Security]`

**Env:** vcst-qa @ Platform 3.1043.0, Theme 2.53.0-pr-2368
**Cases:** SEC-INPUT-002 · SEC-XSS-004 · SEC-VALIDATION-001 · SEC-VALIDATION-002 (suite 044) · SEC-XSS-001 (cart, P2 second surface)

## Summary
The `updateContact` GraphQL mutation returns HTTP 200 with a `VALIDATION` error and `data.updateContact: null` — which reads as "rejected" — yet the malicious payload is **written to the contact record anyway**. An independent admin read (`GET /api/members/{contactId}`) returns the raw `<script>` string persisted verbatim. This is a validate-then-save ordering defect: the persistence layer runs regardless of the validation rejection, creating a stored-XSS vector for every downstream consumer that renders the field (Admin SPA member grid, notification emails, other storefront themes).

## Steps to Reproduce
1. Authenticate as a storefront user (`@td(USER_DEFAULT)`); capture the JWT.
2. Send `updateContact` with a scripted name:
   ```graphql
   mutation { updateContact(command: { id: "<contactId>", firstName: "<script>alert(1)</script>", lastName: "QA" }) { id } }
   ```
3. Observe the response: HTTP `200`, `errors: [{ code: "VALIDATION", ... }]`, `data.updateContact: null` — looks rejected.
4. In an independent admin context, read the same contact back:
   `GET {{BACK_URL}}/api/members/<contactId>`
5. Inspect `firstName` in the returned member JSON.

## Expected vs Actual
- **Expected:** A `VALIDATION` rejection means **no write occurs** — the stored `firstName` is unchanged (or the payload is HTML-escaped/sanitized before persistence). Rejected input must never reach storage.
- **Actual:** `GET /api/members/{contactId}` returns `firstName == "<script>alert(1)</script>"` — the rejected payload is **persisted raw**. The mutation error is cosmetic; validation and persistence are not transactional.

## Second surface (P2)
`AddOrUpdateCartShipment` accepts and persists raw markup into the cart's delivery address (`INCIDENTAL-xss-payload-in-address-data.png`, `CHK-029-shipping-address-xss-literal.png`). Cart-scoped and shorter-lived than the contact record, but the same root failure: markup stored without sanitization/escaping.

![Persisted XSS payload in cart address data](screenshots/INCIDENTAL-xss-payload-in-address-data.png)

## Impact
Stored XSS. Any consumer that renders `firstName`/address without output-encoding executes the injected script — highest risk in the Admin SPA member grid (privileged operator context) and templated notification emails. Severity P1: it is a persisted (not reflected) injection, the "rejection" masks it from the writing client, and it crosses the storefront→admin trust boundary.

## Root cause (hypothesis)
Validation and persistence are sequenced independently rather than as one gated transaction: the command handler writes the contact before (or despite) the validation result short-circuiting the GraphQL response. Fix must (a) make the write conditional on validation passing, and (b) HTML-escape/sanitize free-text fields at the persistence boundary as defense-in-depth so no code path can store executable markup.

## Fix Routing
- **Primary:** `vc-module-customer` — contact persistence (`updateContact` command handler / member repository); enforce validate-before-persist + field sanitization.
- **Validation layer:** `vc-platform` — if the validation pipeline that emits the `VALIDATION` error does not block the downstream save, the ordering fix belongs here.
- **Second surface:** `vc-module-cart` — `AddOrUpdateCartShipment` address sanitization (SEC-XSS-001).
- **Layer:** backend (REST/GraphQL persistence). Reproduce at `updateContact` → independent `GET /api/members/{id}`; a green fix keeps the stored value escaped/unchanged.
