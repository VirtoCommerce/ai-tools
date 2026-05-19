# Authoring GraphQL Test Cases for Runner-Native Execution

Canonical reference for writing **runner-native GraphQL test cases** in suite CSVs. Cases written to this spec execute via `scripts/graphql-runner.ts` (browserless, ~10–30× faster than GraphiQL UI flow), are schema-validated before send, and produce structured JSON evidence.

**Audience:** every QA agent that writes, reviews, or migrates GraphQL test cases — `test-management-specialist`, `qa-backend-expert`, `qa-frontend-expert`, `qa-testing-expert`, `test-runner-agent`, `autonomous-test-runner`, `qa-lead-orchestrator`, plus the `/qa-test-cases-generator` and `/qa-api` skills.

**Source of truth (read these if anything below seems ambiguous — code wins):**

- `scripts/graphql-runner.ts` — orchestrator (loadCase → parse → AUTH → GQL/REST exec → assertions → cleanup → evidence)
- `scripts/lib/graphql-case-parser.ts` — Steps tag grammar (`isStepTag()` + `parseSteps()`)
- `scripts/lib/graphql-assertions.ts` — Assertion grammar + `getByPath()` + filter syntax
- `scripts/lib/graphql-validator.ts` — DV-006…DV-011 schema-validate-before-send
- `scripts/lib/graphql-auth.ts` — `[AUTH role=…]` token resolution
- `scripts/lib/test-data-resolver.ts` — `@td()` resolver
- `test-data/aliases.json` — alias registry
- `regression/suites/Backend/graphql/050i-graphql-configurations.csv` — gold-standard examples (CFG-GQL-001…032)
- `.claude/agents/knowledge/graphql-schema.md` — live xAPI schema reference (consult BEFORE writing any query/mutation)

---

## 1. When to use runner-native vs. GraphiQL UI

| Mode | When |
|------|------|
| **Runner-native** (this doc) | Default for **all** new GraphQL/xAPI cases. Browserless. Fast. Schema-checked. Suite name typically lives under `regression/suites/Backend/graphql/`. |
| GraphiQL UI (legacy) | Only when the test inherently needs the GraphiQL editor itself — header autocomplete, schema docs panel, error rendering. New cases should NOT use this path. |

The runner detects the mode via Phase 0 in `test-runner-agent.md`: if **every** non-empty `Steps` cell in a suite contains `[GQL-OP ` or `[GQL-EXEC `, the suite takes the GraphQL Runner Fast Path (no browser, zero browser-pool slot consumed).

---

## 2. CSV row contract

Same enriched agent-native format as every other suite. The runner reads exactly these columns from each row:

| Column | Used by runner? | Notes |
|--------|-----------------|-------|
| `ID` | ✅ — `--case <csv>:<ID>` lookup | Stable, like `CFG-GQL-013` |
| `Title` | ✅ — printed in announce + evidence | One-liner |
| `Section` | informational | Pipe-delimited path (`GraphQL > Configurable Products > Mutation`) |
| `Priority` | informational | Critical / High / Medium / Low |
| `Business_Rule` | informational | `BL-GQL-001; BL-CART-001` — multiple separated by `;` |
| `Edge_Case_Refs` | informational | `ECL-2.1` |
| `Preconditions` | informational | Plain prose (no `[PRE:*]` tags — those are browser-only) |
| `Test_Data` | ✅ — initial `{{VAR}}` bag | `key=value; key=value` (semicolons) — `@td()` resolved before parsing |
| `Steps` | ✅ — primary execution body | See §3 |
| `Assertions` | ✅ — verdict-affecting | See §4 |
| `Cross_Layer_Checks` | ⚠ informational only | Not evaluated; recorded in evidence |
| `Failure_Signals` | informational | What "wrong" looks like in prose — for human triage |
| `Cleanup` | ✅ — best-effort post-verdict | `[AUTH]` + `[REST]` blocks only; failures never alter verdict |
| `References` | informational | JIRA / sprint IDs |
| `Automation_Status` | informational | `Automated` for runner-native |

**Golden rule:** never hardcode IDs/SKUs/emails/prices/order-numbers. Resolve at runtime via `@td(ALIAS.field)` or capture from upstream responses via `[GQL-CAPTURE]`. (See feedback memory `feedback_flexible_test_cases.md` and `feedback_no_test_data.md`.)

