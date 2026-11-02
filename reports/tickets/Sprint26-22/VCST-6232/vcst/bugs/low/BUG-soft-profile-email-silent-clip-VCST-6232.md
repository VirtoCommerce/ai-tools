# [Soft] Disabled email on /account/profile is clipped with no ellipsis (Inter is wider)

**Severity:** Low (P3) · **Provenance:** IN-SCOPE (VCST-6232, vc-frontend#2600 @ a4f29534) · **Not filed:** below severity floor
**Found by:** agent, /qa-test FULL round 2 (checklist C-16, F8) · **Oracle:** BL-UI-004 · **Env:** local soft build → vcst backend · Edge/Chromium

## Steps
1. Build vc-frontend#2600 with `settings.design = soft`; sign in as `{{ORG_USER_EMAIL}}` (a 42-character address).
2. At 375×812 (or 1024 wide) open `/account/profile`.

## Expected
{BL} BL-UI-004: text stays inside its container — wrap, ellipsis or scroll, never a silent clip.

## Actual
Disabled Email input: scrollWidth 369 px in a 306 px box, overflow clipped, no ellipsis; disabled, so it cannot be focused or scrolled — the address is cut mid-domain. Classic (Lato) fits.

## Evidence
`screenshots/4v-C-16-soft-profile-input-clip-375.png` · KB-EBF47FCB

## Fix Routing
vc-frontend — `text-overflow: ellipsis` (or a title) on disabled/readonly vc-input values.
