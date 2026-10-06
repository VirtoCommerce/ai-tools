# BUG: Returns menu icon renders the legacy solid glyph among outline icons

| Field | Value |
|---|---|
| Jira | [VCST-6176](https://virtocommerce.atlassian.net/browse/VCST-6176) (relates to VCST-5628) |
| Severity | Low (visual consistency) |
| Env | `vcst` — storefront `Ver. 2.59.0-pr-2524` (vc-frontend `dev` @ `dbc3f53b7`) |
| Layer | Frontend — `vc-frontend` (`repoKind: frontend`) |
| Confidence | HIGH — source + live DOM agree |
| Status | REPRODUCED (3/3, signed-in org user, `/account/dashboard`) |

## Steps
1. Sign in as an org user on a store with `Return.ReturnEnabled = true`.
2. Open **Account → Purchasing** sidebar (also: mobile menu, order details "Request return" button).

**Expected:** Returns uses a 24×24 outline (Lucide) icon like Orders, Lists, Quote requests.
**Actual:** Returns shows a filled, 20×20 Heroicons-v1 `receipt-refund` glyph.

![sidebar](screenshots/returns-icon-solid-sidebar.png)

## Evidence (live DOM)
| Item | Wrapper class | SVG |
|---|---|---|
| Orders | `vc-icon vc-icon--outline` | `lucide-clipboard-list`, viewBox 24, `fill:none` |
| **Returns** | `vc-icon` (no `--outline`) | no class, viewBox **20**, `fill: currentColor` |
| Lists | `vc-icon vc-icon--outline` | `lucide-heart`, viewBox 24, `fill:none` |

Network: `assets/receipt-refund-BZ1GJLNx.svg` is served from the host's **solid** set (`ui-kit/icons/solid/`).

## Root cause
1. `client-app/modules/returns/menu.ts:15,30` and `components/request-return-button.vue:6` request `icon: "receipt-refund"` — a legacy solid-set name.
2. `ui-kit/icons/outline/` has no `receipt-refund.svg`, and `ui-kit/utilities/icon-aliases.ts` has no `receipt-refund` entry.
3. `resolveIcon()` (`ui-kit/utilities/icons.ts`) misses the outline map, then takes the **transitional outline→solid fallback**. That fallback is silent (no log), so nothing flagged it.

## When / why
- `8917b3d27` VCST-4400 (2026-07-22, #2382) made outline the default and aliased every legacy name in use **at that time**.
- `d90289590` VCST-5628 (2026-09-25, #2488, returns module) added a new call site with a legacy name that was never aliased, two months after the migration. **Regression introduced by #2488**, not by the icon migration.
- No guard asserts "every icon name used in source resolves to an outline asset", so the gap passed review.

## Ruled out
- **By design:** no. The intentionally solid-only names are the `outline-*` empty-state illustrations and `circle-solid`, and the unit test pins `outline-security` as solid. `receipt-refund` is a menu icon in an outline menu.
- **`icon_variant` store setting = solid:** no. Every neighbour renders outline, so the store default is `outline`.
- **Federated plugin / platform data:** no. The Returns menu ships inside the host bundle (`index-*.js`), and no remote was loaded.

## Fix routing
- Repo: `VirtoCommerce/vc-frontend`, `repoKind: frontend`, owner of `modules/returns/`.
- Minimal fix: use a Lucide name at the 3 call sites, or add an alias `"receipt-refund": "<lucide glyph>"` in `icon-aliases.ts`. Candidates: `receipt-text`, `undo-2`, `package-x`. **The glyph choice is a design decision.**
- Same silent fallback, same class of defect (sales-rep module): `office-building` (`customer-profile-info.vue:53`, `customer-profile.vue:27`) and `presentation-chart-bar` (`layout/stat-cards.ts:113`).
- Hardening (optional): a lint or unit check that every used icon name resolves to an outline asset or an allow-listed solid-only name.
