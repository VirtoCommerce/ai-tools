# Root cause — GA-034: home products block sends no view_item_list on 3.1.0-pr-11

**Verdict: NOT_REPRODUCED as a product bug — class STALE_TEST.** Confidence HIGH.

## Discriminator (run first)
Next's own tracked list blocks on the same build push `view_item_list`: `/agent-test-ga4-product-lists` sent 5 events, one per `data-vc-track="product-list"` container, at scrollY 0 (evidence-index #2). The markup engine (dom-analytics, ported from vc-frontend #2543 by PR #11) works on vc-frontend-next.

## Why the home sends nothing
1. On vc-frontend-next, `/` always renders the built-in `demo-home` page: `matcher.vue` forces `internal: 0`, and `internal.vue` maps `/` to `demo-home.vue`. Page Builder home content (vc-frontend's "Daily Deals" products block) is never shown on this theme. Fork-only behaviour since a9f509b2 (2026-09-24), present on `dev` before PR #11.
2. "Popular with buyers" is `demo-home/popular-section.vue`: a hard-coded grid of `ProductCard`, built with no list container and no `analytics()` call. Per `rules.ts` a card outside a list container sends nothing, so 0 events is the designed result.
3. PR #11 does not touch `demo-home`. Its list-role scope (body §VCST-6017) covers category, PDP variations, bought together and recently browsed. The Next source does not mean the home section to be a tracked list.
4. VirtoOZ (StorefrontDeveloperGuide → Google Analytics Events) lists the view_item_list locations as the search dropdown, related products, variations, recently browsed, compare, catalog and lists. The home page is not on that list, so no documented requirement is broken.

## Alternatives ruled out
- **Markup-engine regression of the merge:** ruled out by #2 (tracked blocks fire on the same build).
- **Cache/stale HTML (KB-D9DF8E54):** ruled out. Both URLs were cache-busted and the footer build was confirmed.
- **Data drift (category empty):** ruled out. 10 cards rendered on the home page.
- **By design:** yes, per the source above. Suite 043 GA-034 was written for vc-frontend's Page Builder home. On the Next redesign that block does not exist.

## Fix routing
No product fix. The test has to be re-based (route to `/qa-review-tests --fix`, suite 043 GA-034): run the products_block assertion on a Page Builder page (e.g. `/agent-test-ga4-product-lists`) instead of `/`, or mark it vc-frontend-only. Advisory, not a bug: whether the Next home "Popular with buyers" *should* be a tracked list is a product decision for VirtoCommerce/vc-frontend-next.

NEW_WITH_MERGE: no. demo-home and the `internal: 0` override predate PR #11 on `dev`, and the section never sent view_item_list.
