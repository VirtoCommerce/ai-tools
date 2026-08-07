/**
 * Builds sprint-demo26-15.pptx from the same content as sprint-demo26-15.html.
 *
 * The HTML deck stays the source of truth for wording; this script mirrors it into
 * PowerPoint for people who want the file rather than a browser. Palette, slide order,
 * and presenter notes are kept in sync by hand — if you edit the HTML, edit here too.
 *
 * Run:  node vc/shared/docs/presentation/build-sprint-26-15-pptx.mjs
 */
import PptxGenJS from "pptxgenjs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "sprint-demo26-15.pptx");

/* ---- palette: lifted from the HTML deck's :root tokens ---- */
const C = {
  surface:    "F7F9FB",
  card:       "FFFFFF",
  line:       "DBE3EC",
  text:       "16202E",
  textSoft:   "4D5C70",
  textFaint:  "7C8AA0",
  accent:     "0F9D8F",
  accentInk:  "0A6E64",
  accentSoft: "E2F4F1",
  agent:      "5566E0",
  agentSoft:  "E8EAFB",
  pass:       "1F9D57",
  warn:       "C98A1A",
  crit:       "D1495B",
  ink:        "0D141F",
  ink2:       "131C2B",
  // terminal text colours
  tTeal: "3FD0BF", tWhite: "E7EDF5", tGreen: "43C47E",
  tWarn: "E0AB53", tDim: "6A7C92", tBlue: "8B98F2", tRed: "F0788A",
  tBody: "C5D2E2",
};

const SANS = "Segoe UI";
const MONO = "Consolas";

const pptx = new PptxGenJS();
pptx.defineLayout({ name: "WIDE", width: 13.33, height: 7.5 });
pptx.layout = "WIDE";
pptx.author = "Virto Commerce QA Engineering";
pptx.company = "Virto Commerce";
pptx.subject = "Sprint 26-15 — Agentic QA";
pptx.title = "Sprint 26-15 Demo — Agentic QA";

const M = 0.72;              // left margin
const W = 13.33 - M * 2;     // content width

let slideNo = 0;
const TOTAL = 13;

/* ---------- shared chrome ---------- */

function newSlide({ tint = null } = {}) {
  const s = pptx.addSlide();
  s.background = { color: C.surface };
  slideNo += 1;

  // accent progress bar across the top, proportional to position in the deck
  s.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: (13.33 * slideNo) / TOTAL, h: 0.055,
    fill: { color: tint === "agent" ? C.agent : C.accent }, line: { type: "none" },
  });

  s.addText(`${slideNo} / ${TOTAL}`, {
    x: 11.5, y: 6.95, w: 1.2, h: 0.3,
    fontSize: 9, color: C.textFaint, fontFace: MONO, align: "right",
  });
  return s;
}

function eyebrow(s, text, tint = null) {
  const col = tint === "agent" ? C.agent : C.accentInk;
  s.addShape(pptx.ShapeType.rect, {
    x: M, y: 0.62, w: 0.26, h: 0.028,
    fill: { color: tint === "agent" ? C.agent : C.accent }, line: { type: "none" },
  });
  s.addText(text.toUpperCase(), {
    x: M + 0.38, y: 0.44, w: W - 0.38, h: 0.32,
    fontSize: 9.5, color: col, fontFace: MONO, bold: true, charSpacing: 2.2,
  });
}

function heading(s, text, y = 0.92, size = 28) {
  s.addText(text, {
    x: M, y, w: W, h: 0.95,
    fontSize: size, color: C.text, fontFace: SANS, bold: true, valign: "top",
  });
}

function lead(s, text, y, w = W) {
  s.addText(text, {
    x: M, y, w, h: 0.75,
    fontSize: 13, color: C.textSoft, fontFace: SANS, valign: "top",
    lineSpacingMultiple: 1.25,
  });
}

/* ---------- terminal panel ----------
 * lines: array of arrays of { t, c } segments. One inner array === one rendered line.
 */
function terminal(s, { x, y, w, h, title, lines }) {
  s.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.08,
    fill: { color: C.ink }, line: { color: C.line, width: 0.5 },
  });
  s.addShape(pptx.ShapeType.rect, {
    x, y, w, h: 0.34, fill: { color: C.ink2 }, line: { type: "none" },
  });
  ["E0788A", "E0AB53", "43C47E"].forEach((col, i) => {
    s.addShape(pptx.ShapeType.ellipse, {
      x: x + 0.14 + i * 0.19, y: y + 0.115, w: 0.11, h: 0.11,
      fill: { color: col }, line: { type: "none" },
    });
  });
  s.addText(title, {
    x: x + 0.78, y: y + 0.05, w: w - 0.9, h: 0.24,
    fontSize: 8.5, color: C.textFaint, fontFace: MONO,
  });

  const runs = [];
  lines.forEach((segs, li) => {
    if (segs.length === 0) {
      runs.push({ text: " ", options: { breakLine: true } });
      return;
    }
    segs.forEach((seg, si) => {
      runs.push({
        text: seg.t,
        options: {
          color: seg.c || C.tBody,
          bold: !!seg.b,
          breakLine: si === segs.length - 1 && li < lines.length - 1,
        },
      });
    });
  });

  s.addText(runs, {
    x: x + 0.22, y: y + 0.46, w: w - 0.44, h: h - 0.62,
    fontSize: 9.5, fontFace: MONO, color: C.tBody,
    valign: "top", lineSpacingMultiple: 1.32,
  });
}

/* ---------- bullet list with accent ticks ---------- */
function bullets(s, items, { x, y, w, tint = null } = {}) {
  const col = tint === "agent" ? C.agent : C.accent;
  let cy = y;
  items.forEach((it) => {
    s.addText("✓", {
      x, y: cy, w: 0.26, h: 0.28,
      fontSize: 11, color: col, fontFace: MONO, bold: true, valign: "top",
    });
    const runs = [
      { text: it.b, options: { bold: true, color: C.text } },
      { text: " — " + it.t, options: { color: C.textSoft } },
    ];
    s.addText(runs, {
      x: x + 0.3, y: cy, w: w - 0.3, h: it.h || 0.62,
      fontSize: 10.5, fontFace: SANS, valign: "top", lineSpacingMultiple: 1.2,
    });
    cy += it.h || 0.62;
  });
  return cy;
}

