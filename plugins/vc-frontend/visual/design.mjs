#!/usr/bin/env node
/**
 * visual:design — does a component under review match its reference? (the DESIGN instrument, visual-axis.md §2a)
 *
 * PIXEL compares a build with the build before it. This compares the SAME component in two places at once:
 *   reference   Storybook (an existing component: same code base as prod) or a design-system build
 *   under test  prod / QA / a fork's preview / another Storybook (a customer theme)
 * and sorts every difference into an acceptance criterion with a severity. The criteria, their tolerances and the
 * source model come from the `design-review` skill's catalog v1.0 (Virto Design System); the measuring is ours,
 * headless, so it runs in a pipeline instead of a person's browser tab.
 *
 * What it checks per component (THRESHOLDS below is the one place the numbers live):
 *   AC-CMP  anatomy — the count of visible descendants per tag; an element missing or extra
 *   AC-LAY  box width / height
 *   AC-SPC  padding, gap
 *   AC-TYP  font family and weight exactly; size / line-height / letter-spacing within tolerance; transform, decoration
 *   AC-CLR  text and background colour, CIEDE2000 ΔE; opacity
 *   AC-BRD  border width, colour (ΔE), radius
 *   AC-ELV  box-shadow: layer count, offsets / blur / spread
 *   AC-PIX  the element's own pixels (pixelmatch, threshold 0.1) — not judged across two theme presets
 *   AC-THM  the theme tokens (--color-*-500, --vc-radius, font) of both pages; a colour difference that the SAME token
 *           names on both sides is `theme`, not a defect of the component
 * Not here, because another probe owns them: AC-A11Y (axe, contrast — qa-accessibility, measure-layout.ts),
 * AC-RSP / AC-CNT (layout-runner PROBE), AC-TOK (tokens:check). AC-STA: give each state its own component entry
 * (a story with the state's args, or a target with `hover` / `focus`).
 *
 * Severity (the catalog's): P1 blocker · P2 a visible difference · P3 within 2 px / ΔE ≤ 3 · theme · info.
 * Verdict: a P1 ⇒ FAIL; a P2 ⇒ PASS WITH ISSUES; else PASS. A component not found on either side is P2 and named.
 *
 * USAGE
 *   node design.mjs --spec <design.json> --out <dir> [--executable <chromium>] [--storage-state <file>]
 *   design.json:
 *     { "viewport": "1280x800",
 *       "ref":  { "label": "storybook", "baseUrl": "https://…" },
 *       "test": { "label": "prod",      "baseUrl": "https://…" },
 *       "components": [ { "name": "VcButton · solid primary md",
 *                         "ref":  { "path": "/iframe.html?id=components-molecules-vcbutton--basic&viewMode=story", "selector": ".vc-button" },
 *                         "test": { "path": "/cart", "selector": ".vc-button--solid--primary", "hover"?: true, "focus"?: true } } ] }
 *   Either side's baseUrl may be a local `storybook build` dir: it is served on 127.0.0.1.
 *
 * OUTPUT  <out>/design-report.json, <out>/design-report.md, <out>/img/<n>-ref.png|-test.png|-diff.png
 * EXIT    0 PASS · 1 PASS WITH ISSUES or FAIL · 2 unusable input (a bad spec, the browser did not start).
 */
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import http from "node:http";
import { extname, join, resolve } from "node:path";
import { flagValue, load, rejectUnknownFlags } from "./lib.mjs";

const playwright = await load("playwright");
const chromium = playwright.chromium ?? playwright.default?.chromium;
const pixelmatchModule = await load("pixelmatch");
const pixelmatch = pixelmatchModule.default ?? pixelmatchModule;
const pngjs = await load("pngjs");
const PNG = pngjs.PNG ?? pngjs.default.PNG;

/** The catalog's tolerances: [pass up to, P3 up to]; above the second is P2. Lengths in CSS px, colours in ΔE2000. */
export const THRESHOLDS = {
  box: [1, 2], spacing: [1, 2], radius: [1, 2], shadow: [1, 2],
  fontSize: [0.5, 2], lineHeight: [0.5, 2], letterSpacing: [0.1, 0.1],
  borderWidth: [0.35, 0.35], colorDeltaE: [1, 3], opacity: [0.05, 0.05],
  pixelPct: [1, 3], // AC-PIX: ≤ 1 % pass, ≤ 3 % review (P3), above it P2
};

