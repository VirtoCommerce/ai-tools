# Testing checklist — VCST-6443 · Round 3 · [PageBuilder] permalink validation — vcptcore-qa @ PR #178 61e8ba0

Env: vcptcore-qa · PageBuilderModule `3.1036.0-pr-178-61e8` (live via `/api/platform/modules`, 2026-10-26T09:15Z) · store B2B-store.
Scope: FULL run on the stand the fix was delivered to — the two Round-2 items `61e8ba0` addresses (R2-06 FAIL, R2-21 INFO), the full server class sweep, and every Round-2 row re-run here (legacy fixtures seeded on vcptcore by `seed:pb-legacy-permalinks`).
Not run here: R2-27 AI `create-page` tool description (file unchanged since `add254f`; not readable from the stand) · R2-29 autotests #208 — not run by operator decision 2026-10-27 (their seeder resets the shared `store-acme` users' passwords); all 7 of their values are in R3-REG-3 / R3-06 (400, nothing stored).
Rule under test: Round-2 {SPEC} = dev comment 112319 (B. Kotov 2026-10-23); Round-2 checklist: `../vcst/testing-checklist.md`.
Probe pages: name prefix `AGENT-TEST-6443 R3`, all deleted in Cleanup (DELETE 200 → GET 404, 10 pages).

