// Tests for the design-spec classifiers in `scripts/lib/verify-design-spec.ts`.
//
// The boundaries pinned here are the ones where a wrong call is INVISIBLE in a report:
//
//   UNSPEC must never be a failure — a design project is rarely exhaustive, and treating
//   "the spec doesn't mention this" as a defect turns the whole axis into noise that gets
//   ignored, which is worse than not running it.
//
//   An empty expectation set must never be a PASS — "we checked and it matched" and "there
//   was nothing to check" are different outcomes, and silence reads as the former.
//
//   SKIPPED must never be a PASS — the design axis cannot run without an authorized
//   DesignSync source (no /design-login in web sessions or CI). Same discipline as
//   `tokens:check` exiting 2 on an unreachable source rather than passing.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyDesignToken,
  classifyIconParity,
  classifyComponentGeometry,
  classifyIconStroke,
  designAxisSkipped,
  expectedStroke,
  iconParityAuditSnippet,
  matchesGlyphPattern,
  summarizeDesignFindings,
  type DesignSpec,
  type IconAuditResult,
  type GeometryAuditResult,
  type StrokeAuditResult,
} from "../lib/verify-design-spec.ts";

// --- tokens ----------------------------------------------------------------

test("token axis: notation-only difference is CONFIRMED, real difference is DRIFT", () => {
  const confirmed = classifyDesignToken({
    evaluated: 1,
    items: [{ name: "--color-primary-500", expected: "#e52121", live: "rgb(229, 33, 33)" }],
  });
  assert.equal(confirmed.verdict, "CONFIRMED");
  assert.equal(confirmed.severity, "PASS");

  const drift = classifyDesignToken({
    evaluated: 1,
    items: [{ name: "--color-primary-500", expected: "#e52121", live: "#c41212" }],
  });
  assert.equal(drift.verdict, "DRIFT");
  assert.equal(drift.severity, "FAIL");
  assert.match(drift.message, /--color-primary-500/);
});

test("token axis: a spec'd token absent from the live page is MISSING, not silently clean", () => {
  const finding = classifyDesignToken({
    evaluated: 1,
    items: [{ name: "--spacing-md", expected: "16px", live: "" }],
  });
  assert.equal(finding.verdict, "MISSING");
  assert.equal(finding.severity, "FAIL");
});

test("token axis: unresolved spec entries downgrade a clean result to WARN", () => {
  // All measured tokens matched, but part of the artboard could not be read. Reporting PASS
  // would overstate coverage.
  const finding = classifyDesignToken(
    { evaluated: 1, items: [{ name: "--spacing-md", expected: "16px", live: "16px" }] },
    { unresolved: 2 },
  );
  assert.equal(finding.verdict, "CONFIRMED");
  assert.equal(finding.severity, "WARN");
  assert.match(finding.message, /2 spec entries unresolved/);
});

// --- icons -----------------------------------------------------------------

function icon(over: Partial<IconAuditResult["items"][0]>): IconAuditResult["items"][0] {
  return {
    requested: "cart",
    rendered: "shopping-cart",
    hasSvg: true,
    drawable: 3,
    width: 24,
    height: 24,
    strokeWidth: 1.5,
    spec: { to: "shopping-cart", tos: ["shopping-cart"], sizePx: 24, strokeWidth: 1.5, custom: false },
    legacy: null,
    ...over,
  };
}

test("icon axis: the mapped glyph rendering at the mapped size is CONFIRMED", () => {
  const finding = classifyIconParity({ evaluated: 1, specCount: 1, items: [icon({})] });
  assert.equal(finding.verdict, "CONFIRMED");
  assert.equal(finding.severity, "PASS");
});

test("icon axis: a different glyph than the mapping declares is DRIFT", () => {
  const finding = classifyIconParity({
    evaluated: 1,
    specCount: 1,
    items: [icon({ rendered: "shopping-bag" })],
  });
  assert.equal(finding.verdict, "DRIFT");
  assert.equal(finding.severity, "FAIL");
  assert.match(finding.message, /shopping-cart.*shopping-bag/);
});

