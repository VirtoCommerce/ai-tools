# Missions page locale defects — ja "日残リ" katakana typo, en non-pluralised counts, de/fi percent not localised, "N/A" untranslated — **P3**

## Status: CONFIRMED (live: 4a chrome, 2026-10-01)
**Found by:** agent — testing VCST-5957 (`/qa-test`, 2026-10-01)
**Tracker:** not filed — below the severity floor (Low). Named in the VCST-5957 QA comment.
**Archetype:** `RENDER` (`VC-UI-007`) · **Provenance:** PRE-EXISTING. None of these keys are changed by PR #2524 (it only removed `card.completed` and added `subtotal_hint`, which are translated correctly).

**Env:** vcst-qa · theme `2.59.0-pr-2524-3069` · `@td(LOY_PERSONAL_NOORG)`.

| Locale | Key / surface | Actual | Expected |
|---|---|---|---|
| ja | `days_left` (cards + modals) | `{count}日残リ`: katakana リ (U+30EA) | hiragana り (U+308A), `{count}日残り` |
| en | `progress_orders`, `count_requirement` | "1 of 1 orders", "Place 1 separate orders" | plural forms ("1 of 1 order") |
| de, fi | progress percent | "3.6%" | locale number format ("3,6 %") — money is already localised ("257,00 $") |
| all | missing-price cell | "N/A" in every locale | translated |

## Evidence
`reports/tickets/Sprint26-19/VCST-5957/screenshots/4a-missions-de.png`, `4a-sku-modal-ja.png`. Case: `MSNF-098` (083c Draft).

## Fix Routing
`VirtoCommerce/vc-frontend` · `client-app/modules/loyalty/locales/*.json` and the percent formatter in `useMissionCard.ts`.
