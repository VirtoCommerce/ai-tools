# Evidence index — VCST-5938 "Aw, Snap! Out of Memory" on /compare

**Verdict:** REPRODUCED on **both** builds. It is a renderer hang plus unbounded memory growth, triggered by a **scroll that stops at the sticky compact-header threshold**. It is **not** triggered by clear/add cycles: that hypothesis is refuted.
**Provenance:** pre-existing on BASELINE, so it belongs to **VCST-5938**. It was not introduced by PR #2518 (VCST-5880).

## Env header
| | |
|---|---|
| TEST_ENV | `vcst` (shared vcst-qa backend for both builds) · ENV_RISK: shared QA |
| PR build | `http://localhost` (local nginx), theme `2.60.0-pr-2518-ee98-ee98adbd` (vc-frontend `ee98adbd7`, footer-verified) |
| BASELINE | `{{FRONT_URL}}` = vcst-qa storefront, theme `2.60.0-pr-2511-81f1-81f18d01` (footer-verified) |
| Platform/modules | not re-captured this run (shared backend, unchanged between builds; storefront-only defect, row 12 N/A to the layer verdict) |
| Browser | Chrome via Chrome DevTools MCP, isolated contexts `oom-pr` / `oom-base`, guest, 1280 wide |
| Date | 2026-10-13 |

## List shape (built through the real UI, identical on both builds)
19 entries over 8 tabs, 11 of them configured, each added with a PDP configuration:
- Configurable Parents: `@td(CFG_LAPTOP)` with RAM 8/32/16 GB, CFG-012 Premium Seat, CFG-021 default.
- Configurable caps & shirts: CFG-002 White and Red.
- Build the bike: CFG-009 two tyre options.
- Wonderful beds: two mattress options.
- Dreamy cakes: 1 plain.
- Group A: `@td(PROD_CMP_A|B|FILL_1|FILL_2|VARIATIONS)`.
- Group C: `@td(PROD_CMP_C)`.
- Compare Nested: `@td(PROD_CMP_PARENT)`.

`@td(PROD_CMP_CHILD)` was not added, to stay at 8 tabs.

The pre-existing PR list (15 entries) was cleared first. Both origins were cleared again at the end (`compareProducts = []`, verified).

## Cycle tables
A cycle is: /compare → Clear all → OK → **Restore products**. That re-adds the same 19 entries in one real-UI click.
- Cycle 0 is the manual build. It was done in a second tab while /compare stayed open, so the page reacted live through the storage event.
- Cycles 4–5 ran under DevTools **Slow 3G** to widen the no-abort window.
- "Heap" is `usedJSHeapSize` before GC. "post-GC" was read right after `take_heapsnapshot`.

**PR (2.60.0-pr-2518)**
| Cycle | Heap MB | GraphQL reqs | CreateConfiguredLineItem | SearchProducts | Pending at next cycle start | DOM nodes |
|---|---|---|---|---|---|---|
| 0 (build) | 29.2 | 40 | 12¹ | 20 | 1 SP at read, 0 at c1 | 1344 |
| 1 | 29.8 (post-GC **27.2**) | 12 | 11 (spread 3 ms) | 1 (766 ms) | 0 | 1344 |
| 2 | 29.9 | 12 | 11 | 1 | 0 | 1344 |
| 3 (+8-tab sweep) | 30.1 / 29.2 | 12 / **0** on tab switches | 11 | 1 | 0 | 1344 / 1341 |
| 4 (Slow 3G) | 29.4 | 12 | 11 | 1 | 0² | 1344 |
| 5 (Slow 3G) | 28.4 | 12 | 11 | 1 | 0² | 1344 |
| 6 | 29.0 (post-GC **28.3**) | 12 | 11 | 1 (654 ms) | 0 | 1344 |
| hard reload | 52.8 (fresh) | 18 | 11 (spread 3 ms) | 1, issued 2 ms after the last mutation, 965 ms | 0 | 1341 |

Idle for 20 s after cycle 3: the heap stayed at 30.2–30.3 MB, with 0 GraphQL requests and 0 DOM mutations.