test("icon axis: a mapped icon that renders nothing drawable is MISSING (the blank-glyph bug)", () => {
  // This is the regression a screenshot review misses: the element exists and occupies space,
  // so layout looks right, but no glyph is painted.
  const blank = classifyIconParity({
    evaluated: 1,
    specCount: 1,
    items: [icon({ drawable: 0 })],
  });
  assert.equal(blank.verdict, "MISSING");
  assert.equal(blank.severity, "FAIL");

  const noSvg = classifyIconParity({
    evaluated: 1,
    specCount: 1,
    items: [icon({ hasSvg: false, drawable: 0 })],
  });
  assert.equal(noSvg.verdict, "MISSING");
});

test("icon axis: an icon the spec never mentions is UNSPEC and NOT a failure", () => {
  const finding = classifyIconParity({
    evaluated: 1,
    specCount: 1,
    items: [icon({ requested: "sparkles", spec: null })],
  });
  assert.equal(finding.verdict, "CONFIRMED");
  assert.equal(finding.severity, "PASS");
  assert.match(finding.message, /not covered by spec/);
});

test("icon axis: size and stroke drift are caught even when the glyph name is right", () => {
  const size = classifyIconParity({
    evaluated: 1,
    specCount: 1,
    items: [icon({ width: 28, height: 28 })],
  });
  assert.equal(size.verdict, "DRIFT");
  assert.match(size.message, /24px, rendered 28×28px/);

  const stroke = classifyIconParity({
    evaluated: 1,
    specCount: 1,
    items: [icon({ strokeWidth: 2 })],
  });
  assert.equal(stroke.verdict, "DRIFT");
  assert.match(stroke.message, /stroke 1\.5, rendered 2/);
});

test("icon axis: sub-pixel size noise inside tolerance stays CONFIRMED", () => {
  const finding = classifyIconParity({
    evaluated: 1,
    specCount: 1,
    items: [icon({ width: 24.4, height: 23.6 })],
  });
  assert.equal(finding.verdict, "CONFIRMED");
});

test("icon axis: when the implementation exposes no rendered glyph name, a drawable glyph is not called drift", () => {
  // `rendered` is only trustworthy where the DOM exposes it. Absent that, claiming a mismatch
  // would invent a finding; claiming a name match would invent a confirmation. We confirm only
  // what was observed — that something drawable rendered at the right size.
  const finding = classifyIconParity({
    evaluated: 1,
    specCount: 1,
    items: [icon({ rendered: "" })],
  });
  assert.equal(finding.verdict, "CONFIRMED");
  assert.equal(finding.severity, "PASS");
});

// --- geometry --------------------------------------------------------------

function geo(over: Partial<GeometryAuditResult["items"][0]>): GeometryAuditResult["items"][0] {
  return {
    tag: "span",
    declared: "md",
    expectedPx: 24,
    expectedRatio: 1,
    width: 24,
    height: 24,
    ...over,
  };
}

test("geometry axis: token equality and ratio are both asserted, not a threshold", () => {
  assert.equal(classifyComponentGeometry({ evaluated: 1, specCount: 1, items: [geo({})] }).verdict, "CONFIRMED");

  const wrongSize = classifyComponentGeometry({
    evaluated: 1,
    specCount: 1,
    items: [geo({ width: 34, height: 28 })],
  });
  assert.equal(wrongSize.verdict, "DRIFT");

  // Right area, wrong shape — the VCST-5413 oval-vs-circle failure mode that every
  // "≥ / no-overflow" gate passes.
  const wrongRatio = classifyComponentGeometry({
    evaluated: 1,
    specCount: 1,
    items: [geo({ width: 24, height: 24, expectedRatio: 2 })],
  });
  assert.equal(wrongRatio.verdict, "DRIFT");
  assert.match(wrongRatio.message, /ratio 2, rendered 1/);
});

