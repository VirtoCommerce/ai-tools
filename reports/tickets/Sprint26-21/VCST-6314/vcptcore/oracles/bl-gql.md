# BL invariants — extract (4 of 232)

> Verbatim slice of the oracle rendered from `.claude\knowledge\oracles\bl/*.yaml`, produced by `npm run bl:extract -- --domain gql`.
> **This is a SUBSET.** Invariants outside the filter are not shown and are not absent — if the
> task turns out to touch another domain, extract that domain too rather than concluding no rule
> applies. The `BL-*` ids are the citation contract the suites use; cite them, do not renumber.

**Included:** BL-GQL-001, BL-GQL-002, BL-GQL-003, BL-GQL-004

---

### BL-GQL-001: GraphQL error contract `[P1-data]`
- **Rule:** Invalid, malformed, or forbidden GraphQL operations return a structured response with `errors[]` non-empty and `data: null` (or partial-null per spec). Per the xAPI GraphQL-over-HTTP contract (graphql-dotnet): **both query validation/parse failures** (unknown field, unknown root field, missing required arg, syntax error, missing `command` wrapper on mutations) **and execution/resolver errors, including auth denials, return HTTP 200** with the error inside `errors[]` — this platform does NOT return a distinct HTTP 400 for validation failures (live-verified 2026-07-22: an unknown root field → HTTP 200 with `errors[0].extensions.code=FIELDS_ON_CORRECT_TYPE`; an anonymous `orders` query → HTTP 200 with `code=Unauthorized` and `data.orders=null`). The server must NEVER (a) return HTTP 5xx for *any* client-side error (validation OR execution), (b) leak internal details in error messages — stack traces (`at System.`), SQL fragments (`SqlException`, `Microsoft.Data`, `SELECT … FROM`), connection strings, file paths, (c) crash instead of returning a structured error.
- **Verify:** Validation cases (`INVALID_FIELD`, `nonExistentTopLevelField`, missing `command` arg) → **HTTP 200** with `errors[]` populated referencing the field/arg name and the `data` entry **absent** (omitted per GraphQL spec §7.1; present-but-null only for partial-failure/execution errors); resolver/auth-level failures → HTTP 200 with `errors[]` too. In all cases the message does not match the internal-leak regex `/^((?!at System\.|SqlException|StackTrace|Microsoft\.Data|connection string|SELECT .+ FROM).)*$/i`.
- **Violation signal:** HTTP 5xx on schema-validation error; `errors[]` empty on an obviously-invalid query; stack trace or SQL fragment exposed in `errors[0].message`; thrown exception bubbles to transport layer.
- **Agents:** qa-backend-expert, test-runner-agent, regression-orchestrator, test-management-specialist, qa-testing-expert
- **Docs:** platform/developer-guide/docs/GraphQL-Storefront-API-Reference-xAPI/best-practices.md (docs) — responses typically return HTTP 200 even when errors occur; inspect errors[] in the body
- **Source:** VP-6664 (Done) — unauthorized user query returned an unhandled error instead of a structured Access denied error; fixed
- **Trust:** DECLARED

### BL-GQL-002: GraphQL query performance thresholds `[P2-ux]`
- **Rule:** Happy-path GraphQL operations against the xAPI complete within target wall-clock thresholds measured from request-send to response-received: simple single-resolver queries (`me`, `categories(first:1)`, flat `orders(first:10)`) **< 500 ms**; deep nested queries (`orders { items addresses inPayments shipments }`) **< 1000 ms**; introspection (`__schema { types }`) **< 1000 ms**. Thresholds are environment-specific — these are baselines for one deployment; other environments may differ.
- **Verify:** Runner-native `[PERF label=X] elapsed_ms < N` assertion against `r.elapsed_ms` captured per operation by `scripts/graphql/graphql-runner.ts`. Repeat the same deep query 5× to check for N+1: elapsed_ms should not grow proportionally.
- **Violation signal:** `elapsed_ms` exceeds threshold consistently (not just one spike); response time grows linearly with repetition (N+1 hint); timeout; 504 Gateway Timeout.
- **Agents:** qa-backend-expert, test-runner-agent, regression-orchestrator, test-management-specialist, qa-testing-expert
- **Trust:** INFERRED

### BL-GQL-003: GraphQL response data integrity `[P1-data]`
- **Rule:** Successful GraphQL operations return data conformant to the schema's declared return type: (a) non-null fields are non-null in the response (resolver did not silently drop a required projection), (b) computed/derived fields (cart totals `total`/`subTotal`/`taxTotal`/`discountTotal`; index-backed price fields `price.actual`/`price.list`) are present and arithmetically consistent, (c) mutation responses include the full mutated entity, not a partial echo, (d) after-state queries reflect the mutation's effect — no stale read.
- **Verify:** `[DATA label=X] $.path is non-null` on every required field of the projection; cross-path arithmetic checks (e.g., `subTotal.amount >= 0`; `total.amount >= subTotal.amount` when no discount; `discountTotal.amount > 0` after valid coupon); after-mutation re-read shows the new state.
- **Violation signal:** `null` returned where schema declares `T!`; computed field `0` or missing after a recalc; stale cart state returned after `changeCartItemQuantity`; `data.entity.field` exists in projection but absent in response.
- **Agents:** qa-backend-expert, test-runner-agent, regression-orchestrator, test-management-specialist, qa-testing-expert
- **Trust:** INFERRED
- **Lifecycle:** SUSPECT — [case] MSNF-027 failed in REG-2026-10-01-1243

### BL-GQL-004: GraphQL resolver auth gating `[P0-security]`
- **Rule:** GraphQL resolvers enforce authentication and authorization at the resolver level, not the transport level. (a) **Public ops** (`categories(storeId:X)`, `__schema`, `slugInfo`): accessible without a Bearer token. (b) **Soft-gated ops** (`me`): callable anonymously but returns `{ memberId: null, contact: null }` for anonymous callers — no error, no leak. (c) **Hard-gated ops** (`orders`, profile reads, cart mutations): return `errors[].extensions.code = "Unauthorized"` for anonymous callers, `data: null`. (d) **Cross-user reads**: an authenticated user cannot read another user's `orders` / `cart` — resolver returns `Forbidden` or empty result.
- **Verify:** Same op called (1) without token → expected gate response, (2) with `ORG_USER` token → real data with valid `memberId`. `errors[0].extensions.code` checked explicitly via `[DATA label=X] errors[0].extensions.code = Unauthorized` (graphql-runner supports `errors`/`extensions` path routing).
- **Violation signal:** Anonymous `orders()` returns real data; `me()` returns another user's `memberId` or `contact`; `extensions.code` missing or wrong on rejected op; HTTP 401/403 returned instead of structured GraphQL error.
- **Agents:** qa-backend-expert, test-runner-agent, regression-orchestrator, test-management-specialist, qa-testing-expert
- **Docs:** platform/developer-guide/docs/GraphQL-Storefront-API-Reference-xAPI/troubleshooting.md (docs) — lists 401 Unauthorized for a missing or invalid token and 403 Forbidden for insufficient permissions
- **Source:** VP-6664 (Done) — unauthorized user query must return a structured Access denied error rather than an unhandled error
- **Source:** VP-7417 (Done) — expired-token request returned 200 with Access denied body; expected HTTP 401
- **Trust:** DECLARED
- **Lifecycle:** SUSPECT — The Violation signal treats HTTP 401/403 as a violation, but troubleshooting.md lists 401 for a missing/invalid token and VP-7417 (Done) expected 401 for an expired token; the transport-vs-resolver split for invalid/expired tokens needs re-checking.

---

