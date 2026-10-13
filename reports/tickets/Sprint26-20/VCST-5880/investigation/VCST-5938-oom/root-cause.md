## Root-Cause Worksheet — VCST-5938 (OOM tab crash on /compare)

### 1. Symptom (one line, observable)
On /compare the page scrolls once and then freezes: no paint, no input. Chrome's renderer memory then climbs by hundreds of MB to GBs until the tab dies with "Aw, Snap! Out of Memory".

### 2. Lowest failing layer (lowest wins)
Network tab said: [x] storefront-only  [ ] xAPI/GraphQL  [ ] REST  [ ] module/data  [ ] infra
- **Decided by:** the freeze issues **0** GraphQL requests and logs 0 console errors (Part A rows 3/6).
- The only activity is a class attribute on the compare header row, which toggles about 230 times/s (`console-pr-hang-probe.txt`).
- **Routing:** repoKind `frontend` → repo **`VirtoCommerce/vc-frontend`**.

### 3. Evidence → claim chain
| # | Claim | Evidence |
|---|---|---|
| 1 | The freeze follows a scroll that stops at the compact threshold. It does not follow list edits. | Toggles start right after PageDown, with scrollY stuck at 240 (PR) or 262 (BASELINE) and the row top fixed at 128 = `--vc-app-header-height` (`console-pr-hang-probe.txt`). Six Clear→Restore cycles on each build left the post-GC heap flat: 27.2→28.3 MB (PR) and 28.9→28.7 MB (BASELINE) (`evidence-index.md`, `heap-diff-c1-vs-c6.txt`). |
| 2 | The main thread never yields. | `Runtime.evaluate` and `Page.captureScreenshot` both time out while the probe keeps logging (`evidence-index.md` row 1b). |
| 3 | Memory grows without bound, and it is the /compare tab doing it. | Renderer private bytes: 4.75→5.38 GB (PR run A), 5.66 GB at about 45 s (PR run B), 1.72→2.70 GB in 8 s (BASELINE). Each pid exits when that tab is closed (`evidence-index.md`). |
| 4 | Configured entries are not required. | It hangs the same way on the plain-only Group A tab: 0 configured, docH 1658, viewport 1358 (`console-pr-hang-probe.txt`). |
| 5 | The class being toggled sits on the same element the code measures. | `compare-table.vue` (PR `ee98adbd7`, lines 11–13): `ref="headerRowRef"` + `:class="{ 'compare-table__header-row--stuck': isCompact }"`. BASELINE has the same thing at lines 9–11. |
| 6 | What is computed from that measurement | PR lines 383–384 (BASELINE 375–376): `const { top: headerRowTop } = useElementBounding(headerRowRef)` and `isCompact = !isMobile && headerRowTop <= appHeaderHeight + 1`. `isCompact` also swaps `v-if` subtrees (lines 42, 48, 69), which changes the row and table height. |
| 7 | The measurement re-runs synchronously when that class changes. | `@vueuse/core` 14.3.0 `useElementBounding` (`dist/index.js` line 3143): `useMutationObserver(target, update, { attributeFilter: ["style","class"] })`, with `updateTiming = "sync"`. So `update()` calls `getBoundingClientRect()` (a forced synchronous layout) from a MutationObserver callback, which runs as a microtask. |

### 4. The "why" in one sentence
When the page is only slightly taller than the viewport and the user scrolls to the compact-header threshold, the compact and full header layouts each place the row on the other side of `appHeaderHeight + 1`. Every write of the `--stuck` class fires VueUse's MutationObserver on that same row, which re-measures it synchronously and flips `isCompact` back. Vue re-renders and the class is written again, so the microtask queue never drains. The tab neither paints nor accepts input while MutationRecords, Vue jobs and DOM churn pile up until the renderer runs out of memory.