test("geometry axis: zero-area control is MISSING; unmatched control is UNSPEC not FAIL", () => {
  const zero = classifyComponentGeometry({
    evaluated: 1,
    specCount: 1,
    items: [geo({ width: 0, height: 0 })],
  });
  assert.equal(zero.verdict, "MISSING");
  assert.equal(zero.severity, "FAIL");

  const unspec = classifyComponentGeometry({
    evaluated: 1,
    specCount: 1,
    items: [geo({ declared: "", expectedPx: null, expectedRatio: null })],
  });
  assert.equal(unspec.severity, "PASS");
  assert.match(unspec.message, /not covered by spec/);
});

// --- empty / skipped: the two "never a PASS" rules -------------------------

test("an empty expectation set is SKIPPED + WARN, never PASS", () => {
  for (const finding of [
    classifyDesignToken({ evaluated: 0, items: [] }),
    classifyIconParity({ evaluated: 0, specCount: 0, items: [] }),
    classifyComponentGeometry({ evaluated: 0, specCount: 0, items: [] }),
  ]) {
    assert.equal(finding.verdict, "SKIPPED", `${finding.axis} must not claim a pass`);
    assert.equal(finding.severity, "WARN");
    assert.match(finding.message, /not exercised, not passed/);
  }
});

test("designAxisSkipped marks every axis SKIPPED + WARN and carries the reason", () => {
  const findings = designAxisSkipped("design source unauthorized (/design-login unavailable)");
  assert.equal(findings.length, 4);
  for (const f of findings) {
    assert.equal(f.verdict, "SKIPPED");
    assert.equal(f.severity, "WARN");
    assert.notEqual(f.severity, "PASS");
    assert.match(f.message, /design-login unavailable/);
  }
});

test("summarizeDesignFindings distinguishes an all-skipped run from a clean run", () => {
  const skipped = summarizeDesignFindings(designAxisSkipped("no authorized design source"));
  assert.equal(skipped.verdict, "SKIPPED");
  assert.equal(skipped.severity, "WARN");
  assert.match(skipped.line, /SKIPPED/);

  const clean = summarizeDesignFindings([
    classifyDesignToken({ evaluated: 1, items: [{ name: "--spacing-md", expected: "16px", live: "16px" }] }),
  ]);
  assert.equal(clean.verdict, "CONFIRMED");
  assert.equal(clean.severity, "PASS");

  const failing = summarizeDesignFindings([
    classifyDesignToken({ evaluated: 1, items: [{ name: "--spacing-md", expected: "16px", live: "13px" }] }),
    ...designAxisSkipped("icons not in scope", ["DESIGN-ICON"]),
  ]);
  assert.equal(failing.severity, "FAIL");
  assert.equal(failing.verdict, "DRIFT");
});

// --- surface-scoped parity: the one-to-many mapping trap -------------------

function specWith(icons: DesignSpec["icons"], over: Partial<DesignSpec> = {}): DesignSpec {
  return {
    path: "Fixture.html",
    cards: [],
    tokens: [],
    icons,
    geometry: [],
    strokeScales: [],
    arrowFamily: [],
    divergences: [],
    unresolved: [],
    ...over,
  };
}

test("icon axis: one call-site name mapping to two glyphs on two surfaces is scoped, not collapsed", () => {
  // `adjustments` is legitimately `settings-2` in the Sales Hub and `sliders-horizontal` on the
  // PDP. Keying expectations by name alone keeps only the last one, so the other surface reports
  // DRIFT against a mapping that was never meant to apply there.
  const spec = specWith([
    { from: "adjustments", to: "settings-2", surface: "Sales Rep Hub — sidebar" },
    { from: "adjustments", to: "sliders-horizontal", surface: "Product page — options" },
  ]);

  const pdp = iconParityAuditSnippet(spec, ".vc-icon", { surface: "Product page" });
  assert.match(pdp, /sliders-horizontal/);
  assert.doesNotMatch(pdp, /settings-2/);

  const hub = iconParityAuditSnippet(spec, ".vc-icon", { surface: "Sales Rep Hub" });
  assert.match(hub, /settings-2/);
  assert.doesNotMatch(hub, /sliders-horizontal/);
});

