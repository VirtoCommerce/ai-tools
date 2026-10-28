#!/usr/bin/env node
/**
 * visual:design — does a component under review match its reference? (the DESIGN instrument, vc-test skills/qa-design/visual-axis.md §2a)
 *
 * PIXEL compares a build with the build before it. This compares the SAME component in two places at once:
 *   reference   Storybook (an existing component: same code base as prod) or a design-system build
 *   under test  prod / QA / a fork's preview / another Storybook (a customer theme)
 * and sorts every difference into an acceptance criterion with a severity. The criteria, their tolerances and the
 * source model come from the `design-review` skill's catalog v1.0 (Virto Design System); the measuring is ours,
 * headless, so it runs in a pipeline instead of a person's browser tab.
 *
 * What it checks per component (THRESHOLDS below is the one place the numbers live):
 *   AC-CMP  anatomy — the count of visible descendants per tag; an element missing or extra. A selector that matches
 *           several visible elements is compared on the first (or on `nth`) and says how many it matched (`info`)
 *   AC-LAY  box width / height
 *   AC-SPC  padding, gap (`normal` is 0)
 *   AC-TYP  font family and weight exactly; size / line-height / letter-spacing within tolerance; transform, decoration.
 *           A value that is not a length on one side only (`line-height: normal` vs `24px`) is P2
 *   AC-CLR  text and background colour, CIEDE2000 ΔE of the colour as shown — composited over white and over black,
 *           the larger counts, so a transparent background against a solid one is a difference; opacity
 *   AC-BRD  border width, colour (ΔE), radius
 *   AC-ELV  box-shadow: layer count, offsets / blur / spread
 *   AC-PIX  the element's own pixels (pixelmatch, threshold 0.1) — not judged across two theme presets (a token both
 *           pages define has a different value)
 *   AC-THM  the theme tokens (--color-*, --vc-radius*, --font*) of both pages. A colour, a font family or a corner radius
 *           that the SAME token names on both sides is `theme`, not a defect of the component; so is a box size that
 *           differs only because the font is a theme font
 * Not here, because another probe owns them: AC-A11Y (axe, contrast — qa-accessibility, measure-layout.ts),
 * AC-RSP / AC-CNT (layout-runner PROBE), AC-TOK (tokens:check). AC-STA: give each state its own component entry
 * (a story with the state's args, or a target with `hover` / `focus`).
 *
 * Severity (the catalog's): P1 blocker · P2 a visible difference · P3 within 2 px / ΔE ≤ 3 · theme · info.
 * Verdict: a P1 ⇒ FAIL; a P2 ⇒ PASS WITH ISSUES; else PASS. A component not found on one side is P2 and named.
 * INCONCLUSIVE instead, whatever else was found: a page answered HTTP ≥ 400 or did not load, or one side matched
 * nothing at all (a wrong baseUrl, a Storybook still warming up, every selector stale) — that run judged nothing.
 *
 * Both sides must show the SAME content: a different label or an icon-only twin of a text button is a width, an
 * anatomy and a pixel difference that says nothing about the design. Point both targets at instances with the same
 * text and variant (`nth` picks one of several visible matches, 0-based).
 *
 * USAGE
 *   node design.mjs --spec <design.json> --out <dir> [--executable <chromium>] [--storage-state <file>]
 *   design.json:
 *     { "viewport": "1280x800",
 *       "ref":  { "label": "storybook", "baseUrl": "https://…" },
 *       "test": { "label": "prod",      "baseUrl": "https://…" },
 *       "components": [ { "name": "VcButton · solid primary md",
 *                         "ref":  { "path": "/iframe.html?id=components-molecules-vcbutton--basic&viewMode=story", "selector": ".vc-button" },
 *                         "test": { "path": "/cart", "selector": ".vc-button--solid--primary", "nth"?: 0, "hover"?: true, "focus"?: true } } ] }
 *   Either side's baseUrl may be a local `storybook build` dir: it is served on 127.0.0.1.
 *
 * OUTPUT  <out>/design-report.json, <out>/design-report.md, <out>/img/<n>-ref.png|-test.png|-diff.png
 * EXIT    0 PASS · 1 PASS WITH ISSUES or FAIL · 2 INCONCLUSIVE or unusable input (a bad spec, a missing build dir,
 *         the browser did not start, any error during the run).
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
const badTarget = (t) => typeof t?.path !== "string" || typeof t?.selector !== "string"
  || (t.nth !== undefined && !(Number.isInteger(t.nth) && t.nth >= 0));
const bad = spec.components.findIndex((c) => badTarget(c?.ref) || badTarget(c?.test));
if (bad >= 0) { console.error(`✗ components[${bad}]: ref and test each need a path and a selector (and an "nth" ≥ 0, if any)`); process.exit(2); }
for (const s of ["ref", "test"]) {
  const b = spec[s].baseUrl;
  if (!/^https?:\/\//.test(b) && !(existsSync(b) && statSync(b).isDirectory())) { console.error(`✗ ${s}.baseUrl: "${b}" is neither a URL nor a build directory`); process.exit(2); }
}
if (!/^\d+x\d+$/.test(String(spec.viewport ?? "1280x800"))) { console.error(`✗ viewport "${spec.viewport}": expected <width>x<height>`); process.exit(2); }
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

/** ΔE2000 of two [r,g,b,a] colours as they show: each composited over white and over black, the larger counts. A
 *  colour against its transparent twin is then a difference; two equally translucent colours compare as solids. */
