# Live Test-Data Discovery — Agent Reference

QA agents have four ways to get data into a test. Picking the right one per data role is what keeps a suite from rotting when the catalog/seed drifts.

This file is the single source of truth for that decision and for the discovery recipes. Companion code lives in [`scripts/lib/live-discover.ts`](../../../scripts/lib/live-discover.ts) and [`scripts/lib/random-data.ts`](../../../scripts/lib/random-data.ts).

---

## Decision tree

Pick one row, then read that row's recipe section below.

| Data role | Layer | Example |
|---|---|---|
| Per-environment URL, credential, store/culture/currency context | `{{VAR}}` from `.env` | `{{BACK_URL}}`, `{{STORE_ID}}`, `{{ADMIN_EMAIL}}` |
| A **specific** entity you assert against by name | `@td(ALIAS.field)` | `@td(CFG_LAPTOP.id)` for "the configurable laptop the test was designed against" |
| **Any** entity, or one whose ID drifts between seeds | `live-discover` | "first available product", "current virtual-catalog root", "first saved address" |
| A **unique input** you never assert exact values on | `random-data` | new-user email, org name, quote comment, BVA quantity |

**The cardinal rule**: random + live-discover are for inputs and navigation; `@td()` is for assertion targets. Never assert exact prices, titles, IDs, or URL path segments on a discovered or random value — assert shape/range invariants instead (`isNumber`, `> 0`, formatted as currency).

Cross-reference: this rule extends the resolver table in [`.claude/rules/test-data.md`](../../rules/test-data.md).

---

## When to use each

| Use `@td()` when | Use `live-discover` when | Use `random-data` when |
|---|---|---|
| The test was written against a specific known fixture (CFG_LAPTOP, ORG_TECHFLOW, COUPON_10OFF) and you assert exact values on it. | The test only needs *any* entity matching a shape (any product in the virtual catalog, any address belonging to the org, any active coupon). | The test inserts a value the system will store but you don't read back exactly (registration email, org name on signup, comment field, name on shipping form). |
| You're chaining asserted values across steps and need them stable. | You suspect fixture drift (404 on a known ID, empty result set on a hardcoded category filter). | You need uniqueness within a run (multiple registrations, multiple orgs). |
| The data is environmental but stable (sandbox card numbers, white-label theme tokens). | The data is environment-specific and known to migrate (virtual catalog root, address IDs after org reseed, cart IDs). | You're testing input validation with BVA — quantities, comment lengths, phone formats. |

---

## JS recipes — for interactive agents (Playwright-MCP, Chrome-DevTools-MCP, standalone scripts)

Use when the agent is running a TypeScript script under `scripts/` or `tests/`, not the CSV runner.

### Pattern A — set up a context once, then discover

```ts
import { contextFromEnv, tokenForRole, discoverVirtualCatalogRoot,
         discoverFirstAvailableProduct, discoverFirstAddress, discoverFirstCart,
         discoverAnyActiveCoupon, discoverProductBySku } from "../scripts/lib/live-discover.js";

const ctx = contextFromEnv();
ctx.token = await tokenForRole("USER_DEFAULT", ctx);

const root = await discoverVirtualCatalogRoot(ctx);
//   → "9238c387-d779-40cb-b27d-5496a670a924" (or whatever is current today)

const product = await discoverFirstAvailableProduct(ctx);
//   → { id, sku, name, slug }

const address = await discoverFirstAddress(ctx, { type: "shipping", countryCode: "USA" });
//   → { id, line1, city, countryCode }  or null

const cart = await discoverFirstCart({ ...ctx, userId: process.env.USER_ID });
//   → { id, itemsCount }

const coupon = await discoverAnyActiveCoupon(ctx);
//   → { code, type } or null
```

All `discover*` functions return `null` (never throw) when nothing matches. Caller decides whether to retry, switch fixtures, or skip.

### Pattern B — random inputs for unique fields

```ts
import { uniqueEmail, uniqueOrgName, randomQty, randomComment,
         randomPersonName, randomUsPhone, randomUsZip,
         randomAddressLine1 } from "../scripts/lib/random-data.js";

const email = uniqueEmail();                // agent-1731234567890-a1b2c3d4@qa.test
const orgName = uniqueOrgName();            // Test Org Bright 1731234567890
const qty = randomQty(1, 99);               // 1..99
const comment = randomComment(200);         // ≤200 chars, never empty
const { first, last } = randomPersonName(); // { first: "Alex", last: "Lane" }
```

