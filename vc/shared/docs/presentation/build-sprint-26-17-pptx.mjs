/**
 * Builds sprint-demo26-17.pptx from the same content as sprint-demo26-17.html.
 *
 * The HTML deck stays the source of truth for wording; this script mirrors it into
 * PowerPoint for people who want the file rather than a browser. Palette, slide order,
 * and presenter notes are kept in sync by hand — if you edit the HTML, edit here too.
 *
 * The three diagrams (value chain, FAST/FULL rail, lane routing) are drawn with NATIVE
 * PowerPoint shapes rather than exported images, so they stay editable in the file and
 * survive a theme change. Same reason the HTML draws them as inline SVG.
 *
 * Run:  node vc/shared/docs/presentation/build-sprint-26-17-pptx.mjs
 */
import PptxGenJS from "pptxgenjs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "sprint-demo26-17.pptx");

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
};

const SANS = "Segoe UI";
const MONO = "Consolas";

const pptx = new PptxGenJS();
pptx.defineLayout({ name: "WIDE", width: 13.33, height: 7.5 });
pptx.layout = "WIDE";
pptx.author = "Virto Commerce QA Engineering";
pptx.company = "Virto Commerce";
pptx.subject = "Sprint 26-17 — Agentic QA";
pptx.title = "Sprint 26-17 Demo — Agentic QA";

const M = 0.72;              // left margin
const W = 13.33 - M * 2;     // content width

let slideNo = 0;
const TOTAL = 14;

/* ---------- shared chrome ---------- */

