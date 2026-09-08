#!/usr/bin/env node
/**
 * firefox-click-probe — A/B reproduction of "playwright-firefox cannot click here".
 *
 * WHAT IT TESTS. `.claude/rules/agents.md` records that `browser_click` on the firefox lane resolves the
 * element and then times out on Playwright's "visible, enabled and stable" gate — on fully visible,
 * non-moving elements, on the team's Windows machines, confirmed 6×, while raw playwright-core in a
 * single foreground window clicks the same element fine. Reading the shipped code explains every one
 * of those facts at once:
 *
 *   1. Playwright's "stable" check samples the element's rect on consecutive `requestAnimationFrame`
 *      ticks, and on **Windows + Firefox it demands 5 identical ticks** (`rafCountForStablePosition()`
 *      returns `process.platform === "win32" ? 5 : 1`; every other browser/OS needs 1).
 *   2. Since Firefox 102 (Windows only) **window occlusion tracking** is on by default: a window fully
 *      covered by other windows is treated as hidden — rAF periods lengthen and then stop entirely,
 *      `document.hidden` stays true (Mozilla bugs 1712854, 1732733, 1802473). Three headed 1920×1080
 *      browsers on one desktop = the firefox window is covered by the two Chromium windows.
 *   3. No rAF ticks → the 5-tick check never completes → the MCP's default 5 s action timeout fires.
 *   4. `fill()` waits for visible + enabled + editable and **not** stable, so typing works; navigation
 *      needs no actionability at all. Exactly the observed split.
 *   5. Chromium never shows this because Playwright launches it with
 *      `--disable-backgrounding-occluded-windows` / `--disable-renderer-backgrounding`.
 *
 * The fix is one Firefox pref in `config/mcp-playwright-firefox.config.json`:
 *   launchOptions.firefoxUserPrefs["widget.windows.window_occlusion_tracking.enabled"] = false
 *
 * THIS SCRIPT PROVES IT ON THE MACHINE THAT SHOWS THE BUG. For each variant (pref default / pref off)
 * it launches headed Firefox at 1920×1080, opens the storefront, then launches a headed Chromium window
 * on top of it (that is the occlusion), waits for Firefox's throttling to settle, and measures:
 *   - rAF ticks per 2 s in the covered Firefox window, and `document.hidden`
 *   - `locator.click({ trial: true, timeout: 5000 })` on the first header link — `trial` runs the full
 *     actionability wait (visible / enabled / stable / receives events) WITHOUT clicking, so nothing
 *     navigates and the probe is safe on any env
 *   - the same trial click after the covering window is closed (control — must pass in both variants)
 *
 * Expected on Windows: default → ~0 ticks, hidden=true, click TIMEOUT; pref off → ~120 ticks, click OK.
 * Exit 0 when the pref-off variant passes the covered click; 1 otherwise (the hypothesis is then wrong
 * or incomplete — report the table, do not flip any lane rule).
 *
 * Usage:
 *   node scripts/maintenance/firefox-click-probe.mjs [--url <storefront>] [--variant default|pref-off|both]
 *                                                     [--settle <ms, default 12000>] [--json]
 *   TEST_ENV=vcst node scripts/maintenance/firefox-click-probe.mjs        # FRONT_URL from the env loader
 *
 * Runs on the MCP lane's OWN Playwright (`@playwright/mcp` bundles a newer `playwright` than the repo's ^1.61,
 * with its own Firefox revision), so install THAT copy's browsers, not the top-level one's:
 *   node node_modules/@playwright/mcp/node_modules/playwright/cli.js install firefox chromium
 * (`npx playwright install firefox` installs the repo's revision — a different build; both can coexist.)
 * Read-only against the storefront (trial clicks only). Not wired to CI — it needs a desktop.
 */
import { createRequire } from 'node:module';

// Use the SAME Playwright the MCP lane runs, not the repo's top-level one: `@playwright/mcp` bundles its own
// `playwright` (a newer alpha with its own Firefox revision), while `import 'playwright'` here resolves the
// repo's ^1.61 with a different Firefox build. Reproducing against the wrong build is how the 2026-08-05
// raw-playwright probe could pass while the lane failed. Fall back to the top-level copy if the MCP is absent.
const rootRequire = createRequire(import.meta.url);
let pwPath = 'playwright';
try {
  pwPath = createRequire(rootRequire.resolve('@playwright/mcp/package.json')).resolve('playwright');
} catch { /* @playwright/mcp not installed — use the top-level playwright */ }
const pwModule = await import(pwPath);
const { firefox, chromium } = pwModule.default ?? pwModule; // playwright's entry is CJS: named exports live on `default`
const pwVersion = JSON.parse(await import('node:fs').then((fs) => fs.readFileSync(pwPath.replace(/index\.(m?js)$/, 'package.json'), 'utf8'))).version;

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return dflt;
  const v = argv[i + 1];
  return v && !v.startsWith('--') ? v : dflt;
};
let URL_ = arg('url', process.env.FRONT_URL);
if (!URL_) {
  // Last resort: run the layered env loader (`.env.defaults` → `.env.<TEST_ENV>` → `.env.local`) and read
  // FRONT_URL through process.env (rules/test-data.md). The loader exits the process when CORE vars are
  // missing, which is why `--url` is the primary path for a probe that needs no credentials.
  await import('../../config.js');
  URL_ = process.env.FRONT_URL;
}
const VARIANT = arg('variant', 'both');
const SETTLE_MS = Number(arg('settle', '12000'));
const JSON_OUT = argv.includes('--json');
const OCCLUSION_PREF = 'widget.windows.window_occlusion_tracking.enabled';

