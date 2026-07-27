// Generates plugin-guide.pptx from the same content as plugin-guide.html
// Run: node vc/shared/docs/presentation/build-plugin-guide-pptx.mjs
import PptxGenJS from "pptxgenjs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- palette (from the HTML :root tokens) ----
const C = {
  surface: "F6F8FA",
  card: "FFFFFF",
  line: "DDE4EC",
  ink: "0D141F", // dark code / title bg
  ink2: "131C2B",
  text: "17212E",
  soft: "48576B",
  faint: "7B8AA0",
  accent: "0F9D8F",
  accentInk: "0A6E64",
  accentSoft: "E3F4F1",
  agent: "5462DD",
  agentSoft: "E9EAFB",
  pass: "1F9D57",
  warn: "B9791A",
  crit: "C93F52",
  codeText: "D6E0EE",
  codeComment: "6B7D93",
  white: "FFFFFF",
};

const MONO = "Consolas";
const SANS = "Segoe UI";

const pptx = new PptxGenJS();
pptx.defineLayout({ name: "W", width: 13.333, height: 7.5 });
pptx.layout = "W";
pptx.author = "vc-fix plugin";
pptx.title = "vc-fix Plugin — Setup & Feature Guide";

const W = 13.333;
const H = 7.5;
const MX = 0.62; // side margin

// ---- helpers ----
function bg(slide, color) {
  slide.background = { color };
}

// standard content-slide header: eyebrow tag + title + optional subtitle
function header(slide, { eyebrow, tag, tagColor, title, subtitle }) {
  bg(slide, C.surface);
  // left accent rail
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 0.16, h: H, fill: { color: tagColor || C.accent }, line: { type: "none" },
  });
  let y = 0.5;
  if (eyebrow) {
    slide.addText(eyebrow.toUpperCase(), {
      x: MX, y, w: 8, h: 0.3, fontFace: MONO, fontSize: 11, bold: true,
      color: tagColor || C.accentInk, charSpacing: 2,
    });
    y += 0.34;
  }
  slide.addText(title, {
    x: MX, y, w: W - MX * 2, h: 0.9, fontFace: SANS, fontSize: 30, bold: true,
    color: C.text, valign: "top",
  });
  y += subtitle ? 0.95 : 0.9;
  if (subtitle) {
    slide.addText(subtitle, {
      x: MX, y, w: W - MX * 2 - 2.2, h: 0.7, fontFace: SANS, fontSize: 14,
      color: C.soft, valign: "top", lineSpacingMultiple: 1.1,
    });
  }
  // tag chip top-right
  if (tag) {
    slide.addText(tag.toUpperCase(), {
      x: W - MX - 3.6, y: 0.5, w: 3.6, h: 0.34, fontFace: MONO, fontSize: 9.5, bold: true,
      color: C.white, align: "center", valign: "middle", charSpacing: 1,
      fill: { color: tagColor || C.accent }, rectRadius: 0.16, shape: pptx.ShapeType.roundRect,
    });
  }
  return subtitle ? y + 0.8 : y + 0.15;
}

// footer page marker
function footer(slide, n) {
  slide.addText("vc-fix plugin — Setup & Feature Guide", {
    x: MX, y: H - 0.42, w: 7, h: 0.3, fontFace: MONO, fontSize: 9, color: C.faint,
  });
  slide.addText(String(n).padStart(2, "0"), {
    x: W - MX - 1, y: H - 0.42, w: 1, h: 0.3, fontFace: MONO, fontSize: 9, color: C.faint, align: "right",
  });
}

// bullet list card
function bulletList(slide, items, { x, y, w, h, dot = C.accent }) {
  const tx = items.map((it) => {
    const runs = typeof it === "string" ? [{ text: it }] : it;
    return {
      text: runs.map((r) => r.text).join(""),
      options: {},
      _runs: runs,
    };
  });
  // build as rich runs
  const rich = [];
  items.forEach((it, i) => {
    const runs = typeof it === "string" ? [{ text: it, opts: {} }] : it;
    runs.forEach((r, j) => {
      rich.push({
        text: r.text,
        options: {
          fontFace: SANS, fontSize: 13, color: r.color || C.text, bold: !!r.bold,
          bullet: j === 0 ? { code: "2022", indent: 18 } : false,
          paraSpaceAfter: j === runs.length - 1 ? 9 : 0,
          breakLine: j === runs.length - 1,
        },
      });
    });
  });
  slide.addText(rich, { x, y, w, h, valign: "top", lineSpacingMultiple: 1.08 });
}

// code panel (dark)
function codePanel(slide, lines, { x, y, w, h }) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h, fill: { color: C.ink }, line: { type: "none" }, rectRadius: 0.1,
    shadow: { type: "outer", blur: 8, offset: 3, angle: 90, color: "000000", opacity: 0.28 },
  });
  const rich = [];
  lines.forEach((ln, i) => {
    const parts = Array.isArray(ln) ? ln : [{ text: ln }];
    parts.forEach((p, j) => {
      let col = C.codeText;
      if (p.t === "c") col = C.codeComment;
      if (p.t === "g") col = C.accent;
      rich.push({
        text: p.text,
        options: {
          fontFace: MONO, fontSize: 12.5, color: col,
          breakLine: j === parts.length - 1,
          paraSpaceAfter: 2,
        },
      });
    });
  });
  slide.addText(rich, {
    x: x + 0.2, y: y + 0.12, w: w - 0.4, h: h - 0.24, valign: "top", lineSpacingMultiple: 1.15,
  });
}

