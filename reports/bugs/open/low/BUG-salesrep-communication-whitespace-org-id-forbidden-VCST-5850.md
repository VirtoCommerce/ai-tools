# BUG: sendCustomerCommunication with a whitespace-only organization id returns Forbidden instead of "Organization is required."

**Severity:** Low · **Provenance:** IN-SCOPE (VCST-5850, vc-module-sales-rep PR #21) · **Oracle:** {SPEC} PR #21 handler validation
**Env:** vcptcore-qa · SalesRep 3.1012.0-pr-21-8964 · 2026-10-06 · found-by-agent, found-in-testing

## Steps
1. Get a token for `@td(SR_REP_PRIMARY)` (password grant + `storeId`).
2. On `/graphql/sales-rep` call `sendCustomerCommunication(command: {organizationIds: ["  "], sendPush: true, sendEmail: false, message: "x", storeId: "{{STORE_ID}}"})`.

## Expected
`errors[0].message = "Organization is required."` — the same answer as `[]`, `[""]` or an omitted list.

## Actual
`errors[0] = "Access denied."` (`Forbidden`), data null. `GetOrganizationIds` filters with `string.IsNullOrEmpty`, so
`"  "` survives as an id and fails the serve check instead of the required check.

## Impact
Fails safe (nothing is sent), but the API reports a permission problem for a malformed input. Fix: filter with
`IsNullOrWhiteSpace` in `SendCustomerCommunicationCommandHandler.GetOrganizationIds`.
