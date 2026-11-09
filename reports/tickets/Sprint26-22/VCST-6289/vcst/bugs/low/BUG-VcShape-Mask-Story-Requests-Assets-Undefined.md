# Storybook VcShape "Mask" story requests /assets/undefined (404) — banner image never shows

## Status: CONFIRMED (live, 2026-11-06) — PRE-EXISTING, Storybook only, not introduced by vc-frontend PR #2620
**Found by:** agent — testing VCST-6289 (labels: `found-by-agent`, `found-in-testing`)
**Severity:** Low (P4 / Trivial) — Storybook demo only, no app impact

**Environment:** QA Storybook https://vcst-qa-storybook.govirto.com (PR build) and DEV Storybook https://vcst-dev-storybook.govirto.com

**Steps:** Open Components / Molecules / VcShape → "Mask" (`components-molecules-vcshape--mask`); watch the network and console.

**Actual:** `GET /assets/undefined` → 404 and a console error on both Storybooks; computed `background-image` is `url(".../assets/undefined")`. The story shows a flat academic-cap shape with no banner image (the mask itself resolves).

**Expected:** The story loads its image (no 404), like the "Image" story (`img: "main-banner.webp"` → 200).

**Cause:** the story arg is `img: "/static/images/home/main-banner.webp"` (also in its "Show code" source). VcShape resolves `img` via `getImageUrl()` = `new URL(`../../assets/images/${fileName}`, import.meta.url)`, which Vite compiles to a lookup over `client-app/assets/images/`; the site-root path is not a key, so it resolves to `undefined`. Same args at base 37cdaf67.

**Evidence:** `evidence/C-35/` (evidence-index.md, root-cause.md, 2 screenshots, `network/qa-sb-shape-style.json`) · checklist C-35 · kb KB-4135FFBE

## Fix Routing (→ /qa-fix)
- **Owning layer:** Storefront UI kit — Storybook stories
- **Suggested repo:** VirtoCommerce/vc-frontend — `client-app/ui-kit/components/molecules/shape/vc-shape.stories.ts` (Mask story args ~l.100 and docs source ~l.108: `img: "main-banner.webp"`)
- **Routing confidence:** HIGH
