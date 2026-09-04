# DRAFT — proposed VCST-5735 tracker comment (NOT POSTED)

Awaiting explicit approval. Jira Markdown (no screenshots embedded, so the body stays Markdown rather
than flipping to wiki markup). Delete this file once posted or abandoned.

---

## QA verdict: FAIL — incomplete delivery against the description

Tested on **vcst-qa**, theme `2.57.0-pr-2452-d1e4-d1e45b04` (vc-frontend PR #2452, still open), Platform `3.1063.0`.

**This is a scope finding, not a defect report.** Most of what was built works — the redesign's core
mechanism is sound. What did not happen is that **six of the ten described behaviours are wholly or
partly unimplemented**. That routes to product and design rather than to a bug-fix cycle.

### The description, bullet by bullet

| # | Promise | Status |
|---|---|---|
| 1 | Category tabs with counts | **Works** |
| 2 | Sticky header collapses full → compact | **Works**, but the morph shifts the table body 144 px in one frame on desktop, and never fires below `md` |
| 3 | "Differences only" filter | Filter works. **The dot + soft amber row marking was not built** — rows are plain zebra |
| 4 | Pin rows to top | **Works** on desktop; the control is hidden below `md` |
| 5 | Simplified product cards | **Works** |
| 6 | Empty rows auto-hidden | **Works** (9 rows → 5) |
| 7 | Tooltips on real terms | Desktop works. **The mobile bottom sheet was not built** — at 375 px the trigger is absent from the DOM entirely |
| 8 | Add / remove / clear flow | Remove, Clear all and Clear category work on desktop. **All bulk-clear controls are hidden below `md`, and the overflow (⋯) menu that was to hold them was not built** — so a phone user cannot clear their list at all |
| 9 | Mobile-specific build | Locked label column and 2-column viewport work. **Scroll indicator, scroll-snap and the duplicate bottom Add-to-cart CTA were not built** |
| 10 | Booleans as check/minus icons | **Drift** — ships icon *and* the literal text, and the negative glyph is a cross, not a minus |

### What works, and is worth saying

The headline capability is sound. One configurable parent added twice with two different configurations
renders as **two distinct columns** with their own prices ($999.00 / $1,399.00), their own configuration
rows and their own customize links — confirmed as a single `SearchProducts` call, so the columns come
from entry re-pairing rather than a second fetch. Category grouping, the per-category limit, cross-tab
sync, the clear/restore round trip and add-to-cart quantity handling (MOQ and pack size) all hold.

### Coverage

**35 test cases authored and executed: 23 pass · 6 fail · 6 blocked.** The six blocked are environment
capability limits (no request interception, no network throttle, and a hook that blocks `localStorage`
access), not avoided failures. Roughly **53% of the ~29 promised behaviours** ended up with a case
behind them — the uncovered half is where the unbuilt features were hiding.

### Findings to be filed

1. **The whole secondary-action set is hidden below `md`** — Clear all, Clear category and Pin all vanish
   together from one stylesheet rule, reached both by viewport (375 px) and by browser zoom (a desktop
   user at 400% loses the same controls). *High/P1.*
2. **Mobile presentation set not built** — bottom sheet, scroll indicator, scroll-snap, duplicate bottom CTA.
3. **Difference marking not built** — no dot, no amber fill.
4. Two configurable display defects: two configuration sections sharing a display label **collapse into one
   row** (the price includes a choice the comparison never shows), and two configurations differing only by
   an uploaded file are silently not added.
5. **Eight accessibility findings** file separately at their real severity — they are properties of the
   surface, not acceptance criteria of this story, and do not gate it.

### The process finding, which matters more than any of the above

This Story reached READY FOR TEST with its acceptance-criteria field reading **"1. No requirements."**
That is the mechanism that let six of ten described behaviours go unbuilt without anyone noticing: there
was no artifact to check "done" against. Every QA condition here had to be derived from the description
prose and the design prototype, so **this verdict is scoped to a specification the ticket does not
contain** — a reader should not take the passing items as agreement on what "done" meant.

### Not verified

- Column alignment between the sticky header and the body **at mobile width with the table scrolled** —
  the two are independent scrollers with different extents. Unverified, not passed.
- Layout-shift provenance (CLS 0.12 vs the ≤0.1 invariant) is **unresolved**: it needs the same page
  measured on the pre-PR theme, which was not taken.
- Screen-reader output, and the Coffee theme's contrast, were not reachable on the available tooling.
  Reported as skipped, never as passing.