### 5. Alternatives ruled out
| Alternative hypothesis | How it was ruled out |
|---|---|
| Repeated clear/add cycles (the brief's hypothesis) | 6 cycles per build left the heap flat, with 0 requests pending at each next cycle (measured on BASELINE c4→c5 under Slow 3G). The c1→c6 heap diff shows no growing retainer. |
| Configured mutation wave without an AbortController (code-derived) | Each wave is 11 mutations spread over 3–5 ms and drains in ≤ 0.62 s, or before the next click even on Slow 3G. At UI cadence the wave never overlapped the next cycle. The freeze itself issues 0 requests. The defect stays real but unreproduced and is not this crash. |
| Unbounded `SearchProducts` fetch (the existing VCST-5938 RCA) | 1 request per edit, 0 on tab switches, about 0.4–1 s for 19 ids. The freeze happens with no network at all. |
| Introduced by PR #2518 (VCST-5880) | It reproduces identically on BASELINE pr-2511. Within `client-app/shared/compare`, PR #2518's own commits change only `compare-table.vue` and its test. The rest of the 116-file diff against the merge base is merged `dev`. The PR keeps the `useElementBounding` / `isCompact` / `--stuck` binding unchanged and moves it only from a `<div>` to the new `<thead>`. |
| By design / config | No setting gates the compact header. VirtoOZ (Compare Products) does not describe it. A tab that hangs is never by design. |
| Env data drift | It reproduces on 3 different tabs (configurable, plain fixtures) and 2 builds against one backend. The trigger is purely layout. |
| DevTools emulation artefact | The 1280x1385 and 1280x1358 sizes are emulated, but the condition is only "document is about 300 px taller than the viewport". A real window or a different tab height reaches that state. The trigger is a single PageDown, and the same threshold oscillation was seen without emulation in Firefox (KB-C5E27085). |

**Not established:**
- The exact width of the trigger band. Four negative controls at viewports 900, 1050 and 1100 on other tabs did not hang.
- The behaviour in Firefox or Safari. Firefox only oscillated per KB-C5E27085.
- A run to the actual "Aw, Snap": stopped at the load cap. A tab growing past 5 GB with a frozen main thread matches the reported crash.

### 6. Regression archaeology
- **Introduced in:** `vc-frontend` `17ad3e6f6`, `feat(VCST-5735): Compare products (#2452)`, 2026-09-07. That is the first commit that adds `useElementBounding(headerRowRef)` to `compare-table.vue`.
- **Last good:** pre-Compare-v2. **First bad:** #2452. It is present in pr-2511 (BASELINE) and pr-2518 (PR).
- The diff explains the symptom: the self-observing measure-and-toggle loop was added in that commit.

### 7. Confidence
[ ] HIGH  [x] **MEDIUM (strong):**
- Observed live: the class-toggle loop, the frozen main thread and the memory growth, 4/4 at the trigger geometry on 2 builds.
- Read in source: the culprit chain (VueUse MutationObserver plus a synchronous measure of the element that `isCompact` restyles).
- Inferred, not traced: that the loop runs as a microtask livelock. Inspector calls could not run on the frozen thread, so no CPU profile was possible.

### 8. Fix Routing handoff (for /qa-fix Gate 1)
- **Owning layer:** Storefront.
- **repoKind:** `frontend`.
- **Repo:** `VirtoCommerce/vc-frontend`.
- **File:** `client-app/shared/compare/components/compare-table.vue`:
  - the `useElementBounding(headerRowRef)` + `isCompact` block (PR lines 383–384, dev 375–376)
  - the `:class` binding on the same `headerRowRef` element (PR lines 11–13)
- **Fix shape:** stop measuring the element whose class the result changes. Options:
  - a zero-height sentinel above the row read through `IntersectionObserver`
  - hysteresis: compact at `≤ h+1`, un-compact only at `> h + compactDelta`
  - at minimum, `updateTiming: "next-frame"`, which ends the microtask livelock but can still flicker
- **Merge path:** fix-forward. Reverting #2452 would remove Compare v2.
- **Tracker:** VCST-5938, which already names the freeze. This is a second, stronger mechanism for "unresponsive". It is not in scope for VCST-5880.
