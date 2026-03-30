# GraphiQL Editor Interaction — `${BACK_URL}/ui/graphiql`

GraphiQL uses **CodeMirror** — a rich text editor, NOT a standard `<textarea>`. Standard `browser_fill` will silently fail or type into the wrong element.

## UI Layout

| Area | Location | Description |
|------|----------|-------------|
| Query editor | Left panel, top | CodeMirror with line numbers + syntax highlighting |
| Response panel | Right panel | Read-only CodeMirror, shows query results |
| Variables tab | Bottom panel, left tab | CodeMirror for JSON variables |
| Headers tab | Bottom panel, right tab | CodeMirror for request headers (auth goes here) |
| Execute button (▶) | Top-right, pink/magenta | Runs the current query |
| Prettify / Merge / Copy | Right sidebar icons | Toolbar actions |
| Docs (📖) | Top-right area | Opens schema explorer sidebar |

## Step-by-Step Workflow

### 1. Navigate

`browser_navigate` to `${BACK_URL}/ui/graphiql`. Wait for the editor to load.

### 2. Set Authorization Header

Click the **"Headers"** tab at the bottom panel. Clear the headers editor (same CodeMirror pattern as step 3), then type the authorization JSON:

```json
{ "Authorization": "Bearer <token>" }
```

Obtain the token first via OAuth2 password grant to `${BACK_URL}/connect/token` (see `api-auth.md`). Without a valid token, queries return 401.

### 3. Clear the Query Editor

Click inside the query editor panel (left side), then select all and delete:

```
browser_click on the query editor area (CSS: `.graphiql-editor .CodeMirror` or the first `.cm-content` element)
browser_press_key: "Control+A" then "Backspace"
```

### 4. Type Your Query

Use `browser_type` (NOT `browser_fill`) to type the GraphQL query into the focused CodeMirror editor:

```
browser_type: "{ cart { id items { id name quantity } } }"
```

### 5. Set Variables (if needed)

Click the **"Variables"** tab at the bottom panel, then repeat the click → select all → delete → type pattern for the variables JSON editor.

### 6. Execute

Click the **Execute (Play) button** (▶) or press `Ctrl+Enter`:

```
browser_click on the execute button (CSS: `.graphiql-toolbar button.execute-button` or `button[aria-label="Execute query"]`)
```

Alternative: `browser_press_key: "Control+Enter"` while the editor is focused.

### 7. Read the Response

The result appears in the right-side panel. Use `browser_snapshot` to read it, or use `browser_evaluate` to extract the response JSON programmatically:

```js
document.querySelector('.result-window .CodeMirror').CodeMirror.getValue()
```

### 8. Schema Explorer

Click "Docs" (📖) in the top-right to open the schema explorer sidebar for introspection.

## Setting Auth Token in Headers (Reliable Method)

The Headers editor is a CodeMirror instance. Standard `browser_fill`, `CodeMirror.setValue()`, and `Ctrl+V` paste all have issues with GraphiQL's React state. The **only reliable method** is:

1. Click the **"Headers"** button (RIGHT tab — not "Variables" which is LEFT/default)
2. Use `document.execCommand('insertText')` on the Headers textarea to set the full value:

```js
// Step 1: Fetch token
const resp = await fetch('{BACK_URL}/connect/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'grant_type=password&scope=offline_access&username={USER}&password={PASS}&storeId={STORE}'
});
const { access_token } = await resp.json();

// Step 2: Set in Headers editor (NOT Variables)
const headerSection = document.querySelector('section[aria-label="Headers"]');
const textarea = headerSection.querySelector('textarea');
textarea.focus();
textarea.select();
document.execCommand('insertText', false,
  JSON.stringify({"Authorization": "Bearer " + access_token}));
```

3. Take a screenshot to **verify** the token is visible in the Headers panel (not Variables)
4. Execute a protected query (e.g., `orders`) to confirm auth works

### Why other approaches fail

| Approach | Visual | GraphiQL state | Actually sends header |
|----------|--------|---------------|----------------------|
| `CodeMirror.setValue()` | ❌ Empty | ❌ Out of sync | ❌ No |
| `textarea.value = ...` | ❌ Empty | ❌ Out of sync | ❌ No |
| `browser_fill()` / `fill()` | ✅ Shows text | ⚠️ Partial | ⚠️ May truncate |
| `execCommand('insertText')` | ✅ Shows text | ✅ Synced | ✅ Yes |
| `Ctrl+V` paste | ❌ Clipboard blocked | ❌ N/A | ❌ No |

## Common Pitfalls

- **Headers vs Variables tab confusion** — The bottom panel has two tabs side by side: **Variables** (left, default/visible) and **Headers** (right). Auth tokens MUST go in the **Headers** tab. After setting the token, take a screenshot and verify the token text appears in the Headers panel, not Variables.
- **`browser_fill` does NOT work** — CodeMirror renders as `<div>` with contenteditable, not `<input>`/`<textarea>`
- **Wrong element focused** — If the editor appears empty after typing, verify focus with `browser_snapshot` first
- **Long/multiline queries** — Prefer `browser_evaluate` to set the editor value programmatically:
  ```js
  document.querySelector('.graphiql-editor .CodeMirror').CodeMirror.setValue(`{ cart { id } }`)
  ```
- **Multiple CodeMirror instances** — GraphiQL has separate instances for query editor, variables editor, headers editor, and response panel — always target the correct one