export function deltaEShown(a, b) {
  const over = (c, bg) => [0, 1, 2].map((i) => c[i] * c[3] + bg * (1 - c[3]));
  return Math.max(deltaE2000(over(a, 255), over(b, 255)), deltaE2000(over(a, 0), over(b, 0)));
}

// ---------------------------------------------------------------------------------------------------- capture

const STYLE_PROPS = ["width", "height", "padding-top", "padding-right", "padding-bottom", "padding-left", "row-gap", "column-gap",
  "font-family", "font-weight", "font-size", "line-height", "letter-spacing", "text-transform", "text-decoration-line",
  "color", "background-color", "opacity", "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
  "border-top-color", "border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius", "box-shadow"];

/** Theme tokens of the page — the custom properties a component's colours, radius and font resolve to — and the root
 *  font size, which turns a `rem` token into the px a computed style reports. */
const THEME_SNIPPET = `(() => {
  const tokens = {};
  const cs = getComputedStyle(document.documentElement);
  for (const sheet of Array.from(document.styleSheets)) {
    let rules; try { rules = sheet.cssRules; } catch { continue; }
    for (const r of Array.from(rules || [])) {
      if (!r.style) continue;
      for (const p of Array.from(r.style)) if (p.startsWith('--') && /^--(color-|vc-radius|font)/.test(p)) tokens[p] = cs.getPropertyValue(p).trim();
    }
  }
  return { tokens, rootPx: parseFloat(cs.fontSize) || 16 };
})()`;