// simple table
function table(slide, headers, rows, { x, y, w, colW, headColor = C.accent }) {
  const rowsData = [];
  rowsData.push(
    headers.map((htxt) => ({
      text: htxt.toUpperCase(),
      options: {
        fontFace: MONO, fontSize: 9.5, bold: true, color: C.white, fill: { color: headColor },
        valign: "middle", align: "left", margin: [3, 5, 3, 5],
      },
    }))
  );
  rows.forEach((r, ri) => {
    rowsData.push(
      r.map((cell) => {
        const runs = Array.isArray(cell) ? cell : [{ text: cell }];
        return {
          text: runs.map((run) => ({
            text: run.text,
            options: { bold: !!run.bold, color: run.color || C.text, fontFace: run.mono ? MONO : SANS },
          })),
          options: {
            fontFace: SANS, fontSize: 11, color: C.text, valign: "top",
            fill: { color: ri % 2 ? C.surface : C.card }, margin: [4, 5, 4, 5],
          },
        };
      })
    );
  });
  slide.addTable(rowsData, {
    x, y, w, colW, border: { type: "solid", pt: 0.5, color: C.line }, autoPage: false,
  });
}

// key-value definition rows (dl.kv)
function kvRows(slide, pairs, { x, y, w, dtColor = C.accentInk }) {
  const dtW = 1.9;
  let cy = y;
  pairs.forEach((p) => {
    const ddRuns = Array.isArray(p.dd) ? p.dd : [{ text: p.dd }];
    // estimate height: rough by char count
    const chars = ddRuns.map((r) => r.text).join("").length;
    const lineChars = Math.floor(((w - dtW - 0.2) / 0.088));
    const rowH = Math.max(0.42, Math.ceil(chars / lineChars) * 0.24 + 0.14);
    slide.addText(p.dt.toUpperCase(), {
      x, y: cy, w: dtW, h: rowH, fontFace: MONO, fontSize: 9.5, bold: true, color: dtColor,
      valign: "top", charSpacing: 1,
    });
    slide.addText(
      ddRuns.map((r) => ({
        text: r.text,
        options: { fontFace: SANS, fontSize: 12, color: r.color || C.text, bold: !!r.bold, italic: !!r.italic },
      })),
      { x: x + dtW + 0.15, y: cy, w: w - dtW - 0.15, h: rowH, valign: "top", lineSpacingMultiple: 1.05 }
    );
    cy += rowH + 0.08;
  });
  return cy;
}

// note / callout box
function note(slide, runs, { x, y, w, h, variant = "accent" }) {
  const isWarn = variant === "warn";
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.08,
    fill: { color: isWarn ? "FBF3E4" : C.accentSoft },
    line: { color: isWarn ? C.warn : C.accent, width: 1, dashType: "dash" },
  });
  slide.addText(
    (Array.isArray(runs) ? runs : [{ text: runs }]).map((r) => ({
      text: r.text,
      options: { fontFace: SANS, fontSize: 11.5, bold: !!r.bold, color: isWarn ? C.warn : C.accentInk },
    })),
    { x: x + 0.18, y: y + 0.05, w: w - 0.36, h: h - 0.1, valign: "middle", lineSpacingMultiple: 1.05 }
  );
}

let PAGE = 0;
function newSlide() {
  const s = pptx.addSlide();
  PAGE += 1;
  return s;
}

// =====================================================================
// SLIDE 1 — TITLE
// =====================================================================
{
  const s = pptx.addSlide();
  bg(s, C.ink);
  // gradient-like accent band
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.28, fill: { color: C.accent }, line: { type: "none" } });
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0.28, w: W, h: 0.1, fill: { color: C.agent }, line: { type: "none" } });
  // logo tile
  s.addShape(pptx.ShapeType.roundRect, {
    x: MX, y: 1.15, w: 0.9, h: 0.9, rectRadius: 0.12, fill: { color: C.accent }, line: { type: "none" },
  });
  s.addText("vc", {
    x: MX, y: 1.15, w: 0.9, h: 0.9, fontFace: MONO, fontSize: 26, bold: true, color: C.white,
    align: "center", valign: "middle",
  });
  s.addText("vc-fix plugin", {
    x: MX + 1.1, y: 1.2, w: 8, h: 0.5, fontFace: SANS, fontSize: 22, bold: true, color: C.white, valign: "middle",
  });
  s.addText("Setup & feature guide", {
    x: MX + 1.1, y: 1.68, w: 8, h: 0.35, fontFace: SANS, fontSize: 13, color: C.faint, valign: "middle",
  });

  s.addText("AGENTIC QA · VC-FIX", {
    x: MX, y: 2.7, w: 10, h: 0.35, fontFace: MONO, fontSize: 13, bold: true, color: C.accent, charSpacing: 3,
  });
  s.addText("Setting up the plugin, and what each\nnew feature actually does.", {
    x: MX, y: 3.15, w: 11.6, h: 1.7, fontFace: SANS, fontSize: 40, bold: true, color: C.white,
    lineSpacingMultiple: 1.02,
  });
  s.addText(
    "Two parts: how to install and drive the vc-fix plugin, then a detailed walk through each capability we shipped this sprint — what it is, how you invoke it, and how it works under the hood.",
    { x: MX, y: 5.0, w: 9.5, h: 1.1, fontFace: SANS, fontSize: 15, color: "A3B3C7", lineSpacingMultiple: 1.15 }
  );
  s.addText("8 agents  ·  16 skills  ·  8 commands", {
    x: MX, y: 6.5, w: 10, h: 0.4, fontFace: MONO, fontSize: 13, bold: true, color: C.accentInk,
  });
  // faux accentInk on dark reads dim; brighten
  s.addText("8 agents  ·  16 skills  ·  8 commands", {
    x: MX, y: 6.5, w: 10, h: 0.4, fontFace: MONO, fontSize: 13, bold: true, color: "3FD0BF",
  });
}

