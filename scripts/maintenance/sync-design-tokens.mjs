#!/usr/bin/env node
/**
 * Derive the design-system tokens our layout audits measure against, straight from
 * the vc-frontend source — instead of hand-transcribing them into measure-layout.ts.
 *
 * WHY THIS EXISTS
 * ---------------
 * `scripts/lib/measure-layout.ts` used to hardcode a 14-value spacing grid
 * `{0,4,8,…,96}`. vc-frontend's real scale is Tailwind's default (incl. the half-steps
 * 2/6/10/14 px) plus `theme.extend.spacing`. The mismatch made the BL-UI-002 audit a
 * false-positive machine: the UI kit's own `vc-button.vue` uses 10 px and 14 px padding,
 * so the canonical button "violated" our grid. Run REG-2026-07-24-2121 reported ~7 bogus
 * off-grid FAILs and concluded there was a "site-wide design-token issue" — there wasn't.
 *
 * Any hand-maintained copy of these numbers goes stale at the NEXT redesign. So we
 * generate them, commit the generated file, and drift-guard it in CI.
 *
 * GOLDEN RULE: nothing here is hardcoded. Every number is READ from a source of truth.
 * Even Tailwind's own default spacing scale is pulled from the exact tailwindcss version
 * vc-frontend pins — not transcribed into this file — so a Tailwind major bump that
 * reshapes the scale is picked up by `tokens:check` instead of silently rotting.
 *
 * SOURCES (single source of truth = the vc-frontend repo + the version it pins)
 *   package.json                              → tailwindcss version   (which scale applies)
 *   tailwindcss@<pinned>/stubs/config.full.js → theme.spacing         (default scale)
 *   tailwind.config.ts                        → theme.extend.spacing  (project additions)
 *   client-app/ui-kit/constants/tailwind.ts   → BREAKPOINTS           (real viewports)
 *   client-app/ui-kit/components/molecules/button/vc-button.vue
 *                                             → --size scale          (control-size reality)
 *
 * USAGE
 *   npm run tokens:sync     # fetch + rewrite scripts/lib/design-tokens.generated.ts
 *   npm run tokens:check    # verify the committed file still matches upstream (CI gate)
 *
 *   --from <dir>   read from a local vc-frontend checkout instead of GitHub
 *   --ref <ref>    git ref to read from GitHub (default: dev)
 *
 * EXIT CODES
 *   0  in sync (check) / written (sync)
 *   1  drift detected (check) — run `npm run tokens:sync` and review the diff
 *   2  could not reach a source (network/checkout) — advisory, never silently "passes"
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const OUT_FILE = join(REPO_ROOT, "scripts", "lib", "design-tokens.generated.ts");

const REPO = "VirtoCommerce/vc-frontend";
const FILES = {
  packageJson: "package.json",
  tailwindConfig: "tailwind.config.ts",
  breakpoints: "client-app/ui-kit/constants/tailwind.ts",
  button: "client-app/ui-kit/components/molecules/button/vc-button.vue",
};

/** Where the pinned Tailwind version's own default theme lives (unpkg serves any published version). */
const tailwindDefaultThemeUrl = (version) => `https://unpkg.com/tailwindcss@${version}/stubs/config.full.js`;

const args = process.argv.slice(2);
const MODE = args.includes("--check") ? "check" : "sync";
const REF = argValue("--ref") ?? "dev";
const FROM = argValue("--from");

function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : undefined;
}

// ---------------------------------------------------------------------------
// Source loading
// ---------------------------------------------------------------------------