/* ---------- card ---------- */
function card(s, { x, y, w, h, rail = C.accent, kicker, title, body, blind }) {
  s.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.06,
    fill: { color: C.card }, line: { color: C.line, width: 0.5 },
  });
  s.addShape(pptx.ShapeType.rect, {
    x, y: y + 0.05, w: 0.045, h: h - 0.1, fill: { color: rail }, line: { type: "none" },
  });

  let cy = y + 0.2;
  if (kicker) {
    s.addText(kicker.toUpperCase(), {
      x: x + 0.28, y: cy, w: w - 0.5, h: 0.22,
      fontSize: 8, color: C.textFaint, fontFace: MONO, bold: true, charSpacing: 1.4,
    });
    cy += 0.26;
  }
  s.addText(title, {
    x: x + 0.28, y: cy, w: w - 0.5, h: 0.34,
    fontSize: 13, color: C.text, fontFace: SANS, bold: true, valign: "top",
  });
  cy += 0.42;
  s.addText(body, {
    x: x + 0.28, y: cy, w: w - 0.5, h: h - (cy - y) - (blind ? 0.82 : 0.2),
    fontSize: 9.5, color: C.textSoft, fontFace: SANS, valign: "top", lineSpacingMultiple: 1.18,
  });

  if (blind) {
    const by = y + h - 0.74;
    s.addShape(pptx.ShapeType.line, {
      x: x + 0.28, y: by, w: w - 0.56, h: 0,
      line: { color: C.line, width: 0.75, dashType: "dash" },
    });
    s.addText("BLIND TO", {
      x: x + 0.28, y: by + 0.06, w: w - 0.5, h: 0.18,
      fontSize: 7.5, color: C.textFaint, fontFace: MONO, bold: true, charSpacing: 1.2,
    });
    s.addText(blind, {
      x: x + 0.28, y: by + 0.26, w: w - 0.5, h: 0.44,
      fontSize: 9, color: C.crit, fontFace: MONO, valign: "top", lineSpacingMultiple: 1.12,
    });
  }
}

function callout(s, { x, y, w, h, text, tint = null }) {
  const isAgent = tint === "agent";
  s.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.05,
    fill: { color: isAgent ? C.agentSoft : C.accentSoft },
    line: { color: isAgent ? C.agent : C.accent, width: 0.75, dashType: "dash" },
  });
  s.addText(text, {
    x: x + 0.24, y: y + 0.12, w: w - 0.48, h: h - 0.24,
    fontSize: 10.5, color: isAgent ? C.agent : C.accentInk, fontFace: SANS,
    valign: "middle", lineSpacingMultiple: 1.2,
  });
}

/* =======================================================================
   SLIDE 1 — title
   ======================================================================= */
{
  const s = newSlide();
  eyebrow(s, "Sprint 26-15 · Agentic QA");
  s.addText("Two plugins to ship,\none pipeline to run.", {
    x: M, y: 1.15, w: W, h: 1.7,
    fontSize: 42, color: C.text, fontFace: SANS, bold: true, valign: "top",
    lineSpacingMultiple: 1.02,
  });
  s.addText(
    "The vc-tools marketplace gained a second plugin this sprint, and the internal QA pipeline " +
    "learned to spend effort in proportion to risk — and to prove its own knowledge is still true.",
    { x: M, y: 3.0, w: 8.6, h: 0.9, fontSize: 13.5, color: C.textSoft, fontFace: SANS,
      valign: "top", lineSpacingMultiple: 1.25 }
  );

  const stats = [["2", "PLUGINS"], ["3", "NEW COMMANDS"], ["121", "SUITES"], ["3,985", "TEST CASES"]];
  s.addShape(pptx.ShapeType.line, { x: M, y: 4.15, w: W, h: 0, line: { color: C.line, width: 0.75 } });
  s.addShape(pptx.ShapeType.line, { x: M, y: 5.15, w: W, h: 0, line: { color: C.line, width: 0.75 } });
  stats.forEach(([n, k], i) => {
    const x = M + i * 2.5;
    s.addText(n, { x, y: 4.32, w: 2.3, h: 0.42, fontSize: 22, color: C.text, fontFace: MONO, bold: true, valign: "top" });
    s.addText(k, { x, y: 4.76, w: 2.3, h: 0.24, fontSize: 8, color: C.textFaint, fontFace: MONO, bold: true, charSpacing: 1.6 });
    if (i < stats.length - 1) {
      s.addShape(pptx.ShapeType.line, { x: x + 2.28, y: 4.28, w: 0, h: 0.78, line: { color: C.line, width: 0.75 } });
    }
  });

  s.addText("Running order:  vc-fix + vc-perf  →  /qa-test, gates, oracle review  →  questions.", {
    x: M, y: 5.45, w: W, h: 0.3, fontSize: 10.5, color: C.textSoft, fontFace: MONO,
  });
  s.addNotes(
    "Open here. Frame the two halves in one line: 'the marketplace we ship to customers now has two plugins, " +
    "and the pipeline we run internally got smarter about where it spends effort.' Read the four numbers, " +
    "give the running order, move on — this slide is 30 seconds."
  );
}

