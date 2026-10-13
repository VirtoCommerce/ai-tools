# Compare — scrolling stalls and bounces at the compact-header threshold on a short page — GRADE PENDING (P3 / P2)

## Status: CONFIRMED on Firefox and on the baseline · Chromium + input-method check IN PROGRESS
**Found by:** agent — testing VCST-5880 (3x lane) · **PRE-EXISTING** (identical on the baseline), OUT-OF-SCOPE · kb KB-C5E27085
**Severity: pending.** The 3x lane graded it **Medium**; the ticket-mode classifier graded it **Low** (wheel only). The deciding check is whether keyboard End/PageDown or the scrollbar also fail to reach the bottom:
- **If any input reaches the bottom, it is Low** and stays a draft.
- **If no input reaches the bottom, it is Medium** and gets filed.

**Not VCST-5938**, which covers a different mechanism (unbounded fetch).

**Env:** vcst-qa, baseline `2.60.0-pr-2511` and PR `2.60.0-pr-2518` · Firefox 151 (Chromium pending).

## Observed
- On a `/compare` page whose maximum vertical scroll is only about 300 px (1280×1336), wheel steps bounce between scrollY 164 and 204 and never pass about 240.
- About 60 px at the bottom is unreachable by wheel.
- The page does not freeze: rendering continues at about 31 frames per 500 ms.

## Likely mechanism (from source)
- `isCompact` is `headerRowTop <= appHeaderHeight + 1`.
- The compact `v-if/else` swap shrinks the header (by about the h-44 image block), which shrinks the document.
- When the maximum scroll is small, the browser clamps scrollY back under the threshold, the header un-compacts, and the page grows again. There is no hysteresis.

**Fix direction:** add hysteresis to `isCompact`, or reserve the header height so the swap does not change document height.
