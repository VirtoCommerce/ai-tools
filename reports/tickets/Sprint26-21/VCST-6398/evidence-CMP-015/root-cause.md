# Root cause — CMP-015: no desktop organization switcher for a multi-org user

**Symptom:** a user with 2 Approved memberships sees one organization and no Organizations switcher in the desktop account menu (vc-frontend-next 3.1.0-pr-11).
**Lowest failing layer:** storefront UI, the desktop header account-menu panel. It is proven, not assumed: REST and xAPI both report 2 organizations (A1, A2), and only the render is missing (A3–A5).
**Owning repo:** `VirtoCommerce/vc-frontend-next` (repoKind `frontend`). Confidence **HIGH**: the gate is a literal constant and its commit message states the intent.

## Cause (cited)

`client-app/shared/layout/components/header/_internal/header-account-menu-panel.vue` @ d67b0e0a:

```vue
<TopHeaderOrganizations
  v-if="IS_ORGANIZATION_SWITCHER_SHOWN && isMultiOrganization"
  ... />
...
const IS_ORGANIZATION_SWITCHER_SHOWN = false;
```

`isMultiOrganization` is true for this user (xAPI `organizations.totalCount = 2`, A2). The hard-coded `false` keeps the switcher out of the render, and the bundler tree-shakes it away. The desktop header in Next is `vc-header.vue` → `HeaderPlate` → `HeaderAccountMenu` → `HeaderAccountMenuPanel`. `top-header.vue` still contains the old `<TopHeaderOrganizations v-if="isMultiOrganization">`, but nothing in the Next desktop header mounts it. Below the desktop breakpoint, `mobile-menu.vue` still offers `contact-organizations` → `MultiOrganisationMenu` (A6). Net effect: a desktop multi-org user has no way to switch organization.

## When and why (regression archaeology)

- Introduced by **vc-frontend-next commit `d5cc49aa` (2026-09-24), "feat(VCST-6030): hold the organization switcher out of the account panel"**. It was deliberate: the redesign had no drawn design for the switcher, so it was "held out rather than deleted… Flip it when the design arrives." It came one day after `91b1fc7e` (2026-09-23, "draw the account menu as the design's avatar dropdown"), which replaced the old top-header login menu where vc-frontend 2.60.0 renders the switcher (`top-header.vue` L173).
- **NEW_WITH_MERGE: no.** The constant is already `false` on vc-frontend-next `dev` (the base of PR #11), and the repo's own `upstream-merges/2026-10-07-origin-dev.md` L70-71 already records it ("renders `TopHeaderOrganizations` behind `IS_ORGANIZATION_SWITCHER_SHOWN`, which tree-shakes it away. Not discussed in this merge; unmapped."). PR #11 (merge of upstream vc-frontend 2.60.0) does not touch `header-account-menu-panel.vue`, and `useOrganizationSwitcher.ts` is byte-identical between 2.60.0 and d67b0e0a.
- Upstream vc-frontend 2.60.0 is **not affected**: it renders the switcher in `top-header.vue` for `isMultiOrganization`.

## Alternatives ruled out

| Alternative | Evidence against |
|---|---|
| Fixture / membership drift (TEST_DATA_DEFECT) | A1: 2 memberships, both Approved, unlocked. Both orgs Active. Contact Approved with both org links. KB-51FB70F2 (Invited/Rejected/Deleted hidden) cannot apply. |
| Backend / xAPI does not report multi-org | A2: `GetMe` returns `organizations.totalCount = 2` with no `errors[]`. |
| Next moved the switcher on desktop (STALE_TEST) | The source has no other desktop mount (search: `TopHeaderOrganizations` / `useOrganizationSwitcher` consumers are only the gated panel, the orphaned `top-header.vue` and the mobile menu). The live DOM has 0 org radios or search on desktop (A5). It moved only on mobile, and CMP-015 runs on the desktop lane. |
| By design | It was deliberate, but as a temporary hold pending design, not a product decision to remove the capability. VirtoOZ documents the switcher in the account menu for any user in more than one company (A11), and the commit itself names the flip as "the whole restore". The PO may still rule it accepted-until-design. |
| Flaky / timing | 3/3 deterministic across 3 pages. The gate is a compile-time constant. |
| Upstream merge regression | See NEW_WITH_MERGE above. |

## Severity

**P2 / Medium.** Organization switching is a core B2B capability, and it is fully unavailable on desktop. A workaround exists only at a mobile viewport. No data loss or security impact. The issue is not new in PR #11, so it does not block that merge on regression grounds.

## Fix direction (for /qa-fix, not applied)

In vc-frontend-next, restore a desktop switcher: either set `IS_ORGANIZATION_SWITCHER_SHOWN = true` (the documented restore, currently unstyled against the design), or render the switcher in a design-approved desktop placement. Single repo, frontend.

## Test-side note

CMP-015 was correctly BLOCKED, not FAILed: its precondition (switch org from the account menu) is unreachable on Next desktop. Suite 098 is authored for vc-frontend. Once Next ships a desktop switcher in a new placement, the case's navigation step will need a Next variant.