// =====================================================================
// SLIDE 2 — WHAT THE PLUGIN IS
// =====================================================================
{
  const s = newSlide();
  let y = header(s, {
    eyebrow: "Getting started",
    title: "What the plugin is",
    subtitle: "A bug-lifecycle toolkit for Virto Commerce, distributed as a Claude Code marketplace plugin. It files, reproduces, fixes, deploys, and verifies bugs against a live deployment — and it now diagnoses its own runs.",
  });
  y += 0.05;
  bulletList(s, [
    [{ text: "Fully self-contained", bold: true }, { text: " — its own agents, skills, commands, knowledge, and config — so it works wherever Claude Code installs it." }],
    [{ text: "Ships 8 agents, 16 skills, and 8 commands", bold: true }, { text: " covering the full bug lifecycle." }],
    [{ text: "Commands: ", bold: true }, { text: "/project-init, /qa-bug, /qa-fix (+ a write-capable developer team), /qa-verify-fix, /qa-monitoring, /qa-env-check.", color: C.soft }],
    [{ text: "Self-diagnostics pair: ", bold: true }, { text: "/vc-self-check + /vc-feedback.", color: C.soft }],
  ], { x: MX, y, w: W - MX * 2, h: 2.2 });

  note(s, [
    { text: "The point of setup: ", bold: true },
    { text: "the profile you write during onboarding lets /qa-fix route each bug to the right repo (your custom code vs the native VirtoCommerce platform) and file it to the right tracker (Jira or Azure Boards). Without it, everything defaults to native-platform / Jira / GitHub behavior." },
  ], { x: MX, y: 5.55, w: W - MX * 2, h: 1.25 });
  footer(s, PAGE);
}

// =====================================================================
// SLIDE 3 — SETUP
// =====================================================================
{
  const s = newSlide();
  let y = header(s, {
    eyebrow: "Getting started",
    title: "Setup — install & configure",
    subtitle: "~5–15 min per environment. Prereqs: Claude Code ≥ 1.0, Node ≥ 18, a storefront URL, an Admin/platform URL, one storefront + one admin test account.",
  });

  const steps = [
    ["1", "Add the marketplace & install the plugin", "Claude clones the plugin into its cache and auto-discovers agents, skills, commands, and MCP config."],
    ["2", "Install dependencies", "From the plugin install directory, run npm install to pull the Node dependencies the scripts and orchestrators need."],
    ["3", "Run the onboarding wizard — /project-init", "Asks only what shapes config (env name, tracker, code host, auth) and derives the rest. Writes project-profile.json + .env.<env> + .env.local + .mcp.json, then prints a readiness table."],
    ["4", "Verify", "npm run env:check (env vars valid) then /qa-env-check (both surfaces + MCP servers, <30s)."],
  ];
  let sy = y + 0.05;
  const stepH = 0.92;
  steps.forEach(([n, title, body]) => {
    s.addShape(pptx.ShapeType.roundRect, {
      x: MX, y: sy, w: 7.3, h: stepH, rectRadius: 0.06, fill: { color: C.card },
      line: { color: C.line, width: 1 },
      shadow: { type: "outer", blur: 6, offset: 2, angle: 90, color: "0D141F", opacity: 0.08 },
    });
    s.addShape(pptx.ShapeType.ellipse, {
      x: MX + 0.16, y: sy + 0.16, w: 0.4, h: 0.4, fill: { color: C.accent }, line: { type: "none" },
    });
    s.addText(n, { x: MX + 0.16, y: sy + 0.16, w: 0.4, h: 0.4, fontFace: MONO, fontSize: 13, bold: true, color: C.white, align: "center", valign: "middle" });
    s.addText(title, { x: MX + 0.72, y: sy + 0.1, w: 6.4, h: 0.32, fontFace: SANS, fontSize: 13.5, bold: true, color: C.text });
    s.addText(body, { x: MX + 0.72, y: sy + 0.4, w: 6.45, h: 0.5, fontFace: SANS, fontSize: 10.5, color: C.soft, valign: "top", lineSpacingMultiple: 1.0 });
    sy += stepH + 0.14;
  });

  // right column: code + env table note
  codePanel(s, [
    [{ text: "/plugin", t: "g" }, { text: " marketplace add \\" }],
    [{ text: "   VirtoCommerce/vc-mcp-testing-module" }],
    [{ text: "/plugin", t: "g" }, { text: " install vc-fix@vc-tools" }],
    [{ text: "npm install" }],
    [{ text: "/project-init", t: "g" }, { text: "            " }, { text: "# wizard", t: "c" }],
    [{ text: "npm run env:check" }],
    [{ text: "/qa-env-check", t: "g" }, { text: "            " }, { text: "# <30s", t: "c" }],
  ], { x: 8.2, y: y + 0.05, w: 4.5, h: 2.15 });

  s.addText("Environments & safety", { x: 8.2, y: y + 2.4, w: 4.5, h: 0.3, fontFace: SANS, fontSize: 14, bold: true, color: C.text });
  s.addText([
    { text: "Env names are arbitrary strings. Safety is gated by ", options: { fontFace: SANS, fontSize: 11, color: C.text } },
    { text: "ENV_RISK", options: { fontFace: MONO, fontSize: 10.5, color: C.accentInk, bold: true } },
    { text: ", not the name — on ", options: { fontFace: SANS, fontSize: 11, color: C.text } },
    { text: "production", options: { fontFace: MONO, fontSize: 10.5, color: C.crit, bold: true } },
    { text: " the plugin is read-only by default; admin-writes refuse without an explicit escape hatch.", options: { fontFace: SANS, fontSize: 11, color: C.text } },
  ], { x: 8.2, y: y + 2.72, w: 4.5, h: 1.5, valign: "top", lineSpacingMultiple: 1.1 });
  footer(s, PAGE);
}

