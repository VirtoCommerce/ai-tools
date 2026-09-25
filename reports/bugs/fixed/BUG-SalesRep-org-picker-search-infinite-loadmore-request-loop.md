# Sales Rep "Served organizations" picker: searching starts an infinite `organizations/search` request loop and the result set is capped at 20 — P1 — VCST-6028

## Status: CONFIRMED
**Status: FIXED**

**Tracker:** [VCST-6028](https://virtocommerce.atlassian.net/browse/VCST-6028)

**Env:** virtostart (staging) @ Platform `3.1071.0`, `VirtoCommerce.SalesRep` `3.1008.0`, `VirtoCommerce.Customer` `3.1025.0`, `@vc-shell/framework ^2.0.7`
**Surface:** Admin → embedded app `vc-sales-rep` → Sales Reps → \<rep\> → **Served organizations → "Organizations served as Sales Rep"**
**Browser:** Edge 153 (Playwright MCP), 1920×1080
**Reproducibility:** 1/1 on the character-by-character typing path (reporter's session + this run)

## Summary

Typing a search term into the Sales Rep organization picker leaves the component in a state where the
rendered option list never grows past the **first 20 results** while the framework keeps firing
`POST /api/organizations/search` **forever** with a frozen `skip`. Measured in this run: **966 requests in
~3 minutes (~5 req/s)**, all identical (`skip: 39, keyword: "AGENT"`), until the dropdown was closed.
The UI shows a permanent "Loading more…" spinner and **23 of the 43 matching organizations are unreachable**
— they cannot be selected at all.

Two distinct impacts:
1. **Functional** — an admin cannot assign an organization whose name does not land in the first 20 search hits.
2. **Load** — every open picker with an active search is a sustained request generator against the Platform
   API. Nothing in the UI tells the operator; there are **zero console errors**.

## STR

1. Sign in to the Admin as an administrator.
2. Open `{BACK_URL}/apps/vc-sales-rep` (or Admin → apps → Sales Reps) → **Sales Reps** → open any rep
   (used: *Alla Volkova*).
3. In the **Served organizations** card, click the **"Organizations served as Sales Rep"** dropdown toggle.
4. Type a term **character by character** that matches **more than 20** organizations — e.g. `AGENT`
   (43 matches on this environment).
5. Scroll the option list to the bottom (mouse wheel, the list's hover-scroll arrow, or ↓ to the last option).
6. Watch the network panel and the bottom of the list.

## Expected vs Actual

- **Expected:** reaching the bottom loads the next page of matches (`skip: 20`, then `40`) until all 43
  matching organizations are listed and selectable; paging then stops.
- **Actual:** the list stays at **20 options**, a **"Loading more…"** spinner is permanently shown, and the app
  issues `POST /api/organizations/search` in a tight loop with a **frozen `skip: 39`** — 966 requests recorded
  before the dropdown was closed. The remaining 23 matches are never rendered and cannot be selected.
  Closing the dropdown is the only thing that stops the loop. No console error is logged.

**Without a search term the same picker pages correctly** — `skip` advances `0 → 20 → … → 87`, the list grows,
and paging converges on `totalCount = 152`. The defect is specific to an **active search filter whose match
count exceeds the page size (20)**.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A | back-office-only surface |
| 2. Backend Admin (embedded `vc-sales-rep` Vue app) | **FAIL** | screenshots below; DOM node `Loading more...` present in the listbox after the last option |
| 3. GraphQL xAPI | N/A | picker uses Platform REST, not xAPI |
| 4. Platform REST API | PASS | every `POST /api/organizations/search` returned `200`; `{"memberType":"Organization","take":20,"skip":0,"keyword":"AGENT"}` → `totalCount: 43` with 20 correct results. `skip`/`take`/`keyword` semantics are correct. |

**Owning layer:** Layer 2 — the client component. The API is blameless.

## Root Cause Analysis

`@vc-shell/framework` → [`framework/ui/components/molecules/vc-select/composables/useSelectDataSource.ts`](https://github.com/VirtoCommerce/vc-shell/blob/main/framework/ui/components/molecules/vc-select/composables/useSelectDataSource.ts)

The composable keeps **two** result stores and mixes them:

```ts
const displayItems = computed(() => searchResults.value ?? cachedItems.value);   // L32-34
const hasMore      = computed(() => cachedItems.value.length < totalCount.value); // L36-38
```

- `open()` (L50-78) fills **`cachedItems`** (unfiltered page 1) and sets `totalCount`.
- `executeSearch()` (L112-136) writes results to **`searchResults`** and **overwrites `totalCount`** with the
  *filtered* total — it never touches `cachedItems`.
- `loadMore()` (L89-108) pages off **`cachedItems.length`** and appends **deduplicated** results back into
  `cachedItems` (L96-100).

So while a search is active, `hasMore` compares an **unfiltered** cache length against a **filtered**
`totalCount`, and the newly fetched items land in `cachedItems` — which is *not* what is rendered
(`displayItems` returns `searchResults`). Consequences:

1. The rendered list never changes → the intersection-observer sentinel
   ([`vc-select.vue` L456-464](https://github.com/VirtoCommerce/vc-shell/blob/main/framework/ui/components/molecules/vc-select/vc-select.vue#L456-L464),
   target in [`_internal/SelectDropdown.vue` L92-97](https://github.com/VirtoCommerce/vc-shell/blob/main/framework/ui/components/molecules/vc-select/_internal/SelectDropdown.vue#L92-L97))
   stays in view and re-fires `loadMore()` on every cycle.
2. Because `loadMore()` dedupes, `cachedItems.length` **stalls** (observed: 39) below `totalCount` (43), so
   `hasMore` is permanently `true` and `skip` never advances → unbounded loop.

Aggravating factor: the picker is mounted with no `debounce`
([`sales-rep-details.vue` L76-87](https://github.com/VirtoCommerce/vc-module-sales-rep/blob/dev/src/VirtoCommerce.SalesRep.Web/App/src/modules/vc-sales-rep/pages/sales-rep-details.vue#L76-L87)),
so each keystroke fires its own `executeSearch` (5 requests for `AGENT`); those race with the in-flight
`open()` call, and whichever resolves last decides `totalCount` — which is how the two stores get out of sync.

The module's own loader is correct and supports paging
([`useOrganizations/index.ts`](https://github.com/VirtoCommerce/vc-module-sales-rep/blob/dev/src/VirtoCommerce.SalesRep.Web/App/src/modules/vc-sales-rep/composables/useOrganizations/index.ts)) —
nothing in `vc-module-sales-rep` needs to change for the loop itself.

## Evidence

Search `AGENT` applied — 20 options rendered, API reported `totalCount: 43`:

![Search AGENT applied](../../screenshots/SalesRep-Org-Picker-Infinite-LoadMore-Loop/01-search-AGENT-43-matches.png)

Keyboard-walked to the last option — item 20 (`AGENT-TEST-Org-AcmeCorp`) is the end of the list:

![Last option is item 20](../../screenshots/SalesRep-Org-Picker-Infinite-LoadMore-Loop/02-last-option-item-20.png)

Mouse-scrolled to the absolute bottom (scroll-down affordance gone) — still 20 options, nothing loaded:

![Scrolled to bottom, still 20](../../screenshots/SalesRep-Org-Picker-Infinite-LoadMore-Loop/03-scrolled-to-bottom-list-ends-at-20.png)

Control run — **no** search term, same picker: the list pages past 20 and reaches item 21+:

![Control run without search](../../screenshots/SalesRep-Org-Picker-Infinite-LoadMore-Loop/04-control-no-search-pages-past-20.png)

Accessibility tree at the bottom of the open listbox (20 `option` nodes, then):

```
- option "AGENT-TEST-Org-AcmeCorp" [active] [selected]
- generic:
  - img
  - generic: Loading more...
```

Network (Playwright MCP capture, same session):

| | Request body | Count |
|---|---|---|
| Picker opened | `{"memberType":"Organization","take":20,"skip":0}` → `totalCount: 152` | 1 |
| Typing `AGENT` (per keystroke, no debounce) | `…,"keyword":"A"` … `…,"keyword":"AGENT"` → `totalCount: 43` | 5 |
| After reaching the bottom | `{"memberType":"Organization","take":20,"skip":39,"keyword":"AGENT"}` — **identical, repeated** | **~960** |
| After closing the dropdown | — | 0 (count frozen at 966) |

Control run, no search term: `skip` advanced `0 → 20 → … → 87` over 7 requests, list grew past 20, loop absent.

HAR: `test-results/edge/har/session.har` · Console: **0 errors, 0 warnings** (silent failure).

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 2 — Admin (embedded Vue 3 app), but the defect is in its framework dependency
- **Suggested repo:** `VirtoCommerce/vc-shell` (`@vc-shell/framework`) — **not** `vc-module-sales-rep`
- **repoKind:** *(none of `module` / `platform` / `frontend` applies)* — `vc-shell` is a separate product repo
- **Ownership hint:** platform (VirtoCommerce-owned; no client fork involved)
- **Component / module:** `@vc-shell/framework` → `VcSelect` async data source
- **RCA anchor:** `framework/ui/components/molecules/vc-select/composables/useSelectDataSource.ts`
  L32-38 (`displayItems` / `hasMore`), L89-108 (`loadMore`), L112-136 (`executeSearch`);
  sentinel wiring `framework/ui/components/molecules/vc-select/vc-select.vue` L456-464
- **Routing confidence:** HIGH on the diagnosis · **BLOCKED for auto-fix** — `vc-shell` is outside
  `fix-repos.json` `allow` (`^vc-module(-x)?-…$` + explicit `vc-frontend` / `vc-platform`), so `/qa-fix`
  Gate 1 `isAllowedRepo()` will reject it. Route to the vc-shell team, or extend the allowlist first.

**Secondary, module-side (optional, `vc-module-sales-rep`):** adding a `debounce` to the picker in
`sales-rep-details.vue` removes the per-keystroke request storm and the `open()`/search race, which
mitigates — but does not fix — the loop. The framework fix is the real one.

## Suggested fix (framework)

Keep search paging in its own store, or reset the cache on search:
- `executeSearch()` should track a separate `searchTotalCount`, or clear `cachedItems` when a keyword is applied;
- `hasMore` must compare **the rendered collection's** length against the total that belongs to it
  (`displayItems.length < totalCount`);
- `loadMore()` must append into the collection that is rendered, and must page off a monotonic offset
  rather than a deduplicated length, so it cannot stall;
- as a belt-and-braces guard, stop paging when a `loadMore()` call adds zero new items.
