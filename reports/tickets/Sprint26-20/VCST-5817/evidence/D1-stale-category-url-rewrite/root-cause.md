# D1: root cause (stale category URL rewrite)

**Verdict:** REPRODUCED on TEST (PR #2522 build) and on CONTROL (`3.0.0-alpha.2685`, no #2522). The provenance is **PRE-EXISTING**.
PR #2522 neither introduces this defect nor fixes it.
**Layer:** vc-frontend storefront, client-side only. The backend, the GraphQL contract and the router are not at fault.
**Source:** `VirtoCommerce/vc-frontend` branch `dev` @ `1850afa61dd2193eb620762db7e0e3b31e079f70` (category.vue was last changed on dev 2026-10-01).

## Mechanism
`client-app/shared/catalog/components/category.vue` (dev):
- **L743–784**: `watch(() => props.categoryId, async (categoryId) => { … }, { immediate: true })`
- **L767**: `data = await fetchCategory({ categoryId, maxLevel: 1, onlyActive: true, productFilter })`
- **L781**: `updateLocalizedUrl(data?.category?.slug);`. It runs unconditionally after the await. Nothing checks that the component
  is still mounted, that the watcher was not invalidated, or that the current route is still this category.
- **L851** `onBeforeUnmount` clears only the search scope. It does not cancel the in-flight fetch and it does not set a flag.

`client-app/core/composables/useLanguages.ts` (dev):
- **L293–315** `updateLocalizedUrl(permalink)` builds `${localePrefix}${basePath}/${permalink}${location.search}${location.hash}` and calls
  **L309** `history.replaceState(history.state, "", …)`. It reads the *current* `location.search`, which is why `/search?q=laser`
  becomes `/printers/multifunction-printers?q=laser`. It writes the URL behind vue-router's back: no navigation happens, no guard runs,
  and the router's current route stays `/cart` or `/search`.

Sequence: breadcrumb click → `GetSlugInfo` → category component mounts → `GetCategory` is sent → the user leaves (Cart, or search Enter)
→ the category component unmounts and the new page renders → `GetCategory` resolves → the orphaned watcher continuation calls
`updateLocalizedUrl` → `replaceState` overwrites the **current** history entry (which now belongs to `/cart` or `/search`) with the
category slug.

## PR #2522 relation
PR #2522 changes the watcher signature to `async (categoryId, _previous, onCleanup)` and registers `onCleanup(() => finishPreparing?.())`.
That cleanup only releases the search-scope "preparing" state. It does not set a cancelled flag that the code after the `await` checks,
so `updateLocalizedUrl` still fires after unmount. Identical behaviour on both builds confirms this.

## User impact
- The address bar shows a category while Cart or search results are on screen. A copy, share or bookmark of the URL gives a different page.
- **Reload** opens the category (Cart case), or a **category-scoped** search (9 results instead of the 19 on screen in the search case).
- **Back** appears to do nothing, because the `/cart` (or `/search`) entry was overwritten and the previous entry has the same category URL.
- No data loss, no checkout or payment impact, no console error. Reproduces in natural timing with no throttling. The window is the
  `GetCategory` latency (~0.4–0.55 s on vcst-qa) and is wider on slow networks or mobile.

## Fix direction (for /qa-fix, not applied)
Guard the post-await continuation in the `categoryId` watcher: use the `onCleanup` that #2522 already introduces to set `cancelled = true`
and return before `isCategoryNotFound`/`updateLocalizedUrl` when cancelled. Optionally also check that the current route still resolves
to this category before the call. Single repo, single file, low risk. A vitest can unmount the component while `fetchCategory` is
pending and assert that `history.replaceState` is not called.

## Severity recommendation
**Medium / P2.** The defect is functional (wrong URL and history state). It is easy to hit in real use (quick navigation away from a category
that is loading) and silent, and it misleads sharing, reload and Back. It is not P1, because no data is corrupted, it does not touch the
purchase flow, and it recovers on the next navigation.
