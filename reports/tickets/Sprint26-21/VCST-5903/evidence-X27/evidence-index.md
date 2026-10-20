# Evidence index — X27 VcStatWidget: unbreakable prose overflows the card

| Field | Value |
|---|---|
| Ticket / row | VCST-5903 Round 2, triage row X27 |
| Env | `TEST_ENV=vcst` — `STORYBOOK_URL` (QA Storybook), ENV_RISK low (non-prod) |
| Build | vc-frontend PR #2568, image `2.61.0-alpha.2597-vcst-5903-vc-stat-widget-a6255676` = `bfe0b259` (+ CI-only merge) |
| Browser | playwright-edge (Chromium/Edge), viewports 1280x900 and 375x812 |
| Date | 2026-10-20 |
| Result | **REPRODUCED 2/2** per prop (errorText 3/3: Error State 1280, Basic 1280, Basic 375; description 2/2; delta 2/2) |
| Trace / operation ID | N/A — client-only CSS defect, no server call involved (Part A row 5/10 not triggered) |
| Input method | Storybook Controls panel, `fill` into each prop's textbox; `evaluate` used only to READ rects/computed styles |

## Measurements (ink right edge minus card border-box right edge; card = 256px, right edge x=272)

| Run | Viewport | Story | Prop | Text | Past border | Line boxes |
|---|---|---|---|---|---|---|
| 1 | 1280 | Error State | errorText | `Unbreakableerrormessagewithoutanyspacesxx` (41 ch) | **+81.98px** | 1 |
| 1 | 1280 | Basic | errorText | same | **+81.98px** | 1 |
| 1 | 1280 | Basic | description | same | **+11.38px** | 1 |
| 1 | 1280 | Basic | delta | same | **+77.98px** | 1 |
| 2 | 375 | Basic | description | same | **+11.38px** | 1 |
| 2 | 375 | Basic | delta | same | **+77.98px** | 1 |
| 2 | 375 | Basic | errorText | same | **+81.98px** | 1 |
| ctrl | 375 | Basic | **label** | same | **-25px (inside)** | 2 (wraps) |
| real | 1280 | Error State | errorText | `Request failed: https://example.com/api/graphql/orders?status=New` | **+41.06px** | 3 |
| real | 1280 | Error State | errorText | `Couldn't load order CO261020-00042` | -93.41 (inside) | 2 |
| real | 375 | Basic | errorText | `Datenbankverbindungsfehler` (26 ch, de compound) | -29.58 (inside, 184/197px used) | 1 |

The brief's figures (77.5 / 8.3 / 73.5) are ~3-4.5px lower than these; same direction and order. The gap is the
reference edge (these measure to the outer border-box edge at x=272).
Card `overflow: visible`; card `scrollWidth` 330-334 vs `clientWidth` 251. The document did not scroll
horizontally at 375 (`scrollWidth` 375 = `clientWidth`): the text paints past the card's border into the empty
canvas. It is not cut off.

## Computed styles (read at the failure state)

| Element | display | overflow-wrap | min-width (text node holder) |
|---|---|---|---|
| `.vc-stat-widget__label` | block | `break-word` | `0px` |
| `.vc-stat-widget__error` > `span` | flex item | `normal` | `auto` |
| `.vc-stat-widget__description` | block | `normal` | n/a (block) |
| `.vc-stat-widget__delta` > `span` | flex item | `normal` | `auto` |

## Artifacts

| # | Artifact | Path |
|---|---|---|
| 1 | Failure screenshot, Error State, 1280 | `screenshots/X27-run1-1280-errorText-unbreakable.png` |
| 1 | Failure screenshot, Basic description + delta, 1280 | `screenshots/X27-run1-1280-basic-description-delta-unbreakable.png` |
| 1 | Realistic URL errorText, 1280 | `screenshots/X27-run1-1280-errorText-url.png` |
| 1 | Failure screenshot, Basic description + delta, 375 | `screenshots/X27-run2-375-basic-description-delta-unbreakable.png` |
| 1 | Failure screenshot, Basic errorText, 375 | `screenshots/X27-run2-375-basic-errorText-unbreakable.png` |
| 1 | Control: label wraps, errorText overflows (same render), 375 | `screenshots/X27-run2-375-control-label-wraps-errorText-overflows.png` |
| 2 | DOM snapshots (accessibility tree) | `test-results/edge/page-2026-10-20T12-1*.yml` (session output, not copied) |
| 3 | Network request list | `network/requests.txt`. Storybook static and `index.json` only, all 2xx. No app API in play |
| 6 | Console (whole session) | `console/console-all.log`. Four `503` loads at 12:15 were a transient Storybook outage that cleared within a minute (curl 200 x3), before repro. No error during repro |
| 7 | HAR | `test-results/edge/har/session.har`, written by the lane config on context close (referenced, not copied) |
| 12 | Deployed build | Image tag above, as given in the dispatch brief. Commit `bfe0b259` = "fix(VCST-6427): treat a blank VcStatWidget value or error text as empty" |
| 13 | Source | `root-cause.md` §Source (file:line at `bfe0b259`) |