if (!URL_) {
  console.error('No storefront URL: pass --url or set FRONT_URL (TEST_ENV=<env> loads .env.<env>).');
  process.exit(2);
}
if (process.platform !== 'win32') {
  console.error(`[note] platform is ${process.platform}: the 5-frame stability rule and occlusion tracking are Windows-only; ` +
    'the probe still runs but the default variant is expected to PASS here.');
}

const variants = VARIANT === 'both' ? ['default', 'pref-off'] : [VARIANT];
const results = [];

async function rafStats(page) {
  // Count rAF ticks for 2 s. The setTimeout is the escape hatch for a window whose rAF has stopped
  // entirely (Playwright already disables Firefox's background TIMER throttling, so timers still fire).
  return page.evaluate(() => new Promise((resolve) => {
    let ticks = 0;
    const t0 = performance.now();
    const step = () => { ticks++; if (performance.now() - t0 < 2000) requestAnimationFrame(step); else resolve({ ticks, hidden: document.hidden, visibilityState: document.visibilityState }); };
    requestAnimationFrame(step);
    setTimeout(() => resolve({ ticks, hidden: document.hidden, visibilityState: document.visibilityState, timedOut: true }), 4000);
  }));
}

async function trialClick(page) {
  const target = page.locator('header a[href], a[href]').first();
  const t0 = Date.now();
  try {
    await target.click({ trial: true, timeout: 5000 });
    return { ok: true, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: String(e.message || e).split('\n').slice(0, 3).join(' | ') };
  }
}

for (const variant of variants) {
  const firefoxUserPrefs = variant === 'pref-off' ? { [OCCLUSION_PREF]: false } : {};
  const row = { variant, prefs: firefoxUserPrefs };
  let ff, cover;
  try {
    ff = await firefox.launch({ headless: false, firefoxUserPrefs });
    const ctx = await ff.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'en-US' });
    const page = await ctx.newPage();
    await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    row.foregroundRaf = await rafStats(page);

    // Occlude: a headed Chromium window at the same size, launched AFTER Firefox, lands on top of it.
    cover = await chromium.launch({ headless: false, args: ['--window-position=0,0', '--window-size=1920,1080'] });
    const coverPage = await (await cover.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
    await coverPage.goto('about:blank');
    await new Promise((r) => setTimeout(r, SETTLE_MS));

    row.coveredRaf = await rafStats(page);
    row.coveredClick = await trialClick(page);

    await cover.close(); cover = undefined;
    await new Promise((r) => setTimeout(r, 1500));
    row.uncoveredClick = await trialClick(page);
  } catch (e) {
    row.fatal = String(e.message || e).split('\n')[0];
  } finally {
    await cover?.close().catch(() => {});
    await ff?.close().catch(() => {});
  }
  results.push(row);
}

if (JSON_OUT) {
  console.log(JSON.stringify({ url: URL_, platform: process.platform, playwright: pwVersion, playwrightPath: pwPath, settleMs: SETTLE_MS, results }, null, 2));
} else {
  console.log(`firefox-click-probe — ${URL_} — ${process.platform} — playwright ${pwVersion} (${pwPath.includes('@playwright/mcp') ? 'the MCP lane\'s own copy' : 'top-level copy'}) — settle ${SETTLE_MS} ms\n`);
  console.log('variant    | covered rAF/2s | hidden | covered trial click        | uncovered trial click');
  console.log('-----------|----------------|--------|----------------------------|----------------------');
  for (const r of results) {
    if (r.fatal) { console.log(`${r.variant.padEnd(10)} | FATAL: ${r.fatal}`); continue; }
    const c = r.coveredClick, u = r.uncoveredClick;
    console.log(`${r.variant.padEnd(10)} | ${String(r.coveredRaf.ticks).padStart(14)} | ${String(r.coveredRaf.hidden).padEnd(6)} | ${(c.ok ? `OK ${c.ms} ms` : `TIMEOUT ${c.ms} ms`).padEnd(26)} | ${u.ok ? `OK ${u.ms} ms` : `TIMEOUT ${u.ms} ms`}`);
    if (!c.ok) console.log(`           |   ↳ ${c.error}`);
  }
  console.log('\nReading: default = TIMEOUT with ~0 ticks and pref-off = OK confirms the occlusion root cause; the config fix is then proven.');
}

const prefOff = results.find((r) => r.variant === 'pref-off');
const dflt = results.find((r) => r.variant === 'default');
const confirmed = prefOff?.coveredClick?.ok && prefOff?.uncoveredClick?.ok;
if (!JSON_OUT) {
  if (confirmed && dflt && !dflt.coveredClick?.ok) console.log('\nRESULT: root cause CONFIRMED — pref off clicks under occlusion, default does not.');
  else if (confirmed) console.log('\nRESULT: pref-off variant clicks; default was not run or also passed (no occlusion throttling on this machine?).');
  else console.log('\nRESULT: NOT confirmed — do not change any lane rule; attach this table to the finding.');
}
process.exit(confirmed ? 0 : 1);
