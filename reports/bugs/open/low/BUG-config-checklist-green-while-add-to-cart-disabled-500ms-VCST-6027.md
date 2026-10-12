# Configuration checklist shows no red row while Add to cart is still disabled for ~0.5 s — **P3**

## Status: CONFIRMED by in-page measurement (MutationObserver on `performance.now()`, 6/6 loads + 5/5 edits — 2026-10-06)
**Found by:** agent — testing VCST-6027 (`/qa-test` FULL, found-in-testing)
**Tracker:** not filed — below the severity floor (Low). Named in the VCST-6027 QA comment.
**Oracle:** `{SPEC}` VCST-6027 statement (the checklist explains why Add to cart is disabled) + `BL-CAT-006` converse.
**Provenance:** IN-SCOPE (the window is visible only because the checklist exists).
**Build:** vc-frontend PR #2527 `2.59.0-pr-2527-d089-d08928e7` on http://localhost, API vcst-qa.

## What happens
- **First paint** (CFG-030, CFG-023): the checklist renders all rows green/optional ~500–550 ms before Add to cart
  loses `disabled` (waits for `CreateConfiguredLineItem`, ~240 ms, after a debounce).
- **After typing** the last required Text (CFG-024, 1920 and 375 px): row is green on the first keystroke; the button
  enables ~500 ms after the LAST keystroke.

**Expected:** no moment where every row is green/optional and Add to cart is disabled with no explanation.
**Actual:** a ~0.5 s window per load / per edit. Short and self-resolving — hence Low.
**Limits:** measured in-page, single session, un-throttled (no Slow-4G); the window scales with `CreateConfiguredLineItem` latency, so it will be longer on a slow network or a loaded backend.

**Not a 5–16 s lag.** Earlier agent readings of 5–19 s (3x, C1 `CFG-CHK-027`) were tool-latency artifacts of snapshot
polling; the in-page timer is authoritative. Measurement scripts: run artifacts of this session (not committed).
**Fix Routing:** `VirtoCommerce/vc-frontend` · checklist / price block — show a pending state on the button (or a
"checking configuration…" hint) while the configuration preview is in flight.
