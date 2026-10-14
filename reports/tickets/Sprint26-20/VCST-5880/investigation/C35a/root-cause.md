## Root-Cause Worksheet: C35a (VCST-5880 triage, out of scope)

### 1. Symptom
In Chromium, a screen reader announces each Availability cell on /compare as "In stock". The visible quantity (12, 340, 60…) is not part of the cell's name.

### 2. Lowest failing layer
Storefront markup and ARIA.
- repoKind: `frontend`
- Repo: **`VirtoCommerce/vc-frontend`**
- File: `client-app/shared/catalog/components/in-stock.vue`, consumed by `compare-table.vue`
- Confidence: **MEDIUM-HIGH**. The cause is certain. The fix location (the shared component or the compare cell) is a design choice.

### 3. Evidence → claim chain
| # | Claim | Evidence |
|---|---|---|
| 1 | The in-stock chip puts the label "In stock" in a `title` attribute and the quantity in text | `in-stock.vue` (dev) L8-21: `<VcChip v-else-if="isInStock" … :title="$t('common.labels.in_stock')">` with `<span>{{ quantity ? inStockQuantityLabel : $t("common.labels.in_stock") }}</span>` |
| 2 | Chromium exposes a titled `<div>` as `group` named from `title` | CDP: chip node `group "In stock"` on /compare, catalog and PDP |
| 3 | A cell's name comes from its content, and Chromium takes the child group's own name ("In stock") instead of descending into its text | CDP: `cell "In stock"`, child list `["group:In stock"]`, ×3 on both builds |
| 4 | Outside a cell the quantity survives | CDP on catalog and PDP: `group "In stock"` keeps the StaticText 25/12/340/60 as children, and no ancestor computes a name from it |

### 4. The "why"
`in-stock.vue` labels the chip through `title`, so Chromium names the chip "In stock". When the compare table computes the Availability cell's name from its content, it uses that child name and drops the quantity text inside it.

### 5. Alternatives ruled out
| Alternative | How ruled out |
|---|---|
| Introduced by PR #2518 | BASELINE 2.60.0-pr-2511 gives the same `cell "In stock"`. The PR only adds `aria-label` / `aria-describedby` to row headers and product `th` (diff), not to Availability cells |
| Data drift (no quantity) | The DOM text and the visible chips show 12/340/60, and the fixture stock_qty is 12/340/60 |
| Systemic quantity loss (catalog, PDP) | Measured: the quantity remains as child text there (row 4), so the loss is limited to the cell context |
| Tool artifact | Reproduced on Chromium's native tree. Playwright's JS accname differs ("12"), which is noted, but assistive technology in Edge and Chrome consumes the native tree |

### 6. Regression archaeology
Not applicable. Behaviour is the same on both 2.60 builds and is recorded in KB-95685F89.

### Fix direction (not a decision)
Option 1: in `in-stock.vue`, drop `title` and add visually-hidden text, e.g. "In stock: 12" (`sr-only`). Option 2: give the compare Availability cell content an explicit accessible text. Option 1 also improves catalog and PDP.

### Severity on evidence: **Low**
Information loss is partial. The stock state is still announced, and the quantity can still be reached by reading inside the cell. The issue is limited to one row on /compare, and the cause is a shared but benign `title`.
