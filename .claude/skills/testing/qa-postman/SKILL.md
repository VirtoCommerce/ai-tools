---
description: "[Testing] Postman MCP collections — create, configure, and run collections with proper variables, auth, and endpoints"
argument-hint: "create <purpose> | env <profile> | run <collection> | list | examples"
---

# /qa-postman — Postman Collection Builder

Build and run Postman collections via Postman MCP with correct variable scoping, authentication, endpoint construction, and request chaining.

**Problem this solves:** Agents create broken Postman collections because they hardcode URLs, forget auth tokens, misuse variable scopes, or build requests with wrong body formats. This skill is the single source of truth for how to use Postman MCP tools correctly.

## Reference

Read **before** any Postman MCP operation: `./claude/skills/testing/qa-postman/postman-collection-guide.md`
- Postman MCP tool signatures and required parameters
- Variable scoping rules (environment vs collection vs local)
- .env → Postman environment variable mapping
- Authentication patterns (OAuth2 token flow)
- Request body formats (raw JSON, form-urlencoded, GraphQL)
- Request chaining with test scripts
- Common mistakes and how to avoid them

## Arguments

| Argument | Description |
|----------|-------------|
| `create <purpose>` | Create a new collection for a specific purpose (e.g., `create catalog CRUD`, `create auth testing`, `create order flow`) |
| `env <profile>` | Create a Postman environment from .env variables for a profile (`qa`, `staging`, `full`) |
| `run <collection>` | Run an existing collection by name — lists matching collections first |
| `list` | List all collections and environments in the workspace |
| `examples` | Show copy-paste-ready examples for common Postman MCP operations |

## Workflow

### Step 0 — Read the Guide
Read `./claude/skills/testing/qa-postman/postman-collection-guide.md`. This is **mandatory** before any Postman MCP tool call.

### Step 1 — Get Workspace ID
Every Postman MCP operation requires a workspace ID.

```
Use getWorkspaces to list available workspaces.
Pick the workspace named "VirtoPlatform" or ask the user.
Store the workspace ID — you'll need it for every subsequent call.
```

### Step 2 — Check Existing Resources
Before creating anything:
1. `getCollections(workspace: workspaceId)` — check if a similar collection exists
2. `getEnvironments(workspace: workspaceId)` — check if the target environment exists
3. Ask the user: reuse, update, or recreate?

### Step 3 — Create or Select Environment
Use `createEnvironment` with variables mapped from `.env`:

| Postman Variable | Source (.env) | Type |
|-----------------|---------------|------|
| `baseUrl` | `BACK_URL` | default |
| `frontUrl` | `FRONT_URL` | default |
| `storeId` | `STORE_ID` | default |
| `admin` | `ADMIN` | default |
| `adminPassword` | `ADMIN_PASSWORD` | secret |
| `userEmail` | `USER_EMAIL` | default |
| `userPassword` | `USER_PASSWORD` | secret |
| `cultureName` | `CULTURE_NAME` | default |
| `currencyCode` | `CURRENCY_CODE` | default |
| `authToken` | _(empty — set by auth request's test script)_ | secret |

**Rule:** Credentials go in environment variables (type: `secret`). Entity IDs from request chaining go in collection variables (scoped to the collection, isolated).

### Step 4 — Build the Collection
Use `createCollection` with the v2.1.0 schema. Every collection MUST include:

1. **Collection-level auth** — Bearer token using `{{authToken}}` variable
2. **Collection-level pre-request script** — (optional) common setup
3. **Collection variables** — for entity IDs extracted during execution (catalogId, productId, etc.)
4. **Folder structure** — logical grouping (Auth → Setup → Test → Verify → Cleanup)
5. **First request** — always the OAuth2 token request that sets `{{authToken}}`

### Step 5 — Add Requests
Use `createCollectionRequest` for each request. Every request must have:
- **URL** using `{{baseUrl}}` prefix (never hardcoded)
- **Headers** with `Content-Type: application/json` and `Authorization: Bearer {{authToken}}`
- **Test script** that validates status code and extracts IDs into collection variables
- **Pre-request script** if the request needs dynamic data

### Step 6 — Run the Collection
Use `runCollection` with:
- `collectionId` — the full owner-qualified ID (format: `{ownerId}-{uuid}`)
- `environmentId` — the environment created in Step 3
- Review results: pass/fail per request, assertion results, response times

### Step 7 — Report Results
Output a summary of the run with pass/fail counts, failed assertions, and response times.

## Mode: `create`

Creates a purpose-built collection. The guide has ready-to-use patterns for:
- **Auth testing** — token lifecycle, refresh, invalid creds, RBAC
- **CRUD testing** — create/read/update/delete with chained entity IDs
- **GraphQL testing** — xAPI queries and mutations with error checking
- **Smoke testing** — lightweight health check across critical endpoints
- **Seed data** — entity creation with dependency ordering (defer to `/qa-seed-data` for full profiles)

## Mode: `env`

Creates a Postman environment from `.env` variables:

| Profile | Variables Included |
|---------|-------------------|
| `qa` | URLs (BACK_URL, FRONT_URL), credentials (ADMIN, USER), store config |
| `staging` | URLs (VIRTO_START_BACK, VIRTO_START_FRONT), same credentials |
| `full` | All variables from both qa and staging profiles |

## Mode: `run`

1. `getCollections(workspace)` → find the collection by name
2. `getEnvironments(workspace)` → find the matching environment
3. `runCollection(collectionId, environmentId)` → execute
4. Report results

## Mode: `list`

Lists all collections and environments in the workspace. Quick inventory check.

## Mode: `examples`

Read and output the "Quick-Copy Examples" section from `postman-collection-guide.md`.

## Agents

| Agent | Role |
|-------|------|
| `qa-backend-expert` | Primary — builds and runs API/GraphQL collections |
| `qa-testing-expert` | Uses collections for interactive debugging |
| `test-management-specialist` | References collections for test planning |

## Rules

- **NEVER hardcode URLs** — always use `{{baseUrl}}`, `{{frontUrl}}` from environment variables
- **NEVER put credentials in collection variables** — use environment variables with `type: secret`
- **ALWAYS include the auth request first** — every collection starts with OAuth2 token acquisition
- **ALWAYS validate status codes** in test scripts — don't assume 200
- **ALWAYS use `pm.collectionVariables.set()`** for entity IDs from chained requests
- **ALWAYS use `pm.environment.get()`** for credentials and URLs
- **Schema is required** — `info.schema` must be `"https://schema.getpostman.com/json/collection/v2.1.0/collection.json"`
- **Workspace ID is required** — every create/get operation needs it; get it from `getWorkspaces` first
- **Collection ID format** — `runCollection` requires the full `{ownerId}-{uuid}` format returned by `createCollection` or `getCollections`