test("icon axis: with no surface filter both candidates survive and either one CONFIRMS", () => {
  // Unscoped, the honest answer is "the spec allows either here", not a coin-flip DRIFT.
  const both = ["settings-2", "sliders-horizontal"];
  for (const rendered of both) {
    const finding = classifyIconParity({
      evaluated: 1,
      specCount: 2,
      items: [
        icon({
          requested: "adjustments",
          rendered,
          spec: { to: both[0], tos: both, sizePx: null, strokeWidth: null, custom: false },
        }),
      ],
    });
    assert.equal(finding.verdict, "CONFIRMED", `${rendered} is a legal glyph for adjustments`);
  }

  const wrong = classifyIconParity({
    evaluated: 1,
    specCount: 2,
    items: [
      icon({
        requested: "adjustments",
        rendered: "settings",
        spec: { to: both[0], tos: both, sizePx: null, strokeWidth: null, custom: false },
      }),
    ],
  });
  assert.equal(wrong.verdict, "DRIFT");
  assert.match(wrong.message, /settings-2.*sliders-horizontal/);
});

// --- known divergence: never a FAIL, never a clean PASS -------------------

test("icon axis: a mismatch a declared-unshipped rule predicts is KNOWN_DIVERGENCE, not DRIFT", () => {
  // The spec says small glyphs must come from the solid set under a different legacy name, and
  // says in the same breath that the code does not do this yet. Filing that as a product defect
  // on every small icon is the exact false-failure class this verdict exists to stop.
  const items = [icon({ requested: "box", rendered: "box", width: 12, height: 12,
    spec: { to: "cube", tos: ["cube"], sizePx: null, strokeWidth: null, custom: false } })];

  const naive = classifyIconParity({ evaluated: 1, specCount: 1, items });
  assert.equal(naive.verdict, "DRIFT", "without the divergence it is an ordinary mismatch");
  assert.equal(naive.severity, "FAIL");

  const aware = classifyIconParity(
    { evaluated: 1, specCount: 1, items },
    { divergences: [{ marker: "not yet implemented in code", fragment: "…the frontend has to catch up" }] },
  );
  assert.equal(aware.verdict, "CONFIRMED", "a known divergence is not a failure");
  assert.notEqual(aware.severity, "FAIL");
  assert.equal(aware.severity, "WARN", "…but it is not a clean pass either");
  assert.match(aware.message, /known design\/code divergence/);
});

test("known divergence above the threshold is still a real DRIFT", () => {
  // The divergence excuses only what it actually governs. A 24px glyph is not covered by a
  // sub-16px rule, so blanket-excusing every mismatch would hide genuine drift.
  const finding = classifyIconParity(
    {
      evaluated: 1,
      specCount: 1,
      items: [icon({ requested: "box", rendered: "package", width: 24, height: 24,
        spec: { to: "box", tos: ["box"], sizePx: null, strokeWidth: null, custom: false } })],
    },
    { divergences: [{ marker: "not yet implemented in code", fragment: "…" }] },
  );
  assert.equal(finding.verdict, "DRIFT");
  assert.equal(finding.severity, "FAIL");
});

// --- stroke ladders --------------------------------------------------------

const BASE = { family: "base" as const, stops: [[16, 1.4], [20, 1.6], [24, 1.85], [86, 3.7]] as [number, number][], flat: 3.7 };
const ARROW = { family: "arrow" as const, stops: [[14, 2.1], [16, 2.2], [20, 2.6]] as [number, number][], flat: 3.0 };

test("expectedStroke is stepped, and the ceiling applies above the last bucket", () => {
  assert.equal(expectedStroke(10, BASE), 1.4, "every size inside a bucket gets the same weight");
  assert.equal(expectedStroke(16, BASE), 1.4, "the bucket boundary is inclusive");
  assert.equal(expectedStroke(17, BASE), 1.6, "17 falls into the next bucket, not between the two");
  assert.equal(expectedStroke(96, BASE), 3.7, "past the last bucket sits on the flat ceiling");
  assert.equal(expectedStroke(14, ARROW), 2.1, "the arrow ladder is a different scale, not an offset");
  assert.equal(expectedStroke(64, ARROW), 3.0);
});

