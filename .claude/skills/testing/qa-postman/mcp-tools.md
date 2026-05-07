# Postman MCP — Tools, Workspace, and ID Formats

Reference for the tool surface exposed by the Postman MCP server. Read this first — every other reference file assumes you know what's available.

> **The Postman MCP authors and manages collections; it does NOT execute them.** There is no `runCollection` tool. Execution is done out-of-band via Newman, the Postman CLI, Postman Monitors (`createMonitor` — full toolset only), or the Postman desktop/web Runner. See [execution.md](execution.md).

---

## 1. Tool Inventory

The Postman MCP runs in `minimal` mode (40 tools) by default. Call `getEnabledTools` first if a tool seems unavailable — it shows what's exposed in the current session and what's available in the `full` set (116 tools).

### Tools available in the `minimal` set (default)

| Tool | Purpose | Required Parameters |
|------|---------|-------------------|
| `getEnabledTools` | List currently enabled tools (call first when unsure) | — |
| `getAuthenticatedUser` | Resolve current user info (`user.id`, `teamId`) — needed for "my X" queries | — |
| `getWorkspaces` | List workspaces (get workspace ID) | — |
| `getWorkspace` | Get a single workspace's detail | `workspaceId` |
| `getCollections` | List collections in a workspace; supports `name` substring filter | `workspace` |
| `getCollection` | Get a collection. **Default returns lightweight collection map** (metadata + recursive itemRefs). Pass `model: "full"` for the full v2.1.0 payload, or `model: "minimal"` for root-level IDs only | `collectionId` (owner-qualified UID) |
| `getEnvironments` | List environments (workspace param optional) | — |
| `getEnvironment` | Get environment detail with variables | `environmentId` |
| `createEnvironment` | Create environment with variables | `workspace`, `environment.name`, `environment.values[]` |
| `createCollection` | Create a full collection (folders + requests) | `workspace`, `collection.info`, `collection.item[]` |
| `createCollectionRequest` | Add a single request to an existing collection | `collectionId` (bare UUID) |
| `createCollectionResponse` | Save an example response on an existing request | `collectionId`, `requestId`, response body |
| `updateCollectionRequest` | PATCH-style update of a single request | `collectionId` (**bare UUID**), `requestId` |
| `putCollection` | Replace the contents of a collection | `collectionId` (**owner-qualified UID**), full collection |
| `putEnvironment` | Replace an environment | `environmentId`, full environment |
| `duplicateCollection` | Clone an existing collection (async; check `getDuplicateCollectionTaskStatus`) | `collectionId`, target `workspace` |
| `generateCollection` | Generate a collection from an OpenAPI/spec definition | `specId`, target `workspace` |

### Useful tools available only in the `full` set

| Tool | Purpose |
|------|---------|
| `deleteCollection`, `deleteEnvironment` | Hard-delete |
| `patchCollection` | Partial update (vs full `putCollection`) |
| `createCollectionFolder`, `updateCollectionFolder`, `deleteCollectionFolder` | Folder CRUD |
| `getCollectionRequest`, `getCollectionFolder` | Read individual requests/folders |
| `createMonitor`, `runMonitor` | Schedule and trigger collection runs |
| `searchPostmanElementsInPrivateNetwork`, `searchPostmanElementsInPublicNetwork` | Discovery search across workspaces |
| `getTaggedEntities` | Find collections by tag |
| `getCollectionTags`, `updateCollectionTags` | Tag management |

---

## 2. Prerequisite: Get the Workspace ID

**Every session must start here.** You cannot create collections or environments without a workspace ID.

**Default for this project:** the `VirtoPlatform` team workspace — `8bd7a5b3-73e5-4414-a9c9-d59018b44079`.

To verify or list alternatives:

```
Call: getWorkspaces({ type: "team", limit: 20 })
Response (relevant rows):
  | id                                   | name           | type | visibility |
  | 8bd7a5b3-73e5-4414-a9c9-d59018b44079 | VirtoPlatform  | team | team       |
  | 111bc60d-...                         | Team Workspace | team | team       |
  | 9c004fb5-...                         | BGS workspace  | team | team       |
```

If the user hasn't specified, default to `VirtoPlatform`. Ask the user to confirm only when an action is destructive (`putCollection`, `deleteCollection`, etc.).

**Store the workspace ID** — you'll pass it to `createCollection`, `createEnvironment`, `getCollections`.

---

## 3. Collection ID Formats

Postman exposes two ID forms — picking the wrong one for a tool returns 404 or a confusing error.

| Tool | Required form | Example |
|------|---------------|---------|
| `getCollection`, `putCollection`, `duplicateCollection` | Owner-qualified `<OWNER_ID>-<UUID>` | `12345-33823532ab9e41c9b6fd12d0fd459b8b` |
| `createCollectionRequest`, `updateCollectionRequest`, `createCollectionResponse` | Bare UUID | `33823532-ab9e-41c9-b6fd-12d0fd459b8b` |

`getCollections` returns both: `id` (bare UUID) and `uid` (owner-qualified). When in doubt, log the response of `getCollections` and pick the matching shape for your next call.

---

## 4. Reading a Collection

`getCollection` returns three response shapes via the `model` parameter:

| `model` value | Returns | Use when |
|---------------|---------|----------|
| _(omitted, default)_ | Lightweight collection map: metadata + recursive `itemRefs` | Quick navigation, ID resolution |
| `minimal` | Root-level folder/request IDs only | Listing folders without bodies |
| `full` | Complete v2.1.0 payload (request bodies, headers, scripts) | Audits, exports, any logic that reads request content |

**Always pass `model: "full"`** when verifying a collection or extracting it for execution.

---

## 5. Postman API Key

The `POSTMAN_API_KEY` from `.env` is consumed by the MCP server itself for authentication — agents do NOT pass it in tool calls. The MCP server handles this transparently.

For Postman CLI execution (out-of-band, see [execution.md](execution.md)) you'll need the same key:

```bash
postman login --with-api-key <POSTMAN_API_KEY>
```
