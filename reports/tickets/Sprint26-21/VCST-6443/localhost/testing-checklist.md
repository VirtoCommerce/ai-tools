# Testing checklist — VCST-6443 · [PageBuilder] permalink validation (reject, never normalize)

Env: localhost (start-local) · Platform 3.1089.0 · PageBuilderModule 3.1036.0-pr-178-e4ff · store `@td(STORE_PRIMARY.id)` (B2B-store), en-US
Model: `test-model.md` (S1–S18 + Round 1) · Discovery: `exploratory/SBTM-VCST-6443-2026-10-22.md` · C1: `reports/regression/REG-2026-10-22-1819/`
Oracle: decision comment B. Kotov 2026-10-21 = {SPEC} (no BL-CMS family; NEW behaviour). Lanes: 4a-be = qa-backend-expert (playwright-edge), 4a-fe = qa-frontend-expert (playwright-chrome).
Probe pages: name prefix `AGENT-TEST-6443 4a`, deleted in Cleanup (DELETE grouped/{id} → GET 404). Fixtures: `@td(PB_6443_LEGACY_*)`, `@td(PB_6443_NOCREATE_USER.login)`.

| # | Condition (atomic) | Source | Scenario | Surface | Verdict | Evidence |
|---|---|---|---|---|---|---|
| CL-01 | `create-group-page` with the ticket STR `/test page` and `/test&page?x#y` → 400, body = rule text, nothing stored (search 0) | AC-1, C-01/02 | S2 | REST | PASS | 4a-be: 400 + rule ×2, search 0 |
| CL-02 | `create-group-page` rejects every class: lead/trail/inner space, tab, LF, NBSP, U+3000, U+0085, U+FEFF, U+0001, `?`, `#`, `&`, `\`, `//a`, `/a//b`, `.`, `/./a`, `/a/..` → 400 each | AC-5..8, C-06/08/09/10 | S2 | REST | PASS | 4a-be: 19 classes → 400 + rule, search 0 each |
| CL-03 | `create-group-page` accepts `/страница`, `/ページ`, `/test%20page`, `/100%`, `/a/`, `/` → 2xx, GET returns permalink verbatim | AC-9, C-11/12 | S3 | REST | PASS | 4a-be: 6 values 200, GET verbatim |
| CL-04 | Allowed-edge (record actual, no verdict on ticket): empty, `no-slash`, U+200B, `" < > { } ^` and the vertical bar, full-width `？＃＆＼` | gap-AC-6/8/13, C-07/24/32 | S3 | REST | N/A — INFO | 4a-be: all 200, stored verbatim (open question to author) |
| CL-05 | `POST grouped` invalid → 400 + no group; valid → 200 | AC-2, C-03 | S4 | REST | PASS | 4a-be: invalid 400 + search 0, valid 200 |
| CL-06 | `PUT grouped` changing permalink to invalid AND name in the same body → 400; GET after = GET before (name unchanged too) | AC-3, gap-AC-2, C-04 | S5 | REST | PASS | 4a-be: 400, GET byte-identical, modifiedDate unchanged |
| CL-07 | `PUT grouped` on `@td(PB_6443_LEGACY_S6.id)` with unchanged legacy permalink + new name → 200, permalink untouched; then publish → OK | AC-4, C-05 | S6 | REST | PASS | 4a-be: PUT 200, publish `?publish=true` 200, published:true |
| CL-08 | `PUT grouped` on `@td(PB_6443_LEGACY_S7.id)`: case-only change and change to another invalid value → 400 each, stored unchanged | AC-4, gap-AC-11 | S7 | REST | PASS | 4a-be: both 400, stored unchanged |
| CL-09 | 400 contract on all three endpoints: status 400, `text/plain`, identical rule sentence | gap-AC-1, C-21 | S14 | REST | PASS | 4a-be: identical text/plain body on 3 endpoints |
| CL-10 | User without Create (`@td(PB_6443_NOCREATE_USER.login)`) + invalid permalink on create-group-page / POST grouped → 403 (not 400) | gap-AC-12, C-22 | S13 | REST | PASS | 4a-be: 403 ×2, empty body, nothing created |
| CL-11 | [JOURNEY] Shell: new page with invalid permalink → field error, Save disabled → fix → Save → Publish → storefront renders the page | AC-10, C-13 | S1 | Admin shell + storefront | PASS | 4a-fe-cl11-invalid-save-disabled.png · 4a-fe-cl11-saved-published.png · 4a-fe-cl11-storefront-renders.png |
| CL-12 | Shell: invalid permalink also keeps Publish disabled; error text shown under the field | AC-10, C-26 | S1 | Admin shell | PASS | 4a-be-cl12-shell-new-invalid-save-disabled.png · 4a-be-cl12-shell-existing-invalid-save-publish-disabled.png |
| CL-13 | Shell, `@td(PB_6443_LEGACY_S8.id)`: rename → Save OK (twice), reload keeps exemption; change permalink to invalid → blocked; revert → Save re-enabled | AC-12, C-14 | S8 | Admin shell | PASS | 4a-be-cl13-shell-legacy-changed-invalid-blocked.png |
| CL-14 | Legacy blade: new page with invalid permalink → error + Create disabled; existing page → Save + Publish disabled | AC-11, C-15 | S9 | Admin legacy blade | PASS | 4a-be-cl14-blade-new-invalid-create-disabled.png · 4a-be-cl14-blade-existing-invalid-save-publish-disabled.png (inner space/&/..) — leading/trailing space: C1 CMS-242 FAIL |
| CL-15 | Legacy blade, page with a stored invalid permalink: other field change → Save enabled and saves; second save still allowed | AC-12, C-16 | S10 | Admin legacy blade | PASS | 4a-be-cl15-blade-legacy-other-field-save-enabled.png |
| CL-16 | Error message translated in ru-RU and ja-JP UI locale in both apps (no raw key) | gap-AC-18, C-27 | S15 | Admin both | PASS | 4a-be-cl16-blade-ru-error.png · 4a-be-cl16-shell-ja-error.png |
| CL-17 | Storefront: published `/agent-test-6443-4a-страница` renders at its natural URL | gap-AC-20, C-28 | S11a | Storefront | PASS | 4a-fe-cl17-cyrillic-renders.png |
| CL-18 | Storefront: published `/agent-test-6443-4a%20pct` (accepted by the rule) renders at its natural URL | gap-AC-20, C-28 | S11b | Storefront | FAIL | 4a-fe-cl18-pct-natural-url-404.png · 4a-fe-cl18-pct-double-encoded-renders.png · same in 3x and C1 CMS-231 |
| CL-19 | Platform import stores an invalid permalink verbatim, errorCount 0 | AC-14, C-18 | S12 | REST/Import | PASS | 4a-be: import job d0dc44be errorCount 0, permalink byte-identical |
| CL-20 | Clone of `@td(PB_6443_LEGACY_S18.id)` in the shell → 400 surfaced as alert/toast, no page created | gap (3x) | S18 | Admin shell | PASS | 4a-be-cl20-shell-clone-legacy-400-alert.png ({HYPOTHESIS} oracle — author decision) |
| CL-21 | AI `create-page` tool: deployed create-page.yaml permalink description lists the rule | AC-13, C-17 | S16 | Module file | PASS | 4a-be: deployed modules/…pr-178-e4ff/ai/tools/create-page.yaml text |
| CL-22 | `content-json` with invalid `settings.permalink` → record status + which permalink GET grouped, pageDocuments and the storefront use | gap-AC-25, C-30 | S17b | REST + storefront | N/A — INFO | 4a-fe: 204; group permalink drives routing; content-settings value is dead data · 4a-fe-cl22-storefront-after-content-json.png |
| CL-23 | Content API (`POST api/content/pages/{store}`) stores an invalid permalink — record as by-design (PR body) | gap-AC-26, C-31 | S17 | REST | N/A — INFO | 4a-be: 200, stored verbatim |
| CL-24 | Autotests vc-test-automation-framework#208 `pages.spec.ts` › spaces rejected, reserved characters rejected pass against localhost | AC-15, C-20 | — | Playwright | PASS | 4a-fe: 2/2 passed (PR head 1fc4a3d) |
| CL-26 | `create-group-page` with a 2 048- and a 10 000-character valid permalink → defined 2xx/4xx, never 5xx, no truncation | gap-AC-9, C-23 | S3 | REST | FAIL | 4a-be: 2048 → 200; 2049/10000 → 500 `22001: value too long for type character varying(2048)` on 3 endpoints |
| CL-27 | Legacy blade: duplicate-permalink warning still shows for a duplicate valid permalink, and does not mask the new format error | gap-AC-14, C-25 | S9 | Admin legacy blade | PASS | 4a-be-cl27-blade-duplicate-warning.png · 4a-be-cl27-blade-format-error-plus-stale-duplicate.png (stale duplicate text stays — Low) |
| CL-28 | Export of an imported legacy page round-trips its permalink unchanged | gap-AC-22, C-29 | S12 | REST/Export | PASS | 4a-be: exported JSON keeps 5 legacy permalinks verbatim |
| CL-25 | Console: no new errors on the shell and blade pages while validating (App Insights not configured on localhost — SKIPPED) | DoD | — | Admin both | PASS | 4a-be: only expected clone 400 + env 404s |

Uncovered conditions (stated, not silent): legacy page migration (AC-14 second half, C-19) — no legacy migration path reachable on a fresh local DB → NOT TESTED · "has Create but wrong store" 400-vs-403 → WAIVED (no fixture, not an AC) · a11y of the field error (gap-AC-19) → visual lane WAIVED at 2c.
