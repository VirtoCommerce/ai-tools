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

**This is the ONE step that requires `browser_evaluate` with `execCommand`.** All other steps use real-user interaction.

Why: The JWT token is ~1800 characters. `browser_fill()` writes to the textarea but GraphiQL's React state doesn't pick it up — queries execute as Anonymous. `browser_click` on CodeMirror textbox times out (overlay intercepts). `Ctrl+V` paste is blocked in automation. Only `execCommand('insertText')` on the focused textarea triggers the proper CodeMirror input event that syncs with GraphiQL's state.

```js
// Step A: Get token (via browser_evaluate — only fetch() call allowed)
const resp = await fetch('${BACK_URL}/connect/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'grant_type=password&scope=offline_access&username=${USER}&password=${PASS}&storeId=${STORE}'
});
const { access_token } = await resp.json();

// Step B: Click Headers tab (via browser_evaluate — button click)
document.querySelector('button[data-name="headers"]').click();

// Step C: Set token in Headers editor (insertText triggers proper CodeMirror sync)
const headerSection = document.querySelector('section[aria-label="Headers"]');
const textarea = headerSection.querySelector('textarea');
textarea.focus();
textarea.select();
document.execCommand('insertText', false,
  JSON.stringify({"Authorization": "Bearer " + access_token}));
```

After setting: take a screenshot to verify the token is visible in the Headers panel (not Variables). Then execute a protected query (e.g., `{ me { id } }`) to confirm auth works — response should NOT say "Anonymous".

### 3. Set Query in Editor

**Use one of these real-user approaches (NO `CodeMirror.setValue()`):**

**Approach A — New tab (recommended for clean state):**
1. Click "Add tab" button (+) → opens clean empty editor
2. `browser_type` on the Query Editor textbox ref with the query text
3. Playwright uses `fill()` which works on empty CodeMirror

**Approach B — Clear existing editor:**
1. `browser_type` on the Query Editor textbox ref — Playwright's `fill()` replaces textarea content
2. ⚠️ CodeMirror display may show old + new content concatenated
3. If this happens: open a new tab instead (Approach A)

**Approach C — Keyboard interaction:**
1. Click somewhere in the query editor area (use the section ref, not the textarea)
2. `browser_press_key: "Control+A"` then `"Backspace"` to clear
3. `browser_type` or `browser_press_key` to type the query character by character

### 4. Execute

Press `Ctrl+Enter` via `browser_press_key: "Control+Enter"` — this is real keyboard interaction.

Or click the Execute button (▶) via `browser_click` on the play icon button ref.

### 5. Read the Response

Use `browser_snapshot` to read the response panel content. The result appears in `region "Result Window"` with collapsible JSON nodes.

For exact JSON extraction, use `browser_evaluate`:
```js
document.querySelector('.result-window .CodeMirror').CodeMirror.getValue()
```

### 6. Set Variables (if needed)

Click the **"Variables"** tab, then use `browser_type` on the Variables textbox ref.

### 7. Schema Explorer

Click "Docs" (📖) in the top-right to open the schema explorer sidebar.

---

## CodeMirror Behavior Summary (verified 2026-03-30)

| Action | Method | Works? | Notes |
|--------|--------|--------|-------|
| **Set auth in Headers** | `execCommand('insertText')` | ✅ Yes | Only reliable method — syncs with React state |
| **Set auth in Headers** | `browser_fill()` | ❌ Visual only | Token appears but queries run as Anonymous |
| **Set auth in Headers** | `CodeMirror.setValue()` | ❌ No | Doesn't update React state |
| **Set auth in Headers** | `browser_click` + type | ❌ Timeout | CodeMirror overlay intercepts click |
| **Set auth in Headers** | `Ctrl+V` paste | ❌ No | Clipboard blocked in automation |
| **Type query (new tab)** | `browser_type` / `fill()` | ✅ Yes | Works on empty editor after "Add tab" |
| **Type query (existing)** | `browser_type` / `fill()` | ⚠️ May append | CodeMirror display may concatenate old+new |
| **Clear query editor** | `Ctrl+A` + `Backspace` | ✅ Yes | Real keyboard interaction |
| **Execute query** | `Ctrl+Enter` | ✅ Yes | Real keyboard interaction |
| **Read response** | `browser_snapshot` | ✅ Yes | Reads from accessibility tree |

## Common Pitfalls

- **Headers vs Variables tab confusion** — The bottom panel has two tabs side by side: **Variables** (left, default/visible) and **Headers** (right). Auth tokens MUST go in the **Headers** tab. After setting the token, take a screenshot and verify the token text appears in the Headers panel, not Variables.
- **`browser_fill` on Headers looks correct but doesn't authenticate** — The token appears visually but GraphiQL doesn't send it as an HTTP header. Use `execCommand('insertText')` instead.
- **Query editor append problem** — `fill()` on an existing editor may concatenate old+new content. Always open a new tab first, or use `Ctrl+A` + `Backspace` to clear.
- **Wrong element focused** — If the editor appears empty after typing, verify focus with `browser_snapshot` first.
- **Long/multiline queries** — Use Approach A (new tab + fill) for best results. Avoid typing character by character for queries longer than ~200 chars.
- **Multiple CodeMirror instances** — GraphiQL has separate instances for query editor, variables editor, headers editor, and response panel — always target the correct one via `section[aria-label="..."]`.
