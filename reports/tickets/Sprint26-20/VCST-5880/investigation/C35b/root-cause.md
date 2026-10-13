## Root-Cause Worksheet: C35b (VCST-5880 triage, out of scope)

### 1. Symptom
A screen reader announces each one-shot "Remove from compare" button on /compare as a toggle button, "not pressed".

### 2. Lowest failing layer
Storefront ui-kit component.
- repoKind: `frontend`
- Repo: **`VirtoCommerce/vc-frontend`**
- File: `client-app/ui-kit/components/molecules/product-actions-button/vc-product-actions-button.vue` (consumer: `client-app/shared/compare/components/compare-table.vue`)
- Confidence: **HIGH**

### 3. Evidence → claim chain
| # | Claim | Evidence |
|---|---|---|
| 1 | The Remove button passes no `ariaPressed` | `compare-table.vue` (fix/VCST-5880) L139-143 `<VcProductActionsButton icon="trash-2" :tooltip-text="…remove_product" @click="onRemoveProduct(item)" />`. dev L138-142 is the same |
| 2 | The prop is a Boolean, which Vue casts to `false` when absent | `vc-product-actions-button.vue` L42 `ariaPressed?: boolean;` in `defineProps`, compiled to `{ type: Boolean }`. Vue's Boolean casting turns an absent prop with no default into `false`, not `undefined`. `withDefaults` (L49-53) sets no default for it |
| 3 | The template's guard then always renders the attribute | L4 `:aria-pressed="ariaPressed !== undefined ? ariaPressed : undefined"`. Because `false !== undefined`, the result is `aria-pressed="false"` |
| 4 | Consumers that pass a value are unaffected | `add-to-compare-catalog.vue` passes `:aria-pressed="isInCompareList"` (a real toggle). `wishlists/components/add-to-list.vue` passes an explicit `undefined` for guests. Live DOM agrees: wishlist has no attribute, compare toggle has false/true |
| 5 | Only compare-table omits it | GitHub code search for `VcProductActionsButton` in vc-frontend finds 3 app consumers: add-to-list, add-to-compare-catalog and compare-table. The rest are stories, types and llms docs |

### 4. The "why"
Vue's Boolean prop casting turns the omitted `ariaPressed` into `false`. The component's `!== undefined` guard was meant to skip the attribute for non-toggle uses, and it never fires. Every non-toggle use is therefore exposed as an unpressed toggle.

### 5. Alternatives ruled out
| Alternative | How ruled out |
|---|---|
| Intentional (Remove as a toggle) | The click handler only removes the item (`onRemoveProduct` → `emit("removeProduct")`), and nothing is pressed afterwards. The component's own guard shows the intent to omit the attribute |
| Introduced by PR #2518 | BASELINE 2.60.0-pr-2511 has the same attribute. The PR does not touch this button or the ui-kit file |
| Systemic on other pages today | The other two consumers pass the prop explicitly (row 4), so they are correct live |

### 6. Regression archaeology
Not a "used to work" symptom. Skipped.

### Fix direction (not a decision)
Option 1: in the ui-kit, declare `ariaPressed?: boolean | undefined` with `default: undefined` in `withDefaults`, which disables Boolean casting. This fixes the guard for all future consumers. Option 2: at the call site, pass `:aria-pressed="undefined"` explicitly. Option 1 is the root fix.

### Severity on evidence: **Low**
The button's name ("Remove from compare") is correct and it activates correctly. Only its role semantics are misleading, and only on the 1–5 Remove buttons on /compare.
