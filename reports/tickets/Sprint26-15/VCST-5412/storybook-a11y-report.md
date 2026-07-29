# VCST-5412 — Storybook component axis (A11Y-01…08, BH-15)

**Surface:** `https://vc-shell-storybook.govirto.com/` (built from `main`, contains PR #255)
**Method:** scripted sweep — axe-core 4.10.2 injected into each story **iframe**, story ids enumerated
from `/index.json`. Runner: `results/vcst-5412/sb-axe-sweep.mjs` (+ `render-sweep.mjs`, `probe-*.mjs`).
Raw: `results/vcst-5412/sb-axe-results.json`, `render-sweep-results.json`.
**Executed by the orchestrator directly** — the dispatched `ui-ux-expert` terminated on an internal API
error (tool-call parse failure), so per the repo's delegation rule the work was done inline rather than
re-delegated.

## Verdicts

| ID | Verdict | Evidence |
|---|---|---|
| A11Y-01 | **PASS at WCAG 2.1 · FAIL at WCAG 2.2** | 170 stories / 13 components: **0 critical, 0 serious, 0 moderate, 0 minor** under tags `wcag2a wcag2aa wcag21a wcag21aa` (contrast excluded per A11Y-02). **Re-running with `wcag22a`/`wcag22aa` adds 3 serious `target-size` violations** (`VcColorInput` 20×20, `VcInputDropdown` 12×34, `VcDataTable` 12×30) — see `wcag22-accessibility-audit.md`. The ticket's plan names WCAG **2.1**, so this table is scoped to 2.1; the 2026 conformance gate is 2.2. |
| A11Y-02 | **PASS (informational)** | `color-contrast` = the *only* rule that fired anywhere: 53 stories, 145 nodes, impact `serious`. Recorded, not raised. |
| A11Y-03 | **PARTIAL** | Focus reachability/visibility verified programmatically; visible focus ring confirmed (`outline: solid 2px`). Not exhaustively hand-driven across all 170 |
| A11Y-04 | **PARTIAL FAIL** | Keyboard operation PASSES; **`aria-expanded` is absent** — see §A11Y-04 |
| A11Y-05 | **PASS** | `Form/VcCheckbox`: keyboard-focusable, `Space` toggles `checked` true→false, accessible name "Checkbox Label" |
| A11Y-06 | **PASS** *(a11y-tree substitute)* | all 7 `VcBreadcrumbs` stories: `<nav aria-label="Breadcrumb">` + `<ol>` + `aria-current="page"`. Not an SR transcript — see §Limits |
| A11Y-07 | **PASS** | `Form/VcEditor`: 18 toolbar buttons, **0 unnamed/generic, 0 unreachable** — see §A11Y-07 |
| A11Y-08 | **FAIL / design decision needed** | `VcImage` renders **no `<img>`** — no alt mechanism exists. See §A11Y-08 |
| A11Y-09 / A11Y-10 | **NOT EXECUTED** | `yarn test:storybook` / `yarn test:a11y` need a local Yarn 4 / Node 22 checkout + build |
| BH-15 | **PASS** | see below |

## A11Y-01 — per component

Zero violations of any impact in every column except contrast, for all 13 components:

| component | stories | crit | serious | moderate | minor | contrast (info) |
|---|---|---|---|---|---|---|
| VcDataTable | 90 | 0 | 0 | 0 | 0 | 30 |
| VcEditor | 12 | 0 | 0 | 0 | 0 | 1 |
| VcCheckbox | 10 | 0 | 0 | 0 | 0 | 1 |
| VcBadge | 8 | 0 | 0 | 0 | 0 | 3 |
| VcImage | 8 | 0 | 0 | 0 | 0 | 0 |
| VcDatePicker | 8 | 0 | 0 | 0 | 0 | 2 |
| VcBreadcrumbs | 7 | 0 | 0 | 0 | 0 | 7 |
| VcColorInput | 7 | 0 | 0 | 0 | 0 | 1 |
| VcInputDropdown ¹ | 6 | 0 | 0 | 0 | 0 | 5 |
| VcContainer | 4 | 0 | 0 | 0 | 0 | 0 |
| VcHint | 4 | 0 | 0 | 0 | 0 | 1 |
| VcDropdown | 3 | 0 | 0 | 0 | 0 | 2 |
| VcScrollableContainer | 3 | 0 | 0 | 0 | 0 | 0 |
| **total** | **170** | **0** | **0** | **0** | **0** | **53 stories / 145 nodes** |

¹ **`VcDropdownPanel` (in the A11Y-01 list) has no stories in the index** — nothing to audit. Nearest
analog `Form/VcInputDropdown` audited in its place. Plan defect, not a product defect.

117 of 170 stories are completely violation-free. **Framing worth noting:** the contrast carve-out is
the only thing separating "zero serious violations" from "53 serious violations" — axe rates
`color-contrast` as `serious`. The exemption is legitimate per A11Y-02, but the exit criteria should say
so explicitly rather than reading as an unqualified zero.

## BH-15 — story split verified (indexing) — PASS

| Assertion | Result |
|---|---|
| `Data Display/VcDataTable` story count | **90** ✓ |
| Distinct titles for those stories | **1** ✓ |
| Docs entries under that title | **1** ✓ |
| Duplicate story ids across all 677 index entries | **0** ✓ |
| Titles anywhere with >1 docs entry | **0** ✓ |

## Gap found in BH-15 — and a defect behind it

BH-15 only asserts **indexing**. A story can index perfectly and still throw on render, so a
gap-AC was added and executed: *every indexed story must render without a console/page error and with a
non-empty root.* Sweeping all **615** stories:

**11 / 615 error.** Classified:

| Group | Stories | Class | Note |
|---|---|---|---|
| `VcDataTable / Inline Editing With Validation` | 1 | **DEFECT** | `onMounted is not defined` — renders 94 bytes of empty shell. → `reports/bugs/open/BUG-vcdatatable-inline-editing-story-missing-vue-imports.md` |
| `Data Display/VcVideo` | 4 | **DEFECT** | sandbox hardening blocks the YouTube player entirely. → `reports/bugs/open/BUG-vc-video-sandbox-blocks-youtube-playback.md` |
| `Layout/VcApp` | 6 | **environmental** | SignalR hub negotiation 404 (nginx) — static Storybook has no platform backend. Stories render fine (8–33 KB). Not a defect; worth mocking to cut noise. |

Both defects are attributable to PR #255 and are present in the shipped 2.2.0 **and** 2.3.0.

## A11Y-04 — keyboard works, but expanded state is never exposed

`Overlay/VcDropdown` (Action Menu + Workspace Switcher), driven by keyboard only:

| Step | Result |
|---|---|
| `Tab` to trigger | focused, visible ring (`outline: solid 2px`) ✓ |
| `Enter` | panel opens ✓ |
| `ArrowDown` | focus moves into the panel (`role="menu"` / `role="listbox"`) ✓ |
| `Escape` | panel closes ✓ |
| **`aria-expanded` reflects state** | **✗ attribute does not exist** |

The trigger, in **both** closed and open state, is:

```html
<button class="vc-button vc-button-secondary vc-button--default" type="button">
```

`document.querySelectorAll("[aria-expanded]").length === 0` closed **and** open — no `aria-expanded`,
no `aria-haspopup`, no `aria-controls` anywhere. A `role="menu"` panel appears when open, but nothing
associates it with its trigger and nothing announces the expanded state.

A11Y-04's expected result explicitly requires "`aria-expanded` reflects state", so this half fails —
WCAG 4.1.2 (Name, Role, Value) for a custom disclosure widget. **axe cannot catch this**: it has no way
to know a plain `<button>` is a disclosure trigger. This looks like a **miss in the PR's a11y sweep**
rather than a regression (there is no evidence it ever worked), so it is reported here as an open
finding against A11Y-04, not filed as a regression bug.

## A11Y-07 — PASS, and visibly the PR's work

18 editor toolbar buttons, every one `tabIndex=0` with a real accessible name despite being icon-only:
`Bold`, `Italic`, `Underline`, `Strikethrough`, `Heading 1/2/3`, `Bullet list`, `Numbered list`,
`Blockquote`, `Insert link`, … — **0 unnamed, 0 generic "button", 0 unreachable.** This is exactly the
"localize the vc-editor toolbar / give controls accessible names" change landing correctly.

## A11Y-08 — FAIL: `VcImage` has no alt mechanism at all

All 8 `VcImage` stories render **zero `<img>` elements**. The component paints a CSS background:

```html
<div class="vc-image__container vc-image_1x1"
     style="background: url(&quot;https://picsum.photos/600&quot;) center center / cover">
```

| Story | `role` | `aria-label` | Exposed to AT? |
|---|---|---|---|
| Default, Widescreen, Round Profile, Thumbnail, Contain Mode, Size Variants | `null` | `null` | **no — content invisible to AT** |
| Clickable | `button` | `"Image"` | yes (focusable, named) ✓ |
| Placeholder | — | `aria-hidden="true"` on the svg | correctly hidden ✓ |

A CSS background image can carry **no** alternative text, so A11Y-08's "alternative text is present"
cannot be satisfied for a meaningful image. The second half ("a decorative image is not announced as
content") passes trivially — by construction *nothing* is announced.

This is a **design decision for the owning team**, not a code slip: acceptable if `VcImage` is only ever
decorative, but a WCAG 1.1.1 problem the moment it shows product/catalogue imagery — which is precisely
its use in a vendor portal. Not filed as a regression (pre-existing), but it should not be signed off as
a pass.

**Note on method:** an earlier scripted run reported A11Y-08 "PASS" — that was a **vacuous pass**
(0 offending images out of 0 images found). Corrected here after inspecting what the component actually
renders. It also means the component's axe-cleanliness is partly structural: with no `<img>` present,
axe's `image-alt` rule has nothing to evaluate.

## Limits of this run

- **No screen reader.** A11Y-06 and any "announced as…" expectation cannot be honoured. Where state was
  checked it was via computed ARIA/role/accessible-name inspection — an *a11y-tree substitute, not a
  screen-reader transcript*. A11Y-06 is reported NOT EXECUTED rather than passed by proxy.
- **A11Y-03** is partial: focus ring and reachability were sampled programmatically, not hand-driven
  through all 170 stories.
- **A11Y-09/10** (`yarn test:storybook`, `yarn test:a11y`) were not run — they need the local toolchain.
  These are the two checks that would have caught both defects above.
