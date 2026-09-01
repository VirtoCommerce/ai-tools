# Missions page discards a successful payload — one failing nested field blanks all 12 returned missions — **P2**

## Status: CONFIRMED
**Tracker:** VCST-5843 (Subtask of VCST-5346; Relates VCST-5842)
**Found by:** manual · investigation of `BUG-missions-page-dead-product-resolver-throws-on-missing-currency.md` · — none (not case-attributable)
**Archetype:** `ERROR-HANDLING`

**Env:** vcst-qa @ Platform `3.1061.0`, Theme `2.57.0-pr-2396-5924`, store `B2B-store`, chrome/1920px, signed in.

## Summary
`/account/missions` treats a **partially successful** GraphQL response as a total failure. `GetLoyaltyMissionProgress` returned HTTP 200 with `totalCount: 24` and **12 fully-populated mission objects** — names, reward points, targets, progress, banners, dates — alongside 9 `errors[]` entries that only concern the nested `items[].product` field on 5 of those missions. The page rendered none of it, showing only `We couldn't load your missions. Please try again.`

The mission cards do not need `product` to be useful: a card's headline, progress bar, reward and deadline all come from fields that resolved correctly. Failing the whole view on any `errors[]` entry means one broken nested resolver — anywhere in a 60-field query — silently costs the customer the entire feature.

This is the frontend half of the current outage; the backend cause is `BUG-missions-page-dead-product-resolver-throws-on-missing-currency.md` (P1). They are independently fixable and both should be: with only the backend fixed, the next nested-field failure reproduces this same blank page.

## STR
1. Sign in on `{{FRONT_URL}}` as any customer account.
2. Go to `/account/missions` while `items[].product` cannot resolve (see the P1 report; currently reproduces on every load).
3. Observe the page body, then DevTools → Network → the `GetLoyaltyMissionProgress` POST → Response.
4. Compare what the response contains against what is rendered.

## Expected vs Actual
- **Expected:** render the 12 returned missions. Degrade only the affected part — a featured-product row whose `product` is `null` shows as unavailable, or the featured-products block is omitted from that one card. Surface the partial failure as a non-blocking notice, not as the page's only content.
- **Actual:** zero missions rendered. The full-page error state replaces the grid whenever `errors[]` is non-empty, regardless of how much usable `data` accompanied it.

## Evidence
![The page's only content, while 24 missions exist and 12 came back fully populated](../screenshots/BUG-missions-page-product-resolver-error-state.png)

Response shape (same request as the screenshot):

| | |
|---|---|
| HTTP status | `200` |
| `data.loyaltyMissionProgress.totalCount` | `24` |
| mission objects returned | `12`, all with `localizedName`, `rewardPoints`, `targetValue`, `percentage`, `daysRemaining` |
| `errors[]` | `9`, all `Error trying to resolve field 'product'.` on `items[].items[].product` |
| missions rendered | **0** |

Fields that resolved and were still discarded, e.g. mission `85fe98b3-…`: `localizedName: "AGENT-TEST-MSN-E2E-…-PERSKU"`, `missionType: "PerSkuAll"`, `rewardPoints.amount: 750.0`, `targetValue: 2.0`, `daysRemaining: 180`.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **FAIL** | 12 usable missions in the response, 0 rendered — screenshot + response body above |
| 2. Backend Admin | N/A | not exercised by this defect |
| 3. GraphQL xAPI | PASS *for this defect* | the operation returned usable `data`; its own `product` failure is the separate P1 report |
| 4. Platform REST API | N/A | not exercised by this defect |

**Owning layer:** Layer 1 — Storefront.

## Notes
- Reproduces identically on a direct load, a browser refresh, an in-app sidebar navigation, and the **Try again** button — so it is the error branch itself, not a routing or hydration race.
- No console error is logged (`console.errors: 0`), so the failure is caught and converted to the error state deliberately; this is an error-policy choice to revisit, not a crash.
- Suggested direction: `errorPolicy: 'all'` on the query (or the equivalent in the composable) and render from whatever `data` arrives, reserving the full-page error state for a response with **no** `data`.
- The page also never sets its document title on this route (`document.title` stays `"Virto Commerce"` instead of the `QA & …` pattern every other account page uses). Minor, same view; noted here rather than filed separately.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** storefront — account → Missions & challenges view / `useLoyaltyMissions`-style composable wrapping `GetLoyaltyMissionProgress`
- **RCA anchor:** the `GetLoyaltyMissionProgress` query's error handling in the missions account module — the branch that renders `We couldn't load your missions. Please try again.` (i18n key behind that string) instead of the returned `items`. Locate via the literal error string and the operation name.
- **Routing confidence:** MEDIUM — the layer and repo are certain (server returned usable data, client discarded it); the exact file was not opened, so the anchor is a search target rather than a `file:line`.
- **Related:** `BUG-missions-page-dead-product-resolver-throws-on-missing-currency.md` (P1, the backend cause) · VCST-5841
