/**
 * LAYER-PARITY — two layers that show the same entity show the same values (REQ-03).
 *
 * Here: a product as the search index returns it (a `products` listing) against the same product read
 * live (`product(id:)`). Past the consistency window they must agree field by field; a stale name, a
 * ghost product that the live read no longer finds, or a price the listing never updated is the defect.
 *
 * Pure, like `page-walk.ts`; the driver is `scripts/invariants/run.ts`. Rule it executes: BL-SRCH-003.
 */
import type { Verdict } from "./page-walk.ts";

export type Fields = Readonly<Record<string, unknown>>;

/** Compared as the storefront shows them: trimmed strings, numbers to the cent. */
function normalise(v: unknown): unknown {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return Math.round(v * 100) / 100;
  return v ?? null;
}

export function layerParity(
  listed: ReadonlyMap<string, Fields>,
  live: ReadonlyMap<string, Fields | null>,
  fields: readonly string[],
): Verdict {
  const violations: string[] = [];
  for (const [id, a] of listed) {
    if (!live.has(id)) {
      violations.push(`${id}: not read live, so it cannot be compared`);
      continue;
    }
    const b = live.get(id);
    if (b === null || b === undefined) {
      violations.push(`${id}: listed by search but the live read finds no such product (ghost result)`);
      continue;
    }
    for (const f of fields) {
      const x = normalise(a[f]);
      const y = normalise(b[f]);
      if (JSON.stringify(x) !== JSON.stringify(y)) violations.push(`${id}: ${f} is ${JSON.stringify(x)} in the listing, ${JSON.stringify(y)} live`);
    }
  }
  if (!listed.size) violations.push("the listing is empty, so nothing was compared");
  return { pass: violations.length === 0, violations };
}
