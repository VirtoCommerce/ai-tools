# Product gallery with 5 images: Previous from the start shows image 5 beside 3 empty thumbnail cells

## Status: CONFIRMED (live, 2026-11-06) — PRE-EXISTING, not introduced by vc-frontend PR #2620
**Found by:** agent — testing VCST-6289 (labels: `found-by-agent`, `found-in-testing`)
**Severity:** Low (P3) — cosmetic, desktop product page

**Environment:** vcst · Platform 3.1094.0 · theme vc-theme-b2b-vue-2.62.0-pr-2620-b47e-b47e1167 · Chromium 1280×900

**Steps:**
1. Open a product with exactly 5 images (live: `/product/44d62e31a783468fa161bccd1b7de19e`).
2. In the thumbnail strip, click Previous once.

**Actual:** The strip shows image 5 followed by three blank cells; images 1–4 are scrolled out. The thumbs Swiper holds 8 slides; indexes 5–7 carry `swiper-slide-blank` and no `<img>`.

**Expected:** The strip only ever shows real thumbnails (no blank cells).

**Cause:** thumbs Swiper uses `slides-per-view=4`, `slides-per-group=4`, `loop`; Swiper 12.1.2 `loopAddBlankSlides` defaults to `true`, padding 5 → 8. By the same rule 6 images → 2 blanks, 7 → 1, 9 → 3 (not observed — no such product on vcst). Loop/group config is unchanged base 37cdaf67 → head b47e1167; the PR only changed nav-arrow hiding (C-30 PASS).

**Evidence:** `evidence/C-30b/` (evidence-index.md, root-cause.md, screenshot gallery-5img-prev-empty-thumbs-1280.png, `network/thumb-slides-after-prev.json`) · checklist C-30b · kb KB-F6BEC4A4 (confirmed)

## Fix Routing (→ /qa-fix)
- **Owning layer:** Storefront (catalog)
- **Suggested repo:** VirtoCommerce/vc-frontend — `client-app/shared/catalog/components/image-gallery.vue` (thumbs `<Swiper>`, ~l.73–92)
- **Fix options:** `:loop-add-blank-slides="false"`, or `slides-per-group` 1, or no loop on the thumbnails
- **Routing confidence:** HIGH