function serveStatic(dir) {
  const root = resolve(dir);
  const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
    ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".woff": "font/woff" };
  return new Promise((ok) => {
    const server = http.createServer((req, res) => {
      let rel;
      try { rel = decodeURIComponent((req.url ?? "/").split("?")[0]); } catch { res.writeHead(400); res.end(); return; }
      const p = join(root, rel);
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

/** Load a target, wait for it, read its styles, anatomy and pixels. `null` when the selector matches nothing visible
 *  (at `nth`); throws when the page itself did not load — the run is then INCONCLUSIVE, not a finding. */
async function capture(page, base, target, file) {
  await page.mouse.move(0, 0);
  const res = await page.goto(base + target.path, { waitUntil: "networkidle" });
  if (res && res.status() >= 400) throw new Error(`HTTP ${res.status()} on ${base + target.path}`);
  await page.evaluate(() => document.fonts.ready);
  const handle = await page.waitForFunction(([sel, nth]) => Array.from(document.querySelectorAll(sel)).filter((e) => e.getClientRects().length)[nth] ?? null,
    [target.selector, target.nth ?? 0], { timeout: 15000 }).catch(() => null);
  const el = handle?.asElement();
  if (!el) return null;
  const matches = await page.evaluate((sel) => Array.from(document.querySelectorAll(sel)).filter((e) => e.getClientRects().length).length, target.selector);
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
  return { ...data, matches };
}

// ---------------------------------------------------------------------------------------------------- compare

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const grade = (delta, [pass, p3]) => (delta <= pass + 1e-9 ? null : delta <= p3 + 1e-9 ? "P3" : "P2");
/** A token or computed length in px: `8px`, `.5rem`, `0`. `rem` / `em` use the page's root font size. */
const px = (v, rootPx) => { const m = /^(-?[\d.]+)(px|rem|em)?$/.exec(String(v ?? "").trim()); return m ? Number(m[1]) * (m[2] === "rem" || m[2] === "em" ? rootPx : 1) : null; };
const fontKey = (v) => String(v ?? "").replace(/["']/g, "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).join(",");
/** Do two values mean the same thing? Colours by ΔE as shown, lengths in px, anything else (a font stack) as text. */
function sameValue(a, b, rootA, rootB) {
  const ca = parseColor(a), cb = parseColor(b);
  if (ca && cb) return deltaEShown(ca, cb) < 0.5;
  const la = px(a, rootA), lb = px(b, rootB);
  if (la !== null && lb !== null) return Math.abs(la - lb) < 0.5;
  return fontKey(a) === fontKey(b);
}
/** The tokens under `prefix` whose value is `value` on that page. */
const namesOf = (theme, value, prefix) => Object.entries(theme.tokens)
  .filter(([k, v]) => k.startsWith(prefix) && v && sameValue(v, value, theme.rootPx, theme.rootPx)).map(([k]) => k);
/** `theme`: one token names the reference value on the reference page and the tested value on the tested one. */
const sharedToken = (themes, prefix, a, b) => namesOf(themes.ref, a, prefix).find((n) => namesOf(themes.test, b, prefix).includes(n));

/** AC-THM: the tokens BOTH pages define whose values differ — the preset difference. A token only one page defines
 *  (a storefront-only `--color-header-*`) says nothing about the preset; `0.5rem` and `.5rem` are one value. */
function themeDiff(ref, test) {
  return Object.keys(ref.tokens).filter((k) => ref.tokens[k] && test.tokens[k] && !sameValue(ref.tokens[k], test.tokens[k], ref.rootPx, test.rootPx))
    .map((k) => ({ token: k, ref: ref.tokens[k], test: test.tokens[k] }));
}

const NORMAL_IS_ZERO = new Set(["row-gap", "column-gap", "letter-spacing"]);

function compare(ref, test, themes) {
  const f = [];
  const add = (severity, ac, prop, a, b, why) => severity && f.push({ severity, ac, prop, ref: a, test: b, ...(why ? { why } : {}) });
  /** `themeWhy(refValue, testValue)` names the token that explains a difference beyond tolerance, or nothing. */
  const length = (ac, prop, tol, themeWhy) => {
    const ra = ref.styles[prop], rb = test.styles[prop];
    const val = (v) => (v === "normal" && NORMAL_IS_ZERO.has(prop) ? 0 : num(v));
    const a = val(ra), b = val(rb);
    if (a === null || b === null) { if (ra !== rb) add("P2", ac, prop, ra, rb, "not comparable as a length"); return; }
    const sev = grade(Math.abs(a - b), tol);
    const why = sev && themeWhy?.(ra, rb);
    add(why ? "theme" : sev, ac, prop, a, b, why || undefined);
  };
  // The font first: a theme font explains the box it grows.
  let themeFont = false;
  if (fontKey(ref.styles["font-family"]) !== fontKey(test.styles["font-family"])) {
    const n = sharedToken(themes, "--font", ref.styles["font-family"], test.styles["font-family"]);
    themeFont = !!n;
    add(n ? "theme" : "P2", "AC-TYP", "font-family", ref.styles["font-family"], test.styles["font-family"], n ? `both ${n}` : undefined);
  }
  const byFont = () => (themeFont ? "follows the theme font" : null);
  length("AC-LAY", "width", THRESHOLDS.box, byFont); length("AC-LAY", "height", THRESHOLDS.box, byFont);
  for (const p of ["padding-top", "padding-right", "padding-bottom", "padding-left", "row-gap", "column-gap"]) length("AC-SPC", p, THRESHOLDS.spacing);
  for (const p of ["font-weight", "text-transform", "text-decoration-line"])
    if (ref.styles[p] !== test.styles[p]) add("P2", "AC-TYP", p, ref.styles[p], test.styles[p]);
  length("AC-TYP", "font-size", THRESHOLDS.fontSize); length("AC-TYP", "line-height", THRESHOLDS.lineHeight);
  length("AC-TYP", "letter-spacing", THRESHOLDS.letterSpacing);
  for (const p of ["color", "background-color", "border-top-color"]) {
    const a = parseColor(ref.styles[p]), b = parseColor(test.styles[p]);
    if (!a || !b) { if (ref.styles[p] !== test.styles[p]) add("P2", p === "border-top-color" ? "AC-BRD" : "AC-CLR", p, ref.styles[p], test.styles[p]); continue; }
    if (a[3] === 0 && b[3] === 0) continue; // both transparent
    const dE = Math.round(deltaEShown(a, b) * 100) / 100;
    const sev = grade(dE, THRESHOLDS.colorDeltaE);
    if (!sev) continue;
    const n = sharedToken(themes, "--color-", ref.styles[p], test.styles[p]);
    add(n ? "theme" : sev, p === "border-top-color" ? "AC-BRD" : "AC-CLR", p, ref.styles[p], test.styles[p], n ? `ΔE ${dE}, both ${n}` : `ΔE ${dE}`);
  }
  length("AC-CLR", "opacity", THRESHOLDS.opacity);
  for (const p of ["border-top-width", "border-right-width", "border-bottom-width", "border-left-width"]) length("AC-BRD", p, THRESHOLDS.borderWidth);
  const byRadius = (a, b) => { const n = sharedToken(themes, "--vc-radius", a, b); return n ? `both ${n}` : null; };
  for (const p of ["border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius"]) length("AC-BRD", p, THRESHOLDS.radius, byRadius);
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
const sides = {};
let exitCode = 2;
try {
  sides.ref = await openSide(spec.ref); sides.test = await openSide(spec.test);
  const ctxOpts = { viewport: { width: vw, height: vh }, deviceScaleFactor: 2, reducedMotion: "reduce", timezoneId: "UTC", locale: "en-US" };
  const pages = {
    ref: await (await browser.newContext(ctxOpts)).newPage(),
    test: await (await browser.newContext({ ...ctxOpts, storageState: flagValue(argv, "--storage-state") })).newPage(),
  };

  const themes = { ref: null, test: null };
  let preset = null; // themeDiff(ref, test), once both pages' tokens are read
  const report = { meta: { ref: spec.ref.label ?? "reference", test: spec.test.label ?? "under test", viewport: `${vw}x${vh}`, dpr: 2, thresholds: THRESHOLDS }, theme: [], inconclusive: [], components: [] };
  for (const [i, c] of spec.components.entries()) {
    const files = { ref: join(out, "img", `${i + 1}-ref.png`), test: join(out, "img", `${i + 1}-test.png`), diff: join(out, "img", `${i + 1}-diff.png`) };
    const got = {};
    for (const s of ["ref", "test"]) {
      got[s] = await capture(pages[s], sides[s].base, c[s], files[s]).catch((e) => ({ error: e.message.split("\n")[0] }));
      if (!themes[s] && got[s] && !got[s].error) themes[s] = await pages[s].evaluate(THEME_SNIPPET);
    }
    if (!preset && themes.ref && themes.test) preset = themeDiff(themes.ref, themes.test);
    const entry = { name: c.name, ref: c.ref, test: c.test, found: { ref: !!got.ref && !got.ref.error, test: !!got.test && !got.test.error }, findings: [] };
    for (const s of ["ref", "test"]) {
      if (got[s]?.error) report.inconclusive.push(`${c.name} · ${s}: ${got[s].error}`);
      else if (!got[s]) entry.findings.push({ severity: "P2", ac: "AC-CMP", prop: `${s} instance`, why: `"${c[s].selector}" matches nothing visible on ${c[s].path}` });
    }
    if (entry.found.ref && entry.found.test) {
      entry.matches = { ref: got.ref.matches, test: got.test.matches };
      entry.findings = compare(got.ref, got.test, themes);
      entry.pixels = pixels(files.ref, files.test, files.diff, preset.length > 0);
      if (entry.pixels.pct !== null) {
        const sev = grade(entry.pixels.pct, THRESHOLDS.pixelPct);
        if (sev) entry.findings.push({ severity: sev, ac: "AC-PIX", prop: "mismatch %", ref: 0, test: entry.pixels.pct });
      }
      entry.shots = { ref: files.ref, test: files.test, diff: entry.pixels.pct !== null ? files.diff : null };
      for (const s of ["ref", "test"]) if (got[s].matches > 1 && c[s].nth === undefined)
        entry.findings.push({ severity: "info", ac: "AC-CMP", prop: `${s} instance`,
          why: `"${c[s].selector}" matches ${got[s].matches} visible elements; the first was compared — set "nth" to the one with the same content` });
    }
    report.components.push(entry);
  }
  report.theme = preset ?? [];
  for (const s of ["ref", "test"]) if (!report.components.some((c) => c.found[s]))
    report.inconclusive.push(`nothing matched on the ${s} side — a wrong baseUrl, a page that did not render, or every selector stale`);

  const all = report.components.flatMap((c) => c.findings);
  const count = (s) => all.filter((x) => x.severity === s).length;
  report.counts = { P1: count("P1"), P2: count("P2"), P3: count("P3"), theme: count("theme"), info: count("info") };
  report.verdict = report.inconclusive.length ? "INCONCLUSIVE" : report.counts.P1 ? "FAIL" : report.counts.P2 ? "PASS WITH ISSUES" : "PASS";
  writeFileSync(join(out, "design-report.json"), JSON.stringify(report, null, 2));

  const md = [`# Design review — ${report.meta.test} vs ${report.meta.ref}`, "",
    `**${report.verdict}** · P1 ${report.counts.P1} · P2 ${report.counts.P2} · P3 ${report.counts.P3} · theme ${report.counts.theme} · ${report.meta.viewport} @2x`, ""];
  if (report.inconclusive.length) md.push("## Inconclusive — this run could not judge", "", ...report.inconclusive.map((x) => `- ${x}`), "");
  if (report.theme.length) md.push("## Theme baseline (AC-THM — confirm the preset is intended)", "", "| Token | Reference | Under test |", "|---|---|---|",
    ...report.theme.slice(0, 40).map((t) => `| \`${t.token}\` | ${t.ref} | ${t.test} |`), "");
  for (const c of report.components) {
    md.push(`## ${c.name}`, "", `Pixels: ${c.pixels?.pct ?? "—"}%${c.pixels?.note ? ` (${c.pixels.note})` : ""}${c.shots?.diff ? ` · diff ${c.shots.diff}` : ""}`, "");
    if (!c.findings.length) { md.push("No difference beyond tolerance.", ""); continue; }
    md.push("| Severity | AC | Property | Reference | Under test | Note |", "|---|---|---|---|---|---|",
      ...c.findings.map((x) => `| ${x.severity} | ${x.ac} | ${x.prop} | ${x.ref ?? ""} | ${x.test ?? ""} | ${x.why ?? ""} |`), "");
  }
  writeFileSync(join(out, "design-report.md"), md.join("\n"));
  console.log(`visual:design  ${report.verdict} · P1 ${report.counts.P1} · P2 ${report.counts.P2} · P3 ${report.counts.P3} · theme ${report.counts.theme} · ${report.components.length} component(s)`);
  for (const x of report.inconclusive) console.log(`  ✗ ${x}`);
  for (const c of report.components) for (const x of c.findings.filter((y) => y.severity !== "theme").slice(0, 6))
    console.log(`  ${x.severity} ${x.ac} ${c.name} · ${x.prop}: ${x.ref ?? ""} → ${x.test ?? ""}${x.why ? ` (${x.why})` : ""}`);
  console.log(`  report: ${join(out, "design-report.md")}`);
  exitCode = { PASS: 0, INCONCLUSIVE: 2 }[report.verdict] ?? 1;
} catch (e) {
  console.error(`✗ ${e.message.split("\n")[0]}`);
} finally {
  await browser.close().catch(() => {});
  sides.ref?.close(); sides.test?.close();
}
process.exit(exitCode);
