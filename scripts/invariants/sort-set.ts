/**
 * SORT-SET — a sort reorders a result set; it never changes which items are in it (REQ-03).
 *
 * The "sort combined with search" class of bug: switching the sort on a keyword or filtered listing drops,
 * adds or duplicates products, or the order ignores the sort key. Both listings must be walked in full
 * (PAGE-WALK) before they are compared, or a page boundary can hide exactly this defect.
 *
 * Pure, like `page-walk.ts`; the driver is `scripts/invariants/run.ts`. Rule it executes: BL-SRCH-007.
 */
import type { Verdict } from "./page-walk.ts";

export interface SortedItem {
  id: string;
  /** The value the sort orders by (a price, a name). Omit to check membership only. */
  key?: number | string;
}

export interface SortSetOptions {
  direction?: "asc" | "desc";
}

export function sortSet(baseline: readonly string[], sorted: readonly SortedItem[], opts: SortSetOptions = {}): Verdict {
  const violations: string[] = [];
  const base = new Set(baseline);
  const ids = sorted.map((s) => s.id);
  const got = new Set(ids);

  if (got.size !== ids.length) violations.push(`the sorted listing repeats ${ids.length - got.size} item(s)`);
  const missing = [...base].filter((id) => !got.has(id));
  const extra = [...got].filter((id) => !base.has(id));
  if (missing.length) violations.push(`sorting dropped ${missing.length} item(s): ${missing.slice(0, 5).join(", ")}`);
  if (extra.length) violations.push(`sorting added ${extra.length} item(s): ${extra.slice(0, 5).join(", ")}`);

  if (opts.direction) {
    const sign = opts.direction === "asc" ? 1 : -1;
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1].key;
      const b = sorted[i].key;
      if (a === undefined || b === undefined) continue;
      const cmp = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
      if (cmp * sign > 0) {
        violations.push(`order breaks the ${opts.direction} sort at position ${i + 1}: ${sorted[i - 1].id} (${a}) before ${sorted[i].id} (${b})`);
        break;
      }
    }
  }
  return { pass: violations.length === 0, violations };
}