function newSlide({ tint = null } = {}) {
  const s = pptx.addSlide();
  s.background = { color: C.surface };
  slideNo += 1;

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
    x: x + 0.28, y: cy, w: w - 0.5, h: h - (cy - y) - (blind ? 0.86 : 0.2),
    fontSize: 9.5, color: C.textSoft, fontFace: SANS, valign: "top", lineSpacingMultiple: 1.18,
  });

  if (blind) {
    const by = y + h - 0.78;
    s.addShape(pptx.ShapeType.line, {
      x: x + 0.28, y: by, w: w - 0.56, h: 0,
      line: { color: C.line, width: 0.75, dashType: "dash" },
    });
    s.addText(blind.label.toUpperCase(), {
      x: x + 0.28, y: by + 0.06, w: w - 0.5, h: 0.18,
      fontSize: 7.5, color: C.textFaint, fontFace: MONO, bold: true, charSpacing: 1.2,
    });
    s.addText(blind.text, {
      x: x + 0.28, y: by + 0.26, w: w - 0.5, h: 0.5,
      fontSize: 8.5, color: C.crit, fontFace: MONO, valign: "top", lineSpacingMultiple: 1.12,
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

function chips(s, list, y, tint = null) {
  list.forEach((t, i, arr) => {
    const widths = arr.map((s2) => 0.2 + s2.length * 0.072);
    const x = M + widths.slice(0, i).reduce((a, b) => a + b + 0.12, 0);
    s.addShape(pptx.ShapeType.roundRect, {
      x, y, w: widths[i], h: 0.34, rectRadius: 0.05,
      fill: { color: tint === "agent" ? C.agentSoft : C.card },
      line: { color: tint === "agent" ? C.agent : C.line, width: 0.5 },
    });
    s.addText(t, {
      x, y, w: widths[i], h: 0.34, fontSize: 9,
      color: tint === "agent" ? C.agent : C.textSoft,
      fontFace: MONO, align: "center", valign: "middle",
    });
  });
}

/* a plain node used by all three diagrams */
function node(s, { x, y, w, h, title, sub, fill = C.card, stroke = C.line, dash = null, titleSize = 10.5 }) {
  s.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.05,
    fill: { color: fill },
    line: { color: stroke, width: dash ? 0.9 : 0.75, dashType: dash || "solid" },
  });
  s.addText(title, {
    x, y: y + (sub ? 0.09 : 0.02), w, h: 0.26,
    fontSize: titleSize, color: C.text, fontFace: SANS, bold: true, align: "center", valign: "middle",
  });
  if (sub) {
    s.addText(sub, {
      x, y: y + 0.32, w, h: 0.22,
      fontSize: 8, color: C.textFaint, fontFace: MONO, align: "center", valign: "middle",
    });
  }
}

function arrow(s, { x, y, w, h = 0, color = C.textFaint, dash = null }) {
  s.addShape(pptx.ShapeType.line, {
    x, y, w, h,
    line: { color, width: 1, dashType: dash || "solid", endArrowType: "triangle" },
  });
}

function microLabel(s, text, { x, y, w, align = "center", color = C.textFaint, size = 7.5 }) {
  s.addText(text, { x, y, w, h: 0.18, fontSize: size, color, fontFace: MONO, align, valign: "middle" });
}

/* =======================================================================
   SLIDE 1 — title
   ======================================================================= */
{
  const s = newSlide();
  eyebrow(s, "Sprint 26-17 · Agentic QA");
  s.addText("The pipeline learned what to\nlook at, before it looks.", {
    x: M, y: 1.15, w: W, h: 1.7,
    fontSize: 42, color: C.text, fontFace: SANS, bold: true, valign: "top",
    lineSpacingMultiple: 1.02,
  });
  s.addText(
    "Last sprint the marketplace gained a second plugin. This sprint the internal pipeline gained a memory " +
    "and a set of eyes: it reads what already exists, names the mechanism under test before it writes a " +
    "single case, and checks four things about the change that nothing was checking at all.",
    { x: M, y: 3.0, w: 9.4, h: 0.95, fontSize: 13.5, color: C.textSoft, fontFace: SANS,
      valign: "top", lineSpacingMultiple: 1.25 }
  );

  const stats = [["26", "PRS MERGED"], ["5", "PRE-FLIGHT AXES"], ["2", "PATHS, SHARPLY SPLIT"], ["3", "VERIFIER GATES"]];
  s.addShape(pptx.ShapeType.line, { x: M, y: 4.25, w: W, h: 0, line: { color: C.line, width: 0.75 } });
  s.addShape(pptx.ShapeType.line, { x: M, y: 5.25, w: W, h: 0, line: { color: C.line, width: 0.75 } });
  stats.forEach(([n, k], i) => {
    const x = M + i * 2.9;
    s.addText(n, { x, y: 4.42, w: 2.7, h: 0.42, fontSize: 22, color: C.text, fontFace: MONO, bold: true, valign: "top" });
    s.addText(k, { x, y: 4.86, w: 2.7, h: 0.24, fontSize: 8, color: C.textFaint, fontFace: MONO, bold: true, charSpacing: 1.6 });
    if (i < stats.length - 1) {
      s.addShape(pptx.ShapeType.line, { x: x + 2.66, y: 4.38, w: 0, h: 0.78, line: { color: C.line, width: 0.75 } });
    }
  });

  s.addText(
    "Running order:  why the corpus measured the wrong thing  →  the fault model and the five axes  →  the machinery underneath  →  questions.",
    { x: M, y: 5.55, w: W, h: 0.3, fontSize: 10.5, color: C.textSoft, fontFace: MONO }
  );
  s.addNotes(
    "Open here, 30 seconds. One line of framing: 'last sprint we shipped a second plugin to customers; this " +
    "sprint we fixed how we ourselves decide what to test.' Read the four numbers, give the running order, " +
    "move on. Do NOT start explaining the axes here — slide 6 does that."
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
  s.addText("/qa-test grew up", {
    x: M, y: 2.5, w: 8.4, h: 1.0, fontSize: 42, color: C.text, fontFace: SANS, bold: true,
    valign: "top", lineSpacingMultiple: 1.02,
  });
  s.addText(
    "Six PRs on one command. It stopped being a script that walks screens and became a pipeline that names " +
    "a mechanism, derives what to check, and spends effort in proportion to what is actually at risk.",
    { x: M, y: 3.85, w: 8.2, h: 0.8, fontSize: 13, color: C.textSoft, fontFace: SANS, valign: "top", lineSpacingMultiple: 1.25 }
  );
  chips(s, ["Step 1e — a fault model", "FAST restored", "5 derived axes", "discovery lane 3x", "--iterate round 2"], 5.1);
  s.addNotes(
    "Section-one divider. Pause so the room resets. The one thing to say out loud: six pull requests all " +
    "landed on ONE command, which is unusual and deliberate — /qa-test is where the cost of a bad decision " +
    "compounds, because every case the pipeline writes lives in the corpus forever."
  );
}

/* =======================================================================
   SLIDE 3 — the diagnosis
   ======================================================================= */
{
  const s = newSlide();
  eyebrow(s, "Why any of this");
  heading(s, "A suite can be well-written, strongly asserted, and\nunable to notice the feature is broken.", 0.92, 26);
  lead(s,
    "Loyalty Missions is the case that drove the whole sprint. Every case was individually defensible. " +
    "Collectively they tested the screens and never the mechanism.", 2.2, 10.6);

  const ev = [
    ["0", "orders placed by the storefront suite — for a feature whose entire premise is that placing an order makes progress."],
    ["11%", "coverage of the mechanism end to end: order → progress → completion → points credited."],
    ["1", "case on the last link — spending what the feature grants — written on the final day."],
    ["0", "BL-* invariants existed for the domain, so the corpus recorded behaviour instead of judging it."],
  ];
  const ew = (W - 0.45) / 4;
  ev.forEach(([n, t], i) => {
    const x = M + i * (ew + 0.15);
    s.addShape(pptx.ShapeType.roundRect, {
      x, y: 3.15, w: ew, h: 1.6, rectRadius: 0.06,
      fill: { color: C.card }, line: { color: C.line, width: 0.5 },
    });
    s.addText(n, {
      x: x + 0.22, y: 3.32, w: ew - 0.44, h: 0.46,
      fontSize: 24, color: C.crit, fontFace: MONO, bold: true, valign: "top",
    });
    s.addText(t, {
      x: x + 0.22, y: 3.84, w: ew - 0.44, h: 0.82,
      fontSize: 9, color: C.textSoft, fontFace: SANS, valign: "top", lineSpacingMultiple: 1.15,
    });
  });

  callout(s, {
    x: M, y: 5.05, w: W, h: 0.95,
    text: "And the ranker scored that suite STRONG. Assertion strength tells you whether a check can fail; " +
          "chain coverage tells you whether anyone cares if it does. Only the second one culls a case that tests nothing.",
  });
  s.addNotes(
    "THE MOST IMPORTANT SLIDE IN THE DECK. Do not rush it. Walk the four numbers left to right and let the " +
    "third one land — one case on the last link, written on the final day. Then the callout, which is the " +
    "whole thesis: the ranker called that suite STRONG, because assertion strength asks 'can this check fail' " +
    "and nothing was asking 'would anyone care'. If someone gets defensive, be explicit that no individual " +
    "author did anything wrong — every case was defensible; the method was what failed."
  );
}

/* =======================================================================
   SLIDE 4 — the fault model (value-chain diagram)
   ======================================================================= */
{
  const s = newSlide();
  eyebrow(s, "Step 1e · the fix");
  heading(s, "Name the chain first. Every other technique\nrefines a link that is already named.", 0.92, 26);
  lead(s,
    "EP, BVA, decision tables, state transitions, pairwise — all parameter-space techniques. None can name " +
    "a value chain, so run against an unnamed one they faithfully produce per-screen checks that pass while " +
    "the feature does not work.", 2.18, 11.2);

  // --- the chain ---
  const NW = 2.14, NH = 0.74, GAP = 0.3;
  const links = [
    ["Place an order", "trigger"],
    ["Progress accrues", "effect"],
    ["Balance persisted", "state"],
    ["Shown to the user", "surface"],
    ["Points spendable", "what it unlocks"],
  ];
  const edge = ["writes", "saves", "renders", "unlocks"];
  const NY = 3.72;
  const xs = links.map((_, i) => M + i * (NW + GAP));

  // the journey case, spanning every link
  microLabel(s, "Technique:FLOW — the [JOURNEY] case, authored first",
    { x: M, y: 3.16, w: 4.6, align: "l" });
  s.addShape(pptx.ShapeType.line, {
    x: xs[0] + NW / 2, y: 3.42, w: 0, h: 0.0,
    line: { color: C.accent, width: 1.5 },
  });
  s.addShape(pptx.ShapeType.line, {
    x: xs[0] + NW / 2, y: 3.42, w: xs[4] + NW / 2 - (xs[0] + NW / 2), h: 0,
    line: { color: C.accent, width: 1.5 },
  });
  s.addShape(pptx.ShapeType.line, {
    x: xs[4] + NW / 2, y: 3.42, w: 0, h: 0.26,
    line: { color: C.accent, width: 1.5, endArrowType: "triangle" },
  });

  links.forEach(([t, sub], i) => {
    const last = i === links.length - 1;
    node(s, {
      x: xs[i], y: NY, w: NW, h: NH, title: t, sub,
      fill: last ? C.accentSoft : C.card, stroke: last ? C.accent : C.line,
    });
    if (i < links.length - 1) {
      arrow(s, { x: xs[i] + NW + 0.03, y: NY + NH / 2, w: GAP - 0.06 });
      microLabel(s, edge[i], { x: xs[i] + NW - 0.15, y: NY + NH / 2 - 0.28, w: GAP + 0.3 });
    }
  });

  // where the cases actually landed, and where they did not
  s.addShape(pptx.ShapeType.line, {
    x: xs[0], y: NY + NH + 0.14, w: NW, h: 0, line: { color: C.textFaint, width: 0.75 },
  });
  s.addText("EP · BVA · DT · ST · PW\nrefine only THIS link", {
    x: xs[0], y: NY + NH + 0.2, w: NW, h: 0.42,
    fontSize: 8, color: C.textFaint, fontFace: MONO, align: "center", valign: "top", lineSpacingMultiple: 1.1,
  });
  s.addText("where the cases piled up", {
    x: xs[0], y: NY + NH + 0.64, w: NW, h: 0.24,
    fontSize: 9.5, color: C.text, fontFace: SANS, bold: true, align: "center",
  });

  s.addShape(pptx.ShapeType.line, {
    x: xs[4], y: NY + NH + 0.14, w: NW, h: 0,
    line: { color: C.crit, width: 0.75, dashType: "dash" },
  });
  s.addText("reached last,\nor not at all", {
    x: xs[4], y: NY + NH + 0.2, w: NW, h: 0.42,
    fontSize: 8, color: C.textFaint, fontFace: MONO, align: "center", valign: "top", lineSpacingMultiple: 1.1,
  });
  s.addText("the hole", {
    x: xs[4], y: NY + NH + 0.64, w: NW, h: 0.24,
    fontSize: 9.5, color: C.crit, fontFace: SANS, bold: true, align: "center",
  });

  s.addText(
    "Part 0 states the chain in the reader's own words, draws it, and publishes a variants × links matrix with no blank cells.",
    { x: M, y: 5.72, w: W, h: 0.24, fontSize: 8.5, color: C.textFaint, fontFace: MONO, align: "center" }
  );

  chips(s, ["condition space per link", "explicit N → M reduction",
            "cell · hypothesis · archetype · technique · oracle", "gated before a case exists"], 6.1, "agent");

  s.addNotes(
    "The fix. Point at the diagram rather than reading the bullets. Three passes: the chain along the middle, " +
    "the single accent arrow above it that is the journey case, then the two brackets underneath — cases piled " +
    "up under link one, nothing under link five. Then the killer line: EP, BVA, pairwise and the rest are " +
    "parameter-space techniques; they refine a link that has ALREADY been named, and none of them can name the " +
    "chain. If asked what enforces it: a planned row is rejected before authoring unless it names its " +
    "observable, the customer-visible failure, and why that failure is plausible here — a null-hypothesis " +
    "phrasing like 'could fail to render' is refused by name."
  );
}

/* =======================================================================
   SLIDE 5 — FAST vs FULL (pipeline rail with a bypass)
   ======================================================================= */
{
  const s = newSlide();
  eyebrow(s, "Step 1a · routing");
  heading(s, "FAST is a checklist and nothing else —\nthat promise is now literally true.", 0.92, 26);
  lead(s,
    "The old split dropped the two analysis agents and left everything expensive marked both paths, always. " +
    "Most recorded runs take FAST, so that is exactly where the cost was sitting.", 2.18, 10.8);

  const stages = [
    ["1a route", "flow + path", false],
    ["1b pre-flight", "5 axes", false],
    ["1c || 1d", "analysis", true],
    ["1e model", "fault model", true],
    ["3 · 3x", "author + explore", true],
    ["4 execute", "+ regression", false],
    ["5 close-out", "verdict + file", false],
    ["5g promote", "Draft → Automated", true],
  ];
  const SW = 1.4, SGAP = 0.14, SY = 4.0, SH = 0.7;
  const sx = stages.map((_, i) => M + i * (SW + SGAP));

  // the FAST bypass, drawn as the difference
  const fromX = sx[1] + SW / 2, toX = sx[5] + SW / 2;
  s.addShape(pptx.ShapeType.line, { x: fromX, y: 3.5, w: 0, h: 0.5, line: { color: C.accent, width: 1.75 } });
  s.addShape(pptx.ShapeType.line, { x: fromX, y: 3.5, w: toX - fromX, h: 0, line: { color: C.accent, width: 1.75 } });
  s.addShape(pptx.ShapeType.line, {
    x: toX, y: 3.5, w: 0, h: 0.44,
    line: { color: C.accent, width: 1.75, endArrowType: "triangle" },
  });
  s.addText("FAST skips all of this", {
    x: fromX, y: 3.18, w: toX - fromX, h: 0.26,
    fontSize: 10, color: C.accent, fontFace: MONO, bold: true, align: "center",
  });

  stages.forEach(([t, sub, fullOnly], i) => {
    node(s, {
      x: sx[i], y: SY, w: SW, h: SH, title: t, sub, titleSize: 9.5,
      fill: fullOnly ? C.agentSoft : C.card,
      stroke: fullOnly ? C.agent : C.line,
      dash: fullOnly ? "dash" : null,
    });
    if (i < stages.length - 1) arrow(s, { x: sx[i] + SW + 0.01, y: SY + SH / 2, w: SGAP - 0.02 });
  });

  // verifier gates
  [4, 6, 7].forEach((i) => {
    const cx = sx[i] + SW / 2;
    s.addShape(pptx.ShapeType.ellipse, {
      x: cx - 0.11, y: SY + SH + 0.08, w: 0.22, h: 0.22,
      fill: { color: C.agent }, line: { type: "none" },
    });
    s.addText("V", {
      x: cx - 0.11, y: SY + SH + 0.08, w: 0.22, h: 0.22,
      fontSize: 8, color: "FFFFFF", fontFace: MONO, bold: true, align: "center", valign: "middle",
    });
  });
  s.addText("V = a fresh verifier instance, never the step's own doer · FULL only · one re-verify round, then STOP", {
    x: M, y: SY + SH + 0.36, w: W, h: 0.22,
    fontSize: 8, color: C.textFaint, fontFace: MONO, align: "right",
  });

  s.addText(
    "FAST keeps the four shared stages and a committed checklist. Everything dashed is FULL-only — and a FAST " +
    "run therefore adds no regression coverage, which is why its checklist is now a file rather than terminal output.",
    { x: M, y: 5.32, w: W, h: 0.4, fontSize: 9, color: C.textFaint, fontFace: MONO, valign: "top", lineSpacingMultiple: 1.2 }
  );

  callout(s, {
    x: M, y: 5.85, w: W, h: 1.0,
    text: "Three axes were made OPT-IN ON FAST for the same reason. Each had been made mandatory on a locally " +
          "reasonable argument of identical shape, and together they had returned FAST to four-to-six agent " +
          "dispatches. Measured across the recorded runs: the visual axis blocked 1, the contract axis 1, " +
          "coverage triage 0. Arguments, not measurements — revisit at five.",
  });
  s.addNotes(
    "FAST vs FULL. The diagram is the argument — the accent arc IS the change. Say the measured part: most " +
    "recorded runs take FAST, so leaving the expensive work marked 'both paths, always' meant the split saved " +
    "nothing on the path everyone actually uses. Then the callout, which is the honest bit: we had made three " +
    "axes mandatory on FAST on arguments that all had the same shape, and when we measured them they had " +
    "blocked one run, one run, and zero. We reversed it. Revisit at five."
  );
}

/* =======================================================================
   SLIDE 6 — the five axes
   ======================================================================= */
{
  const s = newSlide();
  eyebrow(s, "Step 1b · pre-flight");
  heading(s, "Five things the pipeline now derives about a change — none of them asked.", 0.92, 26);
  lead(s,
    "Each was added the same way: a token, a gate, a record, a skill file. Generalising them into one contract " +
    "exposed the difference the shared boilerplate had been hiding.", 1.9, 11.0);

  const rows = [
    ["layer", "2b", "Which surface did this ticket move? It routes the release note and the documentation audience — a wrong answer reaches the wrong readers.", "fails CLOSED", C.crit],
    ["visual_surface", "2c", "Does this change something a human LOOKS AT? Dispatches a design and accessibility pass the pipeline previously did not have at all.", "fails open", C.pass],
    ["contract_surface", "2d", "Is the API contract we are about to read still current? It was read at four points and refreshed at none, and the fixture gate passes clean against any age of cache.", "fails open", C.pass],
    ["coverage_surface", "2e", "Which EXISTING rows does this change make wrong? The corpus had only ever been read for what it already covers.", "fails open", C.pass],
    ["data_surface", "2f", "Does this ticket need data that does not exist yet? The only axis that can REMOVE work rather than add it.", "subtracts only", C.agent],
  ];

  const HY = 2.72, RH = 0.66;
  s.addText("AXIS", { x: M, y: HY, w: 2.2, h: 0.24, fontSize: 8, color: C.textFaint, fontFace: MONO, bold: true, charSpacing: 1.6 });
  s.addText("THE QUESTION IT ANSWERS", { x: M + 2.4, y: HY, w: 7.6, h: 0.24, fontSize: 8, color: C.textFaint, fontFace: MONO, bold: true, charSpacing: 1.6 });
  s.addText("ON DOUBT", { x: M + 10.2, y: HY, w: 1.7, h: 0.24, fontSize: 8, color: C.textFaint, fontFace: MONO, bold: true, charSpacing: 1.6 });
  s.addShape(pptx.ShapeType.line, { x: M, y: HY + 0.28, w: W, h: 0, line: { color: C.line, width: 0.75 } });

  rows.forEach(([name, id, q, fate, fc], i) => {
    const y = HY + 0.38 + i * RH;
    s.addText(name, { x: M, y, w: 2.2, h: 0.24, fontSize: 10, color: C.text, fontFace: MONO, bold: true, valign: "top" });
    s.addText(id, { x: M, y: y + 0.22, w: 2.2, h: 0.2, fontSize: 8, color: C.textFaint, fontFace: SANS, bold: true, valign: "top" });
    s.addText(q, { x: M + 2.4, y, w: 7.6, h: RH - 0.1, fontSize: 9.5, color: C.textSoft, fontFace: SANS, valign: "top", lineSpacingMultiple: 1.15 });
    s.addText(fate, { x: M + 10.2, y, w: 1.7, h: 0.24, fontSize: 9, color: fc, fontFace: MONO, bold: true, valign: "top" });
    s.addShape(pptx.ShapeType.line, { x: M, y: y + RH - 0.08, w: W, h: 0, line: { color: C.line, width: 0.5 } });
  });

  callout(s, {
    x: M, y: HY + 0.44 + rows.length * RH, w: W, h: 0.72, tint: "agent",
    text: "The shared rule: derived, never asked, never defaulted — and always recorded with its sources, " +
          "because a null means the source was never consulted, which is a gap and not a zero.",
  });
  s.addNotes(
    "The five axes, as a table — read the column headings, then only the rows the room cares about. For " +
    "engineers: 2d, because a stale contract has no symptom of its own, it just manufactures cases that fail " +
    "later and get triaged as product defects. For leadership: 2e, which is the next slide anyway. The single " +
    "rule to say out loud is the bottom callout: derived, never asked, never defaulted. The operator is not a source."
  );
}

/* =======================================================================
   SLIDE 7 — coverage triage worked example
   ======================================================================= */
{
  const s = newSlide();
  eyebrow(s, "Axis 2e · worked example");
  heading(s, "A stale test case had exactly one way to be found:\nfail, and get triaged afterwards.", 0.92, 26);

  const LW = 5.6;
  s.addText("Three things compound so that it never even fails.", {
    x: M, y: 2.25, w: LW, h: 0.28, fontSize: 12.5, color: C.textSoft, fontFace: SANS,
  });
  const steps = [
    "Suite selection maps changed PATHS, and the mapping misses — it excluded the three suites the ticket was entirely about, then reported itself fully mapped.",
    "The change-scoped run then keeps only the critical tier, dropping the rows where most label and route assertions live.",
    "A row that never executes is never triaged. Silently, with no error anywhere.",
  ];
  let cy = 2.68;
  steps.forEach((t, i) => {
    s.addText(String(i + 1), { x: M, y: cy, w: 0.26, h: 0.24, fontSize: 10, color: C.crit, fontFace: MONO, bold: true, valign: "top" });
    s.addText(t, { x: M + 0.3, y: cy, w: LW - 0.3, h: 0.66, fontSize: 10, color: C.text, fontFace: SANS, valign: "top", lineSpacingMultiple: 1.2 });
    cy += 0.72;
  });
  callout(s, {
    x: M, y: cy + 0.1, w: LW, h: 0.92,
    text: "One PR renamed a hub widget across thirteen locales. The existing suites assert the OLD label 62 times — in suites where not one row carries an audit stamp.",
  });

  const RX = M + LW + 0.5, RW = W - LW - 0.5;
  s.addText("FOUR DISPOSITIONS, AND ONE OF THEM IS LOAD-BEARING", {
    x: RX, y: 2.25, w: RW, h: 0.24, fontSize: 8, color: C.textFaint, fontFace: MONO, bold: true, charSpacing: 1.6,
  });
  const disp = [
    ["CONFIRMED", "still correct, leave it.", 0.46, false],
    ["REPAIR", "the mechanics went stale — renamed selector, moved route, dead alias. Fixed BEFORE the run: it cannot otherwise reach its own assertion.", 0.84, false],
    ["RE-BASE", "the expected value conflicts. Deliberately NOT rewritten first — the change is an unmerged PR, so rewriting the oracle to match it means the case can only pass. Carried into the run instead, and rewritten afterwards with the run's own evidence.", 1.24, true],
    ["SUPERSEDED", "the surface is gone — a proposal, never an edit. Retirement stays human.", 0.6, false],
  ];
  let dy = 2.62;
  disp.forEach(([k, t, h, hot]) => {
    s.addShape(pptx.ShapeType.roundRect, {
      x: RX, y: dy, w: RW, h, rectRadius: 0.05,
      fill: { color: hot ? C.agentSoft : C.card },
      line: { color: hot ? C.agent : C.line, width: hot ? 0.9 : 0.5 },
    });
    s.addText(k, {
      x: RX + 0.2, y: dy + 0.12, w: 1.1, h: 0.22,
      fontSize: 9, color: hot ? C.agent : C.accentInk, fontFace: MONO, bold: true, valign: "top",
    });
    s.addText(t, {
      x: RX + 1.34, y: dy + 0.12, w: RW - 1.54, h: h - 0.24,
      fontSize: 9.5, color: C.textSoft, fontFace: SANS, valign: "top", lineSpacingMultiple: 1.18,
    });
    dy += h + 0.14;
  });

  s.addNotes(
    "The worked example, and the one people find counter-intuitive. Take the left column as a sequence — " +
    "selection missed, the tier filter dropped the rest, and a row that never runs is never triaged. Then the " +
    "right column, and spend your time on RE-BASE: the change under test is normally an UNMERGED pull request, " +
    "so if you rewrite a case's expected value to match it before the run, the case can only pass. You have " +
    "made the change its own oracle, in the very run that reports it green. REPAIR is safe because it moves " +
    "the mechanics and not the oracle."
  );
}

/* =======================================================================
   SLIDE 8 — section two divider
   ======================================================================= */
{
  const s = newSlide({ tint: "agent" });
  s.addShape(pptx.ShapeType.rect, {
    x: 7.6, y: 0, w: 5.73, h: 3.4, fill: { color: C.agentSoft }, line: { type: "none" },
  });
  s.addText("SECTION TWO", {
    x: M, y: 2.15, w: W, h: 0.3, fontSize: 10, color: C.textFaint, fontFace: MONO, bold: true, charSpacing: 2.4,
  });
  s.addText("The machinery underneath", {
    x: M, y: 2.5, w: 8.6, h: 1.0, fontSize: 42, color: C.text, fontFace: SANS, bold: true,
    valign: "top", lineSpacingMultiple: 1.02,
  });
  s.addText(
    "A pipeline is only as good as what it runs on. Regression got faster and finer-grained, the oracles " +
    "started maintaining themselves, and two knowledge surfaces appeared that simply did not exist before.",
    { x: M, y: 3.85, w: 8.2, h: 0.8, fontSize: 13, color: C.textSoft, fontFace: SANS, valign: "top", lineSpacingMultiple: 1.25 }
  );
  chips(s, ["per-case lane routing", "dependency-closed suite split", "ECL citation gate",
            "value-ordered promotion", "release ledger", "vs. DESIGN"], 5.1);
  s.addNotes(
    "Section-two divider. Colour shifts to indigo. Reset: 'that was how we decide what to test; this is what " +
    "it runs on.' Read the rail as the menu."
  );
}

/* =======================================================================
   SLIDE 9 — regression / lane routing diagram
   ======================================================================= */
{
  const s = newSlide();
  eyebrow(s, "Regression");
  heading(s, "A suite stopped being the unit of execution.", 0.92, 28);
  lead(s,
    "Cases that a runner can execute deterministically were riding browser agents because a handful of their " +
    "siblings are prose. The prize is not wall-clock — it is verdict quality: a case on a browser lane comes " +
    "back BLOCKED for reasons about how it ran rather than about the product.", 1.9, 11.2);

  const CY = 3.6;                       // vertical centre of the flow
  const suiteX = M, suiteW = 1.7;
  const clsX = M + 2.25, clsW = 1.95;
  const laneX = M + 5.0, laneW = 2.3, laneH = 0.6;
  const mergeX = M + 8.35, mergeW = 1.85;
  const outX = M + 10.55, outW = 1.6;
  const laneYs = [2.72, 3.42, 4.12, 4.82];

  node(s, { x: suiteX, y: CY - 0.37, w: suiteW, h: 0.74, title: "One suite CSV", sub: "mixed cases" });
  arrow(s, { x: suiteX + suiteW + 0.05, y: CY, w: 0.45 });
  microLabel(s, "parse", { x: suiteX + suiteW, y: CY - 0.26, w: 0.55 });

  node(s, { x: clsX, y: CY - 0.37, w: clsW, h: 0.74, title: "Classifier", sub: "per case, fail-closed",
            fill: C.agentSoft, stroke: C.agent });

  const lanes = [
    ["machine lane", "runner executes", false],
    ["browser lane", "agent executes", false],
    ["manual lane", "a person runs this", true],
    ["deprecated lane", "nobody does", true],
  ];
  const busX = clsX + clsW + 0.34;
  lanes.forEach(([t, sub, skipped], i) => {
    node(s, { x: laneX, y: laneYs[i], w: laneW, h: laneH, title: t, sub, titleSize: 9.5,
              dash: skipped ? "dash" : null });
    // classifier -> lane, via a shared vertical bus
    s.addShape(pptx.ShapeType.line, {
      x: busX, y: laneYs[i] + laneH / 2, w: laneX - busX - 0.04, h: 0,
      line: { color: C.textFaint, width: 1, dashType: skipped ? "dash" : "solid", endArrowType: "triangle" },
    });
  });
  s.addShape(pptx.ShapeType.line, {
    x: clsX + clsW, y: CY, w: busX - (clsX + clsW), h: 0, line: { color: C.textFaint, width: 1 },
  });
  s.addShape(pptx.ShapeType.line, {
    x: busX, y: laneYs[0] + laneH / 2, w: 0, h: laneYs[3] + laneH / 2 - (laneYs[0] + laneH / 2),
    line: { color: C.textFaint, width: 1 },
  });

  // lanes -> merger, via a second bus
  const bus2X = laneX + laneW + 0.34;
  lanes.forEach(([, , skipped], i) => {
    s.addShape(pptx.ShapeType.line, {
      x: laneX + laneW, y: laneYs[i] + laneH / 2, w: bus2X - (laneX + laneW), h: 0,
      line: { color: C.textFaint, width: 1, dashType: skipped ? "dash" : "solid" },
    });
  });
  s.addShape(pptx.ShapeType.line, {
    x: bus2X, y: laneYs[0] + laneH / 2, w: 0, h: laneYs[3] + laneH / 2 - (laneYs[0] + laneH / 2),
    line: { color: C.textFaint, width: 1 },
  });
  s.addShape(pptx.ShapeType.line, {
    x: bus2X, y: CY, w: mergeX - bus2X - 0.04, h: 0,
    line: { color: C.textFaint, width: 1, endArrowType: "triangle" },
  });
  microLabel(s, "writes a fragment", { x: bus2X + 0.06, y: 2.5, w: 1.5, align: "l" });
  microLabel(s, "never dispatched —", { x: bus2X + 0.06, y: 5.02, w: 1.7, align: "l" });
  microLabel(s, "materialised as SKIPPED", { x: bus2X + 0.06, y: 5.2, w: 1.9, align: "l" });

  node(s, { x: mergeX, y: CY - 0.37, w: mergeW, h: 0.74, title: "Merger", sub: "deterministic",
            fill: C.agentSoft, stroke: C.agent });
  arrow(s, { x: mergeX + mergeW + 0.05, y: CY, w: 0.3 });
  node(s, { x: outX, y: CY - 0.37, w: outW, h: 0.74, title: "One envelope", sub: "counts from rows",
            fill: C.accentSoft, stroke: C.accent, titleSize: 9.5 });

  s.addText("Invariants:\nno case lost\nno case counted twice\nevery row carries its lane\nidempotent re-merge", {
    x: M, y: 4.28, w: 2.4, h: 1.1,
    fontSize: 8.5, color: C.textFaint, fontFace: MONO, valign: "top", lineSpacingMultiple: 1.22,
  });

  s.addText(
    "The planned set comes from the classifier, not from the fragments — so a lane that dies before writing " +
    "surfaces as BLOCKED, rather than producing a smaller, greener, faster-looking suite.",
    { x: M, y: 5.62, w: W, h: 0.4, fontSize: 9, color: C.textFaint, fontFace: MONO, valign: "top", lineSpacingMultiple: 1.2 }
  );
  chips(s, ["115-case smoke suite → 4 dependency-closed siblings", "smoke 83 min → 39",
            "BLOCKED rate: 13.5% at ≤15 cases · 28.6% at 81+"], 6.2);

  s.addNotes(
    "Regression. Lead with the second sentence, not the first — the prize is verdict quality, not speed. A " +
    "case riding a browser lane comes back BLOCKED for reasons about how it ran, not about the product, and " +
    "those get triaged as if they were product failures. Point at the two dashed lanes: manual means a person " +
    "runs this, deprecated means nobody does, and folding them together would make the manual count lie. The " +
    "invariant list is the part to stress — the planned set comes from the classifier, so a lane that dies " +
    "shows up as BLOCKED rather than as a smaller, greener suite."
  );
}

/* =======================================================================
   SLIDE 10 — the oracles
   ======================================================================= */
{
  const s = newSlide();
  eyebrow(s, "The oracles");
  heading(s, "Truth and value are two gates, in that order.", 0.92, 28);

  const HW = (W - 0.6) / 2;
  s.addText("THE EDGE-CASE LIBRARY HAD NO OWNER", {
    x: M, y: 1.95, w: HW, h: 0.24, fontSize: 8, color: C.textFaint, fontFace: MONO, bold: true, charSpacing: 1.6,
  });
  s.addText(
    "Test cases cite its sections, and nothing had ever checked those citations resolved — no declared writer, " +
    "no gate of any kind. The first run found 20 dangling references cited by roughly 65 live cases across " +
    "7 suites, including one section that has never existed.",
    { x: M, y: 2.3, w: HW, h: 1.0, fontSize: 11, color: C.textSoft, fontFace: SANS, valign: "top", lineSpacingMultiple: 1.22 }
  );
  s.addText(
    "Most of those turned out to be the library MISSING content the authors expected rather than authors " +
    "mis-citing — so the sections were written at the numbers already in use. The gate went from 20 findings to zero.",
    { x: M, y: 3.42, w: HW, h: 0.85, fontSize: 11, color: C.textSoft, fontFace: SANS, valign: "top", lineSpacingMultiple: 1.22 }
  );
  callout(s, {
    x: M, y: 4.42, w: HW, h: 1.15,
    text: "The gate proves a reference EXISTS. It cannot prove it is the RIGHT one — nine cases cited " +
          "“Subscription & Recurring Billing” meaning “Loyalty & Points” and no gate could " +
          "object. That call stays with the review skill.",
  });

  const RX = M + HW + 0.6;
  s.addText("AND A SECOND GATE ON WHAT GETS CARRIED", {
    x: RX, y: 1.95, w: HW, h: 0.24, fontSize: 8, color: C.textFaint, fontFace: MONO, bold: true, charSpacing: 1.6,
  });
  s.addText(
    "The evidence bar only ever asked IS THIS TRUE. Both oracles then grew under it alone, and the value " +
    "spread out unevenly — of 211 invariants, 70 are low value and 22 are cited by no test case at all.",
    { x: RX, y: 2.3, w: HW, h: 0.8, fontSize: 11, color: C.textSoft, fontFace: SANS, valign: "top", lineSpacingMultiple: 1.22 }
  );
  const gates = [
    ["business × product", C.agent, "Scored separately and combined by CONJUNCTION, never a sum — so thirty citations cannot carry a cosmetic rule into a file whose job is judging pass or fail."],
    ["growth only", C.pass, "A CORRECTION to an existing entry applies whatever its value. Holding one back would leave a known-false rule in a file other skills judge against."],
    ["IDs are a contract", C.crit, "Never renumber a surviving entry. It silently repoints every previously-correct citation, and no gate can detect that — so it is forbidden rather than checked."],
  ];
  let gy = 3.22;
  gates.forEach(([k, col, t]) => {
    s.addShape(pptx.ShapeType.roundRect, {
      x: RX, y: gy, w: HW, h: 0.78, rectRadius: 0.05,
      fill: { color: C.card }, line: { color: C.line, width: 0.5 },
    });
    s.addText(k, { x: RX + 0.22, y: gy + 0.1, w: HW - 0.44, h: 0.22, fontSize: 10.5, color: col, fontFace: MONO, bold: true, valign: "top" });
    s.addText(t, { x: RX + 0.22, y: gy + 0.34, w: HW - 0.44, h: 0.4, fontSize: 8.5, color: C.textSoft, fontFace: SANS, valign: "top", lineSpacingMultiple: 1.14 });
    gy += 0.9;
  });

  s.addNotes(
    "Oracles. Left column first, and let the number do the work: nothing had ever checked that a cited " +
    "edge-case section existed, and the first run found twenty dangling references across about sixty-five " +
    "live cases. Most were the library missing content, not authors being careless — worth saying, it changes " +
    "how the room hears it. Right column: the value gate. The line that lands is 'thirty citations cannot " +
    "carry a cosmetic rule into a file whose job is judging pass or fail'. If asked whether this deletes " +
    "anything: no — low value is not evidence an entry is dead, and corrections apply regardless of value."
  );
}

/* =======================================================================
   SLIDE 11 — new knowledge surfaces
   ======================================================================= */
{
  const s = newSlide();
  eyebrow(s, "New this sprint");
  heading(s, "Three things the pipeline can now read that did not exist a fortnight ago.", 0.92, 26);

  const cw = (W - 0.5) / 3;
  const cards = [
    ["generated · release ledger", "What actually shipped upstream", C.accent,
     "The documentation corpus stops at Platform 3.917.1 while production is past 3.1050 — roughly nine months of releases nothing in the toolchain could see.",
     { label: "Three rules travel with it", text: "Released upstream is not deployed here · it declares itself non-exhaustive · it carries no behaviour, so it can raise a hypothesis and never settle a verdict." }],
    ["generated · functionality map", "Prior art finally has a reader", C.agent,
     "47 analysis deliverables sat in the reports tree covered by a single line telling one agent to SKIM them for duplicates. Test models were made durable so the next ticket could reuse them, and nothing ever opened one — one surface has two contradictory models.",
     { label: "The finding it produced on run one", text: "1 of 13 domains has a declared purpose. An undeclared one says so rather than inventing a guess." }],
    ["live · vs. DESIGN", "The dead axis came back", C.pass,
     "The design-tool integration exposes two auth calls and caps at about six requests a month, so the one defect class where every invariant passes but the build no longer matches the design had NO EXECUTOR AT ALL. Now a real diff of tokens, control geometry and icon glyph parity.",
     { label: "Precedence, so it cannot mislead", text: "Invariant beats spec beats heuristic. A skip is reported as a skip, never as a pass." }],
  ];
  cards.forEach(([k, t, rail, body, blind], i) => {
    card(s, {
      x: M + i * (cw + 0.25), y: 2.15, w: cw, h: 4.15,
      rail, kicker: k, title: t, body, blind,
    });
  });

  s.addNotes(
    "Three new knowledge surfaces. Pick two. The release ledger is the easiest to explain — our docs source " +
    "stops about nine months behind production, so 'has this changed recently' was unanswerable. The " +
    "functionality map is the one with the sharpest finding: forty-seven analysis documents on disk, one " +
    "instruction telling one agent to skim them for duplicates, and a durable test-model folder that nothing " +
    "ever opened — one surface ended up with two contradictory models. The blind-spot line on each card is " +
    "the honest half; read at least one of them."
  );
}

/* =======================================================================
   SLIDE 12 — the guards that were missing
   ======================================================================= */
{
  const s = newSlide();
  eyebrow(s, "Fixed");
  heading(s, "Three guarantees that held only when someone remembered.", 0.92, 28);

  const cw = (W - 0.35) / 2, ch = 1.9;
  const cards = [
    ["frontmatter", "A description YAML could not parse",
     "A long unquoted description containing a colon and a space — which in YAML IS the key-value separator. The parser abandoned the whole block and the skill loaded with empty metadata. Present for a month, because nothing checked. A second file had the identical defect."],
    ["the guard", "And now something does check",
     "A scanner over every markdown component both surfaces ship, hunting the values a YAML parser mis-reads. It CANNOT PASS VACUOUSLY — it asserts a floor on the corpus, because a guard that silently checks zero files is the exact failure it exists to prevent."],
    ["CI", "The unit suite was never run",
     "Six workflows existed and all six drive QA pipelines against the product; not one ran this repository's own tests. Every guarantee documented as enforced — including a byte-identity check the docs call CI-enforced — held on memory alone. A guard nobody runs is a comment."],
    ["hygiene", "Split by confidence",
     "The secret scanner graded an ordinary base64 config value as a certain credential and FAILED READINESS on it — blocking on a harmless value is precisely what teaches everyone to switch a check off. Certain hits may block; suspected hits only ever warn."],
  ];
  cards.forEach(([k, t, b], i) => {
    card(s, {
      x: M + (i % 2) * (cw + 0.35), y: 2.05 + Math.floor(i / 2) * (ch + 0.28),
      w: cw, h: ch, kicker: k, title: t, body: b,
      rail: i === 2 ? C.crit : C.accent,
    });
  });

  s.addNotes(
    "The guards. Frame it as one story, not four fixes: each of these was a guarantee we had written down and " +
    "were not enforcing. The YAML one is the best telling — a colon and a space inside an unquoted " +
    "description, the parser gives up, the skill loads with empty metadata, and it sat there for a month " +
    "because nothing looked. Then land the general form: a guard nobody runs is a comment. If someone asks " +
    "about the base64 one, it is the reverse failure — a check so eager it blocks on a harmless value, which " +
    "is how you teach a team to turn checks off."
  );
}

/* =======================================================================
   SLIDE 13 — ticket ledger
   ======================================================================= */
{
  const s = newSlide();
  eyebrow(s, "Delivered against tickets");
  heading(s, "The process work paid for itself on real tickets in the same sprint.", 0.92, 28);

  const rows = [
    ["VCST-5320", "Missions & Challenges — the ticket that produced the fault-model diagnosis, then got a model and fixtures of its own.", "LANDED", C.pass],
    ["VCST-5735", "Compare products — test model, fixtures and run evidence; the first ticket driven end to end by the new Step 1e.", "LANDED", C.pass],
    ["VCST-5704", "Page-wide anchor links in Page Builder — regression coverage.", "LANDED", C.pass],
    ["VCST-5745", "CSV export file-name token — suite registered, cases aligned to shipped behaviour and promoted on run evidence.", "LANDED", C.pass],
    ["044 · 049", "Security and Platform API suites — triangulated against docs, live and source; every high-severity finding cleared.", "LANDED", C.pass],
    ["VCST-5733", "Sales-rep customer orders — round-one findings, design report and evidence; the first run to exercise the visual axis for real.", "IN FLIGHT", C.warn],
  ];

  const RY = 2.15, RH = 0.62;
  s.addShape(pptx.ShapeType.line, { x: M, y: RY - 0.1, w: W, h: 0, line: { color: C.line, width: 0.75 } });
  rows.forEach(([key, what, st, col], i) => {
    const y = RY + i * RH;
    s.addText(key, { x: M, y, w: 1.5, h: 0.26, fontSize: 10.5, color: C.accentInk, fontFace: MONO, bold: true, valign: "top" });
    s.addText(what, { x: M + 1.65, y, w: W - 3.4, h: RH - 0.08, fontSize: 10.5, color: C.text, fontFace: SANS, valign: "top", lineSpacingMultiple: 1.18 });
    s.addText(st, { x: M + W - 1.6, y, w: 1.6, h: 0.26, fontSize: 8.5, color: col, fontFace: MONO, bold: true, align: "right", charSpacing: 1.2, valign: "top" });
    s.addShape(pptx.ShapeType.line, { x: M, y: y + RH - 0.1, w: W, h: 0, line: { color: C.line, width: 0.5 } });
  });

  s.addText(
    "VCST-5733 is also the run that found the design axis needs a signed-in browser lane — a finding about our own tooling, produced by our own tooling.",
    { x: M, y: RY + rows.length * RH + 0.25, w: W, h: 0.3, fontSize: 10.5, color: C.textSoft, fontFace: MONO }
  );

  s.addNotes(
    "Tickets, so the room can see the process work was not academic. Do not read all six — say that VCST-5320 " +
    "is where the diagnosis came from and VCST-5735 is the first ticket driven end to end by the new design " +
    "step. Close on the kicker: the in-flight run found that our own design axis needs a signed-in browser " +
    "lane, which is the tooling catching a defect in the tooling. That is the loop working."
  );
}

/* =======================================================================
   SLIDE 14 — close
   ======================================================================= */
{
  const s = newSlide();
  eyebrow(s, "Where that leaves us");
  heading(s, "Three shifts, and they are all the same shift.", 0.92, 28);
  lead(s, "Stop trusting that something was checked. Make it checkable, and then check it.", 1.9, 10.6);

  const cw = (W - 0.5) / 3;
  const cards = [
    ["Design", "Name the mechanism first", C.accent,
     "A value chain before a parameter space. Every case now has to say what it reads, what a customer would see fail, and why that failure is plausible here — before it is written, which is the only point at which culling it is cheap."],
    ["Scope", "Read what already exists", C.agent,
     "Prior analysis, prior models, the current contract, and the rows this change makes wrong. Every one of those was on disk and unread. Prior art is a hypothesis to triangulate, never a baseline to trust."],
    ["Cost", "Effort tracks risk", C.pass,
     "FAST is a checklist. FULL buys a model, authoring and three independent verifiers. Three axes are opt-in on FAST until the measurements say otherwise — and merge and release are still human."],
  ];
  cards.forEach(([k, t, rail, body], i) => {
    card(s, { x: M + i * (cw + 0.25), y: 2.7, w: cw, h: 2.5, rail, kicker: k, title: t, body });
  });

  s.addText("Thank you · questions & walkthrough", {
    x: M, y: 5.75, w: W, h: 0.3, fontSize: 11, color: C.textSoft, fontFace: MONO, align: "center",
  });

  s.addNotes(
    "Close on the three cards and the one sentence above them — stop trusting that something was checked, " +
    "make it checkable, then check it. Design, scope, cost. End by repeating that merge and release are still " +
    "human, then open for questions."
  );
}

await pptx.writeFile({ fileName: OUT });
console.log(`Wrote ${OUT} (${slideNo} slides)`);