// =====================================================================
// SLIDE 4 — env file buckets table
// =====================================================================
{
  const s = newSlide();
  let y = header(s, {
    eyebrow: "Getting started",
    title: "Config layers & safety",
    subtitle: "Three env-file buckets — what is committable, and what stays local.",
  });
  table(s,
    ["Bucket", "File", "Committable", "Holds"],
    [
      ["Plugin defaults", [{ text: ".env.defaults", mono: true }], "Yes", "Sandbox cards, public URLs — same for everyone."],
      ["Per-env config", [{ text: ".env.<env>", mono: true }], "Yes (your fork)", "FRONT_URL, BACK_URL, ENV_RISK, MODULES_ENABLED, tracker key."],
      ["Secrets", [{ text: ".env.local", mono: true }], [{ text: "No", bold: true, color: C.crit }, { text: " (gitignored)" }], "Passwords, API tokens. Per-env via suffix (USER_PASSWORD_QA…)."],
    ],
    { x: MX, y: y + 0.1, w: W - MX * 2, colW: [2.3, 2.4, 2.4, 5.03] }
  );
  note(s, [
    { text: "Re-running after an upgrade? ", bold: true },
    { text: "/project-init --check migrates a stale project-profile.json to the current schema — no full re-onboarding required." },
  ], { x: MX, y: y + 2.5, w: W - MX * 2, h: 0.9 });
  footer(s, PAGE);
}

// =====================================================================
// SLIDE 5 — MCP servers & Serena
// =====================================================================
{
  const s = newSlide();
  let y = header(s, {
    eyebrow: "Getting started",
    title: "MCP servers & Serena",
    subtitle: "Browser automation is required; the rest gate specific skills.",
  });
  bulletList(s, [
    [{ text: "Required — Playwright ", bold: true }, { text: "(chrome / firefox / edge): browser automation for storefront + Admin SPA + cross-browser. Configured in .mcp.json.", color: C.soft }],
    [{ text: "Optional, skill-gating: ", bold: true }, { text: "atlassian → /qa-bug filing; github → PR testing & routing; postman → API skills; context7 + VirtoOZ → /vc-docs; figma-remote-mcp → design comparison.", color: C.soft }],
    [{ text: "Serena ", bold: true }, { text: "— shared LSP-backed semantic code-navigation. Enabled in tracked config but installed per machine (needs uv/uvx on PATH). Dev agents use it for faster, more surgical fixes than a Grep → Read → Edit loop.", color: C.soft }],
  ], { x: MX, y, w: W - MX * 2, h: 2.5 });

  codePanel(s, [
    [{ text: "/plugin", t: "g" }, { text: " marketplace add anthropics/claude-plugins-official" }],
    [{ text: "/plugin", t: "g" }, { text: " install serena@claude-plugins-official" }],
    [{ text: "# then restart — verify: claude mcp list", t: "c" }],
    [{ text: "#   → plugin:serena … Connected", t: "c" }],
  ], { x: MX, y: 4.55, w: 7.3, h: 1.25 });

  note(s, [
    { text: "Login secrets ", bold: true },
    { text: "go in a dedicated .env.playwright.local (Playwright --secrets), never .env.local. The MCP substitutes by NAME and redacts from logs — plaintext never enters the transcript." },
  ], { x: 8.05, y: 4.55, w: 4.65, h: 1.25 });
  footer(s, PAGE);
}

// =====================================================================
// SLIDE 6 — Working with the plugin
// =====================================================================
{
  const s = newSlide();
  let y = header(s, {
    eyebrow: "Getting started",
    title: "Working with the plugin",
    subtitle: "Three kinds of thing, one way to invoke them.",
  });
  table(s,
    ["Kind", "What it is", "You…"],
    [
      [[{ text: "Command", bold: true }], "A testing workflow that runs now — the plugin's verbs.", "Type the slash: /qa-bug, /qa-fix."],
      [[{ text: "Skill", bold: true }], "A packaged methodology + reference files. Some run work, some just inform.", "Invoke like a command; some auto-pull when relevant."],
      [[{ text: "Agent", bold: true }], "A specialist Claude delegates to for multi-step work.", "Rarely called directly — commands dispatch them for you."],
    ],
    { x: MX, y: y + 0.05, w: W - MX * 2, colW: [1.9, 5.2, 5.03] }
  );

  s.addText("How to invoke", { x: MX, y: y + 2.35, w: 6, h: 0.3, fontFace: SANS, fontSize: 14, bold: true, color: C.text });
  bulletList(s, [
    [{ text: "Type the slash explicitly ", bold: true }, { text: "for anything with side effects — guarded by disable-model-invocation.", color: C.soft }],
    [{ text: "Natural language ", bold: true }, { text: "works only for the read-only few (/qa-status, /qa-env-check, /vc-docs).", color: C.soft }],
  ], { x: MX, y: y + 2.68, w: W - MX * 2, h: 1.0 });
  footer(s, PAGE);
}