---

## UI recipes — random pick from a rendered listing (browser agents)

For interactive browser agents (Playwright-MCP, Chrome-DevTools-MCP) running test cases against the storefront. Use when the test exercises the **UI search/browse path** and just needs *any* matching product — not a specific known fixture. Hardcoded `@td(BUYABLE_NO_MIN_QTY.slug)` PDP URLs hide UI listing bugs ("stuck at product #1", coupling on alphabetical first position).

### Recipe 1 — random search keyword

`test-data/search-queries/top-50-amazon.csv` is the curated keyword pool (50 terms across electronics, kitchen, fitness, household, books, etc.). Existing aliases (`SEARCH_KITCHEN`, `SEARCH_FITNESS`) pin one row; for randomization, the agent picks any row at runtime:

```
[SETUP] read test-data/search-queries/top-50-amazon.csv, pick a random row → store as search_term
[NAV] {{FRONT_URL}}
[ACT] click [data-test-id="global-search-query-input"]
[ACT] type {search_term}, press Enter
[WAIT] /search?q=… loads
[ASSERT] heading contains the resolved search_term
[LOG] picked search_term to evidence
```

Don't assert exact result count or specific products in the results — assert ≥ 0 results, results are renderable (no JS error), and the keyword echoes in the heading.

### Recipe 2 — random product from a rendered grid

After `browser_snapshot` on `/catalog` or `/search?q=…`, the agent counts product-card `link` nodes under `main`, picks a random index, and follows that card's `/url`:

```
[NAV] {{FRONT_URL}}/catalog  (or /search?q={search_term})
[WAIT] product grid loaded
[ACT] browser_snapshot → count link nodes whose href matches /product/ or /<category>/<slug>
[ACT] pick random index i in [0, N) → store card[i].url as pdp_url, card[i].text as pdp_name
[NAV] {{FRONT_URL}}{pdp_url}
[WAIT] PDP loaded
[ASSERT] page heading contains pdp_name
[LOG] picked pdp_url + pdp_name to evidence
```

For the storefront, "product card" candidates are `link` elements with `/url` matching `^/(product|[\w-]+/[\w-/]+)$` and a non-empty `img` child — exclude header/footer/nav links by scoping to `main` in the snapshot.

### What to assert on a randomly-picked product

| ✅ Safe | ❌ Brittle |
|---|---|
| Price > 0 and formatted with exactly 2 decimal places | Exact price (`$233.00`) |
| Has at least one image | Specific image filename |
| `Add to cart` / quantity stepper enabled (stock > 0) | Specific stock count |
| PDP title matches the listing card name | Exact product name from a fixture |
| Add-to-cart succeeds and cart line appears with that SKU | Specific SKU |

### Mandatory: log the chosen entity to evidence

Random picks make failures non-reproducible without a record of what was picked. Every test using these recipes MUST write `picked_search_term` / `picked_pdp_url` / `picked_pdp_name` to the per-case evidence JSON before the first non-trivial assertion. Without it, a reviewer can't tell whether a failure is a UI bug or a data quirk on the one product the test happened to pick.

---

## CSV runner recipes — for runner-native GraphQL test cases

Use when you're authoring a row under `regression/suites/Backend/graphql/`. The runner already supports discovery via `[GQL-OP]` + `[GQL-CAPTURE]` — no new tags are needed. See [`graphql-test-cases-runner.md`](graphql-test-cases-runner.md) for the full tag grammar.

### Recipe 1 — discover the virtual-catalog root, then query products under it

`Steps` cell:

```text
[AUTH role=USER_DEFAULT]

[GQL-OP findRoot]
query($storeId: String!) {
  categories(storeId: $storeId, first: 50) { items { id hasParent } }
}
[GQL-VARS findRoot] {"storeId": "{{STORE_ID}}"}
[GQL-EXEC findRoot]
[GQL-CAPTURE findRoot.categories.items[?hasParent=false].id → CAT_ROOT]

[GQL-OP listProducts]
query($storeId: String!, $filter: String!) {
  products(storeId: $storeId, filter: $filter, first: 5) {
    items { id code name }
  }
}
[GQL-VARS listProducts] {"storeId": "{{STORE_ID}}", "filter": "category.subtree:{{CAT_ROOT}}"}
[GQL-EXEC listProducts]
```

