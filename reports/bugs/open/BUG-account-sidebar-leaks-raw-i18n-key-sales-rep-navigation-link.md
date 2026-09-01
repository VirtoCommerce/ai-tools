# Account sidebar renders the raw i18n key `Sales_rep.navigation.link` on a direct page load — **P3**

## Status: CONFIRMED
**Found by:** manual · investigation of the `/account/missions` failure · — none (not case-attributable)
**Archetype:** `I18N`

**Env:** vcst-qa @ Platform `3.1061.0`, Theme `2.57.0-pr-2396-5924`, store `B2B-store`, locale en-US, chrome/1920px, signed in as `@td(MULTI_ORG_USER.email)`.

## Summary
The account sidebar's Corporate group shows the untranslated key **`Sales_rep.navigation.link`** where it should read "Sales reps". It appears only when an account page is entered by a **direct load / refresh**; the same link renders correctly as "Sales reps" after an in-app navigation, which points at a translation bundle that is read before it is ready rather than a missing message.

## STR
1. Sign in on `{{FRONT_URL}}` as any account with the Corporate section (an org member).
2. Navigate **directly** to an account page — e.g. paste `{{FRONT_URL}}/account/missions` in the address bar, or press F5 on any `/account/*` page.
3. Read the third link of the sidebar's **Corporate** group.
4. Now click a different sidebar link (e.g. "Dashboard") and back — read the same link again.

## Expected vs Actual
- **Expected:** "Sales reps" on both paths — the same string the link shows after in-app navigation.
- **Actual:** step 3 renders the literal key `Sales_rep.navigation.link`; step 4 renders "Sales reps".

## Evidence
Both states observed in the same signed-in session, minutes apart:

| Entry path | Sidebar text |
|---|---|
| direct load of `/account/missions` (and F5 on it) | `Sales_rep.navigation.link` |
| `/account/dashboard` → click "Missions & challenges" | `Sales reps` |

Scanning the rendered page text for key-shaped tokens returns exactly one on the direct-load path: `["Sales_rep.navigation.link"]`. No console error accompanies it.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **FAIL** | key rendered instead of its translation on the direct-load path only |
| 2. Backend Admin | N/A | client-side localization |
| 3. GraphQL xAPI | N/A | — |
| 4. Platform REST API | N/A | — |

**Owning layer:** Layer 1 — Storefront.

## Notes
- Cosmetic, but it is the customer-facing account navigation and it leaks internal naming. The capitalized-namespace form (`Sales_rep.` rather than the usual lower-case namespace) suggests the key itself may not match the bundle's convention, which would explain why only the slower load path exposes it.
- Found while investigating `BUG-missions-page-dead-product-resolver-throws-on-missing-currency.md`; unrelated root cause, filed separately per policy.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** storefront — account sidebar navigation (sales-rep module registration) + its i18n bundle
- **RCA anchor:** the sidebar entry whose label resolves to `Sales_rep.navigation.link` — search the literal key across the storefront's account navigation config and `en` locale bundles; check the namespace casing against the sibling entries that resolve correctly.
- **Routing confidence:** MEDIUM — layer and repo are certain; whether the fix is the key's casing or the bundle's load ordering needs the file opened.