/* =======================================================================
   SLIDE 2 — section one divider
   ======================================================================= */
{
  const s = newSlide();
  s.addShape(pptx.ShapeType.rect, {
    x: 7.6, y: 0, w: 5.73, h: 3.4, fill: { color: C.accentSoft }, line: { type: "none" },
  });
  s.addText("SECTION ONE", {
    x: M, y: 2.15, w: W, h: 0.3, fontSize: 10, color: C.textFaint, fontFace: MONO, bold: true, charSpacing: 2.4,
  });
  s.addText("The vc-tools\nmarketplace", {
    x: M, y: 2.5, w: 8.4, h: 1.7, fontSize: 42, color: C.text, fontFace: SANS, bold: true,
    valign: "top", lineSpacingMultiple: 1.02,
  });
  s.addText(
    "What a customer installs. vc-fix got more trustworthy and more portable; vc-perf is brand new — " +
    "the piece we'll actually demo.",
    { x: M, y: 4.3, w: 7.6, h: 0.7, fontSize: 13, color: C.textSoft, fontFace: SANS, valign: "top", lineSpacingMultiple: 1.25 }
  );
  ["vc-fix 0.8.3", "vc-perf 0.2.6 — new", "L1 benchmark", "L2 load", "L3 attribution"]
    .forEach((t, i, arr) => {
      const widths = arr.map((s2) => 0.16 + s2.length * 0.075);
      const x = M + widths.slice(0, i).reduce((a, b) => a + b + 0.12, 0);
      s.addShape(pptx.ShapeType.roundRect, {
        x, y: 5.2, w: widths[i], h: 0.34, rectRadius: 0.05,
        fill: { color: C.card }, line: { color: C.line, width: 0.5 },
      });
      s.addText(t, { x, y: 5.2, w: widths[i], h: 0.34, fontSize: 9, color: C.textSoft, fontFace: MONO, align: "center", valign: "middle" });
    });
  s.addNotes(
    "Section-one divider — the MARKETPLACE, the part a customer installs. Pause so the room resets context. " +
    "Flag that vc-perf is the thing you'll actually drive live in two slides' time, so they know to pay attention."
  );
}

/* =======================================================================
   SLIDE 3 — vc-fix
   ======================================================================= */
{
  const s = newSlide();
  eyebrow(s, "vc-tools marketplace · vc-fix 0.8.3");
  heading(s, "The plugin a customer installs got more honest.");
  lead(s, "Four changes, all of which make the difference between a plugin we'd demo and a plugin we'd leave running on someone else's stack.", 1.85, 10.4);

  const cw = (W - 0.35) / 2, ch = 1.98;
  const cards = [
    ["self-check", "Trustworthy by construction",
     "Capture, judgement and surfacing are now three separate layers. The collector records every anomaly and is forbidden to decide whether it matters — so a signal it doesn't recognise can no longer disappear before anyone analyses it."],
    ["deliver", "Contribution that contributes",
     "Routes cut to issue or local. Previously a token with MORE rights delivered LESS — it printed a hand-off and sent nothing, while a weaker token filed automatically. A transient failure now retries once before falling back."],
    ["/project-init", "Writes where it should",
     "Output root and plugin root are now separate concepts, so an installed plugin writes the project's profile and env into the project — never into its own versioned marketplace cache."],
    ["containment", "Guaranteed on both surfaces",
     "The upstream report is a closed schema of enums and counts — zero free-text fields, so client code can't leak by type rather than by scrubbing. Plugin and in-repo mirror are byte-identical, CI-enforced."],
  ];
  cards.forEach(([k, t, b], i) => {
    card(s, {
      x: M + (i % 2) * (cw + 0.35), y: 2.58 + Math.floor(i / 2) * (ch + 0.24),
      w: cw, h: ch, rail: C.accent, kicker: k, title: t, body: b,
    });
  });
  s.addNotes(
    "vc-fix. Don't read all four cards — pick two for the room. For leadership: containment (closed schema, " +
    "client code can't leak by type) and the delivery fix. For engineers: the self-check three-layer split. " +
    "The delivery one is the most concrete story — a token with MORE rights delivered LESS, because it printed " +
    "a hand-off and sent nothing."
  );
}

/* =======================================================================
   SLIDE 4 — vc-perf, three instruments
   ======================================================================= */
{
  const s = newSlide();
  eyebrow(s, "vc-tools marketplace · New plugin");
  heading(s, "vc-perf — three instruments, because one is never enough.");
  lead(s, "Each layer answers a different question, and each is blind to something the next one sees. Picking the wrong one is how performance work produces confident nonsense.", 1.85, 11.0);

  const cw = (W - 0.6) / 3, ch = 2.6;
  const items = [
    [C.accent, "L1 · BenchmarkDotNet", "Did this code get slower?",
     "Code-level A/B across two revisions, our override against the stock path, or an upstream before/after. Allocations and time, repeatable.",
     "a round-trip you removed —\nit never left the process"],
    [C.agent, "L2 · k6 load harness", "How does it hold up?",
     "The live system under real concurrency — throughput, p95 latency, GC pressure, with optional counters captured alongside.",
     "who is responsible for what\nit just measured"],
    [C.pass, "L3 · dotnet-trace", "Who caused it?",
     "Attribution: allocation churn, on-CPU time, and DB command shape, parsed back to the call sites that produced them.",
     "anything the load didn't\nactually exercise"],
  ];
  items.forEach(([rail, k, t, b, blind], i) => {
    card(s, { x: M + i * (cw + 0.3), y: 2.78, w: cw, h: ch, rail, kicker: k, title: t, body: b, blind });
  });

  callout(s, {
    x: M, y: 5.58, w: W, h: 0.72, text:
    "Reuses vc-fix wholesale — onboarding, repo routing, the backend developer and reviewer agents — and ships only the measurement delta.  Advisory only, never a CI gate.",
  });
  s.addNotes(
    "NEW PLUGIN. The whole slide hangs on the 'blind to' row at the bottom of each card — that's WHY there are " +
    "three layers rather than one. L1 can't see a round-trip you removed, L2 can't tell you who caused what it " +
    "measured, L3 can't see what the load never exercised. Then the callout: it borrows vc-fix's machinery and " +
    "ships only the measurement delta. Say 'advisory only, never a gate' out loud — nobody wants a flaky perf " +
    "check blocking merges."
  );
}