`Assertions` cell:

```text
[COUNT data.products.items >= 1]
[DATA data.products.items[0].id != null]
```

**Why this works**: the root ID gets resolved against the live catalog every run. On 2026-04-30 the root migrated from `fc596540…` to `9238c387…`; the same case kept passing because nothing was hardcoded.

### Recipe 2 — pick the first available product and add it to a cart

```text
[AUTH role=USER_DEFAULT]

[GQL-OP rootQuery]
query($storeId: String!) {
  categories(storeId: $storeId, first: 1) { items { id } }
}
[GQL-VARS rootQuery] {"storeId": "{{STORE_ID}}"}
[GQL-EXEC rootQuery]
[GQL-CAPTURE rootQuery.categories.items.0.id → CAT_ROOT]

[GQL-OP pickProduct]
query($storeId: String!, $filter: String!) {
  products(storeId: $storeId, filter: $filter, first: 1) {
    items { id code }
  }
}
[GQL-VARS pickProduct] {"storeId": "{{STORE_ID}}", "filter": "category.subtree:{{CAT_ROOT}}"}
[GQL-EXEC pickProduct]
[GQL-CAPTURE pickProduct.products.items.0.id → PRODUCT_ID]

[GQL-OP addToCart]
mutation($command: InputAddItemType!) {
  addItem(command: $command) { id itemsCount }
}
[GQL-VARS addToCart] {"command": {"storeId": "{{STORE_ID}}", "currencyCode": "USD", "userId": "@td(USER_DEFAULT.id)", "productId": "{{PRODUCT_ID}}", "quantity": 1}}
[GQL-EXEC addToCart]
```

`Assertions`:

```text
[DATA data.addItem.itemsCount >= 1]
```

### Recipe 3 — pick any active coupon, validate it on a cart

```text
[AUTH role=ORG_USER]

[GQL-OP listCoupons]
query($storeId: String!, $userId: String, $first: Int) {
  promotionCoupons(storeId: $storeId, userId: $userId, first: $first) {
    items { code type }
  }
}
[GQL-VARS listCoupons] {"storeId": "{{STORE_ID}}", "userId": "@td(ORG_USER.id)", "first": 1}
[GQL-EXEC listCoupons]
[GQL-CAPTURE listCoupons.promotionCoupons.items.0.code → COUPON_CODE]

[GQL-OP validate]
query($storeId: String!, $currencyCode: String!, $userId: String!, $coupon: String!) {
  validateCoupon(storeId: $storeId, currencyCode: $currencyCode, userId: $userId, coupon: $coupon)
}
[GQL-VARS validate] {"storeId": "{{STORE_ID}}", "currencyCode": "USD", "userId": "@td(ORG_USER.id)", "coupon": "{{COUPON_CODE}}"}
[GQL-EXEC validate]
```

Gold-standard reference for chained capture syntax: `regression/suites/Backend/graphql/050i-graphql-configurations.csv` (CFG-GQL-013…032).

---

## Anti-patterns

| ❌ Don't | ✅ Do |
|---|---|
| Assert exact prices/names/IDs on a discovered product | Assert shape: `> 0`, `is string`, formatted as currency, `items.length >= 1` |
| Hardcode `category.subtree:fc596540…` in a `products` filter | Capture the root via `findRoot` then template it into the filter |
| Generate a random email and then assert "the email is X@Y" | Generate random email, assert the registration succeeded, then query `me { email }` to read back |
| Discover a product and then assert it equals a specific SKU | Either use `@td(PRODUCT_X.sku)` for the assertion, or assert shape only |
| Throw when `discoverFirstAddress` returns `null` | Treat `null` as a normal outcome — log it, fall back to seeding, or skip |
| Use `random-data` for an email you'll log into later | Random emails have no password in `.env`; use `@td(USER_*.email)` for accounts you authenticate as |
| Random-pick a product from the listing but assert exact name/price/SKU | Assert shape: price > 0, 2-dp formatted, stock > 0, PDP title matches the captured listing card text |
| Random-pick a product or keyword and not record what was picked | Log `picked_pdp_url` / `picked_search_term` to evidence JSON before the first assertion — random failures are unreproducible without it |

---

## Test isolation in parallel runs

