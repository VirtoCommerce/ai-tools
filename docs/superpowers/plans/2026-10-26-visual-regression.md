# Visual regression — implementation plan

**Goal.** Give the QA flow a visual instrument it does not have today: a deterministic **pixel
regression** (`PIXEL`) that answers *"did something change that should not have?"* — for **any web
front** (vc-frontend, frontend-next, customer forks, vc-shell, Admin SPA). Then make the strategy pick
it, or one of the three visual instruments it already half-has, only where it pays.

**Why now.** The visual axis ([`visual-axis.md`](../../../.claude/skills/qa-test/visual-axis.md)) runs
a11y, token and `vs. DESIGN` checks; the layout runner measures BL-UI geometry. Nothing compares a
build with the build before it. `/qa-storybook`'s "visual regression" was a template an agent followed
by hand with MCP screenshots — no comparator, no stored baseline, no determinism. vc-frontend's
Storybook 9.1 is built and deployed by CI and compared with nothing.

## The four instruments

| Instrument | Question it answers | Engine | Where it is the right tool |
|---|---|---|---|
| `PIXEL` | Did anything change that should not have? | `plugins/vc-frontend/visual/` (`npm run visual:*`) — head build vs base build | ui-kit / token / global-style change, a refactor or dependency upgrade that declares *no visual change*, an upstream merge into a fork, a theme, the release regression |
| `DESIGN` | Does it match its reference (design project, Storybook)? | `qa-design` + `claude-design-verification.md`; later the `design-review` AC catalog (Phase 4) | new UI with a design link, a customer theme |
| `PROBE` | Does layout break on hard data? | `layout-runner` (`048c`) + `measure-layout.ts` | any rendered change; stress matrix: locale × length × width × theme |
| `CONTENT` | Is the rendered text right? | new probes (Phase 5) | raw i18n keys, GUIDs, placeholder prices, broken images/icons |

`PIXEL` is useless on a NEW surface (no baseline) and blind to stress-data and content defects; those
go to `DESIGN`, `PROBE`, `CONTENT`. The choice is specified once, in `visual-axis.md` §2a.

## Design — one engine, two sources of targets

`visual:snap` shoots **targets**, `visual:diff` compares two sets of them. Nothing in either is tied to
a framework or a project:

