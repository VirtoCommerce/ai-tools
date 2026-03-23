# Bug Investigation Report: B2C-ORG-007

## Org Switcher Search Does Not Filter Dynamically While Typing

| Field | Value |
|-------|-------|
| **Bug ID** | B2C-ORG-007 |
| **Date** | 2026-03-23 |
| **Investigator** | qa-testing-expert (playwright-chrome) |
| **Environment** | https://vcst-qa-storefront.govirto.com |
| **Browser** | Chromium (playwright-chrome) |
| **Test Account** | mutykovaelena@gmail.com (multi-org, 30+ orgs) |
| **Severity** | Low (UX issue, not functional blocker) |
| **Classification** | Confirmed bug -- missing debounced search-on-type handler |

---

## 1. Summary

The organization switcher search input in the account menu dropdown does not filter the organization list dynamically as the user types. Filtering only occurs when the user explicitly clicks the search icon button or presses Enter. This is a UX friction point for users with many organizations (30+), as they must perform an extra action (click/Enter) to see results.

---

## 2. Steps to Reproduce

1. Log in with a multi-org account (mutykovaelena@gmail.com / Password2!)
2. Click the Account menu button in the top header ("Bence and Family / Elena Mutykova")
3. The dropdown opens showing "Organizations" label, a search input, and a scrollable list of 30 organizations
4. Click on the search input field to focus it
5. Type "cof" character by character

**Expected:** The organization list should filter progressively as each character is typed, narrowing results in real-time (e.g., after "cof", only "Coffee shop" and any other matching orgs should be visible).

**Actual:** All 30 organizations remain visible and unfiltered after typing "cof". No filtering occurs until the user clicks the search icon button or presses Enter.

---

## 3. Investigation Evidence

### 3.1 Before Typing

- Account menu opened, showing 30 organizations in alphabetical order
- Search input empty, all orgs visible
- Screenshot: `org-switcher-initial-state.png`

### 3.2 After Typing "cof" (No Filtering)

- Search input contains "cof"
- DOM inspection confirms: **30 items total, 30 visible, 0 hidden**
- The list is completely unfiltered despite text being entered
- Screenshot: `org-switcher-after-typing-cof.png`

### 3.3 After Clicking Search Button (Filtering Works)

- Clicked the search icon button (magnifying glass) next to the input
- List immediately filters to 2 results: "Bence and Family" (currently selected) and "Coffee shop"
- Screenshot: `org-switcher-after-click-search.png`

### 3.4 Enter Key Behavior

- Cleared search, re-typed "cof", pressed Enter
- List filters correctly to "Bence and Family" and "Coffee shop"
- Enter key triggers the same `onSearch()` function as the button click

### 3.5 Console & Network

- No JavaScript errors related to the org search component
- Only unrelated error: `404 /assets/presets/jensen.json` (known)
- No network requests fired during typing -- confirming no search API calls are made on keystroke

---

## 4. Root Cause Analysis

### Source Code Examined

| File | Repository | Path |
|------|-----------|------|
| Component | VirtoCommerce/vc-frontend | `client-app/shared/layout/components/header/_internal/top-header-organizations.vue` |
| Composable | VirtoCommerce/vc-frontend | `client-app/shared/account/composables/useUserOrganizations.ts` |

### Event Handler Analysis

The `VcInput` component in the template has three relevant event bindings:

```html
<VcInput
  v-model="searchPhrase"
  @keydown.enter="onSearch"
  @input="onSearchInput"
  @clear="onSearchClear"
>
```

The `onSearchInput` handler is the key issue:

```typescript
async function onSearchInput(): Promise<void> {
  if (!searchPhrase.value.trim()) {
    await search();
  }
}
```

**This handler only triggers a search when the input is empty or whitespace.** It is designed to reset the list when the user clears the input manually (e.g., backspaces to empty). It explicitly does NOT call `search()` when the user types non-empty characters.

The `onSearch` handler (bound to Enter key and button click) always performs the search:

```typescript
async function onSearch(): Promise<void> {
  await search();
}
```

The `search()` function in `useUserOrganizations.ts` resets pagination and calls the GraphQL API:

```typescript
async function search(): Promise<void> {
  organizations.value = [];
  endCursor.value = undefined;
  hasNextPage.value = true;
  totalCount.value = 0;
  await loadOrganizations();
}
```