/* =======================================================================
   SLIDE 5 — the demo path
   ======================================================================= */
{
  const s = newSlide();
  eyebrow(s, "vc-tools marketplace · Live demo");
  heading(s, "What running it looks like.");
  lead(s, "One entry point routes to the right layer, then hands back a ranked list rather than a wall of trace output.", 1.85, 6.4);

  bullets(s, [
    { b: "/perf-init", t: "one-time: points the plugin at the local Aspire-hosted backend and the module's own benchmark targets.", h: 0.66 },
    { b: "/perf-loop", t: "the diagnose entry point. Name an operation; it decides whether the question is L2, L3, or both, and runs them.", h: 0.66 },
    { b: "Ranked candidates", t: "each carries its evidence share, the shape of the fix, where the fix lands, and how to verify it. That's the artifact a developer picks up.", h: 0.82 },
    { b: "/perf-fix → /perf-verify", t: "hand a candidate to the existing backend dev + reviewer agents, then re-measure to confirm the number actually moved.", h: 0.82 },
  ], { x: M, y: 2.85, w: 6.4 });

  terminal(s, {
    x: 7.5, y: 1.9, w: 5.1, h: 4.2, title: "/perf-loop — diagnose",
    lines: [
      [{ t: "➜ ", c: C.tTeal }, { t: "/perf-loop getFullCart", c: C.tWhite, b: true }],
      [{ t: "routing … L2 (load) + L3 (attribution)", c: C.tDim }],
      [],
      [{ t: "  L2 ", c: C.tBlue }, { t: "throughput  " }, { t: "rps · p95 · GC", c: C.tDim }],
      [{ t: "  L3 ", c: C.tBlue }, { t: "attribution " }, { t: "alloc · cpu · db", c: C.tDim }],
      [],
      [{ t: "ranked candidates", c: C.tGreen }],
      [{ t: "  1 ", c: C.tWarn }, { t: "allocation churn in a hot mapper" }],
      [{ t: "     evidence share · fix shape · lands in", c: C.tDim }],
      [{ t: "     verify: re-run L1 + L3 on the seam", c: C.tDim }],
      [{ t: "  2 ", c: C.tWarn }, { t: "repeated DB command shape" }],
      [{ t: "  3 ", c: C.tWarn }, { t: "…" }],
      [],
      [{ t: "➜ ", c: C.tTeal }, { t: "/perf-fix 1", c: C.tWhite, b: true }, { t: "  → backend dev + reviewer", c: C.tDim }],
      [{ t: "➜ ", c: C.tTeal }, { t: "/perf-verify", c: C.tWhite, b: true }, { t: " → did the number move?", c: C.tDim }],
    ],
  });
  s.addNotes(
    "THE DEMO SLIDE — drive this live if the environment is up. The point to land is the OUTPUT: not a wall of " +
    "trace data, but a ranked list where each candidate carries its evidence share, the shape of the fix, where " +
    "the fix lands, and how to verify it. That's what a developer picks up. If the env isn't up, walk the " +
    "terminal panel instead — it's the same sequence."
  );
}

/* =======================================================================
   SLIDE 6 — the N+1 evidence
   ======================================================================= */
{
  const s = newSlide();
  eyebrow(s, "vc-tools marketplace · Why it earns its place");
  heading(s, "The same discipline already found a real N+1.");
  lead(s, "From /qa-perf-measure, vc-perf's sibling for deployed environments — it counts dependency calls instead of timing them, because counts transfer across environments and latency does not.", 1.85, 6.4);

  bullets(s, [
    { b: "Paired controls, same window", t: "a positive and a negative control fire alongside the real measurement. That is what makes a null result mean \"no change\" instead of \"dead instrument\".", h: 0.84 },
    { b: "The fix worked; browsing was untouched", t: "four identical searches collapsed to one, and catalog browsing did not move, because its redundancy is a different shape.", h: 0.68 },
    { b: "The residual scales", t: "one Elasticsearch search per variation-bearing product on the page. Slope ≈ 1.0, and every measured value landed inside its independently predicted set across all ten cells.", h: 0.84 },
    { b: "The lever is batching", t: "not deduplication. Filed as its own ticket with the measurement attached.", h: 0.5 },
  ], { x: M, y: 3.0, w: 6.4 });

  terminal(s, {
    x: 7.5, y: 2.0, w: 5.1, h: 3.95, title: "dependency calls per request",
    lines: [
      [{ t: "A/B across the dedup seam · same windows", c: C.tDim }],
      [],
      [{ t: "  positive control", c: C.tGreen }, { t: "  4 → " }, { t: "1", c: C.tGreen, b: true }, { t: "  −75% · fix works", c: C.tDim }],
      [{ t: "  negative control", c: C.tDim }, { t: "  4 → 4  " }, { t: "untouched, by design", c: C.tDim }],
      [{ t: "  PLP · PDP · search", c: C.tDim }, { t: "  unchanged — a real null", c: C.tDim }],
      [],
      [{ t: "vary page size, hold all else fixed", c: C.tDim }],
      [{ t: "  first:  4   8  12  16  20" }],
      [{ t: "  calls:  1   2   4   6   8   " }, { t: "slope ≈ 1.0", c: C.tWarn }],
      [],
      [{ t: "N+1 ", c: C.tRed, b: true }, { t: "one ES search per variation product", c: C.tDim }],
      [{ t: "  → batch it, don't dedup it", c: C.tBlue }],
    ],
  });
  s.addNotes(
    "Why the perf work earns its place — real numbers, this sprint. Be precise about attribution: this came from " +
    "/qa-perf-measure, the sibling skill for DEPLOYED environments, not from the plugin itself; same discipline, " +
    "different instrument. Two things to land: paired controls in the same window are what make a null result " +
    "trustworthy, and the residual scaling at slope 1.0 is what proves it's an N+1 rather than a guess. If asked " +
    "how confident: every measured value fell inside its predicted set across all ten cells."
  );
}

/* =======================================================================
   SLIDE 7 — section two divider
   ======================================================================= */
{
  const s = newSlide({ tint: "agent" });
  s.addShape(pptx.ShapeType.rect, {
    x: 7.6, y: 0, w: 5.73, h: 3.4, fill: { color: C.agentSoft }, line: { type: "none" },
  });
  s.addText("SECTION TWO", {
    x: M, y: 2.15, w: W, h: 0.3, fontSize: 10, color: C.textFaint, fontFace: MONO, bold: true, charSpacing: 2.4,
  });
  s.addText("The agentic\nQA project", {
    x: M, y: 2.5, w: 8.4, h: 1.7, fontSize: 42, color: C.text, fontFace: SANS, bold: true,
    valign: "top", lineSpacingMultiple: 1.02,
  });
  s.addText(
    "The pipeline we run against the live product. This sprint it learned to spend effort in proportion to risk, " +
    "to verify itself at the moments that matter, and to keep its own oracles true.",
    { x: M, y: 4.3, w: 7.6, h: 0.8, fontSize: 13, color: C.textSoft, fontFace: SANS, valign: "top", lineSpacingMultiple: 1.25 }
  );
  ["/qa-test — reworked", "two-axis routing", "three hard-STOP gates", "/qa-review-oracles", "BL + ECL"]
    .forEach((t, i, arr) => {
      const widths = arr.map((s2) => 0.16 + s2.length * 0.075);
      const x = M + widths.slice(0, i).reduce((a, b) => a + b + 0.12, 0);
      s.addShape(pptx.ShapeType.roundRect, {
        x, y: 5.3, w: widths[i], h: 0.34, rectRadius: 0.05,
        fill: { color: C.card }, line: { color: C.line, width: 0.5 },
      });
      s.addText(t, { x, y: 5.3, w: widths[i], h: 0.34, fontSize: 9, color: C.textSoft, fontFace: MONO, align: "center", valign: "middle" });
    });
  s.addNotes(
    "Section-two divider — the internal pipeline. Reset context: 'this is how WE test, day to day.' The colour " +
    "shifts to indigo. Read the rail as the menu for the rest of the deck."
  );
}