---

## 3. `Steps` column — tag grammar

The `Steps` cell is parsed line-by-line by `parseSteps()`. Recognized tags (case-insensitive):

| Tag | Purpose | Body |
|-----|---------|------|
| `[AUTH role=<alias>]` | Acquire OAuth token; set as `Authorization: Bearer …` for subsequent ops | none |
| `[GQL-OP <label>]` | Declare a GraphQL operation under `<label>` | multi-line query/mutation body until next tag |
| `[GQL-VARS <label>]` | Bind variables (JSON) for the named op | inline JSON on same line, OR multi-line JSON until next tag |
| `[GQL-EXEC <label>]` | Validate (vs. introspected schema) + POST /graphql | none — body must already be present |
| `[GQL-CAPTURE <label>.<path> → <VAR>]` | Extract value from response, store in variable bag | none |
| `[REST-OP <label>]` | Declare a free-form REST request | multi-line body (see §3.7) |
| `[REST-EXEC <label>]` | Fire the named REST-OP, store response under `<label>` | none |
| `[REST-CAPTURE <label>.<path> → <VAR>]` | Extract value from REST response body | none |
| `[REST <METHOD> <path>]` | One-shot REST request (no separate OP/EXEC) | optional multi-line body (JSON) |

Other tags (`[WAIT]`, `[SETUP]`, `[TEARDOWN]`) are recognized as step-tag boundaries but skipped at execution time. Anything not on this list is silently dropped from execution but recorded in evidence as `UNKNOWN`.

### 3.1 `[AUTH role=<alias>]`

```text
[AUTH role=ORG_USER]
```

The alias is resolved through `test-data/aliases.json` (preferred) or the `<ROLE>_EMAIL` / `<ROLE>_PASSWORD` env-var fallback. Common aliases:

| Alias | Resolves to |
|-------|-------------|
| `ORG_USER` | `USER_EMAIL` / `USER_PASSWORD` (TechFlow B2B by default) |
| `USER2` | `USER2_EMAIL` / `USER2_PASSWORD` |
| `ADMIN_DEFAULT` | platform admin (`ADMIN` / `ADMIN_PASSWORD`) — note `userName` is `admin`, NOT email |
| `IMPERSONATION_ADMIN` | impersonation flow account |
| `TECHFLOW_ADMIN` | TechFlow org maintainer |

**No `[AUTH]` line ⇒ the request is sent without an `Authorization` header** (PUBLIC). Use this for `productConfiguration`, anonymous catalog, and any guest flow.

**Never hardcode passwords** in the CSV — always go through `[AUTH role=…]` so credentials come from `.env` at runtime (feedback memory `feedback_agents_read_env_creds.md`).

### 3.2 `[GQL-OP <label>]` + body

The label binds the op for `[GQL-VARS]`, `[GQL-EXEC]`, `[GQL-CAPTURE]`, and the `label=` predicate of every assertion. Conventions:

- snake_case, lowercase: `get_config`, `add_item`, `remove_one`, `read_back`
- one verb per op; reuse the same label across `[GQL-OP] / [GQL-VARS] / [GQL-EXEC] / [GQL-CAPTURE]`

The body is everything between `[GQL-OP <label>]` and the next recognized tag. CSV cell is wrapped in `"…"` so embedded `"`-strings inside GraphQL must be doubled (`""..."`):

```csv
"[GQL-OP get_config]
  query {
    productConfiguration(
      configurableProductId: ""@td(CFG_LAPTOP.id)""
      storeId: ""{{STORE_ID}}""
    ) {
      configurationSections { id name type maxLength options { id text product { id } } }
    }
  }
[GQL-EXEC get_config]"
```

**Field-selection rule (feedback memory `feedback_graphql_full_field_selection.md`):** happy-path tests use **full** field selection so the test exercises real-world response shape. Minimal selection (e.g., only `id`) is allowed only for explicit counter probes, idempotency roundtrips, or schema-coverage cases that say so in the Title.

**Schema rule (feedback memory `feedback_graphql_schema_validation.md`):** every query/mutation MUST be validated against the live schema before authoring. Either consult `knowledge/graphql-schema.md` (snapshot) or run `npx tsx scripts/graphql-runner.ts --query "<inline>"` (validate-only mode, no HTTP send). The runner will refuse to execute a query that doesn't validate (`schemaValid: false` recorded in evidence, `responses` populated with synthetic schema-error response so assertions fail loudly).

