# Phase A — RED baseline (pre-fix build)

Environment: vcptcore-qa1 · `VirtoCommerce.SalesRep 3.1009.0-pr-16-b624` (live-confirmed via `/api/platform/modules`)

## A1. Nameless rep is ACCEPTED

Request — `POST /api/sales-rep`
```json
{"emails":["agent-test-sr5759-red-<ts>@example.com"],"storeId":"","password":"<redacted>","status":"Approved"}
```
Response — **HTTP 200**
```json
{"userId":"d5e88ef0-…","userName":"agent-test-sr5759-red-<ts>@example.com",
 "firstName":null,"middleName":null,"lastName":null,
 "fullName":"agent-test-sr5759-red-<ts>@example.com",
 "status":"Approved","id":"773c8577-774c-4868-88c5-0fb2970822e3"}
```
The rep is persisted with `firstName: null, lastName: null`, and `fullName` falls back to the email.

## A2. That rep cannot use the storefront

Request — `POST /graphql` with that rep's storefront token (store `B2B-store`)
```graphql
query { me { contact { firstName lastName fullName } } }
```
Response — **the ticket's reported error, verbatim**
```json
{"errors":[
  {"message":"Error trying to resolve field 'firstName'.","path":["me","contact","firstName"],
   "extensions":{"code":"INVALID_OPERATION","codes":["INVALID_OPERATION"]}},
  {"message":"Error trying to resolve field 'lastName'.","path":["me","contact","lastName"],
   "extensions":{"code":"INVALID_OPERATION","codes":["INVALID_OPERATION"]}}],
 "data":{"me":{"contact":null}}}
```
`data.me.contact` is `null` — every storefront surface reading the current user, including the sign-in
page context (`GetPageContext`), fails.

## A3. The ticket's exact query path — `GetPageContext`

Request (pre-fix build, the nameless rep's storefront token):
```graphql
query GetPageContext($s:String!,$c:String!){
  pageContext(storeId:$s, cultureName:$c){ user { contact { firstName lastName fullName } } } }
# variables: { "s": "B2B-store", "c": "en-US" }
```
Response:
```json
{"errors":[
 {"message":"Error trying to resolve field 'firstName'.",
  "path":["pageContext","user","contact","firstName"],
  "extensions":{"code":"INVALID_OPERATION","codes":["INVALID_OPERATION"]}},
 {"message":"Error trying to resolve field 'lastName'.",
  "path":["pageContext","user","contact","lastName"],
  "extensions":{"code":"INVALID_OPERATION","codes":["INVALID_OPERATION"]}}]}
```
This is the ticket's reported failure **verbatim** — same query name, same `path`, same
`extensions.code`.