// =====================================================================
// SLIDE 7 — the core chain
// =====================================================================
{
  const s = newSlide();
  let y = header(s, {
    eyebrow: "Getting started",
    title: "The core chain",
    subtitle: "The tools hand off to each other. The bug lifecycle is the one you'll run most.",
  });
  codePanel(s, [
    [{ text: "/qa-bug", t: "g" }, { text: ' "cart total wrong on B2B order"   ' }, { text: "# reproduce + file", t: "c" }],
    [{ text: "/qa-fix", t: "g" }, { text: " VCST-1234                        " }, { text: "# fix → open PR", t: "c" }],
    [{ text: "# …a human reviews & merges the PR…", t: "c" }],
    [{ text: "/qa-deploy-pr", t: "g" }, { text: " VCST-1234 --apply           " }, { text: "# deploy artifacts", t: "c" }],
    [{ text: "/qa-verify-fix", t: "g" }, { text: " VCST-1234                   " }, { text: "# confirm live", t: "c" }],
  ], { x: MX, y: y + 0.1, w: W - MX * 2, h: 2.0 });

  // flow chips
  const flow = ["/qa-bug", "/qa-fix", "human merge", "/qa-deploy-pr", "/qa-verify-fix"];
  const chipW = 2.15, gap = 0.28;
  let cx = MX;
  const fy = y + 2.5;
  flow.forEach((label, i) => {
    const isHuman = label === "human merge";
    s.addShape(pptx.ShapeType.roundRect, {
      x: cx, y: fy, w: chipW, h: 0.55, rectRadius: 0.1,
      fill: { color: isHuman ? C.agentSoft : C.accentSoft },
      line: { color: isHuman ? C.agent : C.accent, width: 1 },
    });
    s.addText(label, {
      x: cx, y: fy, w: chipW, h: 0.55, fontFace: MONO, fontSize: 11, bold: true,
      color: isHuman ? C.agent : C.accentInk, align: "center", valign: "middle",
    });
    if (i < flow.length - 1) {
      s.addText("→", { x: cx + chipW, y: fy, w: gap, h: 0.55, fontFace: SANS, fontSize: 16, color: C.faint, align: "center", valign: "middle" });
    }
    cx += chipW + gap;
  });

  s.addText("Reading argument hints:  [a|b|c] = pick one · VCST-XXXX = ticket id · PR #NNN = pull request · <description> = free text · no arg = interactive default.", {
    x: MX, y: fy + 1.0, w: W - MX * 2, h: 0.6, fontFace: SANS, fontSize: 12, color: C.soft, valign: "top", lineSpacingMultiple: 1.1,
  });
  footer(s, PAGE);
}

// =====================================================================
// SLIDE 8 — SELF-DIAGNOSTICS (flagship)
// =====================================================================
{
  const s = newSlide();
  let y = header(s, {
    eyebrow: "New this sprint",
    tag: "Flagship · VCST-5509",
    tagColor: C.accent,
    title: "Self-diagnostics",
    subtitle: "A feedback loop so a customer-installed plugin can tell whether its own commands, skills, and agents did the right thing — and, opt-in, report quality issues back to VirtoCommerce, without mutating the install or leaking client code.",
  });
  y = kvRows(s, [
    { dt: "Collector", dd: "Passive telemetry — a hook records each span's phases, gates, tool errors, denied permissions, and an anomaly score to a local, gitignored trace, and flags failed / degraded / silently-suspect spans. Never throws, never blocks, redacts secrets." },
    { dt: "Your verdict", dd: [{ text: "/vc-feedback \"<what happened>\" 👍/👎", bold: true }, { text: " — you tell the plugin, in your own words. The main detector of SILENT failures — a task done wrong that looked fine. Nothing is sent." }] },
    { dt: "Diagnosis", dd: [{ text: "/vc-self-check", bold: true }, { text: " — reads trace + transcript vs an expectations oracle and writes a local DIAG-*.md: per-skill OK / DEGRADED / BROKEN with evidence, root-cause hypothesis, and a concrete proposed fix (file/line)." }] },
    { dt: "Delivery", dd: [{ text: "/vc-self-check deliver", bold: true }, { text: " — turns a confirmed finding into a scrubbed contribution (PR / fork-PR / issue), gated by feedback.mode. Client source stripped before anything leaves." }] },
  ], { x: MX, y: y + 0.05, w: W - MX * 2 });
  note(s, [
    { text: "Opt-in, local, ephemeral. ", bold: true },
    { text: "Nothing recorded unless selfDiagnostics: true is in your profile. Lifecycle: log → analyze → contribute → delete." },
  ], { x: MX, y: y + 0.05, w: W - MX * 2, h: 0.75 });
  footer(s, PAGE);
}

