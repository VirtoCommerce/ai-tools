# `loyaltyMissionProgress` — every `localizedName` / `description` fails to resolve when the optional `cultureName` argument is omitted — MEDIUM

**Env:** vcst-qa @ Platform 3.1061.0, `VirtoCommerce.Loyalty.ExperienceApi 3.1006.0`
**Found by:** `/qa-monitoring --since=24H` (App Insights signal → live paired-control repro)

## Summary
`Query.loyaltyMissionProgress` declares `cultureName: String` — **optional**. When a caller omits it (or
passes `null`), the resolvers for `localizedName` and `description` throw
`System.ArgumentNullException: Value cannot be null. (Parameter 'languageCode')` at
`LoyaltyUserMissionType.cs:39`. The response is HTTP 200 with `data.loyaltyMissionProgress.items`
populated but **both name fields `null` and one GraphQL error per field per mission** — 40 errors for a
20-mission page. An optional argument that cannot be omitted is a broken contract; the resolver should
fall back to the store's default language.

## Steps to reproduce
1. Get a store-scoped token: `POST {BACK_URL}/connect/token` — `grant_type=password`,
   `username=@td(USER.email)`, `password`, `scope=offline_access`, `storeId={{STORE_ID}}`.
2. **Positive control** — `POST {BACK_URL}/graphql` with `cultureName` supplied:
   ```graphql
   query($s:String!,$c:String!){ loyaltyMissionProgress(storeId:$s, cultureName:$c){
     totalCount items { missionId localizedName description status } } }
   ```
   variables `{"s":"{{STORE_ID}}","c":"en-US"}` → **HTTP 200, `errors` absent, 20 items with names.**
3. **Probe** — the same query with `cultureName` **omitted**:
   ```graphql
   query($s:String!){ loyaltyMissionProgress(storeId:$s){
     totalCount items { missionId localizedName description status } } }
   ```
4. Same again with `cultureName` passed **explicitly as `null`** (`$c:String`, `"c":null`).

## Expected vs Actual
| | |
|---|---|
| **Expected** | `cultureName` omitted ⇒ resolver falls back to the store's `defaultLanguage`; `localizedName`/`description` return the default-language text; no `errors[]`. (Consistent with `project_storefront_default_language_fallback`: untranslated content falls back to the default language.) |
| **Actual** | Steps 3 and 4 both return HTTP 200 with `totalCount: 20`, `localizedName: null`, `description: null`, and **40 errors** — `Error trying to resolve field 'localizedName'.` / `…'description'.` — one pair per mission. Server-side: `System.ArgumentNullException: Value cannot be null. (Parameter 'languageCode')`. |

## Evidence
Probe output (2026-08-28, vcst-qa):
```
[+ control] WITH cultureName='en-US'  → HTTP 200 | errors: null | totalCount: 20
[- probe  ] cultureName OMITTED       → HTTP 200 | errors: ["Error trying to resolve field 'localizedName'.", "…'description'.", ×40] | totalCount: 20
[- probe  ] cultureName EXPLICIT null → HTTP 200 | errors: [same ×40]                                    | totalCount: 20
```
App Insights (backend `vcst-qa`, 24 h to 2026-08-28 12:40Z) — 5 occurrences across two `problemId`s:
`System.ArgumentNullException at …LoyaltyUserMissionType+<>c.<.ctor>b__0_2` (3, `localizedName` + `description`)
and `…b__0_3` (2, `description`), last 2026-08-28 08:37:25Z. Sample `operation_Id`
`e3f5e03d960a40479fc289fe2222f51c`, `ae4fc14aebd14ead893f65ab4d637e3d`.

## Notes
- **Customer impact is indirect.** The storefront always sends `cultureName`, so the Missions page is
  unaffected. The exposure is any integration, partner query, sales-rep tool or test case that trusts
  the schema and omits the optional argument — it gets nameless missions and no clear reason why.
- This is the escalated form of `reference_xapi_ambient_context_args`: the documented hazard is "200
  with wrong/empty data", and here the resolver throws instead of degrading.
- Two `problemId`s, one defect: `b__0_2` and `b__0_3` are the two lambdas registered in the same
  constructor for the two localized fields.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 3 — xAPI
- **Suggested repo:** VirtoCommerce/vc-module-loyalty
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** Loyalty — Experience API mission schema
- **RCA anchor:** `src/VirtoCommerce.Loyalty.ExperienceApi/Schemas/LoyaltyUserMissionType.cs:39` (and the
  sibling `localizedName` lambda in the same constructor) — `languageCode` is passed straight through
  from `context.GetArgument<string>("cultureName")` with no null guard.
- **Fix shape:** resolve the effective language once (argument → store `defaultLanguage` → invariant) and
  pass that to the localization lookup; both lambdas use the same helper. Alternatively make
  `cultureName` non-null in the schema — but that is a breaking contract change, so the fallback is the
  minimal fix.
- **Routing confidence:** HIGH — the exception carries the repo, file and line, and the paired control
  isolates the single input that flips the behaviour.