### 3.3 `[GQL-VARS <label>]`

Two equivalent forms — pick the readable one:

**Inline (preferred for short objects):**
```text
[GQL-VARS create_preview] {"configurationSections": [{"sectionId": "{{SECTION_RAM_ID}}", "type": "Product", "option": {"productId": "{{OPT_RAM_BASE_ID}}", "quantity": 1}}]}
```

**Multi-line (when the JSON is large or needs comments — but JSON itself doesn't allow comments, so use sparingly):**
```text
[GQL-VARS bulk_update]
{
  "configurationSections": [
    {"sectionId": "{{SECTION_RAM_ID}}", "type": "Product", "option": {"productId": "{{OPT_RAM_UPGRADE_ID}}", "quantity": 1}},
    {"sectionId": "{{SECTION_STORAGE_ID}}", "type": "Product", "option": {"productId": "{{OPT_STORAGE_UPGRADE_ID}}", "quantity": 1}}
  ]
}
```

**Authoring quirk (parser back-fill, see graphql-case-parser.ts §backfillEmptyOpFromContinuation):** if you write the mutation body AFTER `[GQL-VARS]` instead of after `[GQL-OP]`, the parser tolerates it but it's confusing — keep body under `[GQL-OP]`.

### 3.4 `[GQL-EXEC <label>]`

Triggers schema validate + POST. After execution, `responses[<label>]` holds the `GraphQLResponse` for assertions and captures.

**Pairing rule (lint enforced by `npm run graphql:lint-labels`):** every `[GQL-OP <L>]` MUST have **exactly one** `[GQL-EXEC <L>]`, and every `[GQL-VARS <L>]` / `[GQL-CAPTURE <L>.…]` MUST reference a declared `<L>`.

### 3.5 `[GQL-CAPTURE <label>.<path> → <VAR>]`

Extract a value from the named response and store it in the variables bag for downstream substitution. The `<path>` is resolved by `getByPath()` (§5).

```text
[GQL-CAPTURE setup_me.data.me.id → USER_ID]
[GQL-CAPTURE get_def.data.productConfiguration.configurationSections.0.id → SECTION_RAM_ID]
[GQL-CAPTURE add_item.data.addItem.items.0.id → LINE_ITEM_ID]
[GQL-CAPTURE add_item.data.addItem.items.0.extendedPrice.amount → BASE_EXTENDED_PRICE]
```

**Path features the parser supports** (mirrors `getByPath`):
- object property: `me.id`
- numeric array index: `items.0.id`
- bracketed array index: `body.[0].url` (REST style)
- JSONPath filter, first match: `items[?id={{LINE_ITEM_ID_B}}]`
- JSONPath filter, all matches: `items[*?type=Product].0`
- Variable substitution inside the path: `{{LINE_ITEM_ID_B}}` is replaced before lookup

**Null capture:** if the path resolves to `null` / `undefined`, the variable is stored as the empty string and a warning is appended to `nullCaptures[]` in evidence. Downstream `{{VAR}}` substitutions will be empty — usually causing a later assertion to fail loudly. Don't suppress this; fix the source data or the path.

### 3.6 `[REST <METHOD> <path>]` — one-shot

Use when the test needs a single REST call (typically inside `Cleanup`):

```text
[REST DELETE /api/cart/items/{{LINE_ITEM_ID}}]
```

If a body is needed:

```text
[REST POST /api/cart/items]
{"productId": "{{PROD_ID}}", "quantity": 1}
```

The runner resolves `{{VAR}}` + `@td()` in path and body before sending. Authorization comes from the most recent `[AUTH role=…]` token (or none).

### 3.7 `[REST-OP <label>]` + `[REST-EXEC <label>]` + `[REST-CAPTURE]` — multi-step

Use when you need to capture from the REST response or pair with later assertions. Body grammar (parsed by `parseRestOp()`):

```text
[REST-OP rest_upload]
POST {{BACK_URL}}/api/files/product-configuration
Content-Type: multipart/form-data
Body: file=@@td(UPLOAD_FIXTURES.primary.path) (mimeType: image/jpeg; filename: laptop-photo.jpg)
[REST-EXEC rest_upload]
[REST-CAPTURE rest_upload.body.[0].url → UPLOAD_URL]
```

For JSON bodies:
```text
[REST-OP rest_create_org]
POST {{BACK_URL}}/api/customer/organizations
Content-Type: application/json
Body: {"name": "AGENT-TEST-{{TIMESTAMP}}"}
[REST-EXEC rest_create_org]
[REST-CAPTURE rest_create_org.body.id → ORG_ID]
```

After `[REST-EXEC]`, the response is also exposed under the GraphQL response map so `[ERRORS label=rest_upload]` and `[DATA label=rest_upload] body.[0].url is non-null` work just like for GQL ops. The `<label>.body.…` prefix is allowed in path expressions for readability — the runner strips it.

### 3.8 Canonical step ordering

For most cart-state mutations (verified by 050i):

```
[AUTH role=ORG_USER]               ← acquire token
[GQL-OP setup_me]                  ← bootstrap user identity
  query { me { id } }
[GQL-EXEC setup_me]
[GQL-CAPTURE setup_me.data.me.id → USER_ID]

[GQL-OP cleanup_pre]               ← guarantee clean state
  mutation { clearCart(command: { storeId: "{{STORE_ID}}" userId: "{{USER_ID}}" }) { id } }
[GQL-EXEC cleanup_pre]

[GQL-OP get_def]                   ← discover dynamic IDs
  …
[GQL-EXEC get_def]
[GQL-CAPTURE …]                    ← capture every ID before use

[GQL-OP <act_under_test>]          ← the actual test action(s)
[GQL-VARS <act_under_test>] {…}
[GQL-EXEC <act_under_test>]

[GQL-OP read_back]                 ← read-back to verify state
  …
[GQL-EXEC read_back]

[GQL-OP cleanup_post]              ← inline cleanup (mirror of pre)
  mutation { clearCart(…) { id } }
[GQL-EXEC cleanup_post]
```

`cleanup_pre` + `cleanup_post` inside Steps protect parallel runs from cart pollution. The `Cleanup` column is a SECOND, best-effort safety net — never the primary cleanup mechanism for runner-native cases.

### 3.9 Discovery queries — no new tag, use `[GQL-OP] + [GQL-CAPTURE]`

When a case needs "any product / the current virtual-catalog root / any active coupon" instead of a specific named entity, do **not** hardcode the ID — write a tiny discovery query, capture, and reference. The mechanism is just `[GQL-OP]` + `[GQL-EXEC]` + `[GQL-CAPTURE]` (already documented above) — no new tag.

```text
[GQL-OP findRoot]
query($storeId: String!) {
  categories(storeId: $storeId, first: 50) { items { id hasParent } }
}
[GQL-VARS findRoot] {"storeId": "{{STORE_ID}}"}
[GQL-EXEC findRoot]
[GQL-CAPTURE findRoot.categories.items[?hasParent=false].id → CAT_ROOT]
```

Then use `{{CAT_ROOT}}` in downstream filters. This pattern survives catalog re-seeding — when the storefront-visible root migrated on 2026-04-30 (`fc596540…` → `9238c387…`), cases that used discovery kept passing while hardcoded ones silently returned zero items.

**Canonical recipes** (root discovery, first-available product, any active coupon, plus the JS equivalents for interactive agents): [`live-discovery.md`](live-discovery.md). Authoring checklist item: prefer discovery over hardcoded IDs whenever the test doesn't depend on which specific entity is used.

---

## 4. `Assertions` column — tag grammar

Parsed by `parseAssertions()`. Verdict-affecting kinds: **ERRORS, DATA, NULL, COUNT, VAR, PERF**. Anything else (e.g. `[EVIDENCE]`, `[ROUNDTRIP]`, `[ADMIN]`, `[STOREFRONT]`, `[EVENT]`, `[MATH]`) is captured as an `InfoAssertion` and recorded in evidence but does NOT affect verdict. **Use info tags for prose only — never put a verdict-critical check inside `[EVIDENCE]`.**

Format:

```text
[<KIND> label=<op_label>] <predicate>
```

The `label=` selects which response the predicate runs against. `[VAR]` is the only kind that doesn't require a `label=` (it compares variables to literals, no response needed).

### 4.1 `[ERRORS label=<L>]` predicates

| Predicate | Meaning |
|-----------|---------|
| `errors[] empty` | `r.errors.length === 0` (PASS) |
| `errors[] non-empty` | `r.errors.length > 0` (PASS) |
| `HTTP 200` / `HTTP 4xx` | For REST-EXEC labels — exact HTTP status check |

Every successful GraphQL operation MUST have an `[ERRORS label=<L>] errors[] empty` assertion (ECL-14.1). HTTP 200 alone does NOT mean success.

### 4.2 `[DATA label=<L>]` predicates

The path may begin with `data.…` or be relative — the runner strips a leading `data.` for you. Available shapes:

| Predicate | Example |
|-----------|---------|
| `data is null` | `[DATA label=bogus] data is null` |
| `<path> is null` / `<path> is non-null` | `[DATA label=q] data.me.id is non-null` |
| `<path> is non-empty GUID` | `[DATA label=cre] data.createOrganization.id is non-empty GUID` |
| `<path> matches /<regex>/<flags>` | `[DATA label=cre] data.createOrganization.name matches /^AT&T/i` |
| `<path> > N` / `>=` / `<` / `<=` | `[DATA label=cre] data.createConfiguredLineItem.extendedPrice.amount > 0` |
| `<path> = <literal>` | `[DATA label=q] data.me.email = ORG_USER@…` (string equality after stripping outer `"`) |
| `<lhs> ≈ <rhs>` / `<lhs> ~= <rhs>` | approximate equal (±0.011) for cents-level rounding |
| Arithmetic / cross-path equality | `data.X.extendedPrice.amount = data.X.listPrice.amount * data.X.quantity` |
| Cross-path ordering | `data.items.0.publishDate >= data.items.1.publishDate` (numeric or lexicographic — ISO-8601 dates work as strings) |
| OR composition | `data.X is non-null OR errors[] non-empty` |
| AND composition | `data.X.id is non-empty GUID AND data.X.name = Foo` |

**Arithmetic detection** is conservative: takes the arithmetic branch when (a) the predicate has `*`, `/`, `(`, `)` or whitespace-padded `+`/`-` AND at least one `data.` reference, OR (b) both sides are paths (cross-path equality, no operators: `a = b`), OR (c) the operator is `≈` / `~=`. Filter brackets (`[?key=value]`) are stripped before arithmetic detection so GUIDs with hyphens don't get mistaken for subtraction.

**Cross-path ordering** (`>=` / `<=` / `>` / `<`) fires whenever both sides reference a `data.` path. When both sides resolve to numbers the comparison is numeric; otherwise it falls back to lexicographic string comparison (so ISO-8601 dates, semver strings, etc. sort correctly).

**Errors and extensions access:** paths starting with `errors` or `extensions` resolve against the full GraphQL response (not `r.data`). Both `errors[0].extensions.code` and `errors.0.message` work — the JS-style bracket index is auto-normalized. Use this to assert error-shape behavior without a separate kind: `[DATA label=noauth] errors[0].extensions.code = Unauthorized`, `[COUNT label=q] errors.length = 0`.

**Mixing OR and AND in one line is NOT supported** — split into separate assertion lines.

### 4.3 `[NULL label=<L>] <path>`

Asserts the path resolves to `null` / `undefined`. Equivalent to `[DATA label=L] <path> is null` but more idiomatic when null is the whole point.

### 4.4 `[COUNT label=<L>] <path> <op> <N>`

Operators: `=` `==` `>=` `<=` `>` `<`. Evaluates `value.length` if the path resolves to an array, or the value itself if it's a number.

```text
[COUNT label=read_back] data.configurationItems.configurationItems.length = 2
[COUNT label=results] data.products.items[*?type=Product].length > 0
```

### 4.5 `[VAR] {{X}} = <literal>`

Compare a captured variable against a literal — no response needed. The runner has already substituted `{{X}}` upstream, so the predicate at evaluation time looks like `Text = Text`. If `{{X}}` was never captured, the assertion fails loudly with `variable {{X}} was never captured (still literal)`.

```text
[VAR] {{SECTION_TYPE}} = Text
```

### 4.6 `[PERF label=<L>] elapsed_ms <op> <N>[ms|s]`

Assert that the operation completed within a time budget. Reads `response.elapsed_ms` (always populated by the runner). Operators: `<` `<=` `>` `>=` `=` `==`. The literal is interpreted as milliseconds; suffix `ms` is explicit-ms, `s` multiplies by 1000.

```text
[PERF label=read_back]      elapsed_ms < 500
[PERF label=heavy_query]    elapsed_ms < 1500ms
[PERF label=introspection]  elapsed_ms < 1s
[PERF label=any]            elapsed_ms >= 0          // probe — always true
```

**This kind is verdict-affecting** (was promoted from info-only along with the errors-path extension). Don't park aspirational targets here without intending to fail the case when the target is missed — that's the whole point. If the threshold is uncertain, write it as `>= 0` and treat the captured number as evidence-only.

### 4.7 Info-only tags (NOT verdict-affecting)

Use these for prose annotations the runner records but does not evaluate. Read as documentation, not as machine-checkable invariants:

| Tag | Use |
|-----|-----|
| `[EVIDENCE]` | Free-form "look at this" notes |
| `[MATH]` | Author's numeric reasoning ("base $999 + RAM $100 = $1099 × 3 = $3297"). For verifiable math use `[DATA] arithmetic` instead. |
| `[ROUNDTRIP]` | Cross-system flow notes (storefront PDP, admin verify) |
| `[ADMIN]` / `[STOREFRONT]` / `[EVENT]` | Cross-layer manual checks |

---

## 5. Path syntax (`getByPath()`)

Used by `[GQL-CAPTURE]`, `[REST-CAPTURE]`, `[DATA]` predicates, and arithmetic expressions. Segments:

| Segment | Example | Meaning |
|---------|---------|---------|
| Object property | `foo` | `obj.foo` |
| Numeric index | `0` | `arr[0]` |
| Bracket index | `[0]` | `arr[0]` (REST style: `body.[0].url`) |
| First match filter | `foo[?key=value]` | first element of `obj.foo` where `item.key === value` |
| All matches filter | `foo[*?key=value]` | array of all elements where `item.key === value`; chain `.0` / `.length` after |
| Not-equals filter | `foo[?key!=value]` / `foo[*?key!=value]` | inverse of above |

The leading `data.` is optional — `data.me.id` and `me.id` resolve identically against `response.data`.

**Filter values can include hyphens, GUIDs, spaces** — anything except `]`. Substitute `{{VAR}}` inside filter values BEFORE the path reaches `getByPath()` (the runner does this for you in `[GQL-CAPTURE]` paths and assertion predicates).

**Why filters matter:** they insulate assertions against backend response-shape ordering. `data.X.configurationItems.0.productId` breaks if the resolver returns Storage before RAM; `data.X.configurationItems[?sectionId={{SECTION_RAM_ID}}].productId` doesn't.

---

## 6. Variables and substitution

Three sources of variables, resolved in this order:

1. **`Test_Data` column** — initial bag, `key=value; key=value` (use `;` not `,`). `@td(ALIAS.field)` resolved BEFORE parsing. Example: `configurable_id=@td(CFG_LAPTOP.id); expected_qty=3`.
2. **`[GQL-CAPTURE]` / `[REST-CAPTURE]`** — captured at runtime, override Test_Data values with the same name.
3. **Process env** — `{{STORE_ID}}`, `{{BACK_URL}}`, `{{FRONT_URL}}`, `{{TEST_SKU}}`, etc. — resolved via `substituteEnv()` AFTER variable substitution.

Substitution happens in `Steps` (queries, var blocks, REST bodies, capture paths), `Assertions`, `Cross_Layer_Checks`, and `Cleanup`. Order: `{{VAR}}` first, then `@td()`, then `{{ENV}}`.

### 6.1 `@td()` test-data resolver

Two forms (see `scripts/lib/test-data-resolver.ts`):

```text
@td(ALIAS.field)                              ← preferred — alias registry lookup
@td(file, key=val&key=val, column)            ← direct CSV lookup (only when no alias exists)
```

Inline aliases (have `_inline: true` in `aliases.json`) carry values directly:

```text
@td(CFG_OFFROAD_BIKE.productId)                ← simple field
@td(UPLOAD_FIXTURES.primary.path)              ← nested object access (dotted)
```

CSV-backed aliases declare `file` + `filter` + `fields` and pull a single column from a single row. Browse `test-data/aliases.json` first; only add a new alias if you genuinely need a NEW resolution (don't duplicate). When in doubt, use `@td(ALIAS.field)` over hand-typed values — environments drift and aliases re-resolve at run time.

### 6.2 Common environment variables

| Name | Resolves to |
|------|-------------|
| `{{BACK_URL}}` | platform base URL (e.g. `https://qa-virto.platform.virtocommerce.com`) |
| `{{FRONT_URL}}` | storefront base URL |
| `{{STORE_ID}}` | default store identifier (e.g. `B2B-store`) |
| `{{TEST_SKU}}` | smoke-test SKU |

---

## 7. Cleanup column — best-effort post-verdict

Runner parses `Cleanup` AFTER computing the verdict and runs only `[AUTH]` and `[REST]` blocks (not `[GQL-*]` — for GraphQL cleanup put it in `Steps` as `cleanup_post`). Failures are recorded in `evidence.cleanup.blocks[]` but never alter the verdict.

```csv
"[AUTH role=ADMIN_DEFAULT]
[REST DELETE /api/customer/organizations/{{ORG_ID}}]"
```

If Cleanup is empty or literally `none`, runner skips this phase silently.

**Don't rely on `Cleanup` for cart state** — use inline `cleanup_post` in Steps. Use `Cleanup` for resources that survive a verdict-fail (orgs, files, dynamic-property definitions).

---

## 8. Failure modes the runner will report

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Step structure invalid: [GQL-OP X] has no matching [GQL-EXEC X]` | typo / missing EXEC | add `[GQL-EXEC X]` |
| `OP block has empty query body` | mutation body went after `[GQL-VARS]` and parser back-fill didn't trigger | move the body back under `[GQL-OP]` |
| `Assertion references unknown label "X" — no [GQL-EXEC X] was run` | label mismatch between Steps and Assertions | rename one to match |
| `variable {{X}} was never captured` | no `[GQL-CAPTURE … → X]` upstream | add the capture, or fix the path |
| `[GQL-VARS X] body is not valid JSON` | typo / unescaped quote | run the JSON through a parser; remember CSV doubles quotes |
| `SCHEMA INVALID — DV-008: Cannot query field "foo" on type "Bar"` | field doesn't exist in live schema | consult `knowledge/graphql-schema.md`; rerun introspection (`--refresh-schema`); fix the field |
| `Token acquisition failed for role="ORG_USER"` | bad creds in `.env` | run `npm run env:check` |
| `Could not parse: "<predicate>"` | DATA predicate doesn't match any pattern in §4.2 | rewrite to one of the supported shapes |

Lint everything before committing:

```bash
npm run graphql:lint-labels -- regression/suites/Backend/graphql/<your-suite>.csv
```

Exit 0 = structurally valid. Exit 1 = at least one row has structural issues; fix them before pushing.

---

## 9. Authoring checklist

When you write a new runner-native GraphQL case, walk this list:

1. **Title + ID** stable, like `<MODULE>-GQL-<NN>`.
2. **Schema check** — every query/mutation validated against live schema (introspection or `knowledge/graphql-schema.md`).
3. **No hardcoded IDs/SKUs/emails/prices** — `@td()` or `[GQL-CAPTURE]`.
4. **`[AUTH role=…]` if and only if the operation requires authentication** — leave out for PUBLIC queries.
5. **One `[GQL-EXEC]` per `[GQL-OP]`** — same label.
6. **Full field selection** on the operation under test (unless this is an explicit minimal-selection probe).
7. **`[ERRORS label=<L>] errors[] empty`** for every successful GraphQL EXEC.
8. **Verdict-critical checks live in `[ERRORS]` / `[DATA]` / `[NULL]` / `[COUNT]` / `[VAR]`** — not inside info tags.
9. **State-mutating tests**: inline `cleanup_pre` (clearCart) before action, inline `cleanup_post` after — both in `Steps`.
10. **Capture every dynamic ID** before referencing it; use filter paths (`[?sectionId={{X}}]`) to insulate against ordering shifts.
11. **`Cleanup` column** carries only `[AUTH]` + `[REST]` blocks for non-cart resources; never put GraphQL there.
12. **Lint passes** — `npm run graphql:lint-labels -- <csv>`.
13. **Dry-run executes** — `npx tsx scripts/graphql-runner.ts --case <csv>:<ID> --dry-run` validates the query against the schema without sending HTTP.
14. **Live execution PASSes** — `npx tsx scripts/graphql-runner.ts --case <csv>:<ID>` returns exit code 0.

---

## 10. Worked example — minimal mutation case

```csv
ID,Title,Section,Priority,Business_Rule,Edge_Case_Refs,Preconditions,Test_Data,Steps,Assertions,Cross_Layer_Checks,Failure_Signals,Cleanup,References,Automation_Status
ORG-GQL-001,createOrganization — Happy Path,GraphQL > Customer > Mutation,Critical,BL-GQL-001; BL-CRM-001,ECL-2.1,Runner-native. Auth as TECHFLOW_ADMIN. Creates AGENT-TEST-prefixed org so cleanup pass can reap it.,org_name=AGENT-TEST-{{TIMESTAMP}}; expected_status=Active,"[AUTH role=TECHFLOW_ADMIN]
[GQL-OP create_org]
[GQL-VARS create_org] {""input"": {""name"": ""{{org_name}}""}}
  mutation CreateOrganization($input: InputCreateOrganizationType!) {
    createOrganization(command: $input) { id name status }
  }
[GQL-EXEC create_org]
[GQL-CAPTURE create_org.data.createOrganization.id → ORG_ID]","[ERRORS label=create_org] errors[] empty
[DATA label=create_org] data.createOrganization.id is non-empty GUID
[DATA label=create_org] data.createOrganization.name = {{org_name}}
[DATA label=create_org] data.createOrganization.status = {{expected_status}}",[EVIDENCE] Org appears in Admin SPA Customer module within 30s (runner-manual),errors[] non-empty; id is null; status not Active,"[AUTH role=ADMIN_DEFAULT]
[REST DELETE /api/customer/organizations/{{ORG_ID}}]",xAPI; CRM-007,Automated
```

Walks: AUTH → set up vars → declare op + vars + body → execute → capture id → 4 verdict-critical assertions on the response → cleanup deletes the test org with admin token.

---

## 11. Quick-reference: forbidden patterns

(Common authoring mistakes the runner WILL accept but you SHOULD NEVER write.)

| Don't | Why | Do instead |
|-------|-----|------------|
| `[DATA] data.X.id = abc-123-…` (hardcoded GUID) | Env drift; runs only on one env | `@td(ALIAS.id)` or capture upstream |
| `[DATA] data.cart.subTotal.amount = 1234.56` (hardcoded price) | Catalog prices change | `data.cart.subTotal.amount > 0` or cross-path arithmetic |
| `[MATH] sum of items = subtotal` (info-only on math) | Not verdict-affecting; bug slips through | `[DATA] data.cart.subTotal.amount = data.cart.items.0.extendedPrice.amount + …` |
| `[EVIDENCE] response shape OK` | Not verdict-affecting | `[DATA label=L] data.X is non-null` |
| `[GQL-CAPTURE r.data.foo.0.id → ID]` then `[DATA] data.foo.0.id = abc` | Brittle to ordering shifts | filter path: `data.foo[?type=Product].id` |
| Cleanup: `clearCart mutation in Cleanup column` | Runner skips GQL-* in Cleanup | put `cleanup_post` in `Steps` |
| `[GQL-OP foo]` body + `[GQL-EXEC bar]` (label mismatch) | EXEC has no matching OP | match labels |
| Hardcoded password in `[GQL-VARS]` | Leaks creds; breaks multi-env | use `[AUTH role=…]` |
| Mixed OR + AND in single predicate | Parser only handles homogeneous composition | split into multiple assertion lines |

---

## 12. Cross-references

| Context | Where to look |
|---------|---------------|
| What columns / tags exist | `knowledge/test-runner-tags.md` |
| Which GraphQL types/fields are real | `knowledge/graphql-schema.md` (snapshot) + live introspection |
| Auth contract (token endpoint, headers) | `knowledge/api-auth.md` |
| Order/checkout flow matrix | `knowledge/order-creation-matrix.md` |
| Business invariants (BL-*) | `knowledge/business-logic.md` |
| Edge case taxonomy (ECL-*) | `knowledge/e-commerce-edge-cases-library.md` |
| Test-data resolver (`@td()`) | `scripts/lib/test-data-resolver.ts` + memory `reference_test_data_resolver.md` |
| Runner CLI usage | memory `feedback_use_canonical_graphql_runner.md` |
| Gold-standard examples | `regression/suites/Backend/graphql/050i-graphql-configurations.csv` |

When in doubt: read the source files in `scripts/` and `scripts/lib/` listed at the top of this doc — they are the actual runner contract; this doc is a guided summary.