// =====================================================================
// SLIDE 9 — CLIENT DEPLOYMENT ROUTING (flagship)
// =====================================================================
{
  const s = newSlide();
  let y = header(s, {
    eyebrow: "New this sprint",
    tag: "Flagship · onboarding + /qa-fix",
    tagColor: C.accent,
    title: "Client-deployment routing",
    subtitle: "One plugin runs on any deployment — ours or a customer's. Tracker + code-host adapters plus ownership-aware routing, behind a hard security invariant.",
  });
  table(s,
    ["Routed repo", "Outcome", "Delivery"],
    [
      [[{ text: "Client repo ", }, { text: "(custom module / theme / fork)", color: C.soft }], "fixable → PR", "PR on the client's host — GitHub or Azure Repos."],
      ["Platform repo, operator = VirtoCommerce", "fixable → PR", "Direct PR to VirtoCommerce/<repo>."],
      ["Platform repo, operator = client", "fixable → PR", "Fork-PR upstream to VirtoCommerce, from the client's fork."],
      ["Platform repo, too complex / multi-repo", "not fixable → issue", "GitHub Issue on the upstream (client deployments only)."],
    ],
    { x: MX, y: y + 0.05, w: W - MX * 2, colW: [4.6, 2.7, 4.83] }
  );
  note(s, [
    { text: "Client-code containment — a hard invariant. ", bold: true },
    { text: "Client code MUST NEVER leave the client's project. Upstream receives contribution only — platform-authored fixes + generic reproduction, scrubbed of client source, paths, identifiers, secrets. Reproduces only with client code → the fix STOPS. Enforced at routing, at review, and in the dev team." },
  ], { x: MX, y: y + 2.85, w: W - MX * 2, h: 1.3, variant: "warn" });
  footer(s, PAGE);
}

// =====================================================================
// SLIDE 10 — /qa-deploy-pr
// =====================================================================
{
  const s = newSlide();
  let y = header(s, {
    eyebrow: "New this sprint",
    tag: "New command",
    tagColor: C.agent,
    title: "/qa-deploy-pr",
    subtitle: "Deploy all of a change's fresh prerelease artifacts (modules + Platform + vc-frontend theme) together, in one manifest update.",
  });
  y = kvRows(s, [
    { dt: "Invoke", dd: [{ text: "/qa-deploy-pr <ticket-key> ", bold: true }, { text: "[--pr] [--module] [--platform] [--theme] [--env] [--apply] [--verify]", color: C.faint }] },
    { dt: "Resolve", dd: "Reads the tracker ticket's linked PRs across all repos (or your explicit set) → picks each PR's latest vc3prerelease CI build." },
    { dt: "Repin", dd: "Minimal-diff update of backend/packages.json (AzureBlob/BlobName + PlatformVersion) and theme/artifact.json — all targets in ONE vc-deploy-dev change, on the branch mapped to TEST_ENV." },
    { dt: "Apply", dd: [{ text: "--apply", bold: true }, { text: " opens ONE gated deploy PR — direct push if you have write, else a fork PR (prints the web-edit URL on a 403)." }] },
    { dt: "Verify", dd: [{ text: "--verify", bold: true }, { text: " reports per-target deploy state — env-branch pin plus the live /api/platform/modules version." }] },
  ], { x: MX, y: y + 0.05, w: W - MX * 2, dtColor: C.agent });
  note(s, [
    { text: "Never merges. ", bold: true },
    { text: "Ends at an open PR for a human to merge (merging is what deploys). Then /qa-test PR #N and /qa-verify-fix can run against the change." },
  ], { x: MX, y: y + 0.05, w: W - MX * 2, h: 0.75 });
  footer(s, PAGE);
}

// =====================================================================
// SLIDE 11 — Hotfix lifecycle
// =====================================================================
{
  const s = newSlide();
  let y = header(s, {
    eyebrow: "New this sprint",
    tag: "New · a 3-step chain",
    tagColor: C.agent,
    title: "Hotfix lifecycle",
    subtitle: "Backport a released fix to a frozen stable line, end to end: discover what's missing → release it onto the support line → deliver it to the deployed envs and verify.",
  });
  y = kvRows(s, [
    { dt: "Discover", dd: [{ text: "/qa-bundle-check vN | <url>", bold: true }, { text: " — flags every pinned module / Platform / Theme with a newer same-line patch (never a newer minor). Each hotfix traces to its PR + tracker task." }] },
    { dt: "Release", dd: [{ text: "/qa-hotfix VCST-XXXX [bundles]", bold: true }, { text: " — resolves task → PR → fix commit, confirms MERGED & SHIPPED, checks a fix-shape safety gate, then per bundle creates support/<X.Y> and cherry-picks, triggering \"Release hotfix\". ASKs which bundles." }] },
    { dt: "Deliver + verify", dd: [{ text: "/qa-hotfix-check VCST-XXXX", bold: true }, { text: " — bumps the deploy manifest for stable + regression envs, waits for green deploy + version match, verifies live, comments + transitions the task to Done, bumps latest-stable bundles." }] },
  ], { x: MX, y: y + 0.05, w: W - MX * 2, dtColor: C.agent });
  note(s, [
    { text: "Gated writes, never auto-merges. ", bold: true },
    { text: "Read-only by default; each write is gated behind an explicit apply. STOP cleanly at any wall — no support branch, a cherry-pick conflict, or an unshipped fix — and hand back to a human." },
  ], { x: MX, y: y + 0.05, w: W - MX * 2, h: 0.85 });
  footer(s, PAGE);
}