/* =======================================================================
   SLIDE 8 — /qa-test routing
   ======================================================================= */
{
  const s = newSlide({ tint: "agent" });
  eyebrow(s, "Agentic project · The pipeline", "agent");
  heading(s, "/qa-test decides twice before it does anything.");
  lead(s, "One ticket in, and the first step answers two separate questions — which flow this even is, and how much depth it deserves.", 1.85, 6.4);

  bullets(s, [
    { b: "Axis 1 — the flow", t: "by ticket type × status. A fix-ready Bug is a verification, not a feature test, so it runs RED→GREEN inline instead of going through authoring and promotion machinery it doesn't need.", h: 0.86 },
    { b: "Axis 2 — the path", t: "FAST for a P2–P3 single-layer change; FULL for a Story, a P0–P1, anything cross-layer or revenue-critical.", h: 0.68 },
    { b: "The tie-break is written down", t: "when in doubt, FULL. The cost of over-testing a small ticket is hours; the cost of under-testing a checkout change is a release.", h: 0.68 },
    { b: "Epic-aware", t: "a story picks up integration coverage against Done siblings; --epic runs the children in series with a cross-story E2E and an Epic-level go/no-go.", h: 0.68 },
  ], { x: M, y: 2.9, w: 6.4, tint: "agent" });

  terminal(s, {
    x: 7.5, y: 1.95, w: 5.1, h: 4.0, title: "Step 1a — routing",
    lines: [
      [{ t: "TICKET", c: C.tWhite, b: true }],
      [{ t: "  │" }],
      [{ t: "  ├─ " }, { t: "axis 1 · FLOW", c: C.tBlue }, { t: "  type × status", c: C.tDim }],
      [{ t: "  │    fix-ready Bug  → " }, { t: "/qa-verify-fix", c: C.tGreen }],
      [{ t: "  │    hotfix Bug     → " }, { t: "/qa-hotfix-check", c: C.tGreen }],
      [{ t: "  │    Sub-task       → " }, { t: "inherit parent", c: C.tDim }],
      [{ t: "  │    everything else→ " }, { t: "feature-test", c: C.tWhite }],
      [{ t: "  │" }],
      [{ t: "  └─ " }, { t: "axis 2 · PATH", c: C.tBlue }, { t: "  feature-test only", c: C.tDim }],
      [{ t: "       " }, { t: "FAST", c: C.tWarn, b: true }, { t: "  P2–P3 · 1 layer · 1 domain" }],
      [{ t: "       " }, { t: "FULL", c: C.tGreen, b: true }, { t: "  Story · P0–P1 · cross-layer" }],
      [],
      [{ t: "       when in doubt → ", c: C.tDim }, { t: "FULL", c: C.tGreen, b: true }],
    ],
  });
  s.addNotes(
    "The mechanism. Keep it tight — the value slide is next and that's the one that matters. The single best " +
    "line: 'a fix-ready bug is a VERIFICATION, not a feature test' — we were doing authoring and promotion work " +
    "for tickets that needed neither. Point at the diagram rather than reading the bullets. End on the " +
    "tie-break: when in doubt, FULL."
  );
}