test("matchesGlyphPattern honours prefix wildcards and exact names", () => {
  const fam = ["chevron-*", "move*", "check", "x"];
  assert.ok(matchesGlyphPattern("chevron-down", fam));
  assert.ok(matchesGlyphPattern("move-right", fam));
  assert.ok(matchesGlyphPattern("check", fam));
  assert.ok(!matchesGlyphPattern("check-check", fam), "an exact pattern must not match a longer name");
  assert.ok(!matchesGlyphPattern("search", fam));
});

function strokeResult(over: Partial<StrokeAuditResult["items"][0]> = {}, rootPin = ""): StrokeAuditResult {
  return {
    evaluated: 1,
    rootPin,
    items: [{ name: "search", width: 24, strokeWidth: 1.85, vectorEffect: "non-scaling-stroke", fill: "none", ...over }],
  };
}

const STROKE_SPEC = specWith([], {
  strokeScales: [BASE, ARROW],
  arrowFamily: ["chevron-*", "plus", "minus", "check", "x"],
});

test("stroke axis: the ladder bucket for the rendered size is CONFIRMED", () => {
  const finding = classifyIconStroke(strokeResult(), STROKE_SPEC);
  assert.equal(finding.verdict, "CONFIRMED");
  assert.equal(finding.severity, "PASS");
});

test("stroke axis: a stepper glyph is judged on the arrow ladder, not the base one", () => {
  // The concrete expectation the spec states outright: `+`/`−` at 14px resolves to 2.1, and no
  // fixed override exists anywhere in the code. Judging it on the base ladder would expect 1.3.
  const ok = classifyIconStroke(strokeResult({ name: "plus", width: 14, strokeWidth: 2.1 }), STROKE_SPEC);
  assert.equal(ok.verdict, "CONFIRMED");

  const drifted = classifyIconStroke(strokeResult({ name: "plus", width: 14, strokeWidth: 3.7 }), STROKE_SPEC);
  assert.equal(drifted.verdict, "DRIFT");
  assert.equal(drifted.severity, "FAIL");
  assert.match(drifted.message, /should render 2\.1 on the arrow ladder, rendered 3\.7/);
});

test("stroke axis: a missing vector-effect invalidates the whole scale and is reported as such", () => {
  // Without non-scaling-stroke the number is in viewBox units, so a bucket comparison is
  // meaningless — reporting "weight is 2 instead of 1.85" would send someone chasing the wrong
  // thing entirely.
  const finding = classifyIconStroke(strokeResult({ vectorEffect: "none" }), STROKE_SPEC);
  assert.equal(finding.verdict, "DRIFT");
  assert.match(finding.message, /viewBox units/);
});

test("stroke axis: a filled outline glyph is caught (the fill trap)", () => {
  const finding = classifyIconStroke(strokeResult({ fill: "rgb(255, 126, 19)" }), STROKE_SPEC);
  assert.equal(finding.verdict, "DRIFT");
  assert.match(finding.message, /floods the contour/);

  for (const benign of ["none", "rgba(0, 0, 0, 0)", "transparent"]) {
    assert.equal(classifyIconStroke(strokeResult({ fill: benign }), STROKE_SPEC).verdict, "CONFIRMED");
  }
});

test("stroke axis: a global --lucide-stroke-width pin is a finding in its own right", () => {
  const finding = classifyIconStroke(strokeResult({}, "2.5"), STROKE_SPEC);
  assert.equal(finding.verdict, "DRIFT");
  assert.match(finding.message, /flattens every stepped bucket/);
});

test("stroke axis: without a declared arrow-family list, family is UNSPEC rather than guessed", () => {
  const noFamily = specWith([], { strokeScales: [BASE, ARROW], arrowFamily: [] });
  const finding = classifyIconStroke(strokeResult({ name: "plus", width: 14, strokeWidth: 2.1 }), noFamily);
  assert.equal(finding.severity, "PASS", "UNSPEC is advisory, never a failure");
  assert.match(finding.message, /not covered by spec/);
});

