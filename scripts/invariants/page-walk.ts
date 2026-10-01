/**
 * PAGE-WALK — a listing walked page by page returns exactly what its count claims (REQ-03).
 *
 * The truncated-page class of bug: page 2 repeats page 1, the last page is dropped, `totalCount` counts
 * something the pages never return, or a facet says "15" and the filtered listing holds 12. A case that
 * asserts "the list is not empty" passes all of these; this check fails every one of them.
 *
 * Pure: it judges pages that a driver already fetched (`scripts/invariants/run.ts`), so the verdict is
 * deterministic and unit-tested without a stand. Rules it executes (`bl/srch.yaml`): BL-SRCH-006, and
 * BL-SRCH-001 when `--expected` carries the facet count.
 */

export interface WalkedPage {
  /** Item ids on this page, in order. */
  ids: readonly string[];
  /** The `totalCount` this page's response reported. */
  totalCount: number;
}

export interface Verdict {
  pass: boolean;
  violations: string[];
}

export interface PageWalkOptions {
  /** The page size requested; every page but the last must be full. */
  pageSize: number;
  /** A count the listing must equal — e.g. the facet term count shown before the filter was applied. */
  expectedCount?: number;
}

export function pageWalk(pages: readonly WalkedPage[], opts: PageWalkOptions): Verdict {
  const violations: string[] = [];
  if (!pages.length) return { pass: false, violations: ["no page was fetched"] };

  const totals = [...new Set(pages.map((p) => p.totalCount))];
  if (totals.length > 1) violations.push(`totalCount changed while walking: ${totals.join(" → ")}`);
  const total = pages[0].totalCount;

  const seen = new Map<string, number>();
  pages.forEach((p, i) => {
    if (p.ids.length > opts.pageSize) violations.push(`page ${i + 1} holds ${p.ids.length} items, more than the page size ${opts.pageSize}`);
    if (i < pages.length - 1 && p.ids.length < opts.pageSize) violations.push(`page ${i + 1} is short (${p.ids.length} of ${opts.pageSize}) but is not the last page`);
    for (const id of p.ids) {
      if (seen.has(id)) violations.push(`item ${id} appears on page ${seen.get(id)} and again on page ${i + 1}`);
      else seen.set(id, i + 1);
    }
  });

  const walked = pages.reduce((n, p) => n + p.ids.length, 0);
  if (walked !== total) violations.push(`totalCount says ${total}, the pages returned ${walked} items`);
  if (opts.expectedCount !== undefined && total !== opts.expectedCount) {
    violations.push(`the listing holds ${total} items, the count shown for it was ${opts.expectedCount}`);
  }
  return { pass: violations.length === 0, violations };
}
