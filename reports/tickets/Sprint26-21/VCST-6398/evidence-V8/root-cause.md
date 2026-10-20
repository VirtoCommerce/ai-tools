## Root-Cause Worksheet — VCST-6398 / V8

### 1. Symptom
On a configurable PDP, each radio of a Product-type section (incl. its "None" row) has no accessible name: axe `label` critical (WCAG 4.1.2), AX tree lists bare `radio`. A screen-reader user hears "radio button, checked/not checked" with only the group name "Top" and cannot tell which product each radio selects.

### 2. Lowest failing layer
storefront-only (markup). No request involved; the data (product name) is present and rendered as a sibling link/title. Proven by evidence-index rows 2-4.
→ repoKind: frontend → repo: **VirtoCommerce/vc-frontend-next** (theme under test); same code also in **VirtoCommerce/vc-frontend** (upstream, 2.60.0 / main).

### 3. Evidence → claim chain
| # | Claim | Evidence |
|---|---|---|
| 1 | Radios have no name | a11y/V8-bed-axe-4.10.2.json: `aria-label:null, aria-labelledby:null, labelText:""` on all 8; cake: 18 axe nodes |
| 2 | Label association exists but is empty | `labelFor` = own id, `labelText` "" (the `<label for>` wraps only the empty `.vc-radio-button__label` span) |
| 3 | The consumer passes neither `aria-label`, `label` nor slot content | source/option-product.vue@d67b0e0a.vue lines 4-9: `<VcRadioButton :model-value :value :name @input />`; option-product-none.vue line 4 same |
| 4 | The kit would name it if told to | source/vc-radio-button.vue: `:aria-label="ariaLabel \|\| label \|\| undefined"` (line 33), prop `ariaLabel` exists, slot is rendered inside the `<label>` |
| 5 | The kit warns about exactly this, but only in dev | vc-radio-button.vue lines 108-113 `if (import.meta.env.DEV) console.warn(...)`: production build is silent (hosted/QA = prod build) |
| 6 | The product name is in a *different* element | `<VcProductTitle>` / link in the card body, not associated with the radio (AX tree: `link "Top: Chocolate / Bottom: White"` next to `radio`) |

### 4. Why
`option-product.vue` / `option-product-none.vue` put a bare `<VcRadioButton>` in the product card's `#media` slot and render the product name in a separate `VcProductTitle`; nothing links the two (no `aria-label`, `aria-labelledby`, `label` prop or slot). So the native radio's computed name is empty.

### 5. Alternatives ruled out
| Alternative | How |
|---|---|
| By design / config-gated | Kit API and its own dev warning state a radio must have ariaLabel/label/slot; the sibling `option-none.vue` (text-section "None") does pass a slot label. BL-A11Y-002 requires non-empty contextual name. Not by design |
| Env data drift | Reproduced on two unrelated products/categories; the names ARE present in data (rendered as link/title) |
| Flaky/timing | Deterministic markup, 3/3 loads; axe run after full render (`wait_for` product name) |
| Version skew / introduced by PR #11 | Ruled out by diff, see §6 |
| Axe false positive | AX tree (DevTools, independent of axe) also shows nameless `radio` |

### 6. Regression archaeology — is it in the changed code? **NO**
- PR #11 (`chore(VCST-6398): merge upstream vc-frontend 2.60.0`, head d67b0e0a87b1da3eb0499afeeaf2b8fc91d064ef, base dev d996e503df41cecfa10c243ab9f5b8a0d5f31efb): 346 changed files (source/pr11-changed-files.txt). **Neither `option-product.vue`, `option-product-none.vue` nor `vc-radio-button.vue` is in it.** Under `shared/catalog/components/configuration/` the PR touches only option-file.vue, product-configuration.vue, product-configuration-checklist.vue (+tests).
- Byte-identical check (`gh api contents`, diff): option-product.vue and vc-radio-button.vue at PR base d996e503 == PR head d67b0e0a == next `dev` (today).
- product-configuration.vue diff (section ids, `collapsedSections`, `onNavigateToSection`) leaves `role="radiogroup" :aria-label="section.name"` and the `<OptionProduct>` / `<OptionProductNone>` call sites untouched.
- Upstream vc-frontend (main, release 2.60.0): option-product.vue has the same bare `<VcRadioButton>` (no aria-label); vc-radio-button.vue has the same `ariaLabel` prop + dev warning. option-product.vue last touched upstream 7d7892c5 (2026-02-10, #2176, pricing), before that 123d2dae (2025-07-25, #1830 b2c variations): the radio has been unnamed since the row was written. Next's own edits to the file (VCST-6030: 6e5fc22a, 20f31c32, 2026-09-25) restyled it and did not add a name.
- → **NEW_WITH_MERGE: no.** The defect pre-exists the merge in Next `dev` and is shared with upstream. Per visual-axis.md §3 an a11y FAIL outside the changed code is filed standalone and does not block VCST-6398.
- Build caveat: pre-merge Next stand not available to observe; the claim rests on identical source at base, not on a pre-merge live run.

### 7. Confidence
[x] HIGH — DOM-vs-source proven for a frontend defect (axe + AX tree + the exact consumer lines + byte-identical base/head).

### 8. Fix Routing handoff
owning layer: storefront UI (Vue) · repoKind: frontend · repo: **VirtoCommerce/vc-frontend-next** (primary; the theme under test) and **VirtoCommerce/vc-frontend** (same code upstream; file there too so the next merge does not conflict) · files: `client-app/shared/catalog/components/configuration/option-product.vue` (lines 4-9) and `option-product-none.vue` (line 4) · hint: pass `:aria-label="product.name"` (and the translated "None" string) to `VcRadioButton`, or give the title an id and use `aria-labelledby`; no kit change needed (prop already exists) · fix-forward (no regression to revert).
Severity: P2 Medium per the caller's classification; axe rates `label` critical; a11y-critical-by-criterion (4.1.2 Level A) on a public EU-reachable route, so EAA exposure makes it arguably High, but it is a single control family with a name-bearing neighbour, so MEDIUM stands unless the PO reads EAA strictly.
