# VCST-6196 — Fix verification (vc-frontend PR #2609, head 52e9649c)

**Verdict: PASS on the PR's theme code.** The bug reproduced on the control (RED), and the theme's built-in Sales Rep hub from PR #2609 shows the translated label in every run (GREEN): STR A 3/3, STR B de 3/3 + ja + zh.

**Caveat:** vcst-qa renders this page from the SalesRep module's MF plugin, not from the theme. So the PR alone does not fix what users of that stand see (see "Delivery path").

| | Control (Phase A) | Fixed build (Phase B) |
|---|---|---|
| Host | vcst-qa storefront | `http://localhost` (`X-VC-Local-Theme: fe-16170560468f`) |
| Theme | 2.61.0-pr-2577 | PR #2609 build (`customer-orders-BEaHXPfP.js`) |
| Backend | vcst-qa | vcst-qa via nginx (no `/modules` location) |
| Sales-rep UI source | SalesRep module MF plugin 0.2.5 | theme built-in hub (plugin manifest 404) |
| Account | `agent-test-sr-primary@example.com` (Priya Rao), B2B-store | same |

**Local-only change, for this run only:** the coordinator flipped the build-time theme setting `sales_rep_builtin_enabled` from `!1` to `!0` in the localhost bundle (`assets/select-address-modal…-jGmYfjJo.js`). The vcst-qa store was not touched.

**Provenance check:** `/company/customer-orders` renders with the "Sales Rep hub" sidebar. The page fetches the theme chunk `/assets/customer-orders-BEaHXPfP.js` (200), and the plugin `mf-manifest.json` returns 404.

## Phase A — control (RED)

| STR | Locale | Result | Screenshot |
|---|---|---|---|
| A, in-session en→Deutsch | de | **RED**: the combobox shows `sales_rep.customer_orders.filters.custom_date` | `01-control-RED-de-in-session-raw-key.png` |
| B, fresh context, direct `/de/…` (2 tries) | de | translated, did not reproduce (2/2) | `02-control-de-cold-attempt1-translated.png` |
| B, direct full load `/ja/…` | ja | **RED**: raw key | `03-control-RED-ja-cold-raw-key.png` |
| B, direct full load `/zh/…` | zh | **RED**: raw key | `04-control-RED-zh-cold-raw-key.png` |

On the first localhost attempt, before the flag was flipped, the page was a 404 (`05-localhost-BLOCKED-de-customer-orders-404.png`).

## Phase B — localhost, built-in hub enabled (GREEN)

| STR | Runs | Combobox reads | Screenshot |
|---|---|---|---|
| A, en → Deutsch via header | 3/3 | "Benutzerdefiniertes Datum" | `07-…-de-in-session-run1.png`, `08-…-run3.png` |
| B, fresh context per run, direct `/de/…` | 3/3 | "Benutzerdefiniertes Datum" | `09-localhost-GREEN-de-cold-run1.png` |
| B, direct full load `/ja/…` | 1/1 | "日付指定" | `10-localhost-GREEN-ja-cold.png` |
| B, direct full load `/zh/…` | 1/1 | "自定义日期" | `11-localhost-GREEN-zh-375px.png` |

ja and zh are the discriminating cases: in the same flow, the control showed the raw key and the fixed build shows the translation.

## Checklist

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | RED baseline on control | **PASS** | de in-session RED, ja/zh cold RED; de cold not reproducible on control |
| 2 | STR A 3/3 (de) | **PASS** | 3/3 translated |
| 3 | STR B de cold 3/3 + ja + zh | **PASS** | 3/3 + 1/1 + 1/1 |
| 4 | de→fr re-translate | **PASS** (see note) | "Date personnalisée", `12-localhost-GREEN-de-to-fr-retranslated.png`. The header switcher reloads the document on both builds, so a switch without a reload cannot be done through the UI. This is the same path that is RED on control. |
| 5 | Presets fill range + Apply filters | **PASS** | "Dernière semaine" → chips 20/10/2026–27/10/2026, 2 rows (Oct 20). "Dernier mois" → 27/09–27/10, 6 pages. Reopening the drawer shows the chosen preset in fr. `13-localhost-fr-last-week-applied.png` |
| 6 | Custom option + range + Apply | **PASS** | Custom shows the Plage de dates group. Start 14/10/2026 typed, end 27/10/2026 → chips updated, 10 rows from Oct 14–20 |
| 7 | Reset / clear-all → custom label, dates cleared | **PASS** | Both the page "Réinitialiser les filtres" button and the drawer "Réinitialiser" (after "Dernière année") clear the chips. The drawer then shows "Date personnalisée" with empty dates. `15-localhost-fr-after-reset-custom-empty.png` |
| 8 | Preset chip removal (VCST-6195) | **PASS** | After "Dernier mois", removing the "Commence à" chip leaves the "Se termine à : 27/10/2026" chip. The drawer shows "Date personnalisée" with the end date still 27/10/2026. `14-localhost-fr-chip-removed-falls-back-to-custom.png` |
| 9 | 375px zh | **PASS** | The combobox is 250px wide and fits "自定义日期". The drawer is 343px wide, no overflow. `11-localhost-GREEN-zh-375px.png` |
| 10 | Document title after switch | **PASS** | During the reload the title is "Virto Commerce", then it reads "QA & Kundenbestellungen" / "Commandes des clients". The raw key never appeared. |
| 11 | Console / network vs control | **PASS** | The only recurring error is the environment-only plugin `mf-manifest.json` 404. All `/graphql` calls returned 200 in the final session. One transient burst of 3× `/graphql` 502 coincided with `ERR_NETWORK_CHANGED` on the first page load: "Couldn't load orders" appeared once and cleared on reload. I treat this as environment noise. |

STR tally on localhost: **A 3/3, B de 3/3, ja 1/1, zh 1/1.**

## Delivery path (important for closing the ticket)

On vcst-qa (and vcptcore-qa, per KB-D89CB35F) the hub is served by the SalesRep module's MF plugin, whose `customer-orders` chunk still has the pre-fix `sales-rep-orders-filters`. The theme's built-in hub is active only when `sales_rep_builtin_enabled=true`. So users on these stands keep seeing the bug until the SalesRep plugin is rebuilt from the fixed sources, or the stand enables the built-in hub.

## Incidental observations (not filed)

- **"Status" heading not translated in the drawer for fr and zh.** The table's own column header is translated ("Statut"). The drawer key `filters.order_status` is the linked message `@:common.labels.status`. Seen on the PR build; not compared with control. This is likely a separate i18n defect and is outside this PR.
- **Grid date cells use an English format in fr** ("Oct 20, 2026"), while the chips use 20/10/2026. Minor; not compared with control.
- **Language switching uses two different "English" entries:** the first switches to `en-GB`, not `en-US`.

KB: confirmed KB-D89CB35F, KB-23CBD97B (VCST-6196) and KB-BE19E49D (VCST-6196) on vcst_qa. The "Status" heading question is recorded as unanswered (kb_none).
