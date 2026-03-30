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

This step has **two parts**: clicking the Headers tab (real-user `browser_click`) and inserting the token (`browser_evaluate` with `execCommand` — the ONLY JavaScript allowed in the entire workflow).

Why `execCommand` for the token only: The JWT is ~1800 characters. `browser_fill` writes to the textarea but GraphiQL's React state doesn't pick it up — queries execute as Anonymous. `browser_type` on the CodeMirror textarea times out (overlay intercepts). Only `execCommand('insertText')` on the focused textarea triggers the CodeMirror input event that syncs with React state.

**Step A — Get token** (via `browser_evaluate` — only `fetch()` call allowed):
```js
const resp = await fetch('${BACK_URL}/connect/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'grant_type=password&scope=offline_access&username=${USER}&password=${PASS}&storeId=${STORE}'
});
const { access_token } = await resp.json();
return access_token;
```

**Step B — Click Headers tab** (real-user interaction):
`browser_click` on the **"Headers"** tab button in the bottom panel. Do NOT use `browser_evaluate` to click — use the MCP click tool like a real user.

**Step C — Insert token into Headers editor** (via `browser_evaluate` with `execCommand`):
```js
const headerSection = document.querySelector('section[aria-label="Headers"]');
const textarea = headerSection.querySelector('textarea');
textarea.focus();
textarea.select();
document.execCommand('insertText', false,
  JSON.stringify({"Authorization": "Bearer " + access_token}));
```

**Step D — Verify** (real-user interaction):
Take a screenshot to verify the token is visible in the Headers panel (not Variables). Then execute a protected query (e.g., `{ me { id } }`) to confirm auth works — response should NOT say "Anonymous".

### 3. Set Query in Editor

**Use one of these real-user approaches (NO `CodeMirror.setValue()`):**

**Approach A — New tab + type (recommended for clean state):**
1. `browser_click` on the "Add tab" button (+) → opens clean empty editor
2. `browser_click` on the query editor area to focus it
3. `browser_type` to type the query text — this simulates real keystrokes into the empty editor

**Approach B — Clear + type (use when staying in same tab):**
1. `browser_click` on the query editor area to focus it
2. `browser_press_key: "Control+A"` then `"Backspace"` to clear all existing content
3. `browser_type` to type the new query text
4. ⚠️ If the editor still shows old content after clear, use Approach A instead

**Important:** Always use `browser_click` to focus, `browser_type` to enter text, and `browser_press_key` for keyboard shortcuts. Never use `browser_evaluate` or `browser_fill` to set query content — interact like a real user.

### 4. Execute

Press `Ctrl+Enter` via `browser_press_key: "Control+Enter"` — this is real keyboard interaction.

Or click the Execute button (▶) via `browser_click` on the play icon button ref.

### 5. Read the Response

Use `browser_snapshot` to read the response panel content. The result appears in `region "Result Window"` with collapsible JSON nodes.

**Do NOT use `browser_evaluate` to extract response JSON.** Read the response from the accessibility tree via `browser_snapshot` like a real user reading the screen. If the response is truncated or collapsed, scroll or click to expand nodes.

### 6. Set Variables (if needed)

`browser_click` on the **"Variables"** tab, then `browser_click` on the Variables editor to focus, then `browser_type` to enter the JSON variables.

### 7. Schema Explorer

`browser_click` on "Docs" (📖) in the top-right to open the schema explorer sidebar.

---

## CodeMirror Behavior Summary (verified 2026-03-30)

| Action | Method | Works? | Notes |
|--------|--------|--------|-------|
| **Click Headers tab** | `browser_click` | ✅ Yes | Real-user click on tab button |
| **Set auth token** | `execCommand('insertText')` via `browser_evaluate` | ✅ Yes | ONLY `browser_evaluate` allowed in entire workflow — syncs with React state |
| **Set auth token** | `browser_fill` | ❌ Visual only | Token appears but queries run as Anonymous |
| **Set auth token** | `browser_type` | ❌ Timeout | CodeMirror overlay intercepts |
| **Type query (new tab)** | `browser_click` (+) → `browser_type` | ✅ Yes | Click to add tab, click editor, type query |
| **Type query (existing)** | `Ctrl+A` + `Backspace` → `browser_type` | ✅ Yes | Clear first, then type |
| **Type query (existing)** | `browser_type` without clearing | ⚠️ May append | CodeMirror may concatenate old+new |
| **Execute query** | `browser_press_key: "Control+Enter"` | ✅ Yes | Real keyboard interaction |
| **Execute query** | `browser_click` on ▶ button | ✅ Yes | Real-user click |
| **Read response** | `browser_snapshot` | ✅ Yes | Reads from accessibility tree — the ONLY way to read responses |
| **Read response** | `browser_evaluate` (`.CodeMirror.getValue()`) | ❌ Forbidden | Violates real-user interaction rule |

## Common Pitfalls

- **Headers vs Variables tab confusion** — The bottom panel has two tabs side by side: **Variables** (left, default/visible) and **Headers** (right). Auth tokens MUST go in the **Headers** tab. After setting the token, take a screenshot and verify the token text appears in the Headers panel, not Variables.
- **`browser_fill` on Headers looks correct but doesn't authenticate** — The token appears visually but GraphiQL doesn't send it as an HTTP header. Use `execCommand('insertText')` via `browser_evaluate` instead — this is the ONLY permitted use of `browser_evaluate` in the workflow.
- **Never use `browser_evaluate` for anything except auth token insertion** — Reading responses, clicking buttons, typing queries, navigating — all must use real-user tools (`browser_click`, `browser_type`, `browser_press_key`, `browser_snapshot`).
- **Query editor append problem** — `browser_type` on an existing editor may concatenate old+new content. Always open a new tab first (`browser_click` on +), or use `Ctrl+A` + `Backspace` to clear.
- **Wrong element focused** — If the editor appears empty after typing, use `browser_snapshot` to check focus, then `browser_click` on the editor area before typing.
- **Long/multiline queries** — Use Approach A (new tab + `browser_type`) for best results.
- **Multiple CodeMirror instances** — GraphiQL has separate instances for query editor, variables editor, headers editor, and response panel — always `browser_click` to focus the correct one before typing.
