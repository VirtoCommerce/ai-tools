# MCP module contract surface — GENERATED, do not edit by hand

> Written by `npm run mcp:schema:refresh`; `mcp:schema:check` fails on drift. This file is the SOURCE OF
> TRUTH for which scopes the MCP module serves, which tools each scope carries and how they are
> annotated, and (Part 2) what `/admin/mcp`'s tools and prompts take — a test case cites it and never
> transcribes it (`.claude/rules/test-data.md` GOLDEN RULE). Tool ARGUMENTS of the `ucp` scope live in
> [`ucp-schema.md`](ucp-schema.md). Run-time STATE (a tool switched off, counts, the caller's approver
> flag) is deliberately excluded: it changes without the contract changing.

## Part 1 — scopes and tool catalog (`api/mcp/scopes`, `api/mcp/tools`, as an administrator)

### Scopes

| scope | title | path | approval | approver permission |
|---|---|---|---|---|
| `admin` | Virto Commerce Back Office | `/admin/mcp` | yes | `mcp:approve` |
| `ucp` | Virto Commerce UCP | `/ucp/mcp` | — | — |

### Per scope and host — protected-resource metadata and the unauthenticated answer

`<platform>` / `<storefront>` stand for BACK_URL / FRONT_URL of the env refreshed against. `tools/list` is sent with no token.

| scope | host | PRM | resource | authorization server | scopes_supported | anonymous tools/list | challenge |
|---|---|---|---|---|---|---|---|
| `admin` | platform | 200 | `<platform>/admin/mcp` | `<platform>/` | offline_access, openid, profile | 401 | `Bearer realm="<platform>", resource_metadata="<platform>/.well-known/oauth-protected-resource/admin/mcp", scope="openid profile offline_access"` |
| `admin` | storefront | 200 | `<platform>/admin/mcp` | `<platform>/` | offline_access, openid, profile | 405 | — |
| `ucp` | platform | 200 | `<storefront>/ucp/mcp` | `<storefront>/` | offline_access, openid, profile | 200 | — |
| `ucp` | storefront | 200 | `<storefront>/ucp/mcp` | `<storefront>/` | offline_access, openid, profile | 200 | — |

### Tools per scope

#### `admin` — 19 tools (read-only 14 · destructive 3 · requires approval 1)

