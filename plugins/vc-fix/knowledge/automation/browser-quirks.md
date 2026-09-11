---
applicability: universal
applicability_rationale: "Per-browser rendering differences. Cross-VC universal."
---

# Browser Quirks — Cross-Browser Testing Reference

## iOS Safari

- `100vh` includes toolbar — use `dvh` (dynamic viewport height) instead
- Fixed positioning breaks during keyboard open
- Momentum scroll traps — elements can "trap" touch scrolling
- Safe area insets needed for notch devices
- Auto-zoom on inputs with font-size < 16px — always verify mobile form inputs

## Safari Desktop

- `<input type="date">` renders native picker differently than Chrome
- `backdrop-filter` has performance issues
- `position: sticky` inside overflow containers may break

## Firefox

- Scrollbar styling: `::-webkit-scrollbar` not supported (use `scrollbar-width` / `scrollbar-color`)
- Subgrid support varies
- `gap` may not work in older flexbox contexts

### "playwright-firefox cannot click here" — ROOT CAUSE (2026-09-08, confirmed) and the fix

**STATUS: RESOLVED. The lane is a full click-capable slot — re-verified live 2026-09-11** against the
vcst-qa storefront: navigate, a popover click (the `Currency` button reached `[expanded]` with all 9
options rendered — a real DOM state change, not a no-op return) and a navigation click (`Sign in` →
`/sign-in`), 0 console errors, no timeouts. The 4 days of transcripts before it hold 43 firefox calls
with **zero** errors, 6 of them clicks. Treat a fresh click timeout on this lane as a **new** defect and
check the two prerequisites below before reopening anything here.

**Two prerequisites, because the fix lives in a config file the SERVER reads at startup:**

1. **Restart the MCP server after editing `config/mcp-playwright-firefox.config.json`.** Without the
   restart the pref is not applied and the lane fails exactly as it did before — indistinguishable from
   a regression.
2. **Keep `@playwright/mcp` PINNED in `.mcp.json`** (added 2026-09-11). An `@playwright/mcp@latest`
   entry silently swaps the server binary underneath this config: each release bundles its own
   `playwright-core`, which demands a specific browser build, so an unattended bump can fail the lane at
   launch with *"Executable doesn't exist"* and can change actionability behaviour without any config
   change. The pin must match `package.json`'s devDependency and `PLAYWRIGHT_MCP_PACKAGE` in
   `ci/lib/lane-mcp.ts`, or interactive runs stop reproducing CI. See `docs/onboarding.md` §Required MCP
   Servers.