async function loadSource(relPath) {
  if (FROM) {
    const p = join(resolve(FROM), relPath);
    if (!existsSync(p)) throw new Error(`not found in --from checkout: ${p}`);
    return readFileSync(p, "utf8");
  }
  const url = `https://raw.githubusercontent.com/${REPO}/${REF}/${relPath}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.text();
}

// ---------------------------------------------------------------------------
// Parsing — narrow, targeted extraction (these blocks are stable, hand-authored config)
// ---------------------------------------------------------------------------

const remToPx = (rem) => Math.round(parseFloat(rem) * 16 * 1000) / 1000;

/** Convert a Tailwind spacing value ("1.125rem" | "18px" | "0") to px. */
function toPx(value) {
  const v = String(value).trim();
  if (v.endsWith("rem")) return remToPx(v);
  if (v.endsWith("px")) return parseFloat(v);
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
}

/** Read the tailwindcss version vc-frontend pins, normalised to an exact published version. */
function parseTailwindVersion(pkgJsonSrc) {
  const pkg = JSON.parse(pkgJsonSrc);
  const raw = pkg.devDependencies?.tailwindcss ?? pkg.dependencies?.tailwindcss;
  if (!raw) throw new Error("vc-frontend package.json declares no tailwindcss dependency");
  // "^3.4.19" | "~3.4.19" | "3.4.19" → 3.4.19. Pin exactly so the generated file is reproducible;
  // a version bump in vc-frontend changes this string and `tokens:check` flags the drift.
  const m = raw.match(/(\d+\.\d+\.\d+)/);
  if (!m) throw new Error(`cannot resolve an exact tailwindcss version from "${raw}"`);
  return { exact: m[1], declared: raw };
}

/**
 * Extract Tailwind's DEFAULT `theme.spacing` from that version's own `stubs/config.full.js`.
 * Identified by the block containing `px: '1px'` so we never grab a same-named nested key.
 */
function parseTailwindDefaultSpacing(src) {
  const re = /spacing:\s*\{([\s\S]*?)\n\s*\}/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const body = m[1];
    if (!/\bpx:\s*['"]1px['"]/.test(body)) continue;
    const out = [];
    for (const line of body.split("\n")) {
      const mm = line.match(/^\s*["']?([\w.-]+)["']?\s*:\s*["']([^"']+)["']/);
      if (!mm) continue;
      const px = toPx(mm[2]);
      if (px != null) out.push({ key: mm[1], px });
    }
    if (out.length) return out;
  }
  throw new Error("could not locate Tailwind's default theme.spacing block");
}

/** Extract `spacing: { ... }` from inside the `extend:` block of tailwind.config.ts. */
function parseExtendSpacing(src) {
  const extendIdx = src.indexOf("extend:");
  if (extendIdx < 0) throw new Error("no `extend:` block in tailwind.config.ts");
  const after = src.slice(extendIdx);
  const m = after.match(/\bspacing:\s*\{([\s\S]*?)\}/);
  if (!m) return [];
  const out = [];
  for (const line of m[1].split("\n")) {
    // e.g.  4.5: "1.125rem", //18px      |      17: "4.25rem",
    const mm = line.match(/^\s*["']?([\w.-]+)["']?\s*:\s*["']([^"']+)["']/);
    if (!mm) continue;
    const px = toPx(mm[2]);
    if (px != null) out.push({ key: mm[1], px });
  }
  return out;
}

/** Extract the BREAKPOINTS map from the ui-kit constants. */
function parseBreakpoints(src) {
  const m = src.match(/BREAKPOINTS\s*=\s*\{([\s\S]*?)\}/);
  if (!m) throw new Error("no BREAKPOINTS in ui-kit constants");
  const out = [];
  for (const line of m[1].split("\n")) {
    const mm = line.match(/^\s*["']?([\w"'-]+?)["']?\s*:\s*["']([\d.]+)px["']/);
    if (!mm) continue;
    out.push({ name: mm[1].replace(/["']/g, ""), px: parseFloat(mm[2]) });
  }
  if (!out.length) throw new Error("BREAKPOINTS parsed empty");
  return out;
}

/** Extract the `--size:` scale from vc-button.vue's `&--size` variants. */
function parseButtonSizes(src) {
  const out = [];
  // &--xxs { --size: 1.625rem; ... }
  const re = /&--([a-z0-9]+)\s*\{\s*--size:\s*([\d.]+rem|[\d.]+px)\s*;/g;
  let m;
  while ((m = re.exec(src)) !== null) out.push({ name: m[1], px: toPx(m[2]) });
  return out;
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

function render({ defaultSpacing, extendSpacing, breakpoints, buttonSizes, tailwind, ref, sourcedFrom }) {
  const lines = [];
  const p = (s = "") => lines.push(s);

  p("/**");
  p(" * AUTO-GENERATED — DO NOT EDIT BY HAND.");
  p(" *");
  p(" * Design tokens derived from the vc-frontend source so our layout audits measure");
  p(" * against the REAL design system instead of a hand-transcribed copy that goes stale");
  p(" * at the next redesign.");
  p(" *");
  p(` * Source:      ${sourcedFrom}`);
  p(` * Ref:         ${ref}`);
  p(` * Tailwind:    ${tailwind.exact} (vc-frontend declares "${tailwind.declared}")`);
  p(" * Regenerate:  npm run tokens:sync");
  p(" * Drift-guard: npm run tokens:check   (CI gate)");
  p(" */");
  p();

  p("/** Tailwind's default `theme.spacing`, read from the pinned tailwindcss version. */");
  p("export const TAILWIND_DEFAULT_SPACING_PX: readonly number[] = [");
  p(`  ${defaultSpacing.map((s) => s.px).join(", ")},`);
  p("] as const;");
  p();

  p("/** `theme.extend.spacing` from vc-frontend's tailwind.config.ts, in px. */");
  p("export const EXTEND_SPACING_PX: readonly number[] = [");
  p(`  ${extendSpacing.map((s) => s.px).join(", ")},`);
  p(`] as const; // keys: ${extendSpacing.map((s) => s.key).join(", ")}`);
  p();

  const grid = [...new Set([...defaultSpacing.map((s) => s.px), ...extendSpacing.map((s) => s.px)])].sort(
    (a, b) => a - b,
  );
  p("/**");
  p(" * Every computed padding/margin/gap value the design system can legitimately produce");
  p(" * (default scale ∪ project additions). This IS the BL-UI-002 grid — do not narrow it.");
  p(" */");
  p("export const SPACING_GRID_PX: readonly number[] = [");
  p(`  ${grid.join(", ")},`);
  p("] as const;");
  p();

  p("/** Real responsive breakpoints from the ui-kit (NOT Tailwind defaults — 2xl is 1500, not 1536). */");
  p("export const BREAKPOINTS_PX = {");
  for (const b of breakpoints) p(`  ${/^[a-z][\w]*$/i.test(b.name) ? b.name : JSON.stringify(b.name)}: ${b.px},`);
  p("} as const;");
  p();

  p("/**");
  p(" * Control sizes the UI kit actually ships (vc-button `--size`), in px.");
  p(" * Use to sanity-check a touch-target finding: a control matching one of these is a");
  p(" * deliberate design-system size, not an accidental regression.");
  p(" */");
  p("export const UI_KIT_BUTTON_SIZES_PX = {");
  for (const b of buttonSizes) p(`  ${b.name}: ${b.px},`);
  p("} as const;");
  p();

  p("/** Viewports worth sweeping: each breakpoint edge, just below it, and the fluid midpoints. */");
  p("export const AUDIT_VIEWPORTS_PX: readonly number[] = [");
  const edges = breakpoints.map((b) => b.px);
  const sweep = new Set([375]);
  for (let i = 0; i < edges.length; i++) {
    sweep.add(edges[i] - 1);
    sweep.add(edges[i]);
    const next = edges[i + 1];
    if (next) sweep.add(Math.round((edges[i] + next) / 2));
  }
  sweep.add(edges[edges.length - 1] + 420); // above the top breakpoint
  p(`  ${[...sweep].sort((a, b) => a - b).join(", ")},`);
  p("] as const;");
  p();

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const sourcedFrom = FROM ? `local checkout ${resolve(FROM)}` : `https://github.com/${REPO}`;
  let defaultSpacing, extendSpacing, breakpoints, buttonSizes, tailwind;
  try {
    const [pkg, cfg, bp, btn] = await Promise.all([
      loadSource(FILES.packageJson),
      loadSource(FILES.tailwindConfig),
      loadSource(FILES.breakpoints),
      loadSource(FILES.button),
    ]);
    tailwind = parseTailwindVersion(pkg);

    // Tailwind's own default scale, from the exact version vc-frontend pins.
    const twUrl = tailwindDefaultThemeUrl(tailwind.exact);
    const twRes = await fetch(twUrl);
    if (!twRes.ok) throw new Error(`GET ${twUrl} → ${twRes.status}`);
    defaultSpacing = parseTailwindDefaultSpacing(await twRes.text());

    extendSpacing = parseExtendSpacing(cfg);
    breakpoints = parseBreakpoints(bp);
    buttonSizes = parseButtonSizes(btn);
  } catch (err) {
    console.error(`[tokens:${MODE}] CANNOT REACH SOURCE — ${err.message}`);
    console.error(`[tokens:${MODE}] This is advisory, not a pass. Re-run with network, or`);
    console.error(`[tokens:${MODE}] point at a local checkout: --from ../vc-frontend`);
    process.exit(2);
  }

  const next = render({ defaultSpacing, extendSpacing, breakpoints, buttonSizes, tailwind, ref: REF, sourcedFrom });

  console.log(`[tokens:${MODE}] tailwind       : ${tailwind.exact} (declared "${tailwind.declared}")`);
  console.log(`[tokens:${MODE}] default scale  : ${defaultSpacing.length} steps → ${defaultSpacing.map((s) => s.px).join(",")}`);
  console.log(`[tokens:${MODE}] extend.spacing : ${extendSpacing.map((s) => `${s.key}=${s.px}px`).join(", ") || "(none)"}`);
  console.log(`[tokens:${MODE}] breakpoints    : ${breakpoints.map((b) => `${b.name}=${b.px}`).join(", ")}`);
  console.log(`[tokens:${MODE}] button sizes   : ${buttonSizes.map((b) => `${b.name}=${b.px}`).join(", ") || "(none)"}`);

  const prev = existsSync(OUT_FILE) ? readFileSync(OUT_FILE, "utf8") : null;
  const normalize = (s) => (s ?? "").replace(/\r\n/g, "\n").replace(/^ \* Ref:.*$/gm, "").replace(/^ \* Source:.*$/gm, "");

  if (MODE === "check") {
    if (prev === null) {
      console.error(`[tokens:check] FAIL — ${OUT_FILE} missing. Run \`npm run tokens:sync\`.`);
      process.exit(1);
    }
    if (normalize(prev) !== normalize(next)) {
      console.error(`[tokens:check] FAIL — committed design tokens DRIFTED from vc-frontend@${REF}.`);
      console.error(`[tokens:check] The design system changed; our layout audits would now`);
      console.error(`[tokens:check] report false positives. Run \`npm run tokens:sync\`, review the`);
      console.error(`[tokens:check] diff, and re-check the BL-UI-002 / BL-UI-006 thresholds.`);
      process.exit(1);
    }
    console.log(`[tokens:check] OK — committed tokens match vc-frontend@${REF}.`);
    process.exit(0);
  }

  writeFileSync(OUT_FILE, next, "utf8");
  const changed = normalize(prev) !== normalize(next);
  console.log(`[tokens:sync] ${changed ? "UPDATED" : "unchanged"} → ${OUT_FILE.replace(REPO_ROOT + "\\", "").replace(REPO_ROOT + "/", "")}`);
  if (changed && prev !== null) {
    console.log(`[tokens:sync] Tokens moved — re-read BL-UI-002 (spacing grid) and BL-UI-006`);
    console.log(`[tokens:sync] (touch targets) in business-logic.md before the next layout run.`);
  }
  process.exit(0);
}

await main();