// =====================================================================
// SLIDE 12 — /qa-review-bl
// =====================================================================
{
  const s = newSlide();
  let y = header(s, {
    eyebrow: "New this sprint",
    tag: "New command",
    tagColor: C.agent,
    title: "/qa-review-bl",
    subtitle: "The business-logic oracle (business-logic.md) audits and corrects itself — triangulating each rule against docs (VirtoOZ) + live (Playwright) + source (GitHub MCP), then applying confirmed corrections automatically, gated by evidence.",
  });
  table(s,
    ["Verdict", "What it means", "Action"],
    [
      [[{ text: "CONFIRMED", bold: true, color: C.pass }], "All sources agree with the current rule.", "No change."],
      [[{ text: "DRIFT", bold: true, color: C.warn }], "Sources moved; the rule is stale.", [{ text: "Auto-applied", bold: true }, { text: " (body-only, stamped, env-agnostic)." }]],
      [[{ text: "MISSING", bold: true, color: C.agent }], "A real invariant not yet recorded.", [{ text: "Auto-added.", bold: true }]],
      [[{ text: "CONTRADICTORY / UNGROUNDED / RETIRE", bold: true, color: C.crit }], "Sources disagree, or evidence is thin.", [{ text: "Human-review proposal", bold: true }, { text: " — never auto-applied." }]],
    ],
    { x: MX, y: y + 0.05, w: W - MX * 2, colW: [3.7, 4.3, 4.13] }
  );
  s.addText("Runs on demand, and automatically as a test-lifecycle phase — scoped to just the rules a run touches — so the knowledge base can't quietly rot. Every run leaves an audit trail. This deliberately supersedes the former \"never auto-edit business-logic.md\" rule.", {
    x: MX, y: y + 3.0, w: W - MX * 2, h: 0.9, fontFace: SANS, fontSize: 11.5, color: C.soft, italic: false, valign: "top", lineSpacingMultiple: 1.1,
  });
  footer(s, PAGE);
}

// =====================================================================
// SLIDE 13 — /qa-fix gate ladder
// =====================================================================
{
  const s = newSlide();
  let y = header(s, {
    eyebrow: "New this sprint",
    tag: "Matured this sprint",
    tagColor: C.accent,
    title: "/qa-fix & the developer team",
    subtitle: "Takes a bug already filed by /qa-bug and walks it through a gate ladder, delegating to a write-capable dev team by repo kind. It never auto-merges — it ends at an open PR for human review.",
  });
  table(s,
    ["Gate", "What must pass"],
    [
      [[{ text: "G0", bold: true }, { text: " Triage" }], [{ text: "Simple, low-risk, code-fixable defect — clear repro, localized cause, no refactor/breaking change. When in doubt, it BAILs (a clean STOP is a success)." }]],
      [[{ text: "G1", bold: true }, { text: " Single repo" }], "Resolves to exactly one allowed repo; ownership + contribution plan pick the PR target."],
      [[{ text: "G2", bold: true }, { text: " Reproduce (red)" }], "A new unit test encodes the bug and fails on current code."],
      [[{ text: "G3", bold: true }, { text: " Fix (green)" }], "A minimal diff turns it green; all pre-existing tests stay green and unmodified; invariants preserved."],
      [[{ text: "G4", bold: true }, { text: " Review" }], "A kind-appropriate reviewer agent checks single-repo scope, no test edits, idiomatic & minimal, no breaking contract."],
      [[{ text: "G5", bold: true }, { text: " Build + CI" }], "Local build/tests, then the PR's CI — build, unit tests, SonarCloud quality gate, deployed auto-tests — all green."],
      [[{ text: "G6", bold: true }, { text: " E2E verify" }], "Once the artifact deploys, a QA expert reruns the affected regression live."],
      [[{ text: "G7", bold: true, color: C.crit }, { text: " Human review" }], [{ text: "Hard stop — never auto-merge. ", bold: true, color: C.crit }, { text: "Ends at an open PR; a human merges." }]],
    ],
    { x: MX, y: y + 0.05, w: W - MX * 2, colW: [2.1, 10.03] }
  );
  footer(s, PAGE);
}

// =====================================================================
// SLIDE 14 — /qa-fix sharpened + /vc-shell-fix
// =====================================================================
{
  const s = newSlide();
  let y = header(s, {
    eyebrow: "New this sprint",
    tag: "Broadened + hardened",
    tagColor: C.accent,
    title: "/vc-shell-fix — embedded @vc-shell apps",
    subtitle: "Fixes a vc-module-* repo's embedded Vue 3 \"shell\" sub-app on @vc-shell/framework. Page-builder was only the first declared — any sub-app in the routing config is in scope. Ships inside the module repo, so it stays a single-repo fix.",
  });
  y = kvRows(s, [
    { dt: "Path 1 — state/logic", dd: "A composable / store / service bug is proven red→green with the sub-app's own real tsx --test runner and plain Vue reactivity — no stubbing, because vue is a real importable package." },
    { dt: "Path 2 — DOM/template", dd: "A mounted-component / rendering / slot / CSS bug uses an ephemeral vitest + @vue/test-utils + jsdom harness reusing the sub-app's own vite.config.ts — stripped from the diff before the PR." },
  ], { x: MX, y: y + 0.05, w: W - MX * 2, dtColor: C.accentInk });

  s.addText("Also sharpened in /qa-fix this sprint", { x: MX, y: y + 0.1, w: 8, h: 0.3, fontFace: SANS, fontSize: 14, bold: true, color: C.text });
  bulletList(s, [
    [{ text: "Module sub-app routing ", bold: true }, { text: "— a bug in a module's embedded Vue 3 shell now routes to the frontend dev team (was a dead end).", color: C.soft }],
    [{ text: "Serena symbol navigation ", bold: true }, { text: "— the fix step uses Serena for precise symbol-level editing, yielding smaller, more surgical diffs.", color: C.soft }],
    [{ text: "Grounded, not assumed ", bold: true }, { text: "— reads the sub-app's own package.json + .claude docs at fix time; the auto-generated src/api_client/ is off-limits.", color: C.soft }],
  ], { x: MX, y: y + 0.45, w: W - MX * 2, h: 1.6 });
  footer(s, PAGE);
}

