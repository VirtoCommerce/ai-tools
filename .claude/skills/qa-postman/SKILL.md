---
name: qa-postman
description: "[Testing] Postman MCP collections — create, configure, verify, and export collections with proper variables, auth, and endpoints"
argument-hint: "create <purpose> | env <profile> | verify <collection> | export <collection> | list | examples"
disable-model-invocation: true
---

# /qa-postman — Postman Collection Builder

Author Postman collections via Postman MCP with correct variable scoping, authentication, endpoint construction, and request chaining. Execution happens outside the MCP — via Newman CLI, Postman CLI, the Postman desktop/web app, or Postman Monitors.

**Problem this solves:** Agents create broken Postman collections because they hardcode URLs, forget auth tokens, misuse variable scopes, or build requests with wrong body formats. This skill is the single source of truth for how to use Postman MCP tools correctly.

> **`runCollection` is not callable — Newman is the default runner.** The tool is listed in the MCP's own `enabledTools` catalog but registered by no endpoint ([mcp-tools.md](mcp-tools.md) §1a). The one MCP-native execution route is a **Postman Monitor** on the full endpoint, and it is rarely the right call for evidence runs — it needs real credentials stored in the Postman cloud and it leaves a scheduled artifact behind ([execution.md](execution.md) §3.3). Use the `verify` mode below to validate content before handing off to a runner.

---

## Reference Files

Read the relevant file **before** invoking the matching Postman MCP tools.

| File | When to read |
|------|--------------|
| [mcp-tools.md](mcp-tools.md) | Always first — tool inventory, workspace ID, collection ID formats, `model: "full"` rule |
| [variables-and-environments.md](variables-and-environments.md) | Before `createEnvironment`/`putEnvironment` or whenever you set/get a variable |
| [collections-and-requests.md](collections-and-requests.md) | Before `createCollection`/`createCollectionRequest` — schema, auth flow, chaining patterns |
| [graphql-authoring.md](graphql-authoring.md) | Before any GraphQL request — links to canonical [`graphql-schema.md`](../../knowledge/api/graphql-schema.md) and [`graphql-test-cases-runner.md`](../../knowledge/api/graphql-test-cases-runner.md) |
| [test-data-fixtures.md](test-data-fixtures.md) | Before authoring values into bodies — `@td()` resolver, [`test-data/aliases.json`](../../../test-data/aliases.json), fixture conventions |
| [execution.md](execution.md) | After authoring — verify checklist + Newman/Postman CLI/Monitor + endpoint quick-reference |
| [bug-evidence.md](bug-evidence.md) | Before building a collection as **bug evidence** — an optional artifact for the narrow class of API/GraphQL defect whose finding is a disagreement or needs ≥2 controls. Criterion, anatomy, the secrets rule, and how it relates to the regression carrier |
| [common-mistakes.md](common-mistakes.md) | When something doesn't work — 15-item catalog |
| [examples.md](examples.md) | Copy-paste-ready collection + environment payloads |

---

## Arguments

| Argument | Description |
|----------|-------------|
| `create <purpose>` | Create a new collection for a specific purpose (e.g., `create catalog CRUD`, `create auth testing`) |
| `env <profile>` | Create a Postman environment from .env variables for a profile (`qa`, `staging`, `full`) |
| `verify <collection>` | Fetch the full collection payload (`getCollection model=full`) and audit it: schema, auth at every request, test scripts, variable usage |
| `bug-evidence <TICKET>` | **Optional.** Build a reproduction collection to attach to a bug ticket — asserts the CORRECT expectation, so it is red while the defect is open and green on the fix. Only for an API/GraphQL defect whose finding is a disagreement or needs ≥2 controls; see [bug-evidence.md](bug-evidence.md) §1 before starting. Needs no Postman MCP — the workspace copy is a separate, optional step |
| `export <collection>` | Output a Newman/Postman-CLI-ready run command for a collection + environment pair (the MCP cannot execute collections directly) |
| `list` | List all collections and environments in the workspace |
| `examples` | Show copy-paste-ready examples for common Postman MCP operations |

---

## Workflow

### Step 0 — Read the Reference Files
At minimum: [mcp-tools.md](mcp-tools.md). Read the others on demand based on what you're authoring (REST → collections-and-requests; GraphQL → graphql-authoring; fixture-driven values → test-data-fixtures).