/* =======================================================================
   SLIDE 9 — /qa-test schema (steps × owner / goal / gate → outputs)
   ======================================================================= */
{
  const s = newSlide({ tint: "agent" });
  eyebrow(s, "Agentic project · The flow", "agent");
  heading(s, "Five steps, five owners, one verdict.");

  const LBW = 0.78, GAP = 0.14;
  const colW = (W - LBW - GAP * 5) / 5;
  const colX = (i) => M + LBW + GAP + i * (colW + GAP);

  const rowLabel = (text, y, h) =>
    s.addText(text.toUpperCase(), {
      x: M, y, w: LBW - 0.06, h,
      fontSize: 7.5, color: C.textFaint, fontFace: MONO, bold: true,
      charSpacing: 1.3, align: "right", valign: "middle",
    });

  const STEPS = ["Context", "Plan", "Author", "Execute", "Report"];
  const OWNERS = ["orchestrator\n+ BA agents", "orchestrator", "test-management\nspecialist",
                  "qa-frontend /\nqa-backend", "orchestrator\n+ specialists"];
  const GOALS = ["Know what we're testing, and how deep", "Decide who tests what",
                 "Cases exist, data is seeded", "Evidence for every condition",
                 "Verdict, and what happens next"];
  const GATES = [["INLINE", null], ["INLINE", null], ["HARD STOP", "fresh verifier"],
                 ["INLINE", null], ["HARD STOP ×2", "verdict · promotion"]];

  // row 1 — step heads, with connectors between them
  const yHead = 2.42, hHead = 0.78;
  STEPS.forEach((nm, i) => {
    const x = colX(i);
    s.addShape(pptx.ShapeType.roundRect, {
      x, y: yHead, w: colW, h: hHead, rectRadius: 0.06,
      fill: { color: C.card }, line: { color: C.line, width: 0.5 },
    });
    s.addShape(pptx.ShapeType.ellipse, {
      x: x + colW / 2 - 0.115, y: yHead + 0.1, w: 0.23, h: 0.23,
      fill: { color: C.agent }, line: { type: "none" },
    });
    s.addText(String(i + 1), {
      x: x + colW / 2 - 0.115, y: yHead + 0.1, w: 0.23, h: 0.23,
      fontSize: 9, color: "FFFFFF", fontFace: MONO, bold: true, align: "center", valign: "middle",
    });
    s.addText(nm, {
      x, y: yHead + 0.4, w: colW, h: 0.3,
      fontSize: 12, color: C.text, fontFace: SANS, bold: true, align: "center", valign: "middle",
    });
    if (i < STEPS.length - 1) {
      s.addShape(pptx.ShapeType.line, {
        x: x + colW, y: yHead + 0.215, w: GAP, h: 0,
        line: { color: C.line, width: 1 },
      });
    }
  });

  // row 2 — owner
  const yOwn = 3.34, hOwn = 0.56;
  rowLabel("Owner", yOwn, hOwn);
  OWNERS.forEach((o, i) => {
    s.addShape(pptx.ShapeType.roundRect, {
      x: colX(i), y: yOwn, w: colW, h: hOwn, rectRadius: 0.05,
      fill: { color: C.card }, line: { color: C.line, width: 0.5 },
    });
    s.addText(o, {
      x: colX(i), y: yOwn, w: colW, h: hOwn,
      fontSize: 8.5, color: C.text, fontFace: MONO, bold: true,
      align: "center", valign: "middle", lineSpacingMultiple: 1.14,
    });
  });

  // row 3 — goal
  const yGoal = 4.02, hGoal = 0.66;
  rowLabel("Goal", yGoal, hGoal);
  GOALS.forEach((g, i) => {
    s.addShape(pptx.ShapeType.roundRect, {
      x: colX(i), y: yGoal, w: colW, h: hGoal, rectRadius: 0.05,
      fill: { color: C.card }, line: { color: C.line, width: 0.5 },
    });
    s.addText(g, {
      x: colX(i) + 0.06, y: yGoal, w: colW - 0.12, h: hGoal,
      fontSize: 9, color: C.text, fontFace: SANS,
      align: "center", valign: "middle", lineSpacingMultiple: 1.12,
    });
  });

  // row 4 — gate
  const yGate = 4.8, hGate = 0.56;
  rowLabel("Gate", yGate, hGate);
  GATES.forEach(([g, sub], i) => {
    const hard = !!sub;
    s.addShape(pptx.ShapeType.roundRect, {
      x: colX(i), y: yGate, w: colW, h: hGate, rectRadius: 0.05,
      fill: { color: hard ? C.agent : C.surface },
      line: { color: hard ? C.agent : C.line, width: 0.5, dashType: hard ? "solid" : "dash" },
    });
    const runs = [{ text: g, options: { color: hard ? "FFFFFF" : C.textFaint, bold: true, fontFace: MONO, fontSize: 9 } }];
    if (sub) runs.push({ text: "\n" + sub, options: { color: "FFFFFF", fontFace: SANS, fontSize: 7.5, bold: true } });
    s.addText(runs, {
      x: colX(i), y: yGate, w: colW, h: hGate,
      align: "center", valign: "middle", lineSpacingMultiple: 1.18,
    });
  });

  // ends-with strip
  const yEnd = 5.56, hEnd = 1.0;
  s.addShape(pptx.ShapeType.roundRect, {
    x: M, y: yEnd, w: W, h: hEnd, rectRadius: 0.06,
    fill: { color: C.card }, line: { color: C.line, width: 0.5 },
  });
  s.addShape(pptx.ShapeType.rect, {
    x: M, y: yEnd + 0.05, w: 0.05, h: hEnd - 0.1, fill: { color: C.pass }, line: { type: "none" },
  });
  s.addText("ENDS WITH", {
    x: M + 0.22, y: yEnd, w: 1.1, h: hEnd,
    fontSize: 8, color: C.pass, fontFace: MONO, bold: true, charSpacing: 1.4, valign: "middle",
  });

  const OUT = [
    ["Verdict", " — pass / fail / blocked", false],
    ["GO / NO-GO", " recommendation", false],
    ["Bugs filed", " as sub-tasks", false],
    ["Cases promoted", " in the suites", false],
    ["Ticket status", " moved", false],
    ["Human", " merges & releases", true],
  ];
  let ox = M + 1.45, oy = yEnd + 0.16;
  OUT.forEach(([b, t, human]) => {
    const w = 0.3 + (b.length + t.length) * 0.062;
    if (ox + w > M + W - 0.15) { ox = M + 1.45; oy += 0.42; }
    s.addShape(pptx.ShapeType.roundRect, {
      x: ox, y: oy, w, h: 0.34, rectRadius: 0.04,
      fill: { color: human ? "FDF7EA" : C.surface },
      line: { color: human ? C.warn : C.line, width: 0.5 },
    });
    s.addText(
      [{ text: b, options: { bold: true, color: human ? C.warn : C.pass } },
       { text: t, options: { color: C.text } }],
      { x: ox + 0.08, y: oy, w: w - 0.16, h: 0.34, fontSize: 9, fontFace: SANS, align: "center", valign: "middle" }
    );
    ox += w + 0.1;
  });

  s.addNotes(
    "THE SCHEMA — read it as a table, don't narrate every cell. Three passes, in this order: across the top, " +
    "five steps; down the OWNER row, note that every step has exactly one accountable owner and only Step 1 " +
    "pulls in the BA agents; down the GATE row, note that three of the five are cheap inline checks and only two " +
    "buy an independent verifier. The 'ends with' strip is what a stakeholder actually receives — and the amber " +
    "chip is the boundary: the pipeline stops at a recommendation, a human merges and releases. If someone asks " +
    "why Step 5 has two hard stops: one guards the verdict before it's filed, the other guards promotion after " +
    "the close-out."
  );
}