// =====================================================================
// SLIDE 15 — Regression dashboard & triage
// =====================================================================
{
  const s = newSlide();
  let y = header(s, {
    eyebrow: "New this sprint",
    tag: "Matured this sprint",
    tagColor: C.agent,
    title: "Regression dashboard & triage",
    subtitle: "The regression pipeline gained live visibility and a triage step that turns a red run into an action list.",
  });
  bulletList(s, [
    [{ text: "Live per-case dashboard ", bold: true }, { text: "— a self-refreshing HTML report where each case flips PASS / FAIL / BLOCKED live; gate verdict, summary tiles, and a pass-rate donut update in place.", color: C.soft }],
    [{ text: "Per-failure trace ", bold: true }, { text: "— every real FAIL writes an isolated trace (network failures with body snippets, console errors with parsed stack frames), linked from the dashboard. Secrets redacted.", color: C.soft }],
    [{ text: "Cross-run overview ", bold: true }, { text: "— a consolidated dashboard trends pass-rate per run (bars coloured by gate) with a filterable table; the in-progress run flags live.", color: C.soft }],
    [{ text: "/qa-triage-results ", bold: true }, { text: "— classifies each failure (real product bug vs test defect vs flake / env / known), verifies the real ones live, routes test-defect fixes. Never files a ticket, never auto-fixes — stops for a human.", color: C.soft }],
  ], { x: MX, y: y + 0.05, w: W - MX * 2, h: 3.4, dot: C.agent });
  footer(s, PAGE);
}

// =====================================================================
// SLIDE 16 — The quality bar
// =====================================================================
{
  const s = newSlide();
  let y = header(s, {
    eyebrow: "New this sprint",
    tag: "Raised this sprint",
    tagColor: C.agent,
    title: "The quality bar",
    subtitle: "Trustworthy tests come from grounded assertions and honest data — both were made structural, not conventions.",
  });
  bulletList(s, [
    [{ text: "Assertion provenance gate ", bold: true }, { text: "— every generated assertion is tagged with its source (spec, business rule, docs, or live observation). Ungrounded assertions are blocked from promotion; a new feature must be grounded live first.", color: C.soft }],
    [{ text: "WCAG 2.2 AA accessibility ", bold: true }, { text: "— /qa-accessibility sharpened for WCAG 2.2, axe-core bumped, and the read-only scan allow-listed so it runs cleanly as a safe interaction.", color: C.soft }],
    [{ text: "Env-agnostic test data ", bold: true }, { text: "— every environment owns its own data aliases and no runtime IDs live in committed files, so a suite can never resolve another env's data by accident.", color: C.soft }],
    [{ text: "Test-data engineer, end to end ", bold: true }, { text: "— the agent now authors seeders and runs them live against a non-prod env with drift-guard validation, not just writing the code.", color: C.soft }],
  ], { x: MX, y: y + 0.05, w: W - MX * 2, h: 3.4, dot: C.agent });
  footer(s, PAGE);
}

// =====================================================================
// SLIDE 17 — CLOSING
// =====================================================================
{
  const s = pptx.addSlide();
  bg(s, C.ink);
  s.addShape(pptx.ShapeType.rect, { x: 0, y: H - 0.38, w: W, h: 0.1, fill: { color: C.agent }, line: { type: "none" } });
  s.addShape(pptx.ShapeType.rect, { x: 0, y: H - 0.28, w: W, h: 0.28, fill: { color: C.accent }, line: { type: "none" } });
  s.addText("END OF GUIDE", {
    x: MX, y: 2.6, w: 10, h: 0.4, fontFace: MONO, fontSize: 13, bold: true, color: "3FD0BF", charSpacing: 3,
  });
  s.addText("File · fix · deploy · verify —\nand now, diagnose itself.", {
    x: MX, y: 3.1, w: 11.5, h: 1.5, fontFace: SANS, fontSize: 36, bold: true, color: C.white, lineSpacingMultiple: 1.02,
  });
  s.addText("Pair with the sprint demo deck for the walkthrough.", {
    x: MX, y: 4.8, w: 10, h: 0.4, fontFace: SANS, fontSize: 15, color: "A3B3C7",
  });
  s.addText("vc-fix plugin  ·  Agentic QA for Virto Commerce", {
    x: MX, y: 6.6, w: 10, h: 0.35, fontFace: MONO, fontSize: 11, color: C.faint,
  });
}

const out = join(__dirname, "plugin-guide.pptx");
await pptx.writeFile({ fileName: out });
console.log("Wrote", out);