| tool | read-only | destructive | approval | description |
|---|---|---|---|---|
| `approve_pending_change` | — | yes | — | Approve a pending change and execute it right away with the stored arguments, as the approving user. Only approve after the user has reviewed the change with get_pending_change and explicitly asked to approve it. A change cannot be approved by the user who requested it, and the approver must be allowed to run the tool. |
| `cancel_job` | — | — | — | Cancel a background job that a bulk tool started. A queued job does not start; a running job stops when the job engine supports cancellation, and the items processed so far stay processed. Ask the user before canceling. |
| `check_capacity` | yes | — | — | Are the resources enough, and where is the bottleneck. Measures this instance over a short sample: CPU against its processors, memory against its limit (the container limit when there is one), garbage collection, the thread pool queue (starvation), database latency, and the background job backlog of the cluster. Returns findings with evidence and one recommendation: ok, scale_up, scale_out, fix_hotspot or investigate. Measure again during the problem and at a quiet time to compare. |
| `check_configuration` | yes | — | — | Check the configuration against production-readiness rules: Development environment, the development signing certificate, Redis and push notifications with several instances, local file storage for assets, Lucene search, in-memory background jobs, debug logging, plain HTTP, the sample database password, failed modules and the license. Each finding has a severity, the evidence and the fix. Rules about several instances use the instances the job engine knows. |
| `check_pending_migrations` | yes | — | — | For every database context of the platform and its modules: how many EF Core migrations are applied and which are pending. Pending migrations after a deployment mean the database is older than the code. Reads the migration history of each database; applies nothing. The back office's Export migration scripts gives the SQL. |
| `explain_error` | yes | — | — | Answer 'is it our code or Virto's' for one error: maps every frame of its stack to the platform, a Virto module or one of the solution's own modules, with versions, and names the likely cause class (data, configuration, customization, platform_code, infrastructure, external_service) with the reason and the next checks. Pass the fingerprint from search_errors, or a stack trace the user pasted. |
| `get_environment_profile` | yes | — | — | What this Virto Commerce solution runs on: platform and .NET versions, environment, database, search, assets and background job providers, Redis, the instance (processors, memory limit, uptime), the number of known instances, the license status, and the modules split into Virto's and the solution's own (customizations) and failed. No connection strings or secrets. Start here before any diagnosis. |
| `get_incident_timeline` | yes | — | — | What happened in a window, in time order: instance starts (restarts, deployments, scale-out), the first occurrence of each error with its count, and failed background jobs. Use it to see what changed just before a problem started. Errors are those of this instance since it started. |
| `get_job_status` | yes | — | — | Get the status and progress of a background job that a bulk tool started: Queued, Running, Succeeded, Failed or Canceled, how many items are processed, and the last message. Call it again later while the job is Queued or Running. |
| `get_pending_change` | yes | — | — | Get one change submitted for approval: the tool, its exact arguments, the dry-run preview, and, once reviewed, the reviewer and the execution result. A user who is not an approver gets only their own changes. |
| `get_platform_health` | yes | — | — | Run the platform's health checks on this instance: database, cache, Redis, module loading and the checks modules add (search and others). Returns the status and latency of each check, and findings with the cause class and the fix for every check that is not healthy. |
| `list_failed_jobs` | yes | — | — | The background job engine at a glance: enqueued, scheduled, processing and failed counts, the job servers (one per instance that processes jobs, with workers, start time and heartbeat), the queues, and the most recent failed jobs with the exception. Use it when imports, exports, indexing, emails or integrations do not finish. |
| `list_modules` | yes | — | — | List the installed modules with version and origin: 'virto' for Virto Commerce's modules, 'own' for the solution's customizations and third-party modules. Filter 'own' answers 'what did we customize', 'failed' returns the modules that did not load with their errors. Returns one page: when total_count is larger than the rows returned, call again with skip to read the rest. |
| `list_pending_changes` | yes | — | — | List changes that agents submitted for approval, newest first. An approver sees every change, any other user only the changes they requested. Returns compact rows; call get_pending_change for the arguments and the dry-run preview of one change. |
| `prepare_support_case` | yes | — | — | Prepare a problem report for Virto Commerce support in Markdown: the problem, steps and what was tried, the environment and the solution's own modules, health, configuration findings, the errors with trace ids, where they are thrown and their stack traces, failed jobs and the timeline. Secrets, emails and card numbers are replaced with ***. Nothing is sent: show the report to the user to review and send. |
| `reject_pending_change` | — | — | — | Reject a pending change so that it is never executed. An approver rejects any change; any other user can only withdraw a change they requested. |
| `reset_platform_cache` | — | yes | — | Expire the whole platform memory cache, as the back office's Reset cache does. Use it after a change made directly in the database, or when the storefront shows stale data that the cache explains. The first requests after it are slower. |
| `restart_platform` | — | yes | yes | Restart the platform application gracefully, as the back office's Restart does, for example after installing modules or changing settings that are read at start. The change is submitted for approval: tell the user its id and that another person must approve it. The instance that runs the approved change restarts; running background jobs on it are interrupted and retried. |
| `search_errors` | yes | — | — | Errors this instance logged since it started, grouped by fingerprint (exception type, message template and the frame that threw), most recent first, with the count in the window, first and last time, the source, the last message and trace id. Messages have secrets and personal data removed. Pass a fingerprint to explain_error to find out whose code throws it. |

#### `ucp` — 25 tools (read-only 16 · destructive 3 · requires approval 0)