const argv = process.argv.slice(2);
const VALUED = ["--spec", "--out", "--executable", "--storage-state"];
rejectUnknownFlags(argv, VALUED, VALUED, 2);
const specFile = flagValue(argv, "--spec");
const out = flagValue(argv, "--out");
if (!specFile || !out) {
  console.error("usage: node design.mjs --spec <design.json> --out <dir> [--executable <path>] [--storage-state <file>]");
  process.exit(2);
}
let spec;
try { spec = JSON.parse(readFileSync(specFile, "utf8")); } catch (e) { console.error(`✗ ${specFile}: ${e.message}`); process.exit(2); }
if (!spec.ref?.baseUrl || !spec.test?.baseUrl || !Array.isArray(spec.components) || !spec.components.length) {
  console.error("✗ the spec needs ref.baseUrl, test.baseUrl and a non-empty components[]");
  process.exit(2);
}
const [vw, vh] = String(spec.viewport ?? "1280x800").split("x").map(Number);

// ---------------------------------------------------------------------------------------------------- colour maths

/** #rgb[a] / #rrggbb[aa] / rgb() / rgba() / color(srgb …) → [r,g,b,a] in 0..255 / 0..1, or null for anything else
 *  (then compared as text). Hex matters: theme tokens are declared that way, computed colours come back as rgb(). */
export function parseColor(s) {
  const h = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(String(s ?? "").trim());
  if (h) {
    const x = h[1].length <= 4 ? h[1].split("").map((c) => c + c).join("") : h[1];
    return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)).concat(x.length === 8 ? parseInt(x.slice(6, 8), 16) / 255 : 1);
  }
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(s ?? "");
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : m[4].endsWith("%") ? Number(m[4].slice(0, -1)) / 100 : Number(m[4])];
  const c = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)$/.exec(s ?? "");
  if (c) return [Number(c[1]) * 255, Number(c[2]) * 255, Number(c[3]) * 255, c[4] === undefined ? 1 : Number(c[4])];
  return null;
}

function toLab([r, g, b]) {
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** CIEDE2000 between two sRGB colours. */
export function deltaE2000(c1, c2) {
  const [L1, a1, b1] = toLab(c1), [L2, a2, b2] = toLab(c2);
  const rad = Math.PI / 180, deg = 180 / Math.PI;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = a1 * (1 + G), a2p = a2 * (1 + G);
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h = (b, a) => { const v = Math.atan2(b, a) * deg; return v < 0 ? v + 360 : v; };
  const h1p = C1p === 0 ? 0 : h(b1, a1p), h2p = C2p === 0 ? 0 : h(b2, a2p);
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) { dhp = h2p - h1p; if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360; }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lmp = (L1 + L2) / 2, Cmp = (C1p + C2p) / 2;
  let hmp = h1p + h2p;
  if (C1p * C2p !== 0) hmp = Math.abs(h1p - h2p) <= 180 ? (h1p + h2p) / 2 : h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  const T = 1 - 0.17 * Math.cos((hmp - 30) * rad) + 0.24 * Math.cos(2 * hmp * rad) + 0.32 * Math.cos((3 * hmp + 6) * rad) - 0.2 * Math.cos((4 * hmp - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hmp - 275) / 25) ** 2));
  const RC = 2 * Math.sqrt(Cmp ** 7 / (Cmp ** 7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lmp - 50) ** 2) / Math.sqrt(20 + (Lmp - 50) ** 2), SC = 1 + 0.045 * Cmp, SH = 1 + 0.015 * Cmp * T;
  const RT = -Math.sin(2 * dTheta * rad) * RC;
  return Math.sqrt((dLp / SL) ** 2 + (dCp / SC) ** 2 + (dHp / SH) ** 2 + RT * (dCp / SC) * (dHp / SH));
}

// ---------------------------------------------------------------------------------------------------- capture

const STYLE_PROPS = ["width", "height", "padding-top", "padding-right", "padding-bottom", "padding-left", "row-gap", "column-gap",
  "font-family", "font-weight", "font-size", "line-height", "letter-spacing", "text-transform", "text-decoration-line",
  "color", "background-color", "opacity", "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
  "border-top-color", "border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius", "box-shadow"];

