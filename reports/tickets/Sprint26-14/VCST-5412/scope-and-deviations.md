# VCST-5412 — Scope, Build Gate & Deviations

**Ticket:** [vc-shell] accessibility and bundle size improvements · Task · Medium · status **Testing**
**Source PR:** [vc-shell#255](https://github.com/VirtoCommerce/vc-shell/pull/255) — merged 2026-07-20, 191 files
**Target under test:** https://vcmp-dev.govirto.com/apps/vendor-portal/ (Marketplace vendor portal, `vcmp-dev` deployment)
**Test window opened:** 2026-07-28 12:06 UTC
**Run date:** 2026-07-28

---

## 1. Build gate — PASS (change is deployed)

The ticket premises framework `2.2.0` vs baseline `2.1.0`. The login page footer displays **`2.1.0`**, which is the
vendor-portal **application's own** version, *not* the framework's. Version was therefore established from the
deployed bundle against the published npm manifests:

| Marker | 2.1.0 | 2.2.0 | Deployed | Verdict |
|---|---|---|---|---|
| `js-beautify` | absent | dependency | **present** (own ~102 KB chunk) | ≥2.2.0 |
| `whatwg-fetch` | dependency | removed | **absent** | ≥2.2.0 |
| `vee-validate` | direct dep | **peer** dep | single core copy | ≥2.2.0 |
| `prettier` | present | replaced | **absent** | ≥2.2.0 |
| Shell landmarks | — | added | `main`, `navigation "Primary navigation"`, `complementary`, `region "Blade navigation"` observed live | present |

**Attribution caveat:** npm `latest` is **2.3.0** and a `2.3.0` string appears in the bundle, so the deployed build is
**"2.2.0 or later"**. A defect found here is not attributable to PR #255 alone without bisecting.

## 2. Pipeline steps not applicable

| Step | Status | Reason |
|---|---|---|
| **1b — BA story/AC review** | **Skipped** | Ticket `description` is **null** and there are **zero acceptance criteria**. There is no AC spine to score or reconcile, so `ac-analysis.md` is not produced and the PASS-requires-AC-evidence rule cannot apply. The ticket's own 60-case test plan (comment 2026-07-28) is used as the checklist instead. |
| **3 — test-management-specialist checklist** | **Superseded** | The ticket already carries a detailed, better-grounded plan (3 axes, ~60 cases, exit criteria, defect-reporting taxonomy). Re-deriving a checklist would add ceremony, not coverage. Cases were passed to execution agents verbatim from the ticket. |
| **6a — App Insights correlation** | **Skipped** | No App Insights wiring exists for the `vcmp-dev` deployment (`APPINSIGHTS_*` are defined only for vcst/vcptcore). Per policy this is noted, not verdict-blocking. |

## 3. Deviations from the ticket's plan — cannot be executed in this harness

| Plan requirement | Cases | Deviation |
|---|---|---|
| **NVDA / VoiceOver** screen-reader verification | A11Y-06, 13, 14, 17 | No screen reader available. Substituted with **accessibility-tree + computed accessible-name/role/aria-state** assertions. These catch missing names/roles/live-regions but are **not** SR transcripts. |
| **Safari** (explicitly mandatory) | BS-15 | Unavailable — Windows host, WebKit barred. The `whatwg-fetch`-removal risk in Safari is **NOT VERIFIED**. |
| **macOS** | §7 matrix | Unavailable. Windows only. |
| Local `yarn test:unit` / `test:storybook` / `test:a11y` / `check` | A11Y-09, A11Y-10, §8 | Need a local vc-shell checkout; excluded by the deployed-build-only decision. |
| **Bundle before/after** vs 2.1.0 | BS-01, 02, 07, 08, 10 | No baseline build captured (user decision: deployed-build-only). These are comparisons and are reported as **not measured**, never as pass/fail. |

## 4. Bundle axis — measured on the deployed build

| Metric | Value |
|---|---|
| First-load JS, **transferred (compressed)** | **1.28 MiB** across **79** files |
| Uncompressed | 4.53 MiB |
| Largest (compressed) | vc-shell-vendors 192.6 KB · tiptap 171.0 KB · lucide 152.5 KB · appinsights-sdk 82.1 KB · index 62.0 KB · charts 56.9 KB · framework 36.3 KB |

Settled without a baseline:
- **BS-04 PASS** — `vee-validate` core appears **once**. The two `*vee*` chunks are different packages: core (41 KB, `useField`/`useForm`/`validateObject`) and **`@vee-validate/rules`** (11 KB, the rule set). Not duplicate bundling.
- **BS-05 PASS** — `whatwg-fetch` absent from all 79 chunks.
- **BS-03 open question** (delegated) — `index.html` `modulepreload`s **both** `vc-shell-vendor-charts` and `vc-shell-vendor-gridstack`, so they are fetched **eagerly on first load, including on the login page**. Whether opt-in subpath exports *deferred* that cost or merely *relocated* it is being verified in-browser.

## 5. Infrastructure findings (this repo — NOT VCST-5412)

- **`--secrets` pointed at `.env.local`** (all three Playwright servers), which also holds `GITHUB_TOKEN`,
  `GITHUB_FIX_BUGS_TOKEN`, `ANTHROPIC_API_KEY`, `JIRA_API_TOKEN`, `FIGMA_API_KEY`, `POSTMAN_API_KEY`,
  `BROWSERSTACK_ACCESS_KEY` — contrary to `.claude/rules/mcp-browsers.md`, which mandates the scoped
  `.env.playwright.local` precisely so a malicious page cannot induce typing a PAT into a form.
  **Fixed** in `.mcp.json`; required an MCP restart.
- **`.gitignore` gap:** `.env.*.local` matches only names *ending* in `.local`, so `.env.playwright.local.bak`
  / `.env.local.save` and similar are **committable with secrets**. Worth tightening to `.env.*local*`.
- `ADMIN_PASSWORD_VCMP-DEV` (hyphen) cannot resolve through `config.js` — `TEST_ENV` is validated against
  `/^[a-z0-9_]+$/` and suffix promotion builds `_${TEST_ENV.toUpperCase()}`, i.e. `..._VCMP_DEV`. The hyphenated
  name works for Playwright `--secrets` (verified) but is a silent no-op for any Node consumer via `process.env`.
  There is also no `.env.vcmp-dev` layer and no committed identity var for this deployment.