| tool | read-only | destructive | approval | description |
|---|---|---|---|---|
| `cancel_cart` | — | yes | — | Standard UCP cancel_cart (dev.ucp.shopping.cart) in this Virto Commerce storefront: removes every line of an anonymous buyer's cart and returns the cart as it was before. The cart of a signed-in buyer is their storefront cart, so it is not cleared: the call returns an error, and update_cart removes lines instead. |
| `cancel_checkout` | yes | — | — | Standard UCP cancel_checkout (dev.ucp.shopping.checkout). Not supported by this Virto Commerce storefront: a checkout here is the cart, and it returns an error. A hosted checkout link expires by itself; cancel_cart or update_cart changes the cart. |
| `checkout_and_handoff` | — | — | — | Create checkout and immediately create a hosted checkout handoff URL. For the user's account or organization, do not call this tool until link_buyer_identity succeeds. For physical goods, do not call until shipping_address.first_name, shipping_address.last_name, and shipping_address.postal_code are provided, unless the store assigns cart addresses itself (store_managed_addresses in get_store_capabilities); ask the user for missing values. This does not execute a payment. Its next step for track_order carries placed_after (the handoff issued_at); keep those arguments to track the order the buyer places. |
| `complete_checkout` | — | — | — | Standard UCP complete_checkout (dev.ucp.shopping.checkout) in this Virto Commerce storefront. It does not take payment or place the order: it creates the hosted checkout link and returns status requires_escalation with continue_url, where the buyer pays and places the order. Give the buyer continue_url; it is short-lived and works once. The checkout needs a shipping address first (update_checkout), unless the store assigns addresses. For the user's account or organization, do not call this tool until link_buyer_identity succeeds. |
| `create_cart` | — | — | — | Create a cart in this Virto Commerce storefront, or add to the buyer's storefront cart: a signed-in buyer's lines are added to the cart they already have, so tell the user when it already holds items. Without a Platform bearer token this creates an anonymous cart. If the user asks for 'my cart', to act on their behalf, or to use their account or organization, do not call this tool until link_buyer_identity succeeds. Buyer and organization then come only from the validated Platform token; never invent them. Also the standard UCP tool of this name: a call with the standard arguments returns the standard UCP payload. |
| `create_checkout` | — | — | — | Create checkout in this Virto Commerce storefront. For the user's account or organization, do not call this tool until link_buyer_identity succeeds. For physical goods, do not call until shipping_address.first_name, shipping_address.last_name, and shipping_address.postal_code are provided, unless the store assigns cart addresses itself (store_managed_addresses in get_store_capabilities); ask the user for missing values. Also the standard UCP tool of this name: a call with the standard arguments returns the standard UCP payload. |
| `get_cart` | yes | — | — | Get a cart in this Virto Commerce storefront. For the user's account, organization, or saved cart, do not call this tool until link_buyer_identity succeeds; authenticated buyer identity comes from the Platform token. Also the standard UCP tool of this name: a call with the standard arguments returns the standard UCP payload. |
| `get_checkout` | yes | — | — | Standard UCP get_checkout (dev.ucp.shopping.checkout) in this Virto Commerce storefront. The checkout id is the cart id. status is ready_for_complete when the hosted checkout has what it needs, otherwise incomplete (see messages). For the user's account or organization, do not call this tool until link_buyer_identity succeeds. |
| `get_order` | yes | — | — | Standard UCP get_order (dev.ucp.shopping.order) in this Virto Commerce storefront: the order by its id or number, with the same buyer checks as track_order. checkout_id is the cart id the order was placed from. For the user's account or organization, do not call this tool until link_buyer_identity succeeds. |
| `get_payment_handlers` | yes | — | — | Get payment handlers for a checkout in this Virto Commerce storefront. For the user's account or organization, do not call this tool until link_buyer_identity succeeds. This only discovers handlers; it does not execute a payment. |
| `get_product` | yes | — | — | Get one product in this Virto Commerce storefront. Without a Platform bearer token this lookup is anonymous. If the user asks to use their account, act on their behalf, or use their organization or personalized prices, do not call this tool until link_buyer_identity succeeds. Also the standard UCP tool of this name: a call with the standard arguments returns the standard UCP payload. |
| `get_store_capabilities` | yes | — | — | Discover UCP capabilities for this Virto Commerce storefront. |
| `handoff_checkout` | — | — | — | Create a hosted checkout handoff URL. For the user's account or organization, do not call this tool until link_buyer_identity succeeds. For physical goods, do not call until shipping_address.first_name, shipping_address.last_name, and shipping_address.postal_code are provided, unless the store assigns cart addresses itself (store_managed_addresses in get_store_capabilities); ask the user for missing values. This does not execute a payment. Its next step for track_order carries placed_after (the handoff issued_at); keep those arguments to track the order the buyer places. |
| `link_buyer_identity` | yes | — | — | REQUIRED first step for an authenticated buyer request. Call this before search_products, get_product, create_cart, cart, checkout, or order tools whenever the user says 'my account', 'my cart', 'on my behalf', 'from my name', 'for my organization', or asks for personalized prices, saved data, or orders. Without a valid bearer token, the MCP client starts standard Virto Commerce Platform OAuth and retries this call. With a valid token, this tool returns its current buyer and organization, with their names, the user name and, when the email scope was granted, the email: tell the user which account and organization you act for. It does not sign out, switch accounts, or force a new browser login. To switch buyers, reconnect the MCP client with a new OAuth authorization, then verify the returned identity before continuing. Signing out of the storefront does not switch this MCP connection. After it succeeds, repeat the requested commerce operation. Do not call it when the user explicitly requests anonymous shopping. |
| `list_carts` | yes | — | — | List buyer-scoped carts in this Virto Commerce storefront. By default the result is the buyer's storefront cart(s); lists such as wishlists or saved-for-later carts are returned only when an explicit cart_type is passed. Anonymous continuation requires buyer_id. For the user's account or organization carts, do not call this tool until link_buyer_identity succeeds; buyer and organization then come from the Platform token. Global cart listing is not allowed. |
| `list_countries` | yes | — | — | List or search countries in this Virto Commerce storefront. |
| `list_regions` | yes | — | — | List regions for a country in this Virto Commerce storefront. |
| `logout_buyer` | — | yes | — | Sign out the current buyer from this MCP OAuth application. Call when the user asks to log out. Revokes the current Platform OAuth authorization and its access/refresh tokens, including other connections sharing that authorization. Does not sign out other applications or clear browser cookies. After success, stop using saved buyer, organization, cart, and checkout identifiers. Do not call link_buyer_identity until the user explicitly asks to sign in again. Never ask for passwords or tokens in chat. |
| `lookup_catalog` | yes | — | — | Standard UCP catalog lookup (dev.ucp.shopping.catalog.lookup) in this Virto Commerce storefront: catalog.ids lists up to 20 product or variant ids. Each returned variant names the ids that resolved to it in inputs; an id that does not resolve is an info message with code not_found. |
| `resolve_country` | yes | — | — | Resolve country text to a Virto Commerce platform country id in this storefront. |
| `search_catalog` | yes | — | — | Standard UCP catalog search (dev.ucp.shopping.catalog.search) in this Virto Commerce storefront: catalog.query, catalog.filters.price (minor units) and catalog.filters.categories, catalog.pagination (cursor, limit), catalog.context (currency, language, address_country). Without a Platform bearer token the search is anonymous. |
| `search_products` | yes | — | — | Search products in this Virto Commerce storefront. Without a Platform bearer token this search is anonymous. If the user asks to use their account, act on their behalf, or use their organization or personalized prices, do not call this tool until link_buyer_identity succeeds; then call this tool with the same search arguments. |
| `track_order` | yes | — | — | Track order by order id, order number, or cart id in this Virto Commerce storefront. After a hosted checkout, call it with the cart_id and placed_after from the handoff's next step (placed_after is the handoff issued_at): orders lists the orders placed from that checkout, child orders included (each carries parent_order_id), oldest first (the main order before its child orders), and order is the newest top-level order. Without placed_after, cart_id returns only the newest top-level order of the cart together with its child orders: a storefront cart keeps its id across checkouts, so earlier orders of the cart need placed_after. To list the cart's order history, pass an earlier placed_after (for example the date the user asks about, or 2000-01-01T00:00:00Z for all orders). Not found with the handoff placed_after means the buyer has not placed the order yet. For the user's account, organization, or orders, do not call this tool until link_buyer_identity succeeds. |
| `update_cart` | — | yes | — | Update cart state in this Virto Commerce storefront. This replaces the cart's line items with the complete desired line_items state: lines not listed are removed, so read the cart first and send every line that should remain. For the user's account, organization, or cart, do not call this tool until link_buyer_identity succeeds; authenticated buyer identity comes from the Platform token. Also the standard UCP tool of this name: a call with the standard arguments returns the standard UCP payload. |
| `update_checkout` | — | — | — | Update checkout address or buyer data in this Virto Commerce storefront. For the user's account or organization, do not call this tool until link_buyer_identity succeeds. Also the standard UCP tool of this name: a call with the standard arguments returns the standard UCP payload. |