/* =======================================================================
   SLIDE 10 — /qa-test value
   ======================================================================= */
{
  const s = newSlide({ tint: "agent" });
  eyebrow(s, "Agentic project · What it's worth", "agent");
  heading(s, "What actually changed for whoever runs it.");
  lead(s, "Five things that used to cost a person time, a hand-off, or a judgement call they shouldn't have had to make.", 1.8, 10.4);

  const rows = [
    ["Every ticket got the same heavyweight treatment — a copy tweak cost what a checkout feature cost.",
     "Effort tracks risk.", " FAST skips the BA-context and story-review agents, authors minimally, runs one execution agent, self-checks inline."],
    ["A fix-ready Bug was re-tested as though it were a new feature, authoring cases nobody needed.",
     "A bug fix is a verification.", " Routed straight to RED→GREEN inline — the right job, at a fraction of the work."],
    ["New cases landed in a run-scoped CSV and waited for a separate promotion pass to reach the real suites.",
     "One pipeline, one promoter.", " Cases go straight into the suites as Draft, are executed by the run that wrote them, and promote in-run only if green."],
    ["A red run was a list of failures somebody had to interpret from scratch.",
     "A red run is an action list.", " Step 5a triages its own FAILs through /qa-triage-results --fix — real bug vs test defect vs flake."],
    ["Test → fix → re-test was three manual invocations with a deploy wedged in the middle.",
     "--iterate closes the loop.", " Bounded at 2 rounds, confirming every prerelease deploy. Merge and release stay human."],
  ];

  let y = 2.62;
  const rh = 0.82;
  s.addShape(pptx.ShapeType.line, { x: M, y: y - 0.1, w: W, h: 0, line: { color: C.line, width: 0.75 } });
  rows.forEach(([was, nowB, nowT]) => {
    s.addText("BEFORE", { x: M, y, w: 1.2, h: 0.18, fontSize: 7.5, color: C.textFaint, fontFace: MONO, bold: true, charSpacing: 1.4 });
    s.addText(was, { x: M, y: y + 0.2, w: 5.0, h: rh - 0.24, fontSize: 9.5, color: C.textFaint, fontFace: SANS, valign: "top", lineSpacingMultiple: 1.16 });

    s.addText("NOW", { x: M + 5.35, y, w: 1.2, h: 0.18, fontSize: 7.5, color: C.agent, fontFace: MONO, bold: true, charSpacing: 1.4 });
    s.addText(
      [{ text: nowB, options: { bold: true, color: C.text } }, { text: nowT, options: { color: C.text } }],
      { x: M + 5.35, y: y + 0.2, w: W - 5.35, h: rh - 0.24, fontSize: 10, fontFace: SANS, valign: "top", lineSpacingMultiple: 1.16 }
    );

    y += rh;
    s.addShape(pptx.ShapeType.line, { x: M, y: y - 0.1, w: W, h: 0, line: { color: C.line, width: 0.75 } });
  });
  s.addNotes(
    "THE VALUE SLIDE — the most important one in section two. Work down the before/after rows; each is a real " +
    "cost that went away. If you only have time for two: 'effort tracks risk' and 'one pipeline, one promoter' " +
    "(cases now reach the real suites in the same run that authored them, and get reverted if they don't earn " +
    "promotion). Close on --iterate, and stress that merge and release are still human."
  );
}

/* =======================================================================
   SLIDE 10 — the gates
   ======================================================================= */
{
  const s = newSlide({ tint: "agent" });
  eyebrow(s, "Agentic project · The new gates", "agent");
  heading(s, "Two kinds of gate, and the difference is the point.");
  lead(s, "One kind needs judgement, so we buy independence. The other needs none, so we make it deterministic and unarguable.", 1.85, 10.4);

  const lw = 6.3, rw = W - lw - 0.4, rx = M + lw + 0.4;

  s.addText("JUDGEMENT · THREE HARD STOPS · FULL PATH", {
    x: M, y: 2.72, w: lw, h: 0.2, fontSize: 8, color: C.textFaint, fontFace: MONO, bold: true, charSpacing: 1.5,
  });
  s.addText("A fresh verifier, never the doer", {
    x: M, y: 2.95, w: lw, h: 0.28, fontSize: 13, color: C.text, fontFace: SANS, bold: true,
  });
  const gates = [
    ["Step 3", "Artifacts reviewed & data seeded", " — before a single test runs."],
    ["Step 5b", "Triage + AC/DoD vs implementation", " — with a quantified coverage estimate, before any verdict is filed."],
    ["Step 5g", "Promotion sound", " — runs last and non-blocking, after the verdict and the close-out."],
  ];
  let gy = 3.32;
  gates.forEach(([k, t, d]) => {
    const h = 0.52;
    s.addShape(pptx.ShapeType.roundRect, {
      x: M, y: gy, w: lw, h, rectRadius: 0.05, fill: { color: C.card }, line: { color: C.line, width: 0.5 },
    });
    s.addText(
      [{ text: k + "   ", options: { color: C.agent, bold: true, fontFace: MONO } },
       { text: t, options: { color: C.text, bold: true } },
       { text: d, options: { color: C.textSoft } }],
      { x: M + 0.2, y: gy + 0.06, w: lw - 0.4, h: h - 0.12, fontSize: 9.5, fontFace: SANS, valign: "middle", lineSpacingMultiple: 1.1 }
    );
    gy += h + 0.14;
  });
  callout(s, {
    x: M, y: gy + 0.06, w: lw, h: 0.86, tint: "agent",
    text: "A fresh orchestrator instance re-derives the evidence from source — re-runs the lints, re-opens the artifacts, and delegates a live re-check on a different browser lane than the doer used. REJECT → reason + fix → re-verify once, then STOP.",
  });

  s.addText("DETERMINISTIC · NO JUDGEMENT REQUIRED", {
    x: rx, y: 2.72, w: rw, h: 0.2, fontSize: 8, color: C.textFaint, fontFace: MONO, bold: true, charSpacing: 1.5,
  });
  s.addText("Lints that simply refuse", {
    x: rx, y: 2.95, w: rw, h: 0.28, fontSize: 13, color: C.text, fontFace: SANS, bold: true,
  });
  const lints = [
    ["ECL", "Citation gate", " — every edge-case reference in every suite must resolve."],
    ["IDs", "Globally unique case IDs", " — hard-fails on a collision, across every CSV on disk."],
    ["CSV", "Declared-but-missing suite", " — hard-fails, so a selection can never silently run zero cases."],
    ["TRI", "Stamp staleness", " — flags assertions whose last audit has aged out."],
  ];
  let ly = 3.32;
  lints.forEach(([k, t, d]) => {
    const h = 0.6;
    s.addShape(pptx.ShapeType.roundRect, {
      x: rx, y: ly, w: rw, h, rectRadius: 0.05, fill: { color: C.card }, line: { color: C.line, width: 0.5 },
    });
    s.addText(
      [{ text: k + "   ", options: { color: C.accentInk, bold: true, fontFace: MONO } },
       { text: t, options: { color: C.text, bold: true } },
       { text: d, options: { color: C.textSoft } }],
      { x: rx + 0.2, y: ly + 0.06, w: rw - 0.4, h: h - 0.12, fontSize: 9.5, fontFace: SANS, valign: "middle", lineSpacingMultiple: 1.1 }
    );
    ly += h + 0.14;
  });
  s.addNotes(
    "The gates. The framing IS the content: judgement gates buy independence, deterministic gates buy certainty — " +
    "don't mix them up. Left column: the verifier is a FRESH instance, never the step's own doer, and it re-checks " +
    "live on a DIFFERENT browser lane. One re-verify round, then stop — it can't loop forever. Right column: four " +
    "lints that simply refuse. The 'declared-but-missing suite' one is worth a sentence — that's how a selection " +
    "could silently run zero cases."
  );
}

