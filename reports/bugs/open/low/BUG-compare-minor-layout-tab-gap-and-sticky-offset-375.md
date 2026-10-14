# Compare — two minor layout findings: All/Differences 2 px gap, sticky header 9 px under the site header at 375 — P3

## Status: CONFIRMED (4v lane, both builds identical)
**Found by:** agent — testing VCST-5880 (visual lane, `reports/tickets/Sprint26-20/VCST-5880/design-report.md` F3, F5) · **PRE-EXISTING**, OUT-OF-SCOPE
**Severity:** Low/P3 each · **BELOW the 5-file severity floor — not filed**, named in the VCST-5880 QA comment

**Env:** vcst-qa, baseline `2.60.0-pr-2511` and PR `2.60.0-pr-2518` · Chrome DevTools.

## F3 — All / Differences targets 2 px apart (BL-UI-006)
At ≤768 px the two `VcTabSwitch` buttons are 32 px tall with a **2 px** gap; BL-UI-006 asks for ≥8 px between adjacent targets. Size passes AA (≥24 px).

## F5 — sticky header pushed 9 px under the site header at 375 (BL-UI-003)
At the page bottom at 375 px the sticky thead sits at y=81 while the fixed site header ends at 90, so 9 px of the header row is covered. It happens when the container's end pushes the sticky element up. Same numbers on both builds.

## Why Low
Both are cosmetic or minor-reach issues, with no lost function and no misattributed values.
