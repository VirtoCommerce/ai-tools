// Tests for the shared colour maths in `scripts/lib/measure-layout.ts`
// (`COLOR_MATH_JS` + `EFFECTIVE_BG_JS`).
//
// These helpers are emitted as JS source into browser snippets, which is exactly why they
// went untested and why three defects survived in them long enough to distort a real audit
// (VCST-5346). They are DOM-free (or DOM-injectable) on purpose so they can be evaluated
// here in Node and pinned.
//
// The boundaries pinned are the ones where a wrong answer is INVISIBLE in a report:
//
//   A transparent `html` must resolve to WHITE, never black. The old walk stopped before
//   `document.documentElement` and then fell back to `parseColor(htmlBg) || white` — but a
//   transparent html parses to [0,0,0,0], which is TRUTHY, so the fallback never fired and
//   every text node was measured against black. That manufactured 13 phantom 1.06:1
//   failures on text that is actually 19.8:1.
//
//   An undecodable colour must be REPORTED, not skipped. Neither snippet parsed
//   `color(srgb …)`, which vc-frontend emits widely, so 8 of 14 probes silently vanished
//   and the remainder was reported as full coverage.
//
//   A colour space we cannot convert must return null rather than a guess. A guessed
//   expectation fails every correct implementation.

import { test } from "node:test";
import assert from "node:assert/strict";
import { COLOR_MATH_JS, EFFECTIVE_BG_JS } from "../lib/measure-layout.ts";

type RGBA = [number, number, number, number];

const colorMath = new Function(
  `${COLOR_MATH_JS}; return { parseColor, lum, ratio, compositeOver };`,
)() as {
  parseColor: (s: string) => RGBA | null;
  lum: (rgb: number[]) => number;
  ratio: (a: number[], b: number[]) => number;
  compositeOver: (top: number[], bottom: number[]) => RGBA;
};

/** Build `effectiveBg` over a fake ancestor chain: index 0 is the element, last is <html>. */
function effectiveBgOver(backgrounds: string[]) {
  const chain = backgrounds.map((bg) => ({ bg, parentElement: null as unknown }));
  for (let i = 0; i < chain.length - 1; i++) chain[i].parentElement = chain[i + 1];
  const fn = new Function(
    "getComputedStyle",
    `${COLOR_MATH_JS}${EFFECTIVE_BG_JS}; return effectiveBg;`,
  )((el: { bg: string }) => ({ backgroundColor: el.bg })) as (el: unknown) => RGBA;
  return fn(chain[0]);
}

const approx = (actual: number, expected: number, tol = 0.5) =>
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `expected ${expected} ± ${tol}, got ${actual}`,
  );

// --- parseColor ------------------------------------------------------------

test("parseColor: rgb/rgba legacy comma syntax", () => {
  assert.deepEqual(colorMath.parseColor("rgb(222, 49, 49)"), [222, 49, 49, 1]);
  assert.deepEqual(colorMath.parseColor("rgba(0, 0, 0, 0.5)"), [0, 0, 0, 0.5]);
});

test("parseColor: modern space syntax with slash alpha", () => {
  assert.deepEqual(colorMath.parseColor("rgb(0 0 0 / 50%)"), [0, 0, 0, 0.5]);
  assert.deepEqual(colorMath.parseColor("rgb(229 33 33)"), [229, 33, 33, 1]);
});

test("parseColor: color(srgb …) decodes — the 8-of-14 silent-skip defect", () => {
  // vc-frontend emits this form widely; it used to return null and the probe vanished.
  const c = colorMath.parseColor("color(srgb 0.5 0.25 0.125)")!;
  assert.ok(c, "color(srgb …) must not be null");
  approx(c[0], 127.5);
  approx(c[1], 63.75);
  approx(c[2], 31.875);
  assert.equal(c[3], 1);

  const withAlpha = colorMath.parseColor("color(srgb 1 1 1 / 0.4)")!;
  assert.deepEqual(withAlpha.slice(0, 3), [255, 255, 255]);
  assert.equal(withAlpha[3], 0.4);
});

test("parseColor: a colour space we cannot convert returns null, never a guess", () => {
  // Reported as `unparsed` by the snippets → classifier WARNs. Decoding display-p3 as if
  // it were sRGB would silently mis-measure every ratio instead.
  assert.equal(colorMath.parseColor("color(display-p3 1 0 0)"), null);
  assert.equal(colorMath.parseColor("oklch(62% 0.2 29)"), null);
  assert.equal(colorMath.parseColor("not-a-colour"), null);
  assert.equal(colorMath.parseColor(""), null);
});

