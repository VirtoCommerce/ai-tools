# VCST-5938 verification report — 2026-11-05

**Verdict: VERIFIED** · STR 3/3 · env vcst (https://vcst-qa-storefront.govirto.com) · theme 2.62.0-pr-2613-e3fc-e3fce9a9

Step 5 run inline — agent has no built-in browser.

## Checklist
- Reproduce original STR 3x: **PASS**
- Fix resolves freeze: **PASS**
- Root cause (anchor measure + room check): **PASS**
- Long-page compact on/off at threshold: **PASS**
- Category tabs switch: **PASS**
- All/Differences filter: **PASS**
- Clear all + confirm: **PASS**
- No new console errors: **PASS**

## Before → after
- Short page (max scroll 300): one-page scroll from top: stops ~240 px; ~230 --stuck toggles/s; tab OOM → reaches 300; row full height 251 px, pinned, stuck styling; 1 class change; 60 fps; heap 33 MB flat
- Long page (max scroll 903): cross threshold both ways: n/a → compact on at 240, off below 240; 2 class changes total

## Console / network
- No application console errors; only the QA probe's own CORS /health and 404 calls and ad-blocker blocks.
- No network failures in the compare flow.

## Notes
- The first runs were discarded: the pane was in the background (visibilityState hidden, rAF 0/s), which invalidates timing checks. All counted runs were made with the page visible (60 fps).
- Compare list restored to empty after the test (Clear all).

## SKIPPED
- SKIPPED — Step 0.2 /qa-env-check endpoints — device VM and cloud cannot reach the stand (egress); reachability confirmed in the built-in browser, admin /connect/token not run (no sign-in from automation)
- SKIPPED — Step 5 agent dispatch — dispatched agents have no built-in browser; Step 5 run inline
- SKIPPED — Step 6 /vc-fix:qa-report — skill not available in this session; result comment written by hand
- SKIPPED — Step 6 inline screenshots — Jira media upload host blocked from cloud and device network; screenshot kept locally, stated in the comment
- SKIPPED — Step 6A evidence page — written locally by hand (qa-report unavailable)
