# Evidence index — VCST-5903 X5: VcStatWidget blank guard misses U+200B

**Verdict:** REPRODUCED 2/2 (chromium, playwright-chrome) — value and errorText both, two stories, two input paths.

## Env header
| Field | Value |
|---|---|
| TEST_ENV | vcst (QA) |
| Surface | QA Storybook `STORYBOOK_URL` (UI kit), story `components-organisms-vcstatwidget--basic` and `--with-suffix` |
| Build | vc-frontend PR #2568, image `2.61.0-alpha.2597-vcst-5903-vc-stat-widget-a6255676` (source `bfe0b259` + CI merge) |
| Bundle identity | preview bundle `assets/iframe-D_mlhHPT.js`, identical to the Round-2 capture (`../R2-A-storybook-network.log`); `iframe.html` last-modified 2026-10-20 07:31:46 GMT |
| Fix presence (control) | value = 3 spaces → `vc-stat-widget__value--pending` dash, status `""` — the VCST-6427 `trim()` guard IS deployed |
| Browser | Chromium 1920x1080 |
| Date | 2026-10-20 12:15–12:17 UTC |
| Server-side | none — static Storybook, no API/xAPI involved, so no trace/operation ID and no App Insights resource apply |

Transient: the first two loads at 12:15:14 returned **503** from the Storybook host; recovered at 12:15:43 (≈30 s, same bundle). Unrelated to the defect; logged in `console/`.

## Input method (real user)
- Run 1, value: control textarea focused, Ctrl+A, Delete, then U+200B entered via keyboard insertText (`pressSequentially`, the same path an IME / OS character-map commit takes).
- Run 1, errorText: value control content (U+200B) selected with Ctrl+A, **copied with Ctrl+C**, errorText "Set string" clicked, **pasted with Ctrl+V** — a pure clipboard copy-paste.
- Run 2 (fresh navigation, With Suffix story): value typed `" ​ "`; errorText typed U+200B.
- `browser_evaluate` used for READING only (char codes of the control, classes, rects, `output.vc-stat-widget__status` text). No prop or DOM injection.
- Storybook dropped the arg from the URL ("Omitted potentially unsafe URL args", console) — the value still reaches the component through the Controls channel, as the control char codes and the rendered DOM show.

## Observations
| # | Story | Input (code points) | Branch rendered | Figure / message | Status text (`output`) | Screenshot |
|---|---|---|---|---|---|---|
| C | Basic | value `20 20 20` | pending dash | `—` | `""` | `screenshots/X5-00-control-value-3spaces-dash.png` |
| 1a | Basic | value `200b` | `vc-stat-widget__value` (NOT pending) | text `200b 20`, row 219×37.5 px, visually blank, no dash | `""` | `screenshots/X5-01-value-zwsp-blank-row-run1.png` |
| 1b | Basic | errorText `200b` (pasted) | `vc-stat-widget__error` | icon + message `200b` (blank), 219×24 px; figures hidden | `"Revenue this week: ​"` | `screenshots/X5-02-errortext-zwsp-pasted-blank-error-run1.png`, `X5-02b-…canvas-run1.png` |
| 2a | With Suffix | value `20 200b 20` | `vc-stat-widget__value` | row 219×37.5 px showing only the unit `items` — no number, no dash | `""` | `screenshots/X5-03-withsuffix-value-sp-zwsp-sp-run2.png` |
| 2b | With Suffix | errorText `200b` | `vc-stat-widget__error` | blank message, 219×24 px; figures hidden | `"Active carts: ​"` | `screenshots/X5-04-withsuffix-errortext-zwsp-run2.png` |

## Console / network
- `console/X5-session-console.log` — 0 component errors; 2× 503 (host outage above), preload warnings, the URL-args warning. No Vue warnings.
- `network/X5-run2-network.log` — only `index.json` 200 and Cloudflare RUM; one `mf-entry-bootstrap` preload `ERR_ABORTED` (pre-existing, benign).
- HAR: not captured for this lane (the playwright-chrome server writes its own HAR per its lane config); no request is relevant to a purely client-side render.

## Oracle
- PR #2568 body: "No value in the ready state: the same dash, so a blank figure can't read as a value" {SPEC}.
- Prop docstring at `vc-stat-widget.vue:56`: "Without it the card shows a dash." {SPEC}
- VCST-6427 expected result (blank/whitespace value → dash; blank errorText → not an error) {SPEC}.
- VirtoOZ: not applicable — the component is unreleased (open PR), so no doc page exists; ticket/PR + source + live build are ground truth.

## kb
- ask `2026-10-20T12:15:07.838Z` → list (KB-B9BB372D, KB-A4C7F35D, KB-82296935: pre-fix whitespace behaviour, none about U+200B) → closed with `kb_none`.
- Captured: see the handback report for ids.