<!-- part 2: /admin/mcp tools/list + prompts/list -->

## Part 2 — `/admin/mcp` as an administrator's agent (`tools/list`, `prompts/list`)

- protocol: `2025-06-18` · serverInfo: `Virto Commerce Back Office` v`3.1000.0`
- capabilities: `logging`, `prompts`, `tools`
- 19 tools · 6 prompts (an administrator sees every tool of the scope; another user sees the subset its permissions allow)

### Tool arguments (`*` = required)

#### `approve_pending_change` — readOnly=false · destructive=true · idempotent=false

```
* change_id: string
  comment: string default null
```

#### `cancel_job` — readOnly=false · destructive=false · idempotent=true

```
* job_id: string
```

#### `check_capacity` — readOnly=true · destructive=false · idempotent=true

```
  sample_seconds: integer default 2
```

#### `check_configuration` — readOnly=true · destructive=false · idempotent=true

```
(no arguments)
```

#### `check_pending_migrations` — readOnly=true · destructive=false · idempotent=true

```
(no arguments)
```

#### `explain_error` — readOnly=true · destructive=false · idempotent=true

```
  fingerprint: string default null
  stack_trace: string default null
```

#### `get_environment_profile` — readOnly=true · destructive=false · idempotent=true

```
(no arguments)
```