**Symptom (confirmed 6× on the team's Windows machines, 2026-06 → 2026-08):** `browser_click` on the
`playwright-firefox` MCP lane resolves the element, then times out on Playwright's *"visible, enabled
and stable"* wait — on fully visible, non-moving elements (CLS 0, fixed rect). `browser_type` and
navigation work. Raw `playwright-core` + firefox in a single foreground window clicks the same element,
headed and headless. A browser-revision re-install changed nothing.

**ROOT CAUSE, confirmed by probe run 4 (2026-09-08, `--repeat 3`, per-attempt rAF).** Every failing attempt
in the whole matrix — **15 of 15** — was preceded by a dead `requestAnimationFrame` (≤2 ticks in 500 ms), and
**no passing attempt was**. The chain is:

> the firefox window is fully covered → Windows Firefox occlusion tracking stops the refresh driver → rAF
> stops → Playwright's Windows-Firefox stable check, which needs **5 consecutive rAF ticks**, can never
> complete → `browser_click` times out at *"visible, enabled and stable"*. `fill()` does not wait for
> `stable`, so typing keeps working. Chromium needs **1** tick and is launched with
> `--disable-backgrounding-occluded-windows`, so it never shows this.

| run-4 variant | foreground | covered (rAF/2 s) | uncovered | reading |
|---|---|---|---|---|
| `chromium-control` | OK ×3 | OK ×3 (120) | OK ×3 | the target and the page are fine |
| `firefox-default` | OK ×3 (raf 31) | **TIMEOUT ×3 (rAF 0)** | **TIMEOUT ×3 (rAF 0)** | the bug, reproduced |
| `ff-repro+pref-off` | OK ×3 | **OK ×3 (rAF 121)** | OK ×3 | **the fix** — covered, still ticking |
| `ff-repro+headless` | OK ×3 | n/a (no window) | OK ×3 | also works; bigger change |
| `ff-repro+keepalive` | OK ×3 | TIMEOUT ×3 (rAF 0) | TIMEOUT ×3 | a CSS animation does **not** keep the driver alive |

**Two findings beyond the mechanism, both of which explain the lane's history:**

1. **The stall is STICKY.** `firefox-default` was still at rAF 0 and still failing *after the cover was
   removed*. The driver does not restart on its own. So one moment of occlusion — inevitable when the MCP
   runs three headed 1920×1080 browsers on one desktop — poisons that firefox session for every click that
   follows. That is why the failure reads as "firefox cannot click here" rather than "firefox is flaky",
   and why re-running the same suite on the same lane kept failing.
2. **`ff-repro+pref-off` keeping its rAF at 121 under the cover IS the proof, not a missed cover.** Its
   window geometry is identical to `firefox-default`'s in the same run (3440×1440 at 0,0; window 4,4
   1936×1173), and the cover is placed from that geometry — so both were covered and only the one with
   occlusion tracking off kept ticking. (v4 mislabelled that row `COVER MISSED`; the flag now excludes
   variants that deliberately disable the pref.)

Run 3 read the other way — plain Firefox clicked once while covered at rAF 0 — because that single attempt
happened to land in a moment when the driver had ticked. Three attempts with the rAF rate recorded before
each one is what settled it; a single sample cannot.

**The reproducer that made this cheap to test:** `reducedMotion: 'reduce'` idles the storefront's 3
animations and produces the same dead-rAF stall in ONE window, with no cover and no monitor layout. Keep it
in the matrix — any future candidate fix can be tested against it in seconds.

**Probe runs 1–2 (2026-09-08, invalid).** Two defects in the probe itself, kept here because they explain the
numbers in those logs:

- **The target was unclickable for every engine.** `a[href]:visible` matched the storefront's `skip-link` at
  `y = −29`. Playwright calls it visible, then loops on *"element is outside of the viewport"* until the
  timeout — on Firefox **and on Chromium**. So the click timeouts in runs 1–2 were the probe's, not the
  lane's. A Chromium control that fails now means *bad target*, never *Firefox bug*.
- **The cover landed on the wrong monitor.** The machine is dual-head (Firefox reported a 3440×1440 screen,
  Chromium 1920×1080); the cover opened at 0,0 and missed, so Firefox kept ticking at **121 rAF/2 s**.
  **Except once** — in the `reduced-motion` run the cover happened to land on Firefox's monitor, rAF fell to
  **0**, and the click stalled at exactly *"waiting for element to be visible, enabled and stable"* with no
  further progress. That is the reported symptom, reproduced by accident.

**What those runs did settle:** rect jitter is **1 distinct rect in 12 frames** on every engine, so the
storefront is still and rect movement is not the trigger — what matters is whether the rAF ticks arrive at all.

**Shipped facts the candidates rest on:**

1. Playwright's *stable* check samples the element rect on consecutive `requestAnimationFrame` ticks and
   on **Windows + Firefox demands 5 identical ticks** (`rafCountForStablePosition()` is
   `process.platform === "win32" ? 5 : 1`; Chromium, WebKit and non-Windows Firefox need 1).
2. Since Firefox 102, **Windows window-occlusion tracking** is on by default: a window fully covered by
   other windows is treated as hidden — rAF periods lengthen and then **stop**, `document.hidden` stays
   `true` (Mozilla bugs 1712854, 1732733; Marionette hit the same class in 1802473). Three headed
   1920×1080 browsers on one desktop means the firefox window sits under the two Chromium windows.