| ID | Check | Was | Layer | Lane | Result | Evidence |
|---|---|---|---|---|---|---|
| R3-06 | Astral Cf U+E0001, U+E0041, U+1D173, U+1BCA0 + BMP U+2060 → 400 + rule sentence on `create-group-page` and POST grouped, nothing stored; PUT grouped → 400, name + permalink unchanged | R2-06 FAIL (200, stored) | REST | node | PASS | 5 values × 3 endpoints → 400; search 0; PUT before = after |
| R3-REG-1 | Still rejected → 400, nothing stored: `%`, `<`, inner space, `?`, `//`, U+200B, ZWJ emoji (U+200D), 2049 chars | R2-01..03 PASS | REST | node | PASS | create-group-page + POST grouped 400 each |
| R3-REG-2 | Still accepted, stored verbatim: 2048 chars, `/…-😀`, Cyrillic, full-width `？＃`; PUT 2048 → 200 | R2-04/05 PASS | REST | node | PASS | 200, GET permalink === sent |
| R3-REG-3 | `IsInvisible` was rewritten (per Rune; U+FEFF left the explicit list) → full Round-1 + Round-2 class sweep on `create-group-page`: ticket STR, lead/trail/inner space, tab, LF, CR, NBSP, U+3000, U+0085, U+FEFF, U+0001, U+007F, U+2028, U+00AD, U+200E, U+180E, `# & \ %20 %2F " > { } \| ^` backtick, `//a`, `/.`, `/./a`, `/a/..`, `..` → 400, nothing stored (34 values); accepted verbatim: no slash, trailing slash, Japanese, full-width `＼`, ❤️ (VS16), 1023 emoji + `a` = 2048 UTF-16 | R2-01..04 (on add2) | REST | node | PASS | 0 deviations |
| R3-26 | Platform import stores legacy-invalid permalinks unchanged — `seed:pb-legacy-permalinks` on vcptcore (8 groups, job 111710, 0 errors, GET byte-identical); each value → 400 on create-group-page (non-vacuous) | AC-14 | REST/Import | node | PASS | seeder output |
| R3-09 | `@td(PB_6443_LEGACY_S6.id)`: PUT unchanged legacy permalink + rename → 200, permalink untouched; publish `?publish=true` → 200, publish-status `published:true` | AC-4 | REST | node | PASS | name restored after |
| R3-10 | `@td(PB_6443_LEGACY_S7.id)`: PUT case-only change / other invalid / `+?y` (each with a rename) → 400 ×3, name + permalink unchanged | AC-4 | REST | node | PASS | |
| R3-11 | `@td(PB_6443_LEGACY_LT.id)` (`<`): PUT unchanged + rename → 200 (exemption holds for the new classes); `@td(PB_6443_LEGACY_PCT.id)` seeded Published | 112319 | REST | node | PASS | |
| R3-08 | POST grouped `%` → 400, no group stored | AC-2 | REST | node | PASS | |
| R3-12 | `@td(PB_6443_NOCREATE_USER.login)` + invalid permalink on create-group-page and POST grouped → 403 (not 400), nothing stored; valid permalink → 403 (seeder) | gap-AC-12 | REST | node | PASS | |
| R3-34 | 400 contract: `text/plain; charset=utf-8`, body = the rule sentence | CMS-234 | REST | node | PASS | |
| R3-28 | `content-json` (`{content:"<json>"}`, strong If-Match) with invalid `settings.permalink` → 204; group permalink kept, content carries the invalid value | 112319 Q4 | REST | node | INFO | accepted per 112319 |
| R3-18 | [JOURNEY] Shell: `/agent test r3` → error + Save disabled; `%20` variant blocked; valid → Save → Publish → storefront renders at the natural URL (control: unknown URL → 404) | AC-10 | Shell + storefront | chrome | PASS | `r3-fe-r2-18-*.png` |
| R3-19b | Shell: `%`, `<a>`, `{a}`, `a\|b`, U+200B, ZWJ emoji → error, Save disabled; 😀 and Cyrillic → Save enabled | 112319 | Shell | chrome | PASS | `r3-fe-r2-19-*.png` |
| R3-20 | Shell, `@td(PB_6443_LEGACY_S8.id)`: rename → PUT 200, permalink kept; change to another invalid → Save + Publish disabled; revert → clean, saves. `@td(PB_6443_LEGACY_PCT.id)` (Published) rename → saved | AC-12 | Shell | chrome | PASS | `r3-fe-r2-20-*.png` |
| R3-40 | CMS-240: invalid permalink + dirty Name → Save + Publish disabled; Name only dirty → Save on, Publish off; after Save → Publish on | AC-10 | Shell | chrome | PASS | `r3-fe-cms-240-*.png` |
| R3-41 | CMS-241: invalid typed, not saved, real reload (leave-page prompt) → stored value back, no stale error | AC-10 | Shell | chrome | PASS | `r3-fe-cms-241-after-reload-clean.png` |
| R3-42s | CMS-242 shell half: leading / trailing space kept and rejected; pasted LF → space (single-line input) → rejected | AC-11 | Shell | chrome | PASS | `r3-fe-cms-242-leading-space.png` |
| R3-22s | Shell locales ru-RU / ja-JP: rule text translated, `{ } \| ^` backtick literal, not cut. Known Low (as R2): the visible error stays in the previous language until re-validation; "Has unsaved changes" banner untranslated | 112319 | Shell | chrome | PASS | `r3-fe-r2-22-shell-*.png` |
| R3-23 | Clone a valid page → `(copy)` at `…-copy`, 200; clone `@td(PB_6443_LEGACY_S18.id)` → 400, rule text in toast + alert, no copy stored | 112319 Q2 | Shell | chrome | PASS | `r3-fe-r2-23-*.png` |
| R3-24 | Published Cyrillic permalink renders at its natural storefront URL | gap-AC-20 | Storefront | chrome | PASS | `r3-fe-r2-24-cyrillic-render.png` |
| R3-25 | Legacy `%20` page (PCT) at its natural URL → 404; Builder.io `urlPath` double-encoded (`%2520`) — VCST-6512 residual, pre-existing; new `%` permalinks are now rejected | VCST-6512 | Storefront | chrome | INFO | `r3-fe-r2-25-pct-natural-url.png` |
| R3-13 | Blade (VCST-6511): new page — leading/trailing space, leading/trailing tab → error + Create disabled; not trimmed after blur; existing page → Save + Publish disabled | VCST-6511 | Blade | edge | PASS | `r3-be-R2-13-*.png` |
| R3-14 | Blade: inner space, `%`, `<x>`, U+200B, `//`, `/../`+backtick+`{` → error + blocked; `%` on an existing page blocks Save + Publish; `/…-страница-日本語-😀` → enabled | AC-11, 112319 | Blade | edge | PASS | `r3-be-R2-14-new-percent.png` |
| R3-15 | Blade duplicate warning: valid duplicate → warning, Create enabled; + `%` → warning hidden, format error, Create disabled; remove `%` → warning back (vcptcore's B2B-store content index was empty — own probe page published to seed it) | 112319 (R1 Low) | Blade | edge | PASS | `r3-be-R2-15-*.png` |
| R3-16 | CMS-229: stored legacy-invalid `.page` (Content API) → no error, other-field change saves twice in session, permalink kept; change to another invalid → blocked; revert → Save on | AC-12 | Blade | edge | PASS | `r3-be-R2-16-*.png` |
| R3-17 | Blade length: 2048 → accepted; 2049 → error + Create disabled (no input cap) | VCST-6513 | Blade | edge | PASS | `r3-be-R2-17-new-2049-rejected.png` |
| R3-22b | Blade locales ru-RU / ja-JP: rule text complete, symbols literal, no raw key (aria-label stays "Permalink" — cosmetic) | 112319 | Blade | edge | PASS | `r3-be-R2-22-blade-*.png` |
| R3-37 | CMS-237: Content-module save path accepts an invalid permalink (unguarded by design) | PR body | REST | edge | INFO | |
| R3-30 | Console: no new JS errors, no 5xx; stand noise only (SignalR 302, theme logo 404, `git/legacy-draft` 404 on draft-only probe) | DoD | Both | chrome+edge | PASS | |
| R3-INFO | Lone surrogate `\uD800` / `\uDC00` in raw JSON → 200, stored NOT verbatim (replaced while the JSON is read, same length); empty permalink → 200 | — | REST | node | INFO | not reachable from either UI; recorded only |
| R3-21 | Shell permalink input holds 2048 chars → no error, Save enabled, saved 2048 (GET); paste 2049 → truncated to 2048, never stored | R2-21 INFO (capped 1024) | Admin shell | edge | PASS | `r3-21-shell-2048-before-save.png`, `r3-21-shell-2048-saved.png`, `r3-21-shell-2049-truncated.png` |
| R3-07 | `/r3-`+U+E0041 → field error + Save disabled in the shell; error + Create disabled in the legacy blade (valid value re-enables Create) | R2-07 PASS | Admin both | edge | PASS | `r3-07-shell-tag-char-error.png`, `r3-07-legacy-tag-char-error.png` |
| R3-19 | Shell `/agent-test-6443-r3-😀` → no error, Save enabled, GET verbatim | R2-19 PASS | Admin shell | edge | PASS | `r3-19-shell-emoji-ok.png` |


Console / network: no 5xx. One 401 on `POST /api/page-builder-pages/grouped` after ~40 min idle (session expiry, re-login; env, not a finding). Pre-existing 404 on theme `logo.png` in the legacy Content view.
