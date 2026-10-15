# Solid-secondary buttons and chips — white on secondary-500 #688198 is 4.05:1 (WCAG 1.4.3) — P3

## Status: CONFIRMED (2/2 builds)
**Found by:** agent — testing VCST-5880 · **PRE-EXISTING**, OUT-OF-SCOPE · **Archetype:** `CONVENTION`
**Severity:** Low/P3 · **BELOW the 5-file severity floor — not filed**, named in the VCST-5880 QA comment

**Env:** vcst-qa, baseline `2.60.0-pr-2511` and PR `2.60.0-pr-2518`, identical · default preset · Edge 1280.

## Measured
- `/compare` selected category tab "Group A": #fff on #688198, 12px/700 → **4.05:1**.
- Catalog active-filter chip "Show in stock" (`vc-chip--solid--secondary`): 14px/700 → **4.05:1**.
- The unselected tab passes at 6.11:1.

## Root cause
- `client-app/assets/styles/_ui-kit-tokens.scss` L32/L34 (button) and L554/L556 (chip) put `additional-50` on `secondary-500`.
- `client-app/assets/presets/default.json` sets `color_secondary_500: #688198`.

## Why Low
It is an AA miss by 0.45 on short, bold labels that remain legible. It is systemic, though, so it belongs with VCST-6304's token fix.

Evidence package: `reports/tickets/Sprint26-20/VCST-5880/investigation/C23c/`.