test("parseColor: transparent is alpha 0, not black", () => {
  assert.deepEqual(colorMath.parseColor("transparent"), [0, 0, 0, 0]);
  assert.equal(colorMath.parseColor("rgba(0, 0, 0, 0)")![3], 0);
});

test("parseColor: hex in 3/4/6/8-digit forms", () => {
  assert.deepEqual(colorMath.parseColor("#e52121"), [229, 33, 33, 1]);
  assert.deepEqual(colorMath.parseColor("#f80"), [255, 136, 0, 1]);
  const withAlpha = colorMath.parseColor("#ff880080")!;
  assert.deepEqual(withAlpha.slice(0, 3), [255, 136, 0]);
  approx(withAlpha[3], 0.502, 0.01);
});

// --- ratio / compositing ---------------------------------------------------

test("ratio: white on black is 21:1", () => {
  approx(colorMath.ratio([255, 255, 255], [0, 0, 0]), 21, 0.01);
  approx(colorMath.ratio([255, 255, 255], [255, 255, 255]), 1, 0.001);
});

test("compositeOver: a translucent layer is blended, not taken at face value", () => {
  const half = colorMath.compositeOver([0, 0, 0, 0.5], [255, 255, 255, 1]);
  approx(half[0], 127.5);
  assert.equal(half[3], 1);
  // Fully transparent top leaves the bottom untouched.
  assert.deepEqual(
    colorMath.compositeOver([0, 0, 0, 0], [12, 34, 56, 1]).slice(0, 3),
    [12, 34, 56],
  );
  // Opaque top wins outright.
  assert.deepEqual(colorMath.compositeOver([1, 2, 3, 1], [255, 255, 255, 1]), [1, 2, 3, 1]);
});

test("focus ring: 30% primary over white reproduces the measured 1.63:1 (VCST-5346 N3)", () => {
  // The design system declares `--focus-color: rgb(from var(--color-primary-500) r g b / 0.3)`.
  // With the Red preset (#e52121) that composites to rgb(247.2, 188.4, 188.4) → the live
  // audit's measured rgb(247,188,188) and 1.63:1, matching EXACTLY. This pins the maths to a
  // real observation, and is the arithmetic showing a ≤40%-alpha ring cannot reach the 3:1
  // non-text minimum for any mid-luminance hue.
  const primary = colorMath.parseColor("#e52121")!;
  const ring = colorMath.compositeOver([primary[0], primary[1], primary[2], 0.3], [255, 255, 255, 1]);
  approx(ring[0], 247.2, 0.1);
  approx(ring[1], 188.4, 0.1);
  approx(ring[2], 188.4, 0.1);
  const r = colorMath.ratio(ring, [255, 255, 255]);
  approx(r, 1.63, 0.02);
  assert.ok(r < 3, "a 30% alpha ring must fail the 3:1 non-text minimum");
});

// --- effectiveBg -----------------------------------------------------------

test("effectiveBg: an all-transparent chain resolves to WHITE, never black", () => {
  // The regression that manufactured 13 phantom 1.06:1 failures. A transparent html/body
  // is the normal case, and the canvas under it is white.
  const bg = effectiveBgOver(["rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0)"]);
  assert.deepEqual(bg.slice(0, 3), [255, 255, 255]);
});

test("effectiveBg: html's own background is honoured — the walk no longer stops short", () => {
  // The old loop exited at `cur !== document.documentElement`, so a dark-mode background
  // set on <html> was reached only through the buggy fallback path.
  const bg = effectiveBgOver(["rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0)", "rgb(10, 10, 10)"]);
  assert.deepEqual(bg.slice(0, 3), [10, 10, 10]);
});

test("effectiveBg: nearest opaque ancestor wins", () => {
  const bg = effectiveBgOver(["rgba(0, 0, 0, 0)", "rgb(211, 66, 71)", "rgb(255, 255, 255)"]);
  assert.deepEqual(bg.slice(0, 3), [211, 66, 71]);
});

test("effectiveBg: translucent layers composite down onto the first opaque one", () => {
  const bg = effectiveBgOver(["rgba(0, 0, 0, 0.5)", "rgb(255, 255, 255)"]);
  approx(bg[0], 127.5);
});

test("effectiveBg: a color(srgb …) background is resolved, not skipped to white", () => {
  const bg = effectiveBgOver(["rgba(0, 0, 0, 0)", "color(srgb 0 0 0)"]);
  assert.deepEqual(bg.slice(0, 3), [0, 0, 0]);
});