### Why This Happens

The search is **server-side** (GraphQL API call with `searchPhrase` parameter), not client-side filtering. The `onSearchInput` handler was intentionally written to NOT trigger server-side search on every keystroke -- likely to avoid excessive API calls. However, no debounced search was implemented as an alternative.

### Search Flow Summary

| Trigger | Handler | Calls `search()`? | Result |
|---------|---------|-------------------|--------|
| User types characters | `onSearchInput()` | NO (only if empty) | List unchanged |
| User clears to empty | `onSearchInput()` | YES | List resets to all |
| User presses Enter | `onSearch()` | YES | List filters |
| User clicks search icon | `onSearch()` | YES | List filters |
| User clicks clear (x) | `onSearchClear()` | YES (reset + search) | List resets to all |

---

## 5. Comparison with Other Search Inputs

The main product search in the header uses a different pattern -- it has autocomplete suggestions that appear dynamically as the user types (via debounced API calls). This establishes a platform-level UX expectation that search inputs should respond to typing, making the org switcher's behavior inconsistent.

---

## 6. Verdict: Bug or Intentional Design?

**This is a genuine UX bug, not intentional design.**

### Evidence it is a bug:

1. **The `@input` handler exists** -- `onSearchInput` is bound but does not perform search when non-empty text is typed. If search-on-submit was the intended pattern, the `@input` handler would be unnecessary.
2. **Inconsistency** -- The header product search filters dynamically. Users expect the same behavior from the org search.
3. **No visual affordance** -- There is no visible hint (e.g., "Press Enter to search" tooltip) telling users they must explicitly submit. The search icon button looks decorative, not actionable, at first glance.
4. **The `searchPhrase` is already a reactive `ref`** bound via `v-model` -- it updates on every keystroke. The infrastructure for debounced search is already in place.

### Why it was likely omitted (not malicious):

The search calls a server-side GraphQL API (`getOrganizations`). Calling it on every keystroke without debouncing would cause excessive API calls. The developer likely deferred implementing debounce and went with explicit search-on-submit as a quick solution.

---

## 7. Recommended Fix

Add a debounced search trigger to `onSearchInput` in `top-header-organizations.vue`:

```typescript
import { useDebounceFn } from "@vueuse/core";

const debouncedSearch = useDebounceFn(async () => {
  await search();
}, 300);

async function onSearchInput(): Promise<void> {
  if (!searchPhrase.value.trim()) {
    await search(); // Immediate reset when cleared
  } else {
    debouncedSearch(); // Debounced search while typing
  }
}
```

This would:
- Filter dynamically as the user types (300ms debounce prevents API flooding)
- Maintain the existing immediate-reset behavior when the input is cleared
- Use `@vueuse/core` which is already a project dependency (`createGlobalState` is used in the composable)

Alternative minimal fix (client-side): Since 30 orgs fits in a single page load, a `computed` filter on the already-loaded `organizations` array could provide instant client-side filtering without any API calls.

---

## 8. Impact Assessment

| Dimension | Impact |
|-----------|--------|
| **Functional** | Search works, just requires explicit trigger -- low severity |
| **UX** | Significant friction for users with 10+ orgs who expect type-to-filter -- medium UX impact |
| **Frequency** | Affects every multi-org user every time they switch orgs |
| **Workaround** | Type and press Enter, or type and click search icon |
| **Revenue** | No direct revenue impact -- org switching is an admin-level action |

**Final Severity:** Low (P3) -- UX improvement, not functional defect.

---

## 9. Evidence Files

| File | Description |
|------|-------------|
| `org-switcher-initial-state.png` | Account menu open, all 30 orgs visible, search empty |
| `org-switcher-after-typing-cof.png` | "cof" typed in search, list NOT filtered (30 visible) |
| `org-switcher-after-click-search.png` | After clicking search icon, list filtered to 2 results |

---

## 10. Source Code References

| File | URL |
|------|-----|
| top-header-organizations.vue | https://github.com/VirtoCommerce/vc-frontend/blob/dev/client-app/shared/layout/components/header/_internal/top-header-organizations.vue |
| useUserOrganizations.ts | https://github.com/VirtoCommerce/vc-frontend/blob/dev/client-app/shared/account/composables/useUserOrganizations.ts |