3. No rAF ticks → the 5-tick wait never completes → the MCP's **default 5 s action timeout** fires with
   the element still reported visible and enabled.
4. `fill()` waits for visible + enabled + **editable, not stable**, and navigation has no actionability
   wait — so typing and navigating keep working while every click dies. Chromium is immune because
   Playwright launches it with `--disable-backgrounding-occluded-windows` /
   `--disable-renderer-backgrounding`; Playwright sets Firefox's background *timer* prefs but not the
   occlusion pref.

It is not a Firefox rendering bug, not the storefront, and not the MCP's click code — it is the MCP's
*headed, three-windows-at-once* topology meeting a Windows-only Firefox power-saving feature.

**THE FIX (in the repo):** `config/mcp-playwright-firefox.config.json` → `launchOptions.firefoxUserPrefs`
`{ "widget.windows.window_occlusion_tracking.enabled": false }`. The MCP spreads `launchOptions` into
`browserType.launch()`, so the pref reaches Firefox. Proven at browser level: covered rAF 121 vs 0 without
it, 6/6 clicks. **Restart the MCP server after pulling** — the config is read at server start.

Headless is the alternative (no window, so nothing to occlude) and would also close the class for any future
engine with the same power-saving behaviour; it costs the lane its visible window, so the pref is preferred
while the other two lanes stay headed.

**Prove any fix before touching a lane rule:** `node scripts/maintenance/firefox-click-probe.mjs --url <storefront>`
on a Windows machine (v4, ~5 min). It runs `chromium-control` and `firefox-default` as controls, then the
**reproducer** (`ff-repro-reducedmotion`) and three candidates on top of it — `+keepalive` (a 1 px infinite
CSS animation injected before page JS), `+headless`, `+pref-off`. Each phase clicks `--repeat` times
(default 3) with `trial: true` (full actionability wait, no real click) and records the rAF ticks in the
500 ms before each attempt; the footer prints how many failing attempts had a dead rAF and how many passing
ones did.

Exit 0 requires the control to pass, the reproducer to stall, and at least one candidate to clear it on every
attempt — the RESULT line names the winner. **That bar is met (run 4): the pref wins.**

**THE LANE IS OPEN (2026-09-08).** `defaults.firefoxClickOk: true` in `config/test-suites.json`, a rewritten
firefox box in `.claude/rules/agents.md` (§Parallel Execution), `qa-testing-expert` back on
`playwright-firefox`, and the exploratory / charter / triage lane rules no longer exclude it. The deny-list
is not deleted, only switched off: `browserDenyListFor` (`ci/lib/suite-manifest.ts`) is the single consumer
and `scripts/unit/run-plan.test.ts` pins both directions of the flag.

**What is proven, and what is not.** The probe proves the BROWSER: with the pref, a covered firefox window
keeps ticking and clicks 6/6. It does not prove the PIPELINE — no regression suite has yet run on the lane
since the fix. So the first click-driven suite scheduled onto firefox is the real confirmation. Watch it,
and if clicks time out at *"visible, enabled and stable"*:

1. **Check the MCP restart first.** The config is read at server start; an un-restarted server behaves
   exactly as before the fix. This is the likeliest cause by far.
2. **Then flip `defaults.firefoxClickOk` to `false`** — one line, no code change, the deny-list returns for
   every click-driven suite — and reopen this section with the run id.

**If no candidate clears the reproducer, the fix is not a launch option.** The remaining lever is the
actionability wait itself — a force-click skips the stable check entirely — which is an `@playwright/mcp`
capability question, not a config one. Report that rather than inventing a pref.

## Edge

- Generally Chrome-compatible (Chromium-based)
- Extension-injected console noise — filter out `extension://` messages
- **High-contrast mode** (Edge/Windows): Verify components remain usable, borders visible, focus indicators work

## WebKit — NOT Available on Windows

WebKit is not available on Windows via Playwright. Use Edge or Chrome as fallback. Do not attempt WebKit installation.