**BASELINE (2.60.0-pr-2511)**
| Cycle | Heap MB | GraphQL reqs | CreateConfiguredLineItem | SearchProducts | Pending at next cycle start | DOM nodes |
|---|---|---|---|---|---|---|
| 0 (build) | 29.0 | 43 (incl. page load) | 11 | 19 | 1 SP at read | 1347 |
| 1 | 30.1 (post-GC **28.9**) | 12 | 11 (spread 3 ms) | 1 (394 ms) | 0 | 1344 |
| 2 | 29.1 | 12 | 11 | 1 | 0 | 1344 |
| 3 | 30.1 | 12 | 11 | 1 | 0 | 1347 |
| 4 (Slow 3G) | 30.6 | 12 | 11 | 1 | **0** (measured) | 1347 |
| 5 (Slow 3G) | 29.9 | 12 | 11 | 1 | 0 | 1347 |
| 6 | 29.5 (post-GC **28.7**) | 12 | 11 | 1 (550 ms) | 0 | 1347 |
| hard reload | 54.9 (fresh) | 18 | 11 (spread 3 ms) | 1, issued 2 ms after, 556 ms | 0 | 1342 |

¹ 12 = 11 configured entries + 1 extra mutation. The extra one came from an add that a second click on Add to Compare immediately removed. That button toggles, and the label does not change in the a11y tree.
² The previous wave had drained before the next Clear. The fastest UI cadence was about 18 s per cycle through the tools, longer than one wave even on Slow 3G. So the code-derived no-abort re-issue window was **not reachable** at that cadence.

**Heap diff c1→c6** (`heap-diff-c1-vs-c6.txt`):
- PR: +1.8 MB, mostly V8 `(code)` and `blink::AX*` objects that the DevTools snapshots create.
- BASELINE: +0.13 MB.
- No app-level retainer grows on either build.

## The crash path (both builds)
| # | Artifact | Where |
|---|---|---|
| 1 | Pre-trigger state, PR, 1280x1385, docH 1685 | `../../screenshots/oom-pr-1280x1385-before-pagedown-docH1685.png` |
| 1b | No failure-state screenshot is possible: `Page.captureScreenshot` **timed out**, and so did `Runtime.evaluate`. That timeout is itself the evidence of a main thread that never yields. | — |
| 2 | Cycle-0 state | `oom-pr-1280-c0-19entries-8tabs-11cfg.png`, `oom-base-1280-c0-19entries-8tabs-11cfg.png` (and the predecessor's `oom-pr-1280-c0-18entries-8tabs.png`) |
| 6 | Probe console: header-row class toggles about 230/s while frozen; PR run 2, BASELINE, and the BASELINE plain-only tab; negative controls | `console-pr-hang-probe.txt` |
| — | Renderer memory (Win32 PrivatePageCount, pid tied to the tab because it exits on tab close) | see the table below |
| 3/4/5/7/10 | Network list, failing request, trace ID, HAR, App Insights: **N/A**. The failure has 0 GraphQL requests, 0 console errors and no server call, and the CDP lane writes no HAR. | — |

| Run | Build | Geometry | Renderer private memory |
|---|---|---|---|
| A | PR | Configurable Parents, 1280x1385 | 4.75 GB → 5.38 GB over 2 min (pid 58980, exited on close) |
| B | PR | same | 5.66 GB about 45 s after PageDown (pid 32176, exited on close) |
| C | BASELINE | same | 1.72 → 2.70 GB in 8 s (pid 52612, exited on close) |
| D | BASELINE | Group A (plain only), 1280x1358 | toggling confirmed, closed at once |

**Reproduction rate:** 4/4 at "page is 300 px taller than the viewport" (3 tabs, 2 builds). There were 0 hangs in 4 negative controls: viewport 900 / 1050 / 1100 on other tabs, where the scroll lands past the band.

## kb
- `kb_ask` "/compare memory / OOM": none certified (`kb_none`).
- Related entry: KB-C5E27085, a Firefox scroll oscillation at the same threshold on the same baseline (no freeze in Firefox).
- **Captured KB-8891459E**: a Chrome hang at the compact threshold, `vcst_qa`, baseline theme.
- VirtoOZ (Storefront User Guide, Compare Products) documents nothing about the sticky compact header. This is a new Compare v2 surface, so source plus live are the ground truth.