/* =======================================================================
   SLIDE 11 — BL + ECL
   ======================================================================= */
{
  const s = newSlide({ tint: "agent" });
  eyebrow(s, "Agentic project · Oracle review", "agent");
  heading(s, "Our oracles now prove themselves against reality.");
  lead(s, "/qa-review-oracles — one skill, two axes. The business-rules audit and the edge-case library shared their entire mechanism, so they became one thing with two entry points.", 1.85, 6.4);

  bullets(s, [
    { b: "Three independent axes", t: "documentation, live behaviour, and platform source, gathered per entry and compared.", h: 0.52 },
    { b: "Auto-apply on evidence, not approval", t: "a confirmed correction is written straight to the oracle; contradictory or ungrounded ones become a proposal a human reads.", h: 0.68 },
    { b: "IDs are a citation contract", t: "never renumber a surviving entry. Renumbering silently repoints every correct citation, and no gate could detect it.", h: 0.68 },
    { b: "Parallel, but a single writer", t: "fans out across up to three analysts each with their own browser lane, then applies serially. It never edits a test CSV.", h: 0.68 },
  ], { x: M, y: 3.0, w: 6.4, tint: "agent" });

  callout(s, {
    x: M, y: 5.75, w: 6.4, h: 0.82, tint: "agent",
    text: "The ECL axis had never had a gate at all. Its first run found 20 dangling references cited by ~65 cases across 7 suites — including one id that had never existed.",
  });

  terminal(s, {
    x: 7.5, y: 2.0, w: 5.1, h: 3.8, title: "/qa-review-oracles all",
    lines: [
      [{ t: "➜ ", c: C.tTeal }, { t: "/qa-review-oracles all cart", c: C.tWhite, b: true }],
      [{ t: "axes: docs · live · source", c: C.tDim }],
      [],
      [{ t: "  entry  " }, { t: "CONFIRMED", c: C.tGreen, b: true }, { t: "  all three agree", c: C.tDim }],
      [{ t: "  entry  " }, { t: "DRIFT", c: C.tWarn, b: true }, { t: " → " }, { t: "auto-applied", c: C.tGreen }],
      [{ t: "     docs + source moved the rule", c: C.tDim }],
      [{ t: "  entry  " }, { t: "MISSING", c: C.tBlue }, { t: " → added" }],
      [{ t: "  entry  " }, { t: "CONTRADICTORY", c: C.tWarn }],
      [{ t: "     → proposal, a human decides", c: C.tDim }],
      [],
      [{ t: "oracle updated · audit trail written ", c: C.tDim }, { t: "✓", c: C.tGreen }],
      [{ t: "citation remap → /qa-review-tests --fix", c: C.tDim }],
    ],
  });
  s.addNotes(
    "Oracle review. Lead with the merge rationale (two audits, one mechanism) then the evidence in the callout: " +
    "the ECL axis had no gate at ALL, and its first run found 20 dangling references across ~65 cases. The " +
    "citation-contract rule is the subtle one — renumbering a surviving entry silently repoints every " +
    "previously-correct citation, and no gate can detect that, which is why it's forbidden rather than checked. " +
    "If someone asks whether it can be wrong: yes — the gate proves a reference EXISTS, not that it's the RIGHT " +
    "one; that call stays with the review skill."
  );
}

/* =======================================================================
   SLIDE 12 — close
   ======================================================================= */
{
  const s = newSlide();
  eyebrow(s, "Where that leaves us");
  heading(s, "A plugin we can hand over, and a pipeline that spends\neffort where it matters.", 0.92, 26);

  const cw = (W - 0.6) / 3, ch = 2.25;
  const items = [
    [C.accent, "The marketplace", "Two products, not one",
     "vc-fix is trustworthy enough to leave running on someone else's stack, and vc-perf gives performance work an instrument instead of an opinion."],
    [C.agent, "The pipeline", "Proportionate by default",
     "Effort tracks risk, a bug fix is verified rather than re-tested, and new cases reach the real suites in the same run that wrote them."],
    [C.pass, "The principle", "Independent where it counts",
     "Judgement gates buy a second opinion from someone who wasn't involved; everything else is deterministic. Merge and release stay human."],
  ];
  items.forEach(([rail, k, t, b], i) => {
    card(s, { x: M + i * (cw + 0.3), y: 2.75, w: cw, h: ch, rail, kicker: k, title: t, body: b });
  });

  s.addText("Thank you  ·  questions & live demo", {
    x: M, y: 5.55, w: W, h: 0.4, fontSize: 12, color: C.textSoft, fontFace: MONO, align: "center",
  });
  s.addNotes(
    "Close on the three cards, mapped to the two sections. Marketplace: two products now, one of them handable " +
    "to a customer. Pipeline: proportionate by default. Principle: independent where it counts, deterministic " +
    "everywhere else, and merge stays human. Then open for questions and offer the live vc-perf demo."
  );
}

await pptx.writeFile({ fileName: OUT });
console.log(`Wrote ${OUT} (${slideNo} slides)`);