test("stroke axis: with no ladders at all the axis is SKIPPED, never PASS", () => {
  const finding = classifyIconStroke({ evaluated: 0, rootPin: "", items: [] }, specWith([]));
  assert.equal(finding.verdict, "SKIPPED");
  assert.equal(finding.severity, "WARN");
});

test("stroke axis: a sub-threshold outline glyph is KNOWN_DIVERGENCE when the spec declares the gap", () => {
  const spec = specWith([], {
    strokeScales: [BASE, ARROW],
    arrowFamily: ["plus", "minus"],
    divergences: [{ marker: "not yet implemented in code", fragment: "sub-16px solid rule" }],
  });
  const finding = classifyIconStroke(strokeResult({ name: "box", width: 12, strokeWidth: 2 }), spec);
  assert.equal(finding.verdict, "CONFIRMED");
  assert.equal(finding.severity, "WARN");
  assert.match(finding.message, /known design\/code divergence/);

  // The divergence must not blanket-excuse everything below the threshold: a glyph that DOES
  // match its bucket is an ordinary confirmation, and still a clean PASS.
  const matching = classifyIconStroke(strokeResult({ name: "box", width: 12, strokeWidth: 1.4 }), spec);
  assert.equal(matching.verdict, "CONFIRMED");
  assert.equal(matching.severity, "PASS");

  // An arrow glyph is explicitly excepted from that rule, so it stays a real comparison.
  const arrowBelow = classifyIconStroke(strokeResult({ name: "minus", width: 12, strokeWidth: 1.4 }), spec);
  assert.equal(arrowBelow.verdict, "DRIFT");
});

test("summarizeDesignFindings surfaces a known divergence instead of reporting CONFIRMED", () => {
  const spec = specWith([], {
    strokeScales: [BASE],
    arrowFamily: ["plus"],
    divergences: [{ marker: "code pending", fragment: "…" }],
  });
  const summary = summarizeDesignFindings([
    classifyIconStroke(strokeResult({ name: "box", width: 12, strokeWidth: 2 }), spec),
  ]);
  assert.equal(summary.severity, "WARN");
  assert.notEqual(summary.severity, "PASS");
});

// --- the reverse check: a retired glyph that still paints ------------------

test("icon axis: a retired glyph still rendering is DRIFT even with no call-site name exposed", () => {
  // VcIcon exposes glyph identity only through `svg class="lucide lucide-<glyph>"`, so the
  // forward requested->rendered lookup finds nothing and every item would read UNSPEC — an
  // axis that reports advisory-clean while verifying nothing. The migration is still checkable
  // backwards: `filter` was replaced by `funnel`, so a painted `filter` is drift.
  const finding = classifyIconParity({
    evaluated: 1,
    specCount: 1,
    items: [icon({ requested: "", rendered: "filter", spec: null, legacy: { from: "filter", tos: ["funnel"] } })],
  });
  assert.equal(finding.verdict, "DRIFT");
  assert.equal(finding.severity, "FAIL");
  assert.match(finding.message, /retired glyph "filter" still rendering/);
  assert.match(finding.message, /"funnel"/);
});

test("icon axis: a self-mapping name is not treated as retired", () => {
  // `heart` -> `heart` retires nothing. Emitting it as a legacy pair would report every correct
  // heart on the site as drift, which is worse than not running the check.
  const spec = specWith([
    { from: "heart", to: "heart", surface: "Category — card hover" },
    { from: "filter", to: "funnel", surface: "Orders — toolbar" },
  ]);
  const snippet = iconParityAuditSnippet(spec, ".vc-icon");
  const legacyBlock = /const legacyPairs = (\[.*?\]);/s.exec(snippet)?.[1] ?? "";
  assert.match(legacyBlock, /filter/);
  assert.doesNotMatch(legacyBlock, /heart/);
});

test("icon axis: the snippet reads the icon-set class, not just data-* attributes", () => {
  const snippet = iconParityAuditSnippet(specWith([{ from: "cart", to: "shopping-cart" }]), ".vc-icon");
  assert.match(snippet, /lucide-\(\[a-z0-9-\]\+\)/, "must derive the glyph name from the class");
  assert.match(snippet, /getAttribute\('class'\)/);
});