/** Theme tokens of the page: the custom properties a component's colours, radius and font resolve to. */
const THEME_SNIPPET = `(() => {
  const out = {};
  const cs = getComputedStyle(document.documentElement);
  for (const sheet of Array.from(document.styleSheets)) {
    let rules; try { rules = sheet.cssRules; } catch { continue; }
    for (const r of Array.from(rules || [])) {
      if (!r.style) continue;
      for (const p of Array.from(r.style)) if (p.startsWith('--') && /^--(color-|vc-radius|font)/.test(p)) out[p] = cs.getPropertyValue(p).trim();
    }
  }
  return out;
})()`;

function serveStatic(dir) {
  const root = resolve(dir);
  const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
    ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".woff": "font/woff" };
  return new Promise((ok) => {
    const server = http.createServer((req, res) => {
      const p = join(root, decodeURIComponent((req.url ?? "/").split("?")[0]));
      const f = existsSync(p) && statSync(p).isDirectory() ? join(p, "index.html") : p;
      if (!f.startsWith(root) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" });
      createReadStream(f).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => ok({ base: `http://127.0.0.1:${server.address().port}`, close: () => server.close() }));
  });
}

async function openSide(side) {
  if (/^https?:\/\//.test(side.baseUrl)) return { base: side.baseUrl.replace(/\/+$/, ""), close: () => {} };
  return serveStatic(side.baseUrl);
}

/** Load a target, wait for it, read its styles, anatomy and pixels. `null` when the selector matches nothing visible. */
async function capture(page, base, target, file) {
  await page.goto(base + target.path, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const handle = await page.waitForFunction((sel) => Array.from(document.querySelectorAll(sel)).find((e) => e.getClientRects().length) ?? null,
    target.selector, { timeout: 15000 }).catch(() => null);
  const el = handle?.asElement();
  if (!el) return null;
  if (target.hover) await el.hover();
  if (target.focus) { await el.focus(); await page.keyboard.press("Shift"); }
  await page.waitForTimeout(250);
  const data = await el.evaluate((node, props) => {
    const cs = getComputedStyle(node);
    const styles = Object.fromEntries(props.map((p) => [p, cs.getPropertyValue(p)]));
    const r = node.getBoundingClientRect();
    styles.width = String(r.width); styles.height = String(r.height);
    const anatomy = {};
    for (const d of node.querySelectorAll("*")) if (d.getClientRects().length && getComputedStyle(d).visibility !== "hidden") anatomy[d.tagName.toLowerCase()] = (anatomy[d.tagName.toLowerCase()] ?? 0) + 1;
    return { styles, anatomy };
  }, STYLE_PROPS);
  await el.screenshot({ path: file, animations: "disabled", caret: "hide" });
  return data;
}

// ---------------------------------------------------------------------------------------------------- compare

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const grade = (delta, [pass, p3]) => (delta <= pass + 1e-9 ? null : delta <= p3 + 1e-9 ? "P3" : "P2");
const namesOf = (theme, value) => Object.entries(theme).filter(([, v]) => v && parseColor(v) && parseColor(value)
  && deltaE2000(parseColor(v), parseColor(value)) < 0.5).map(([k]) => k);

function compare(ref, test, themes) {
  const f = [];
  const add = (severity, ac, prop, a, b, why) => severity && f.push({ severity, ac, prop, ref: a, test: b, ...(why ? { why } : {}) });
  const length = (ac, prop, tol) => { const a = num(ref.styles[prop]), b = num(test.styles[prop]); if (a !== null && b !== null) add(grade(Math.abs(a - b), tol), ac, prop, a, b); };
  length("AC-LAY", "width", THRESHOLDS.box); length("AC-LAY", "height", THRESHOLDS.box);
  for (const p of ["padding-top", "padding-right", "padding-bottom", "padding-left", "row-gap", "column-gap"]) length("AC-SPC", p, THRESHOLDS.spacing);
  for (const p of ["font-family", "font-weight", "text-transform", "text-decoration-line"])
    if (ref.styles[p] !== test.styles[p]) add("P2", "AC-TYP", p, ref.styles[p], test.styles[p]);
  length("AC-TYP", "font-size", THRESHOLDS.fontSize); length("AC-TYP", "line-height", THRESHOLDS.lineHeight);
  length("AC-TYP", "letter-spacing", THRESHOLDS.letterSpacing);
  for (const p of ["color", "background-color", "border-top-color"]) {
    const a = parseColor(ref.styles[p]), b = parseColor(test.styles[p]);
    if (!a || !b) { if (ref.styles[p] !== test.styles[p]) add("P2", p === "border-top-color" ? "AC-BRD" : "AC-CLR", p, ref.styles[p], test.styles[p]); continue; }
    if (a[3] === 0 && b[3] === 0) continue; // both transparent
    const dE = Math.round(deltaE2000(a, b) * 100) / 100;
    const sev = grade(dE, THRESHOLDS.colorDeltaE);
    if (!sev) continue;
    // `theme`: the same token names the reference value in the reference theme and the tested value in the tested one.
    const shared = namesOf(themes.ref, ref.styles[p]).filter((n) => namesOf(themes.test, test.styles[p]).includes(n));
    add(shared.length ? "theme" : sev, p === "border-top-color" ? "AC-BRD" : "AC-CLR", p, ref.styles[p], test.styles[p],
      shared.length ? `ΔE ${dE}, both ${shared[0]}` : `ΔE ${dE}`);
  }
  length("AC-CLR", "opacity", THRESHOLDS.opacity);
  for (const p of ["border-top-width", "border-right-width", "border-bottom-width", "border-left-width"]) length("AC-BRD", p, THRESHOLDS.borderWidth);
  for (const p of ["border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius"]) length("AC-BRD", p, THRESHOLDS.radius);
  const layers = (s) => (s && s !== "none" ? s.split(/,(?![^(]*\))/) : []);
  const [sa, sb] = [layers(ref.styles["box-shadow"]), layers(test.styles["box-shadow"])];
  if (sa.length !== sb.length) add("P2", "AC-ELV", "box-shadow", ref.styles["box-shadow"], test.styles["box-shadow"], "layer count differs");
  else sa.forEach((l, i) => {
    const na = (l.replace(/rgba?\([^)]*\)/, "").match(/-?[\d.]+px/g) ?? []).map(parseFloat);
    const nb = (sb[i].replace(/rgba?\([^)]*\)/, "").match(/-?[\d.]+px/g) ?? []).map(parseFloat);
    const d = Math.max(0, ...na.map((v, j) => Math.abs(v - (nb[j] ?? 0))));
    add(grade(d, THRESHOLDS.shadow), "AC-ELV", `box-shadow[${i}]`, l, sb[i]);
  });
  for (const tag of new Set([...Object.keys(ref.anatomy), ...Object.keys(test.anatomy)]))
    if ((ref.anatomy[tag] ?? 0) !== (test.anatomy[tag] ?? 0)) add("P2", "AC-CMP", `<${tag}> visible`, ref.anatomy[tag] ?? 0, test.anatomy[tag] ?? 0);
  return f;
}

function pixels(refFile, testFile, diffFile, themeDiffers) {
  if (themeDiffers) return { pct: null, note: "two theme presets — AC-PIX not judged" };
  const A = PNG.sync.read(readFileSync(refFile)), B = PNG.sync.read(readFileSync(testFile));
  if (A.width !== B.width || A.height !== B.height) return { pct: null, note: `size ${A.width}×${A.height} vs ${B.width}×${B.height} (see AC-LAY)` };
  const D = new PNG({ width: A.width, height: A.height });
  const n = pixelmatch(A.data, B.data, D.data, A.width, A.height, { threshold: 0.1 });
  writeFileSync(diffFile, PNG.sync.write(D));
  return { pct: Math.round((n / (A.width * A.height)) * 10000) / 100 };
}

// ---------------------------------------------------------------------------------------------------- run

mkdirSync(join(out, "img"), { recursive: true });
let browser;
try { browser = await chromium.launch({ executablePath: flagValue(argv, "--executable") }); }
catch (e) { console.error(`✗ browser did not start: ${e.message.split("\n")[0]}`); process.exit(2); }
const sides = { ref: await openSide(spec.ref), test: await openSide(spec.test) };
const ctxOpts = { viewport: { width: vw, height: vh }, deviceScaleFactor: 2, reducedMotion: "reduce", timezoneId: "UTC", locale: "en-US" };
const pages = {
  ref: await (await browser.newContext(ctxOpts)).newPage(),
  test: await (await browser.newContext({ ...ctxOpts, storageState: flagValue(argv, "--storage-state") })).newPage(),
};

const themes = { ref: null, test: null };
const report = { meta: { ref: spec.ref.label ?? "reference", test: spec.test.label ?? "under test", viewport: `${vw}x${vh}`, dpr: 2, thresholds: THRESHOLDS }, theme: [], components: [] };
for (const [i, c] of spec.components.entries()) {
  const files = { ref: join(out, "img", `${i + 1}-ref.png`), test: join(out, "img", `${i + 1}-test.png`), diff: join(out, "img", `${i + 1}-diff.png`) };
  const got = {};
  for (const s of ["ref", "test"]) {
    got[s] = await capture(pages[s], sides[s].base, c[s], files[s]).catch((e) => ({ error: e.message.split("\n")[0] }));
    if (!themes[s] && got[s] && !got[s].error) themes[s] = await pages[s].evaluate(THEME_SNIPPET);
  }
  const entry = { name: c.name, ref: c.ref, test: c.test, findings: [] };
  for (const s of ["ref", "test"]) if (!got[s] || got[s].error)
    entry.findings.push({ severity: "P2", ac: "AC-CMP", prop: `${s} instance`, why: got[s]?.error ?? `"${c[s].selector}" matches nothing visible on ${c[s].path}` });
  if (!entry.findings.length) {
    const themeDiffers = JSON.stringify(themes.ref) !== JSON.stringify(themes.test);
    entry.findings = compare(got.ref, got.test, { ref: themes.ref ?? {}, test: themes.test ?? {} });
    entry.pixels = pixels(files.ref, files.test, files.diff, themeDiffers);
    if (entry.pixels.pct !== null) {
      const sev = grade(entry.pixels.pct, THRESHOLDS.pixelPct);
      if (sev) entry.findings.push({ severity: sev, ac: "AC-PIX", prop: "mismatch %", ref: 0, test: entry.pixels.pct });
    }
    entry.shots = { ref: files.ref, test: files.test, diff: entry.pixels.pct !== null ? files.diff : null };
  }
  report.components.push(entry);
}
for (const k of new Set([...Object.keys(themes.ref ?? {}), ...Object.keys(themes.test ?? {})]))
  if ((themes.ref ?? {})[k] !== (themes.test ?? {})[k]) report.theme.push({ token: k, ref: themes.ref?.[k] ?? null, test: themes.test?.[k] ?? null });
await browser.close();
sides.ref.close(); sides.test.close();

const all = report.components.flatMap((c) => c.findings);
const count = (s) => all.filter((x) => x.severity === s).length;
report.counts = { P1: count("P1"), P2: count("P2"), P3: count("P3"), theme: count("theme") };
report.verdict = report.counts.P1 ? "FAIL" : report.counts.P2 ? "PASS WITH ISSUES" : "PASS";
writeFileSync(join(out, "design-report.json"), JSON.stringify(report, null, 2));

const md = [`# Design review — ${report.meta.test} vs ${report.meta.ref}`, "",
  `**${report.verdict}** · P1 ${report.counts.P1} · P2 ${report.counts.P2} · P3 ${report.counts.P3} · theme ${report.counts.theme} · ${report.meta.viewport} @2x`, ""];
if (report.theme.length) md.push("## Theme baseline (AC-THM — confirm the preset is intended)", "", "| Token | Reference | Under test |", "|---|---|---|",
  ...report.theme.slice(0, 40).map((t) => `| \`${t.token}\` | ${t.ref ?? "—"} | ${t.test ?? "—"} |`), "");
for (const c of report.components) {
  md.push(`## ${c.name}`, "", `Pixels: ${c.pixels?.pct ?? "—"}%${c.pixels?.note ? ` (${c.pixels.note})` : ""}${c.shots?.diff ? ` · diff ${c.shots.diff}` : ""}`, "");
  if (!c.findings.length) { md.push("No difference beyond tolerance.", ""); continue; }
  md.push("| Severity | AC | Property | Reference | Under test | Note |", "|---|---|---|---|---|---|",
    ...c.findings.map((x) => `| ${x.severity} | ${x.ac} | ${x.prop} | ${x.ref ?? ""} | ${x.test ?? ""} | ${x.why ?? ""} |`), "");
}
writeFileSync(join(out, "design-report.md"), md.join("\n"));
console.log(`visual:design  ${report.verdict} · P1 ${report.counts.P1} · P2 ${report.counts.P2} · P3 ${report.counts.P3} · theme ${report.counts.theme} · ${report.components.length} component(s)`);
for (const c of report.components) for (const x of c.findings.filter((y) => y.severity !== "theme").slice(0, 6))
  console.log(`  ${x.severity} ${x.ac} ${c.name} · ${x.prop}: ${x.ref ?? ""} → ${x.test ?? ""}${x.why ? ` (${x.why})` : ""}`);
console.log(`  report: ${join(out, "design-report.md")}`);
process.exit(report.verdict === "PASS" ? 0 : 1);
