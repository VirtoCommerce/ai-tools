# Design & Accessibility report — VCST-5944

**Surface:** Push Messages → New message → Audience builder (Admin SPA embedded app)
**Env:** vcptcore-qa1 · `VirtoCommerce.PushMessages 3.1006.0-pr-28-1764` · Chrome DevTools lane
**Oracles:** no `BL-UI-*` invariant governs this surface, so the ticket's own mockups
(`design-spec/d1–d3`) plus the reviewer's annotated build screenshots (`r1–r4`) plus platform convention
are the highest oracle available. `DesignSync` token/geometry pull: **SKIPPED** (`/design-consent`
unavailable in a non-interactive lane) — the mockup diff below is image-vs-live, not a token diff.

## Verdicts

| Axis | Verdict |
|---|---|
| vs. RULES (`BL-UI-*`) | **N/A** — none exists for this surface |
| vs. DESIGN | **DRIFT** (4 items) + **KNOWN_DIVERGENCE** (1, reviewer-mandated) + **UNSPEC** (1, advisory) |
| vs. WCAG 2.2 AA | **FAIL** — 1.3.1, 4.1.2 (×5 instances), 4.1.3 (×2), 1.4.3 (×3) |
| vs. SYSTEM (design-system consistency) | **PASS** — platform primitives and tokens throughout, no bespoke hex |

## vs. DESIGN — drift

**D1 · Match by conditions inverts the primary affordance.** On entering the mode only the
`START FROM A COMMON AUDIENCE` chip row is visible. The Match ALL/ANY toggle, the condition row, `+ Add
condition` and `Edit as query` mount only after clicking the **"Custom conditions"** chip — and then render
*below* the chips. Mockup `d1` shows the opposite: the condition builder is the immediately-visible primary
content with a populated example, and the chips sit beneath it as a secondary quick-start. A user wanting to
hand-write a rule must first discover that "Custom conditions" is a chip rather than a mode of its own.
Recognition-over-recall; worth a product decision, not a silent divergence.

**D2 · The query-validity affirmation lost its visual treatment.** `d3` specifies a bordered, filled-green
row with a checkmark: `✓ Query is valid — 0 recipients.` Live it renders as plain grey body text
(`class="vc-hint"`, `color: rgb(115,115,115)`, transparent background, no icon, no border — read from
computed style). There is no visual difference between "just typed" and "confirmed valid".
**This compounds the functional defect below** — the affirmation is both unconditional *and* visually
indistinct, so nothing in the interface marks the moment a query stops being trustworthy.

**D3 · "Show available fields" is missing.** `d3` places it beside `← Back to conditions`. Only the latter
exists live. This one matters more than its size suggests: the ticket exists because *"the customer reported
the query field as undocumented"*, and this link is the design's direct answer to that complaint in the one
mode where a user still writes raw syntax. (The `Preview recipients` / `Show generated query` buttons that do
appear belong to the shared estimate card, not to this link.)

**D4 · The estimate card is flattened in "Specific people or companies" mode.** Live it is a one-line
`0 recipients / The 0 selected, plus everyone in any company chosen`. `d2` specifies the structured
arithmetic breakdown that Everyone and Match-by-conditions modes do render. Medium; inconsistent within the
feature rather than absent from it.

**KNOWN_DIVERGENCE (advisory, not filed).** The shared string `Add specific recipients (people or whole
companies)` now labels the picker in all three non-Everyone modes. The mockups distinguished the contexts
(`Recipients — people or whole companies` vs `Also include specific people or companies`), but the reviewer
explicitly requested the single string, so the shipped text is correct-by-request. The observation worth
recording: in conditions/query modes the picker's bordered block partially signals "additive", but the label
alone no longer says so — a linear or screen-reader read gives no cue that these people are *in addition to*
the rule above, not an alternative to it.

**UNSPEC (advisory).** The built radio options carry leading icons (globe / people / funnel / `<>`) absent
from the mockups. Never a failure.

## WCAG 2.2 AA — FAIL

Reproduced live with axe-core injected into the embedded app, scoped to the Audience container, plus manual
DOM inspection. Each was confirmed, not inferred.

| Criterion | Finding |
|---|---|
| 1.3.1, 4.1.2 | The four audience radios have **no accessible name** (no `<label>`, `aria-label` or `aria-labelledby`), and **no `role="radiogroup"` wrapper exists**, so the "Audience" heading is never programmatically associated. A screen reader hears "radio button, not checked" with no group context. Keyboard behaviour itself is correct — ArrowDown moves and checks via native `name` grouping, Tab exits the group — so this is a naming gap, not a keyboard trap |
| 4.1.2 | The condition row's **field** and **operator** comboboxes render `role="combobox"` with zero accessible name |
| 4.1.2, 3.3.2 | The condition row's **value textbox** has no label at all |
| 4.1.2 | The **ALL/ANY toggle** is two plain `<button>`s with no `role` and no `aria-pressed`; active state is conveyed by fill colour only, so which one is selected is not programmatically determinable |
| 4.1.2 | **Icon-only remove buttons** (condition row `×` and recipient chip `×`) have no `aria-label`; their Lucide SVGs are `aria-hidden="true"`, leaving the button nameless. Two instances of one defect class |
| 4.1.3 | **No `aria-live` on the recipient count.** The number updates asynchronously on every chip add and query edit, announced to nobody. Walked the full ancestor chain — no live region anywhere |
| 4.1.3 | **No `aria-live` on the query-validity hint** — same element as D2 |
| 1.4.3 | Contrast: `START FROM A COMMON AUDIENCE` label **2.52:1**; `Add a person or company…` placeholder **2.52:1** (worse, since it is placeholder-only text with no wrapping label); `Build a rule from customer data` helper **4.37:1**. All need 4.5:1 |

**Passing, and worth naming:** the "Recipients query" textarea *does* have a correct accessible name. So
labelling practice is **inconsistent within one feature** rather than uniformly absent — which is usually the
cheaper thing to fix.

## Design-system consistency — PASS

Tokens read live from `getComputedStyle(document.documentElement)` inside the embedded app, not from a
transcribed table (the GOLDEN RULE): `--primary-50 #eff7fc`, `--primary-500 #319ed4`, `--primary-700
#237aa5`, `--neutrals-400 #a3a3a3`, `--neutrals-500 #737373` — the vc-shell Admin-SPA set. Every control uses
platform primitives (`vc-radio-button__label`, `vc-select__*`, `vc-button*`, `vc-input__input`, `vc-editor`);
no hardcoded hex bypassing the token system was found.

**So the contrast failures above are token-compliant colour *choices*, not a design-system bypass** —
`neutrals-400`/`500` used for body text that needs 4.5:1. That is a note for design about the token pairing,
not an implementation shortcut, and it is counted under WCAG rather than here.

## Out-of-scope observations (wider Push Messages app, not the Audience section)

Surfaced under the out-of-scope-bug rule, not filed against this ticket: `html` has no `lang`;
`meta[name=viewport]` carries `user-scalable=no` (1.4.4); contrast failures in the message-list table;
`aria-command-name` and `nested-interactive` on the breadcrumb dropdown trigger; an `<ol>` with non-`<li>`
children.

**Responsive:** at 375 px the persistent left nav does not collapse and squeezes the blade to ~340 px;
content reflows without horizontal overflow and chips ellipsis-truncate as expected. Admin back-office is not
conventionally mobile-first on this platform and no invariant governs it — low-priority observation only.

## Evidence

15 screenshots under `screenshots/` with the `4v-` prefix (one per mode, plus condition-row, chip-added,
valid/invalid query, 375 px and scroll states). Mockups under `design-spec/`.