#### `get_incident_timeline` — readOnly=true · destructive=false · idempotent=true

```
  hours: integer default 24
  take: integer default 100
```

#### `get_job_status` — readOnly=true · destructive=false · idempotent=true

```
* job_id: string
```

#### `get_pending_change` — readOnly=true · destructive=false · idempotent=true

```
* change_id: string
```

#### `get_platform_health` — readOnly=true · destructive=false · idempotent=true

```
(no arguments)
```

#### `list_failed_jobs` — readOnly=true · destructive=false · idempotent=true

```
  hours: integer|null default null
  take: integer|null default null
```

#### `list_modules` — readOnly=true · destructive=false · idempotent=true

```
  filter: string default "all"
  skip: integer default 0
  take: integer|null default null
```

#### `list_pending_changes` — readOnly=true · destructive=false · idempotent=true

```
  status: string default "Pending"
  tool_name: string default null
  skip: integer default 0
  take: integer|null default null
```

#### `prepare_support_case` — readOnly=true · destructive=false · idempotent=true

```
* symptom: string
  steps_to_reproduce: string default null
  what_was_tried: string default null
  fingerprint: string default null
  hours: integer default 24
```

#### `reject_pending_change` — readOnly=false · destructive=false · idempotent=false

```
* change_id: string
  reason: string default null
```

#### `reset_platform_cache` — readOnly=false · destructive=true · idempotent=true

```
* reason: string
```

#### `restart_platform` — readOnly=false · destructive=true · idempotent=false

```
* reason: string
  dryRun: boolean default false
```

#### `search_errors` — readOnly=true · destructive=false · idempotent=true

```
  hours: integer|null default null
  keyword: string default null
  take: integer|null default null
```

### Prompts

| prompt | arguments (`*` = required) | description |
|---|---|---|
| `capacity_review` | `when` | Are the resources enough, where is the bottleneck, and should we scale up, scale out or fix a hotspot. |
| `daily_health_check` | (none) | Morning check of the platform: health, new errors, failed jobs, capacity and configuration, with a short action list. |
| `incident_rca` | *`symptom`, `hours` | Root-cause analysis of an incident: timeline, errors, whose code, cause class and next steps. |
| `is_it_us_or_virto` | *`error` | For one error: is it the solution's own code, Virto's code, the data, the configuration or the infrastructure. |
| `prepare_support_case` | *`symptom` | Collect the evidence and prepare a problem report for Virto Commerce support, for you to review and send. |
| `production_readiness` | (none) | Is this environment ready for production traffic: configuration, capacity, migrations, modules and license. |

