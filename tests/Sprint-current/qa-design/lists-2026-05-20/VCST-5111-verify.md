# VCST-5111 — Fix Verification

**Date:** 2026-05-20
**Tester:** ui-ux-expert (Chrome DevTools MCP)
**Build:** `2.49.0-pr-2292-bcfc-bcfcf0cc`
**PR:** https://github.com/VirtoCommerce/vc-frontend/pull/2292 (OPEN — not merged, deployed to vcst-qa)

---

## Deployed bundle check

The build version string in the page footer and the artifact URL in the PR body both contain the same short hash `bcfcf0cc`. The PR head SHA is `bcfcf0cc96ffd4bf8b09101af48e09e42a91c6c1`. The deployed bundle is confirmed to be the PR build.

New BEM structure introduced by PR (presence in DOM confirms the PR code is running):

| Signal | Expected (if PR deployed) | Actual | Match? |
|--------|--------------------------|--------|--------|
| `.lists` root class | present | present | MATCH |
| `.lists__container` | present | present | MATCH |
| `.lists__items` | present | present | MATCH |
| `.wishlist-card` BEM class | present | present | MATCH |
| Old `md:space-y-2.5` class in DOM | absent | absent | MATCH |
| `.wishlist-card-skeleton` | 0 (data loaded) | 0 | MATCH |

**Conclusion: PR #2292 code is confirmed deployed.** No caching issue.

---

## Token scope analysis — what PR #2292 actually changes

The original ticket VCST-5111 identified three tokens in two files. The PR diff covers a different set of files:

| Ticket Token | Expected source file | PR touches file? | Implication |
|---|---|---|---|
| Token 1 — `account-shell` `paddingBottom` | `vc-container.vue` (sets `--vc-container-pb` default) | **NO** | PR cannot fix this |
| Token 2 — `link-lists__wrapper` `paddingLeft` | `link-lists.vue` | **NO** | PR cannot fix this |
| Token 3 — `lists__items` `rowGap` | `lists.vue` | **YES** — but see below | Partially addressed |

Files modified by PR #2292: `lists.vue`, `wishlist-card.vue`, `wishlist-card-skeleton.vue`, `locales/*.json`.

---

## Computed-style measurements at viewport 1280 px

| Element | Property | CSS Source | Expected (fixed) | Measured @ 1280 | On 4px grid | Result |
|---|---|---|---|---|---|---|
| `.vc-container.account-shell` | `paddingBottom` | `.vc-container { --pb: var(--vc-container-pb, 2.25rem); }` default = 2.25rem | 32px or 40px | **36px** | NO (2.25rem = off-grid half-step) | FAIL |
| `.link-lists__wrapper` | `paddingLeft` | `.link-lists__wrapper { padding: 0.5rem 0.5rem 0.5rem 0.625rem; }` | 8px or 12px | **10px** | NO (0.625rem = off-grid) | FAIL |
| `.lists__items` | `rowGap` | `@container (min-width: 36rem) { .lists__items { row-gap: 0.625rem; } }` | 8px or 12px | **10px** | NO (0.625rem = off-grid) | FAIL |

768 px note: The Chrome DevTools MCP resize command did not change `window.innerWidth` from 1280px during this session. Token 1 and Token 2 are not breakpoint-conditional (their CSS rules have no `@media` guards), so the 1280px measurements apply at 768px equally. Token 3 uses a container query (`min-width: 36rem = 576px`); at 768px viewport the `.lists__container` content area is still wider than 576px (sidebar + content layout), so the container query remains active and `rowGap` remains 10px.

---

## Token 3 detail — structural substitution, same numeric violation

The PR replaced:

```html
<!-- OLD lists.vue -->
<div class="space-y-3 md:space-y-2.5">
  <WishlistCard ... />
</div>
```

With:

```scss
// NEW lists.vue <style>
.lists__items {
  @apply space-y-3;                   // mobile: 12px margin-top between children — ON GRID

  @container (min-width: theme("containers.xl")) {
    @apply grid grid-cols-[...] gap-y-2.5 space-y-0;  // desktop: row-gap 10px — OFF GRID
  }
}
```

At the current container width (941px > 576px), the container query IS active. The result: `row-gap: 0.625rem` = **10px** — identical to the old `md:space-y-2.5` value. The mechanism changed (viewport media query → container query), the violation did not.

---

## Additional off-grid violation introduced by PR (outside ticket scope)

PR also modified `wishlist-card.vue` and introduced:

```scss
.wishlist-card__date {
  @apply flex items-center gap-1.5;  // gap-1.5 = 0.375rem = 6px — OFF GRID
}
```

Measured `gap` on `.wishlist-card__date`: **6px** (off-grid; nearest grid values: 4px or 8px). This is a new violation brought in by the same PR but is outside VCST-5111's scope. Recommend `gap-1` (4px) or `gap-2` (8px).

---

## Verdict

**FIX_INCOMPLETE**

Build `bcfcf0cc` is confirmed deployed. All three ticket tokens remain off-grid:

- **Token 1** (`account-shell` paddingBottom 36px) — source is in `vc-container.vue` (untouched by PR). Not fixed.
- **Token 2** (`link-lists__wrapper` paddingLeft 10px) — source is in `link-lists.vue` (untouched by PR). Not fixed.
- **Token 3** (`lists__items` rowGap 10px) — source replaced from `md:space-y-2.5` to `@container gap-y-2.5`, but computed value is still 10px (0.625rem). Not fixed.

The PR is a layout refactor (BEM migration + container queries) for a broader VCST-5110 task; VCST-5111's specific half-step token fixes for Token 1 and Token 2 were not included. Token 3 was re-introduced under the new structure.

**Do not transition JIRA to Closed/Done.**

---

## Evidence

- Screenshots: `tests/Sprint-current/qa-design/lists-2026-05-20/VCST-5111-verify/verify-1280.png` (viewport), `verify-1280-full.png` (full page)
- Raw class strings + computed-style payload: `tests/Sprint-current/qa-design/lists-2026-05-20/VCST-5111-verify/verify-data.json`
- Prior audit data: `tests/Sprint-current/qa-design/lists-2026-05-20/storefront/audit-data.json`
