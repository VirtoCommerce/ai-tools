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
| `PIXEL` | Did anything change that should not have? | `scripts/visual/` — head build vs base build | ui-kit / token / global-style change, a refactor or dependency upgrade that declares *no visual change*, an upstream merge into a fork, a theme, the release regression |
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

- [x] `scripts/visual/snap.ts` — Storybook and pages sources, determinism settings, `--repeat`,
  HAR record/replay (`--har-url` mandatory), `--storage-state`, `--block`, `hide`/`mask`.
- [x] `scripts/visual/diff.ts` — best-pair comparison over repeated shots; `same / changed / unstable
  / size-changed / added / removed / unrendered`; diff PNGs; `flagged-ids.txt` for pass 2.
- [x] `scripts/visual/affected.ts` — git diff → components + their renderers, any repo with stories.
- [x] `.claude/skills/qa-visual-regression/` — sources, two-pass procedure, triage, checklist rows.
- [x] `visual-axis.md` §2a — the four instruments; `PIXEL` verdict rows in §3; `ui-kit-class.md`
  takes `PIXEL`.
- [x] `/qa-storybook` — its by-eye baseline template replaced by a pointer to the skill.
- [x] Verified on real builds and on the pages fixtures above.

The strategy (`plugins/vc-test/skills/qa-test-strategy/floors.md`) routes F3/F8 to "the visual lane"
and cites `visual-axis.md` for what that lane runs, so Phase 1 reaches it by citation — no plugin
change, no version bump.

### Phase 2 — the checklist, the strategy, the fork flow

- Visual checklist rows carry `instrument: PIXEL|DESIGN|PROBE|CONTENT` (`qa-checklist`, Artifact B),
  generated after ticket analysis from `visual:affected`. A row with no instrument decides nothing.
- `vc-test` strategy: `VISUAL` risks name their instrument; F8 adds `PIXEL`. Plugin change ⇒ version
  bump + tag (`docs/release-process.md`).
- `vc-frontend` plugin: `merge-upstream` runs `PIXEL` on the fork before vs after the merge (the fork
  owns how it looks). Plugin change ⇒ version bump + tag.
- `/qa-regression visual` (release): all stories + a page targets set, Coffee + Red × 375 + 1280, base
  = the previous release tag.

### Phase 3 — page targets for the Virto storefront (needs a reachable stand)

- A targets file of key storefront routes (home, catalog, PDP, cart, checkout steps, account) with
  `hide`/`mask` for carousels and recommendations, and the xAPI GraphQL endpoint as `--har-url`.
- Measure on a stand: noise on the targets across two passes, then one seeded regression — the same
  two measurements as Phase 1, on real pages. Admin SPA blades the same way.

### Phase 4 — `DESIGN` from the `design-review` skill (with its author)

- Port its AC catalog (16 numeric criteria, P1/P2/P3, verdict rule), its source model (Storybook for
  existing components, the design project for new ones, the innovations registry) and its theme
  normalisation into `qa-design`; reconcile thresholds with BL-UI and `measure-layout.ts` (it uses 44 px
  touch targets at 390, ours is 24 AA / 44 AAA) so each lives in one place.
- Move its tools into git; run its extractor headless on our lanes.
- Its report (columns, heatmap, onion-skin) becomes the review view for `PIXEL` diffs too.
- Its prod-vs-Storybook mode stays the customer-theme check: it cannot catch a component regression,
  because Storybook and prod share the component code.

### Phase 5 — `CONTENT` probes + `PROBE` stress matrix

- `layout-runner` probes: visible text shaped like an i18n key or a GUID, `img`/icon with
  `naturalWidth = 0`, a value wrapped mid-token.
- Stress matrix on `048c`: locales (`pt`, `de`), ×2 text, many currencies, 320/375/768/1280, themes.

### Phase 6 — vc-frontend CI (frontend team)

- `PIXEL` on every PR in vc-frontend, pinned Linux image, baselines owned there. Until then the base
  is a build of the PR's base commit, shot in the same run.

## Constraints

- No committed unit test (`when-to-write-a-test.md`): the engine is verified on real builds; nothing
  was added under `scripts/unit/`.
- No value with a source of truth is transcribed: story ids come from the build's `index.json`,
  themes from the Storybook globals, routes and selectors from the caller's targets file.
- Nothing writes outside the directory the caller passes (`.claude/rules/test-data.md` THIRD RULE).