The regression orchestrator runs up to 3 browser agents in parallel (chrome / firefox / edge — `playwright-chrome`, `playwright-firefox`, `playwright-edge`). Naive discovery breaks under that:

| Naive call | Failure mode |
|---|---|
| `discoverFirstCart(ctx)` with all three agents authenticated as `USER_DEFAULT` | All three agents discover **the same cart**. Whichever agent runs `clearCart` first invalidates the others' state. |
| `discoverFirstAvailableProduct(ctx)` with three agents adding it to cart | All three add the same SKU; one of them will own a cart with quantity 3 when its assertion expected quantity 1. |
| `discoverFirstAddress(ctx, { type: "shipping" })` when the test then *deletes* the address | Sibling agents lose the address mid-run. |

**Use the agent user pool** in [`test-data/users/agent-user-pool.csv`](../../../test-data/users/agent-user-pool.csv) — there are dedicated slots keyed by browser:

| Slot | Browser | Personal (alias) | B2B account (alias) |
|---|---|---|---|
| 1 | `playwright-chrome` | `@td(AGENT_POOL_SLOT_1.email)` / `@td(AGENT_POOL_SLOT_1.password)` | `@td(AGENT_POOL_SLOT_1.b2b_email)` in `@td(AGENT_POOL_SLOT_1.b2b_org)` |
| 2 | `playwright-firefox` | `@td(AGENT_POOL_SLOT_2.email)` / `@td(AGENT_POOL_SLOT_2.password)` | `@td(AGENT_POOL_SLOT_2.b2b_email)` in `@td(AGENT_POOL_SLOT_2.b2b_org)` (paired with slot 1 for same-org tests) |
| 3 | `playwright-edge` | `@td(AGENT_POOL_SLOT_3.email)` / `@td(AGENT_POOL_SLOT_3.password)` | `@td(AGENT_POOL_SLOT_3.b2b_email)` in `@td(AGENT_POOL_SLOT_3.b2b_org)` (cross-org pair) |

**vcst-qa values for reference** (customers edit `test-data/users/agent-user-pool.csv` with their own; the pattern stays):
- Slot 1: `qa-agent-slot1@virtocommerce.com` / `TestAgent1!` · `test-john.mitchell-…` in TechFlow
- Slot 2: `qa-agent-slot2@virtocommerce.com` / `TestAgent2!` · `test-emily.johnson-…` in TechFlow
- Slot 3: `qa-agent-slot3@virtocommerce.com` / `TestAgent3!` · `test-carlos.rodriguez-…` in BuildRight

Agents should authenticate against their slot user (resolve at runtime via `@td(AGENT_POOL_SLOT_N.*)` from `agent-user-pool.csv`, never hardcode), so each agent's `discoverFirstCart` / `discoverFirstAddress` returns *its own* isolated state. Cross-reference: `user_test_accounts.md` memory.

For read-only discovery (catalog root, product list, any active coupon) the shared user is fine — those calls don't mutate state.

If a test genuinely needs a brand-new entity (registration, fresh org), use `random-data` with the `AGENT-TEST-` prefix so `/qa-seed-data teardown` sweeps it up after the run.

---

## Logging discovered values to evidence

When a test fails on discovered data, the diff between "what we asked for" and "what we got" is everything. Always log the captured values:

- **CSV runner**: `[GQL-CAPTURE]` writes captured vars into the per-case evidence JSON automatically — no extra work needed.
- **Interactive scripts**: `console.log({ catRoot, productId, addressId })` before the first assertion, or write to `reports/<run>/<case>/discovered.json`. Future failures will be reproducible from the log.

---

## Reused primitives

- [`scripts/lib/graphql-auth.ts`](../../../scripts/lib/graphql-auth.ts) — `TokenCache` (called by `tokenForRole`)
- [`scripts/lib/graphql-executor.ts`](../../../scripts/lib/graphql-executor.ts) — `executeOperation` (called by every `discover*`)
- [`scripts/lib/graphql-case-parser.ts`](../../../scripts/lib/graphql-case-parser.ts) — `[GQL-CAPTURE label.path → VAR]` grammar (used by CSV recipes)
- [`.claude/agents/knowledge/graphql-schema.md`](graphql-schema.md) — schema reference; consult before writing new discovery queries
- [`test-data/aliases.json`](../../../test-data/aliases.json) — registry for `@td()` references (the other half of the data layer)
