# BUG: App Insights shows 500 for GraphQL requests that actually returned 200/400 — xAPI middleware hardcodes telemetry resultCode [Medium]

## Status: CONFIRMED

**Env:** vcst-qa @ Platform 3.1032.0, VirtoCommerce.Xapi 3.1009.0 · found by `/qa-monitoring` MONITOR-2026-06-05-2025

## Summary

`GraphQLHttpMiddlewareWithLogs` hardcodes App Insights `ResponseCode = "500"` + `success = false` for **any** GraphQL execution result containing `errors[]`, and logs the ExecutionErrors to the `exceptions` table. Clients actually receive correct responses (400 for validation errors, 200 + `errors[{code: Unauthorized}]` for auth denials), so every expected client-side error — expired token, bad query, anonymous access — shows up in monitoring as a server 500 + exception. This produces phantom 5xx signals (it polluted today's monitoring run with 4 false "500" signatures) and makes real server errors indistinguishable from noise.

## STR

1. `POST {FRONT_URL}/graphql` (or `{BACK_URL}/graphql`), anonymous, body:
   `{"operationName":"GetFullCart","query":"query GetFullCart { cart(storeId: \"B2B-store\", userId: \"<registered-user-guid>\", currencyCode: \"USD\", cultureName: \"en-US\") { id } }"}`
   → client receives **HTTP 200** with `errors[{message: "Anonymous access denied or access token has expired or is invalid.", extensions.code: "Unauthorized"}]`
2. Same endpoint, query a nonexistent field (e.g. `cartTotals` on `CartType`)
   → client receives **HTTP 400** with proper `FIELDS_ON_CORRECT_TYPE` errors.
3. Query App Insights (vcst-qa) `requests` table for the same calls.

## Expected vs Actual

- **Expected:** App Insights `requests.resultCode` = the HTTP status the client actually received — **200** (auth denial inside `errors[]`) or **400** (validation error). `success` distinguishes server faults from expected client errors; the `exceptions` table holds genuine unhandled exceptions.
- **Actual:** App Insights records **500** (`success=False`) for these requests. The 500 exists **only in telemetry** — the middleware overwrites `requestTelemetry.ResponseCode` with a hardcoded `"500"`; no client ever receives it. Verified live: probe at 18:35 UTC answered **400** on the wire, recorded as **`500 POST graphql/GetFullCart`** in `requests`.

Corresponding `exceptions` record (18:35:10 UTC) — **no stack trace**, because the middleware synthesizes an `AggregateException` from ExecutionErrors that were never thrown:

```text
type:    GraphQL.Validation.Errors.FieldsOnCorrectTypeError   method: Unknown
details: [{type: System.AggregateException, message: "One or more errors occurred. (Cannot query field 'currencyCode' …)"},
          {type: FieldsOnCorrectTypeError, message: "Cannot query field 'currencyCode' on type 'CartType'…"},
          {type: FieldsOnCorrectTypeError, message: "Cannot query field 'cartTotals' on type 'CartType'…"}]   // no parsedStack frames
```

(Resolver-thrown `AuthorizationError`s carry at most the single resolver frame in `problemId`, e.g. `…ProfileSchema+<CheckAuthAsync>d__8.MoveNext` — still no usable stack.)

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A | Client contract is correct; no user-visible symptom |
| 2. Backend Admin | N/A | Not admin-visible |
| 3. GraphQL xAPI | **FAIL** (telemetry side-channel; HTTP contract itself PASSes) | curl probes above + App Insights `requests` row `500/False` for a 400-answered call |
| 4. Platform REST API | PASS | REST requests record true status codes |

**Owning layer:** Layer 3 — xAPI middleware (vc-module-x-api).

## Root Cause Analysis

`src/VirtoCommerce.Xapi.Core/Infrastructure/GraphQLHttpMiddlewareWithLogs.cs` → `ExecuteRequestAsync`:

```csharp
requestTelemetry.Success = result.Errors.IsNullOrEmpty();
if (requestTelemetry.Success != true)
{
    // pass an error response code to trigger AppInsights operation failure state
    requestTelemetry.ResponseCode = "500";
    ...
    _telemetryClient.TrackException(exceptionTelemetry);
}
```

Deliberate per the comment, but it conflates client errors (validation, Unauthorized) with server faults. A fix should use the actual `context.Response.StatusCode` (or classify by error code: `Unauthorized`/`FIELDS_ON_CORRECT_TYPE`/`ValidationError` → non-5xx) while still flagging genuine execution faults as failures.

**Impact on QA monitoring:** our `backend-failed-requests` probe filters `resultCode >= 500` — all GraphQL client errors surface as phantom 5xx (today: 4 of 4 backend "500" signatures were client errors). Telemetry: [vcst-qa failures blade](https://portal.azure.com/#resource/subscriptions/973d0b8c-44bf-438d-a4b7-1c4162d3ccba/resourceGroups/vcst/providers/Microsoft.Insights/components/vcst-qa/failures).


## Re-verification 2026-08-26 — still reproduces, unchanged in source

Backlog triage, Platform `3.1061.0`. **The module moved a long way and the defect did not**:
`VirtoCommerce.Xapi` is now **3.1019.0** (draft baseline **3.1009.0**), ten minor versions later.

**Client wire behaviour — still exactly as drafted** (probed live against `{{BACK_URL}}/graphql`):

| Probe | HTTP the client receives |
|---|---|
| anonymous `GetFullCart` | **200** + `errors[{extensions.code:"Unauthorized"}]` — "Anonymous access denied or access token has expired or is invalid." |
| malformed field selection | **400** + `errors[{extensions.code:"SCALAR_LEAFS"}]` |

**Source — the hardcode is untouched** on `vc-module-x-api@dev`,
`src/VirtoCommerce.Xapi.Core/Infrastructure/GraphQLHttpMiddlewareWithLogs.cs`:

```csharp
requestTelemetry.Success = result.Errors.IsNullOrEmpty();
if (requestTelemetry.Success != true)
{
    // pass an error response code to trigger AppInsights operation failure state
    requestTelemetry.ResponseCode = "500";

    Exception exception = result.Errors?.Count > 1
        ? new AggregateException(result.Errors)
        : result.Errors?.FirstOrDefault();
    var exceptionTelemetry = new ExceptionTelemetry(exception);
    ...
    _telemetryClient.TrackException(exceptionTelemetry);
}
```

Every element the draft named is still there: `Success` derived from *any* `errors[]`, the literal
`"500"`, and the synthesized `AggregateException` fed to `TrackException` — which is why those
`exceptions` rows carry no stack trace (nothing was ever thrown).

**The App Insights axis was NOT re-checked** — `az` refused with `AADSTS50078` (MFA expired) and this
session cannot run an interactive re-auth. Not needed for the verdict: the recorded `500` is produced by
the line above, so source plus the wire probe settle it. Re-run the KQL side after `az login` if a
telemetry screenshot is wanted for the ticket.

**Still not filed to the tracker.**

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 3 — xAPI (telemetry middleware; HTTP contract unaffected)
- **Suggested repo:** VirtoCommerce/vc-module-x-api
- **repoKind:** module
- **Component / module:** Xapi.Core — `GraphQLHttpMiddlewareWithLogs` (App Insights instrumentation)
- **RCA anchor:** `src/VirtoCommerce.Xapi.Core/Infrastructure/GraphQLHttpMiddlewareWithLogs.cs` — `requestTelemetry.ResponseCode = "500";` in `ExecuteRequestAsync` (search: "pass an error response code to trigger AppInsights operation failure state")
- **Routing confidence:** HIGH