If a tool you expect appears unavailable, call `getEnabledTools` first — the MCP runs in `minimal` mode by default. Read `serverInfo.currentServerTools`, **not** the `enabledTools` catalog: the catalog advertises tools no endpoint actually serves ([mcp-tools.md](mcp-tools.md) §1a).

### Step 1 — Get Workspace ID
- Default workspace: **VirtoPlatform** — `8bd7a5b3-73e5-4414-a9c9-d59018b44079` (team workspace)
- Verify with `getWorkspaces({ type: "team" })` if uncertain, or ask the user

### Step 2 — Check Existing Resources
1. `getCollections({ workspace, name: "<filter>" })` — substring match by name
2. `getEnvironments({ workspace })` — check if the target environment exists
3. Ask the user: reuse, update, or recreate?

> Reading a collection's full content takes a separate call: `getCollection({ collectionId, model: "full" })`. The default response is a lightweight collection map (metadata + recursive itemRefs only).

### Step 3 — Create or Select Environment
See [variables-and-environments.md](variables-and-environments.md). Map `.env` → Postman env values, mark passwords/tokens as `type: "secret"`, always include an empty `authToken` (the auth request's test script populates it).

### Step 4 — Build the Collection
See [collections-and-requests.md](collections-and-requests.md). Every collection MUST include:
1. v2.1.0 schema in `info.schema`
2. Collection-level Bearer auth using `{{authToken}}`
3. Collection variables for entity IDs (initially empty)
4. Folder structure (Auth → Setup → Test → Verify → Cleanup)
5. First request = OAuth2 token with `auth: { type: "noauth" }`

### Step 5 — Add Requests
Resolve fixture values via [test-data-fixtures.md](test-data-fixtures.md) (`@td()` resolver, [`test-data/aliases.json`](../../../test-data/aliases.json)). For GraphQL bodies, verify field names against [`graphql-schema.md`](../../knowledge/api/graphql-schema.md) **before** writing — see [graphql-authoring.md](graphql-authoring.md).

Every request must have URL using `{{baseUrl}}`, proper headers, and a test script with at least a status-code assertion.

### Step 6 — Verify the Collection
See [execution.md](execution.md) §2. `getCollection({ collectionId, model: "full" })` then run the audit checklist.

### Step 7 — Hand Off for Execution
The MCP cannot execute collections. See [execution.md](execution.md) §3 for Newman, Postman CLI, Monitor, and UI options.

---

## Mode: `create`

Creates a purpose-built collection. Patterns ready to copy in [examples.md](examples.md):
- **Auth testing** — token lifecycle, refresh, invalid creds, RBAC
- **CRUD testing** — create/read/update/delete with chained entity IDs
- **GraphQL testing** — xAPI queries and mutations with error checking (see [graphql-authoring.md](graphql-authoring.md))
- **Smoke testing** — lightweight health check across critical endpoints

**For test data seeding** — use `/qa-seed-data` instead. It provides entity dependency ordering, API request bodies, batch patterns, and seed profiles. It delegates all Postman mechanics back to this skill's reference files.

## Mode: `env`

Creates a Postman environment from `.env` variables. See [variables-and-environments.md](variables-and-environments.md) §3.

| Profile | Variables Included |
|---------|-------------------|
| `qa` | URLs (`BACK_URL`, `FRONT_URL`), credentials (`ADMIN`, `USER`), store config |
| `staging` | URLs (`VIRTO_START_BACK`, `VIRTO_START_FRONT`), same credentials |
| `full` | All variables from both profiles |

## Mode: `verify`

1. `getCollections({ workspace, name: "<filter>" })` → resolve the collection ID
2. `getCollection({ collectionId, model: "full" })` → fetch full payload
3. Run the audit checklist in [execution.md](execution.md) §2
4. Report findings: pass/fail per criterion, list of issues found

## Mode: `export`

1. `getCollections({ workspace })` → find the collection (capture its `uid`, format `<OWNER>-<UUID>`)
2. `getEnvironments({ workspace })` → find the matching environment (capture its `uid`)
3. Output Newman/Postman-CLI run commands using those IDs (see [execution.md](execution.md) §3)
4. Note: actual collection/environment JSON files must be exported manually from the Postman UI — there is no MCP tool that emits a Postman v2.1.0 export bundle

## Mode: `list`

`getCollections({ workspace })` + `getEnvironments({ workspace })`. Quick inventory check.

## Mode: `examples`

Read and output [examples.md](examples.md).

---

## Agents

| Agent | Role |
|-------|------|
| `qa-backend-expert` | Primary — authors API/GraphQL collections, then hands them off to Newman/Postman CLI for execution |
| `qa-testing-expert` | Uses collections for interactive debugging |
| `test-management-specialist` | References collections for test planning |

---

## Rules

- **NEVER hardcode URLs** — always use `{{baseUrl}}`, `{{frontUrl}}` from environment variables
- **NEVER hardcode IDs/SKUs/emails/prices/order-numbers/paths** — resolve via [test-data-fixtures.md](test-data-fixtures.md) (`@td()` + `aliases.json`) or seed via API
- **NEVER put credentials in collection variables** — use environment variables with `type: secret`
- **NEVER hardcode passwords in agent prompts** — agents read `process.env` at runtime (populated by `config.js` from `.env.${TEST_ENV}` + `.env.local`; default `TEST_ENV=vcst`)
- **ALWAYS include the auth request first** — every collection starts with OAuth2 token acquisition
- **ALWAYS validate status codes** in test scripts — don't assume 200
- **ALWAYS verify GraphQL field names** against [`graphql-schema.md`](../../knowledge/api/graphql-schema.md) before authoring
- **A GraphQL body is `mode: "graphql"`, NEVER `mode: "raw"`** — `body.graphql.query` + `body.graphql.variables` (variables as their own JSON string). Postman then treats the query and its variables as first-class (schema autocomplete, a real variables pane) instead of one opaque blob, and a variable change no longer means editing a hand-embedded JSON string. This is stated in [`graphql-authoring.md`](graphql-authoring.md) §3 and is repeated here because that file is read *on demand* while this list is read every time — the rule was missed on VCST-5933 for exactly that reason. Only a genuine REST JSON body stays `raw`.
- **ALWAYS use `pm.collectionVariables.set()`** for entity IDs from chained requests
- **ALWAYS use `pm.environment.get()`** for credentials and URLs
- **NEVER leave an edited collection only on disk — PUSH it, then VERIFY it. Do not skip either half.**
  Every change to a collection goes back to the workspace with `putCollection` **in the same turn as the
  edit**, and is then read back with `getCollection model: "full"` and checked for *the specific fields you
  changed*. Two reasons, both measured on VCST-5933:
  - **A `200` from `putCollection` is not proof the content is right.** It returned 200 on a payload whose
    own description still pointed at the pre-restructure request numbers ("request 6 is the defect" when it
    was 8) — persisted, and wrong.
  - **`model: "minimal"` cannot confirm a body change** — it returns metadata and item ids only, no bodies.
    Verifying a `raw` → `graphql` conversion with `minimal` proves nothing; it needs `full`.
  When a local mirror exists (`test-data/postman/*.json`), **regenerate it in the same turn** so the two
  never diverge. A divergence is invisible until someone runs the stale one and reports a result that does
  not match the ticket.
- **A client cache is not a failed push.** If the operator says they still see the old collection, re-read it
  with `getCollection model: "full"` and report the `updatedAt` + the changed fields before re-pushing —
  Postman's desktop/web app does not live-refresh a collection edited through the API, and a blind re-push
  hides whether the first one worked.
- **Schema is required** — `info.schema` must be `"https://schema.getpostman.com/json/collection/v2.1.0/collection.json"`
- **Collection name cannot be empty** — `info.name` minLength is 1
- **Workspace ID is required** for create operations — default `8bd7a5b3-73e5-4414-a9c9-d59018b44079` (VirtoPlatform)
- **`runCollection` is advertised but not served** — no endpoint registers it, so execute via Newman (default), Postman CLI, the Postman UI, or a Monitor on the full endpoint. Diagnose any "listed but uncallable" tool against `currentServerTools` ([mcp-tools.md](mcp-tools.md) §1a)
- **Collection ID format depends on the tool** — owner-qualified `<OWNER>-<UUID>` for `getCollection`/`putCollection`/`duplicateCollection`; bare UUID for `createCollectionRequest`/`updateCollectionRequest`
- **`getCollection` returns a collection map by default** — pass `model: "full"` to get the complete v2.1.0 payload
