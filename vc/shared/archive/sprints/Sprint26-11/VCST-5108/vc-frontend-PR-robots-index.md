# vc-frontend PR draft — robots index/noindex fix (VCST-5108)

Proposed change to `VirtoCommerce/vc-frontend` (base branch: `dev`). Route-meta-driven; no per-route edits. Keeps `index.html`'s static `noindex` as the safe pre-hydration default.

> Token lacks write access to the org repo — to be pushed manually with credentials that have access.

## Branch
```bash
git checkout dev && git pull
git checkout -b feat/VCST-5108-seo-robots-index
```

## Edit 1 — `client-app/vue-router.d.ts`
Inside `interface RouteMeta`, after the `redirectable?: boolean;` line:
```ts
    /** Excludes the route from search-engine indexing (renders <meta name="robots" content="noindex">). */
    noindex?: boolean;
```

## Edit 2 — `client-app/App.vue`
In `<script setup>`, immediately **after** the existing favicon `useHead({ link: … })` block (right before `const layouts = …`). `route` and `computed` are already imported/declared:
```ts
// Override the static `noindex` default from index.html: index public content
// routes; keep noindex on account/company, checkout, cart-by-id, and auth/error pages.
const isNoIndex = computed(
  () =>
    route.meta?.noindex === true ||
    route.meta?.requiresAuth === true ||
    route.meta?.layout === "Secure" ||
    route.meta?.public === true,
);

useHead({
  meta: [{ name: "robots", content: () => (isNoIndex.value ? "noindex, follow" : "index, follow") }],
});
```

## Commit & push
```bash
git add client-app/App.vue client-app/vue-router.d.ts
git commit -m "feat(seo): set robots=index on indexable routes, keep noindex on private/auth pages (VCST-5108)"
git push -u origin feat/VCST-5108-seo-robots-index
```

## PR (base: `dev`)
**Title:** `feat(seo): index indexable routes, keep noindex on private/auth pages (VCST-5108)`

**Body:**
```markdown
## Why
The SPA ships `<meta name="robots" content="noindex">` in index.html as a safe pre-hydration default, but nothing ever flips it back — so every page (incl. PDP/PLP) stays noindex. This blocks SEO indexing (VCST-5108).

## What
- App.vue now sets `robots` via unhead based on route meta:
  - `index, follow` by default (catalog, category, product, search, …)
  - `noindex, follow` on `requiresAuth` (account/company), `layout: "Secure"` (checkout, /cart/:id, order payment), and `public: true` auth/error/utility pages (sign-in, password flows, 400/403/404, …)
- Adds optional `noindex?: boolean` to RouteMeta for explicit per-route overrides.
- index.html static `noindex` is kept as the pre-hydration default (no change there).

## Notes / scope
- Driven entirely off existing route meta — no per-route edits.
- For **bots** to see `index`, the prerender snapshot must be taken after hydration; tracked separately (no `window.prerenderReady` signal yet). Human SPA gets correct robots immediately.
- Canonical tags + Product JSON-LD are separate follow-ups.

Refs VCST-5108.
```

**Before pushing:** run `yarn build` / `yarn lint` / `npx tsc --noEmit` (local typecheck is the only validation gap — patch was authored without a local build).