- **`--storybook <dir|url>`** — every story of a Storybook 7+ build. Base and head are two builds from
  source, shot in one run. `visual:affected` narrows the stories from a git diff in **any** repo with
  stories (`--roots` for a fork's own component dirs, `--global` for its restyle-everything files;
  vc-frontend's layout is the default). A file inside a root that no component owns fails open (`ALL`).
- **`--pages <targets.json> --base-url <url>`** — named routes of any running web app. Base and head
  are two URLs (a stand and a PR preview, a fork before and after an upstream merge). API answers are
  recorded once on base and replayed on both, matched by method + path + query + **body** (GraphQL
  POSTs every operation to one path) and never by origin (base and head live at different addresses).
  `hide` / `mask` selectors cover what legitimately differs per load.

Noise is handled by **repetition, not a pixel threshold**: pass 1 shoots once; the flagged targets are
shot 3× on each side; a target is unchanged when any base shot matches any head shot.

## Evidence

**Spike, 2026-10-23** — vc-frontend `master` Storybook built locally (~80 s), all 750 stories shot
headless (Chromium, 1280×800, DPR 1, reduced motion, animations off, fonts ready, foreign requests
aborted), compared with pixelmatch (threshold 0.1):

| Check | Result |
|---|---|
| One pass | 750 stories, ~5 min on 6 pages; 2 did not render (`vcicon--all-icons` timeout, `vcpagination--one-page`) |
| Same build twice | 747 / 748 pixel-identical |
| Two seeded regressions (md `VcButton` padding −2 px, `VcBadge` radius −2 px) | both caught, 59 stories in 14 components — the blast radius, not only the edited components |

**Engine, 2026-10-26** — the same two builds through `visual:affected` → `visual:snap` → `visual:diff`:

| Check | Result |
|---|---|
| `visual:affected` on the two edits | `SUBSET`, 49 component dirs (499 of 750 stories) — **all 14 components that really changed are in scope**; the first version missed 3 until stories counted as sources (a story slots a VcButton into a VcEmptyView) |
| Base vs mutant, pass 1 → pass 2 (`--repeat 3`) | 59 flagged → **58 changed + 1 `unstable`** (VcEmptyPage), all 14 components, 0 missed |
| Base vs base (false positives), pass 1 → pass 2 | 2 flagged (VcTable) → **0** |
| Why no pixel threshold | the real `VcBadge` outline regression moved **12 px**; the noisiest identical-build story moved 10 px. A 20 px threshold (the first design) hid 2 of the 5 badge stories |
| Noise sources found and removed | an icon loading as a lazy chunk (fixed: `networkidle` + images complete); bistable layouts in VcTable / VcEmptyPage (not fixable by waiting; scrolling first made it worse → `--repeat`) |
| Pages source, frozen data | a mini app whose `/api` data differs between base and head: without HAR → `changed`; recorded on base, replayed on both → `same`; a real 4 px margin change on head under frozen data → `changed`. GraphQL-shaped (two POSTs to one path): replay keyed by body → `same` |
| Pages source on the two Storybook builds | button, badge, modal `changed`; alert `same`; a target whose changed region is masked → `same` |

Bug-history read (≈45 visual/UI reports under `reports/bugs/`, classified by title): about half are
caught by **measurement** (contrast, overflow at 320/375, CLS, touch targets, shifts); ≈7 are
overlap/clipping under **stress data**; ≈10 are **content** (raw i18n keys, GUIDs, `£0.00`, wrong
label); ≈5 are design drift or a missing icon. `PIXEL` catches *changes after a PR*, not defects that
predate it — one instrument of four.

## Phases

### Phase 1 — `PIXEL` engine + skill + axis wiring (this PR)

- [x] `visual:snap` (moved in Phase 2 to `plugins/vc-frontend/visual/snap.mjs`) — Storybook and pages sources, determinism settings, `--repeat`,
  HAR record/replay (`--har-url` mandatory), `--storage-state`, `--block`, `hide`/`mask`.
- [x] `visual:diff` — best-pair comparison over repeated shots; `same / changed / unstable
  / size-changed / added / removed / unrendered`; diff PNGs; `flagged-ids.txt` for pass 2.
- [x] `visual:affected` — git diff → components + their renderers, any repo with stories.
- [x] `.claude/skills/qa-visual-regression/` — sources, two-pass procedure, triage, checklist rows.
- [x] `visual-axis.md` §2a — the four instruments; `PIXEL` verdict rows in §3; `ui-kit-class.md`
  takes `PIXEL`.
- [x] `/qa-storybook` — its by-eye baseline template replaced by a pointer to the skill.
- [x] Verified on real builds and on the pages fixtures above.

The strategy (`plugins/vc-test/skills/qa-test-strategy/floors.md`) routes F3/F8 to "the visual lane"
and cites `visual-axis.md` for what that lane runs, so Phase 1 reaches it by citation — no plugin
change, no version bump.

### Phase 2 — the checklist, the strategy, the fork flow

- [x] Visual checklist rows name their instrument (`[PIXEL]`, `[DESIGN]`, `[PROBE]`, `[CONTENT]`) and are derived
  after ticket analysis — `visual-axis.md` §6.
- [x] `vc-test` 0.4.0: a `VISUAL` risk names its instrument (`VISUAL:PIXEL|DESIGN|PROBE|CONTENT`, gate clause 4);
  F8 requires a `VISUAL:PIXEL` risk (gate clause 6, `floors.mjs`); `/vc-test:qa-ticket` runs each `VISUAL:PIXEL`
  risk through `qa-visual-regression`. Tag `vc-test--v0.4.0` after the merge (`docs/release-process.md` §Step 5a).
- [x] Release visual run — `regression-selection.md` §Visual regression at a release: base = the previous
  release tag, the whole kit, plus the key routes.
- [x] `vc-frontend` 0.2.0: the engine ships in the plugin (`plugins/vc-frontend/visual/*.mjs`), and
  `npm run visual:*` in ai-tools runs the same files — one engine, no second copy. `setup.mjs` installs its three
  packages into the fork's `node_modules/.cache/` (never its `package.json`); `--with-browser` adds Chromium.
  `merge-upstream` step 7 compares the fork before the merge (`M^1`) with the merge (`M`) on Storybook and pages
  (`skills/merge-upstream/visual.md`): a fork component, its theme or a restyled ui-kit component that moved
  without the brief accepting it is a regression. Verified as an installed plugin in a repository with no
  packages: exit 2 with the setup command, setup, then the seeded badge regression found. Tag
  `vc-frontend--v0.2.0` after the merge only if another plugin starts depending on it (none does today).

### Phase 3 — page targets for the Virto storefront (needs a reachable stand)

- [x] Storefront targets: [`vcst-storefront.json`](../../../.claude/knowledge/automation/visual-targets/vcst-storefront.json)
  — home, catalog, PDP, cart (vcst runs one-page checkout: `/checkout` redirects to `/cart`, which holds
  the shipping and payment steps), account dashboard / orders / profile; signed in as `USER`
  (`scripts/auth/save-storage-state.ts`), replayed with `--har-url "**/graphql"`. Masked: the hero slider,
  PDP *Customers bought together*, cart *Recently browsed*, the footer build string (it differs on every
  deploy and would flag every page of a base-vs-head pair).
- [x] Admin SPA targets: [`vcst-admin.json`](../../../.claude/knowledge/automation/visual-targets/vcst-admin.json)
  — dashboard + the first blade of catalog, orders, customers, stores, pricing, marketing; replayed with
  `--har-url "**/api/**"` (the Admin SPA talks REST, not GraphQL). Only the first blade of a module has a
  URL; a detail blade opens by click and is not a page target.
- [ ] A repo command for an Admin storage state. `save-storage-state.ts` signs into the storefront only;
  the Admin run used a one-off script that fills the real login form from `resolveRole("ADMIN")` in-process.

**Measured on vcst, 2026-10-27** (Chromium 156, headless, same machine). The planted regression has no
second build to come from, so head is the stand behind a local proxy that injects one CSS rule into every
HTML response, and base is the same proxy without it — the rule is the only difference:

| Check | Storefront (7 targets × 1280x800, 375x812) | Admin SPA (7 targets × 1280x800) |
|---|---|---|
| HAR recorded once on base | 167 GraphQL answers | 87 REST answers |
| Stand vs stand, replayed, pass 1 | 14 / 14 `same` (twice) | 6 `same`, 1 `changed` (marketing: the second blade lands at a different x) |
| Proxy vs proxy, pass 1 | 13 `same`, 1 `changed` (catalog 1280: two `SearchProducts` answers race — card order and count differ) | — |
| Pass 2 (`--repeat 3`) on those | `same` | `same` |
| Replay misses / `unrendered` | 0 / 0 | 0 / 0 |
| Planted rule | `.vc-widget{border-radius:2px}` | `.blade-header__title{margin-left:2px}` |
| Planted, pass 1 → pass 2 | 11 flagged → **10 `changed` + 1 `unstable`** (catalog 1280); smallest real diff 3 px | 6 flagged → **4 `changed` + 2 `unstable`** (pricing, marketing: two-blade pages) |
| Not flagged, and right not to be | home ×2, catalog 375: their only `.vc-widget`s have no border, background or shadow, so the radius draws nothing | dashboard: no blade header |

Missed: 0. As on Storybook, the noise is **bistable layouts**, not drift — the replay holds the data still,
and `--repeat` clears the rest. An `unstable` row is a real change on a page that also moves by itself:
read its diff by eye (skill §5).

### Phase 4 — `DESIGN` from the `design-review` skill (with its author)

- [x] Its AC catalog, source model and theme normalisation in `qa-design` (`component-acceptance.md`), with
  the overlaps reconciled: AC-A11Y / RSP / CNT / TOK stay with their owners (ours win: touch targets 24 AA / 44
  AAA, the generated spacing scale); a DESIGN difference stays advisory (`visual-axis.md` §3).
- [x] **Without its tools** (they live in a Claude project that could not be exported — only the loader
  `SKILL.md` was): our own headless engine, `visual:design` (`plugins/vc-frontend/visual/design.mjs`, vc-frontend
  0.3.0). Per component it judges AC-CMP / LAY / SPC / TYP / CLR (CIEDE2000) / BRD / ELV / PIX / THM against the
  catalog's tolerances, kept in its `THRESHOLDS`. Verified 2026-10-26 on vc-frontend Storybook: the seeded button
  padding (P3) and width (P2) and badge radius (P3, pixels P2) found, a control alert clean, a missing instance P2;
  the same button on the red preset is `theme` (both `--color-primary-500`), PASS, pixels not judged.
- [ ] Its report view (columns, heatmap, onion-skin) — and its tools, if they are ever exported, compared with
  `visual:design` before either replaces the other.

### Phase 5 — `CONTENT` probes + `PROBE` stress matrix

- [x] `layout-runner` `[PROBE:CONTENT]` + `[CONTENT]` (`measure-layout.ts` `contentAuditSnippet`): raw i18n keys in
  text and in accessible-name attributes, GUIDs in visible text, `img` loaded with `naturalWidth = 0`, leaked
  `undefined` / `NaN` / `null` / `[object Object]` / `{{ … }}`, and a no-space value with a digit drawn on two lines.
  Verified 2026-10-26: a planted page finds each class (incl. camelCase / kebab keys, `$NaN` and `Welcome,
  undefined`, de / pt prices whose spaces are non-breaking) and none of its look-alikes (an e-mail, a URL, a host,
  a file name, a version, a dotted SKU, code under `pre`, a price that fits), in Chromium and Firefox; a scope that
  matches nothing is BLOCKED; across all 750 vc-frontend stories, 0 raw keys / GUIDs / placeholders /
  mid-wraps, and the only 3 broken images are external photos the run itself blocked.
- [x] `048c` rows using it, and the stress matrix: locales (`pt`, `de`), ×2 text, many currencies,
  320/375/768/1280, themes. **Needs a reachable stand**: a case is promoted only after it ran there (and, per
  `cases-that-catch-bugs.md`, after it failed once on the bug it targets). Done 2026-10-27 on vcst — below.

**Phase 5b, 2026-10-27.** 15 rows in `048c`: `LAYOUT-CNT-001..008` (`[PROBE:CONTENT]` → `[CONTENT]`) and
`LAYOUT-STR-001..007` (the matrix, `[OVERFLOW]` plus one dark-theme `[CONTENT]`), pairwise over en / de / pt ×
USD / EUR / PTS / CZK × 320 / 375 / 768 / 1280 × light / dark × ×1 / ×2 text, signed out and as `USER`.

- **Runner.** `[STRESS:TEXT] x<N> [<scope>]` repeats every visible text to N× its length — the long-translation
  stress the runner could not express. `[AUTH]` now passes the one-time-code form the sign-in page opens on
  (`SWITCH_TO_PASSWORD_SELECTORS` from `save-storage-state.ts`); on `main` every `[AUTH]` row of `048c` (5) was
  BLOCKED at the password field, and with the fix they pass.
- **How the stand switches the axes.** Locale by URL segment (`/de/`, `/pt/`); currency by the header selector
  at desktop width (it is hidden on mobile) and kept across navigation; theme by `dark-mode-toggle`. Only USD,
  EUR and PTS have price lists on vcst — AUD / CNY / CZK / GBP / GHS / XPT render an empty catalog, the
  documented behaviour for an uncovered currency (ECL-12.1), so CZK gets the empty-state row. A product's slug
  is per language (`/de/` + the English slug is a 404), so PDP rows reach the page by clicking a catalog card.
  Signed-in rows stay on USD: a currency switch is saved on the shared account.
- **Guards against a hollow PASS.** Each currency switch waits for the header label to show the new code; price
  rows wait for a rendered price; order and cart rows for their table or place-order button. Two rows passed
  vacuously before the guards — a 404 PDP has no price to wrap and no width to overflow.
- **Proof (§6).** Every row ran on vcst, then through a local proxy that injects one mutant into every HTML page:
  a three-segment i18n key or a GUID in the main content, price CSS that breaks inside the number, a missing
  image, `white-space: nowrap` on text. Through the proxy without the mutant every row matched the stand; with
  it, each row FAILed on its own metric. 14 rows promoted with `tc:promote` from the final stand run.
- **Found.** `LAYOUT-STR-001` FAILs on the stand: the catalog's results count is `nowrap` with no ellipsis, so
  ×2 text widens a 320 px page to 353 (de), 341 (pt), 375 (ru); today's translations fit. Filed locally as
  `reports/bugs/open/low/BUG-catalog-results-count-nowrap-overflows-on-long-text-VCST-6534.md`, kb KB-06A3A50F;
  the row stays `Draft` until it is fixed.

### Phase 6 — vc-frontend CI — not doing (decided 2026-10-26)

- Dropped: no `PIXEL` gate on every vc-frontend PR, no pinned image, no stored baselines. `PIXEL` stays an
  instrument the strategy picks where it pays, and its base is always a build of the PR's base commit, shot in
  the same run.

## Constraints

- No committed unit test (`when-to-write-a-test.md`): the engine is verified on real builds; nothing
  was added under `scripts/unit/`.
- No value with a source of truth is transcribed: story ids come from the build's `index.json`,
  themes from the Storybook globals, routes and selectors from the caller's targets file.
- Nothing writes outside the directory the caller passes (`.claude/rules/test-data.md` THIRD RULE).
