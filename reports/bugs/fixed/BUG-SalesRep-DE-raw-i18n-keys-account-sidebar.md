# BUG: Account sidebar renders raw i18n keys instead of German labels

## Status: FIXED — [VCST-5681](https://virtocommerce.atlassian.net/browse/VCST-5681)

**Severity: Medium** (visible to end users on every localized page; fails silently — no console warning, so it is invisible to monitoring).

## Resolution
- **Root cause (dev, 2026-09-22):** not a translation gap — all six module `de.json` files already carry these keys. Module locale bundles load asynchronously, after the sidebar has rendered, so on that first pass `t()` returns the raw key; because the menu-tree translation mutated the link objects **in place** rather than replacing them, Vue saw unchanged props and never re-rendered when the bundle landed. That is the mechanism behind the non-determinism, the silence (no missing-key warning — the key was never actually missing), and why it surfaced on any locale, not only German.
- **Fixed by:** [VirtoCommerce/vc-frontend#2496](https://github.com/VirtoCommerce/vc-frontend/pull/2496) (open, unmerged at verification time).
- **Verified:** 2026-09-22, local frontend-only hybrid env running PR #2496's own CI theme artifact (`vc-theme-b2b-vue-2.58.0-pr-2496-3b02-3b02d64a.zip`, theme marker `X-VC-Local-Theme: fe-3cdb021fec18`), `/graphql`+`/connect/token` proxied to real `vcst-qa` data (store `B2B-store`). Signed in as `agent-test-sr-primary@example.com`. **10/10 full page loads clean, 0 raw keys** — `/de/company/my-customers` ×3, `/de/account/missions` ×2, `/de/account/orders` ×1, `/account/orders` (en) ×2, plus repeats — versus 0/7 on the pre-fix build (`2.58.0-pr-2495`), which was already non-deterministic before the fix. Full checklist: `reports/tickets/Sprint26-19/VCST-5681/testing-checklist.md`.
- **Tracker:** VCST-5681 transitioned `In review → Ready for test → Testing → Tested` on 2026-09-22, on the operator's **explicit authorization** despite the real `vcst-qa` deployment still running an unrelated build (PR #2467) — `TESTED` here does NOT mean the fix has been observed on the shared deployment, only on the local pre-merge build. Verification comment: Jira comment id 110207 (inline evidence screenshot, `renderedBody`-verified).
- **Residual, non-blocking:** the underlying defect is a **race condition**, not a deterministic gap — 3/3 formal + 16 total clean loads is strong pre-merge evidence but not proof the race is structurally eliminated rather than just less frequent. Not re-tested: the buyer-account EN variant (`agent-test-multiorg-...` on `/account/lists`) and a higher-volume automated repro. **Recommended: a confidence spot-check on the shared `vcst-qa` deployment once PR #2496 actually merges and deploys** (not required to close the ticket — that already happened — but worth doing before treating this defect class as closed).

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

## Update 2026-08-20 — reproduces in **ENGLISH**, on a clean load, for a **buyer** only

Found while testing VCST-5724 on **vcst-qa** @ theme `2.56.0-pr-2438-ef16` (a different env AND a different build from the original report).

Signed in as a **buyer** (`agent-test-multiorg-20260615@yopmail.com`), on a clean full load of `{{FRONT_URL}}/account/lists` with the storefront in **English**, three sidebar links render raw keys:

- `Quotes.navigation.route_name`
- `Push_messages.menu_item_name`
- `Loyalty.navigation.route_name`

The **sales-rep** account on the same env, same build, same English locale renders all three correctly ("Quote requests" / "Notifications" / "Points history").

**This contradicts both hypotheses in the original report.** The keys were framed as (a) a German locale-file gap plus (b) a lazy-load race on the in-page language switch. English on a hard load rules out both: `en.json` is by definition not missing its own keys, and there was no locale switch. The discriminator is the **account**, not the locale or the navigation timing — the same three keys resolve for one user and not another in identical conditions.

That points at **account/permission-scoped locale-resource loading**: these three entries come from modules whose i18n bundle is registered conditionally (quotes, push-messages, loyalty), and a buyer evidently reaches the sidebar before — or without — the bundle that owns their labels. Note these are exactly the three keys the original report attributed to the switch-race, which is consistent with one root cause (bundle not loaded for this principal) surfacing through two different triggers.

**Consequence for the fix:** filling the German gaps in `de.json` will not fix this. Reproducing under EN first is the cheaper diagnostic, and the proposed en-vs-sibling-locale CI guard would **not** have caught it — the key is present in `en.json` and still renders raw. The guard needs to be a runtime/registration check, not a locale-parity check.

Evidence: `reports/tickets/Sprint26-15/VCST-5724/screenshots/INCIDENTAL-raw-i18n-keys-buyer-sidebar-en.png`

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

---

## Update 2026-09-21 — still reproducing on a THIRD env/build pair; the EN half is intermittent, the DE half deterministic

Found again incidentally during the `/qa-test VCST-5732` re-test (Sales Rep Tasks), **vcptcore-qa @ theme
`2.58.0-pr-2464-2971-2971a77b`** — a newer build than either of the two pairs above, so the gap has now
survived `2.55.0-pr-2408` → `2.56.0-pr-2438` → `2.58.0-pr-2464`. **Not re-filed: VCST-5681 already owns it.**

What this run adds is the shape of the EN manifestation, which the original report could only infer:

- **Under `en` — INTERMITTENT, and that is the new datum.** Correct on the first page load of a session;
  the raw keys appear after subsequent navigations (reproduced on `/company/calendar` and
  `/company/calendar?filter=upcoming`, both cold-loaded); then correct again on later loads. Keys seen:
  `Quotes.navigation.route_name`, `Purchase_requests.menu.link.title`,
  `Back_in_stock.navigation.route_name`. This is consistent with the original report's hypothesis of a
  **lazy-loaded message-bundle race on re-mount**, now observed on a clean load rather than only after an
  in-page locale switch.
- **Under `de` — deterministic, five keys**, adding `Push_messages.menu.item_name` and
  `Loyalty.navigation.route_name` to the three above.
- **Still silent:** zero console errors, zero warnings, HTTP 200. Monitoring cannot see it. This is the
  property that makes the CI guard proposed in §Fix Routing worth more than the fix itself.
- The sales-rep hub's **own** labels localize correctly, so `BL-SR-013` holds for the rep-facing
  vocabulary — the leak is in the shared account sidebar, as reported.

**A correction to this report's env line, for whoever picks it up:** the original entry reads *"the German
locale file is genuinely missing the keys"*. That remains the best explanation for the deterministic DE
half, but it cannot explain the EN half — `en.json` is the source locale. Two mechanisms, not one.
