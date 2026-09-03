# BUG: Account sidebar renders raw i18n keys instead of German labels

## Status: CONFIRMED — filed as [VCST-5681](https://virtocommerce.atlassian.net/browse/VCST-5681)

**Severity: Medium** (visible to end users on every localized page; fails silently — no console warning, so it is invisible to monitoring).

**Env:** vcptcore-qa @ Theme 2.55.0-pr-2408-0cc5 · store `B2B-store`

## Summary
On a German storefront the account/Sales-Rep sidebar renders three untranslated i18n **keys** in place of labels. This is not an in-page-locale-switch race: it persists on a clean full load of `/de/…`, so the German locale file is genuinely missing the keys. Nothing is logged — no missing-translation-key warning — so the gap is silent.

## Steps to Reproduce
1. Sign in as a Sales Rep (`@td(SR_REP_PRIMARY)`) on the B2B storefront.
2. Navigate by **full page load** to `{{FRONT_URL}}/de/company/my-customers` (do not use the in-page language switcher — that is a different, wider symptom).
3. Read the left sidebar.

**Expected:** every sidebar entry shows a German label (the surrounding chrome already does — `Meine Kunden`, `Vertriebsmitarbeiter-Hub`, `Schnellaktionen`).
**Actual:** three entries render their raw keys:
- `Purchase_requests.menu.link.title`
- `Back_in_stock.navigation.route_name`
- `Sales_rep.navigation.link`

The in-page EN→DE switch leaks a wider set (also `Quotes.navigation.route_name`, `Push_messages.menu_item_name`, `Loyalty.navigation.route_name`), which suggests a lazy-load race **on top of** the missing-key gap.

Evidence: `reports/tickets/Sprint26-15/VCST-5586/screenshots/SR-CP-056-de-localized-error-vs-raw-sidebar-keys.png` (one frame showing correctly-localized statistics copy next to the raw sidebar keys), `BUG-de-raw-i18n-keys-sidebar.png`.

## Business rule
**BL-SR-013** `[P2-ux]` — rep-facing vocabulary localizes by `cultureName`; the storefront renders the localized label, **never a raw i18n key**. One of the three leaked keys (`Sales_rep.navigation.link`) is in the sales-rep namespace.

## Provenance
**Pre-existing — NOT introduced by PR #2408 (VCST-5586).** Found incidentally while verifying that ticket's own new `*_load_failed` strings, which localize correctly (`"Laden fehlgeschlagen"`). These are account/loyalty/navigation keys that PR #2408 does not own. Filed separately so the finding is not lost with the run that surfaced it.

## Fix Routing
`vc-frontend` — locale files for the affected modules (`purchase-requests`, `back-in-stock`, `sales-rep` navigation entries) in `de.json`, plus a check of the other 12 locales for the same gap. Worth adding a CI guard: a key present in `en.json` but absent from a sibling locale should fail rather than fall through to the raw key.

---

## Re-verification 2026-08-26 — PARTIALLY FIXED, and **the stated root cause is wrong**

Re-tested live on **vcst-qa @ Theme 2.56.0-pr-2451** (the draft ran on vcptcore-qa @ 2.55.0-pr-2408), signed in as `@td(SR_REP_PRIMARY)`.

### The keys were never missing

This report concluded *"the German locale file is genuinely missing the keys."* It is not. All three exist in `vc-frontend@dev`, in the per-module locale files, fully translated:

| key | `de.json` value | `de.json` last modified |
|---|---|---|
| `sales_rep.navigation.link` | **"Vertriebsmitarbeiter"** | 2026-08-21 |
| `purchase_requests.menu.link.title` | **"Kaufanfragen"** | **2024-12-18** |
| `back_in_stock.navigation.route_name` | **"Benachrichtigungsliste"** | **2025-10-15** |

Two of the three files have not been touched since 2024 and 2025 — long before this report was written. The translations were present the whole time, so a missing-key gap cannot be the mechanism.

The proposed remedy is also already in place: commit `feat: add languages and check messages keys in CI (#1499)` added exactly the guard this report asks for ("a key present in `en.json` but absent from a sibling locale should fail"). That guard passing is further evidence the keys are present.

**The real mechanism is the lazy module-locale merge** — the race this report considered and dismissed. These are *per-module* locale bundles; the menu entry can render before its module's bundle is merged, and vue-i18n falls through to the raw key. That also explains the silence: a missing *bundle* at render time produces no missing-key warning the way a genuinely absent key would.

### What still reproduces, and what does not

| Path | Reported | Now |
|---|---|---|
| Clean full load of `/de/company/my-customers` | 3 raw keys | **0 raw keys** — sidebar reads `Benachrichtigungsliste`, `Vertriebsmitarbeiter`, `Punkteverlauf`, all correct |
| In-page EN→DE switch | "wider set" (6 keys) | **1 raw key: `Loyalty.navigation.route_name`** |

So the clean-load symptom — this report's primary STR — no longer reproduces, and the in-page-switch symptom has narrowed from six keys to one.

`loyalty.navigation.route_name` = **"Punkteverlauf"** has been in `de.json` since 2025-09-19, and the clean load renders it correctly. Only the in-page switch produces the raw key. That is a race, conclusively — the same key, same build, same session, differing only by how the locale was reached.

### Caveat on the environment

I tested vcst-qa, not the vcptcore-qa this report used. The **key-presence** finding is env-independent (shared source). The **clean-load symptom being absent** could be the theme bump (2.55→2.56) or an env difference, and I did not separate the two.

### Recommended change to this report

Keep it open, but rewrite it: severity drops (one key, one path), and the fix routing is wrong as written. Adding keys to `de.json` and adding a CI guard would both be no-ops. The work is in **when module locale bundles are merged relative to menu render on an in-page locale change** — and it is not sales-rep-specific, so this may belong outside the SalesRep group entirely.

**VCST-5681** is **Draft / To Do, unresolved** (Medium, updated 2026-08-24) — worth updating with the above before anyone starts on it.
