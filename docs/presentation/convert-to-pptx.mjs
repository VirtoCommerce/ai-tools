import PptxGenJS from "pptxgenjs";

const pptx = new PptxGenJS();

// Design tokens matching the HTML presentation
const COLORS = {
  bg: "EDE9E3",
  slideBg: "FFFFFF",
  codeBg: "F5F2EC",
  text: "1A1714",
  text2: "5C5852",
  text3: "9C9891",
  accent: "C5603E",
  accent2: "A84F31",
  accentSoft: "F9EFEB",
  green: "2E7D5A",
  greenSoft: "EAF4EF",
  blue: "2959A8",
  blueSoft: "E8EDF6",
  red: "B03A3A",
  redSoft: "F5ECEC",
  white: "FFFFFF",
  dark: "1A1714",
  darkAlt: "2a2420",
  yellow: "8B6E00",
  yellowSoft: "F5F1E5",
};

pptx.defineLayout({ name: "WIDE", width: 13.33, height: 7.5 });
pptx.layout = "WIDE";
pptx.author = "Virto Commerce QA Engineering";
pptx.subject = "Agentic QA — AI-Driven Testing";
pptx.title = "Agentic QA — AI-Driven Testing for Virto Commerce";

// Helper to add slide number
function addSlideNumber(slide, num, total, color = COLORS.text3) {
  slide.addText(`${num} / ${total}`, {
    x: 11.8, y: 0.15, w: 1.3, h: 0.3,
    fontSize: 10, color, align: "right", fontFace: "Segoe UI",
  });
}

// Helper for eyebrow text
function addEyebrow(slide, text, opts = {}) {
  slide.addText(text, {
    x: opts.x || 0.7, y: opts.y || 0.5, w: 5, h: 0.3,
    fontSize: 10, color: opts.color || COLORS.accent, bold: true,
    fontFace: "Segoe UI", charSpacing: 4,
  });
}

// ==================== SLIDE 1: TITLE ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.dark };
  addSlideNumber(slide, 1, 18, "666666");

  addEyebrow(slide, "VIRTO COMMERCE  ·  QA ENGINEERING  ·  2026", { y: 1.0, color: COLORS.accent });

  slide.addText([
    { text: "Agentic QA\n", options: { fontSize: 44, bold: true, color: COLORS.white, fontFace: "Segoe UI" } },
    { text: "AI-Driven Testing", options: { fontSize: 44, bold: true, color: COLORS.accent, fontFace: "Segoe UI" } },
  ], { x: 0.7, y: 1.5, w: 10, h: 2.0 });

  slide.addText("Natural language replaces brittle scripts.\n14 specialized agents. ~3,000 test cases. Zero code required.", {
    x: 0.7, y: 3.4, w: 8, h: 0.8,
    fontSize: 16, color: "AAAAAA", fontFace: "Segoe UI",
  });

  const tags = ["🤖 14 AI Agents", "🧪 97 Test Suites", "⚡ 3 Parallel Browsers", "🔄 CI/CD (Planned)", "🛡️ Self-Healing"];
  tags.forEach((tag, i) => {
    slide.addText(tag, {
      x: 0.7 + i * 2.3, y: 4.5, w: 2.1, h: 0.45,
      fontSize: 11, color: "BBBBBB", fontFace: "Segoe UI",
      fill: { color: "333333" }, shape: pptx.ShapeType.roundRect, rectRadius: 0.2,
      align: "center", valign: "middle",
    });
  });

  // Bottom info
  const info = [
    { label: "PLATFORM", value: "Virto Commerce B2B" },
    { label: "PRESENTATION", value: "~15 minutes" },
    { label: "DATE", value: "May 2026" },
  ];
  slide.addShape(pptx.ShapeType.line, { x: 0.7, y: 5.3, w: 10, h: 0, line: { color: "444444", width: 1 } });
  info.forEach((item, i) => {
    slide.addText(item.label, {
      x: 0.7 + i * 3.2, y: 5.5, w: 2.5, h: 0.25,
      fontSize: 9, color: "666666", fontFace: "Segoe UI", charSpacing: 3,
    });
    slide.addText(item.value, {
      x: 0.7 + i * 3.2, y: 5.75, w: 2.5, h: 0.3,
      fontSize: 13, color: "DDDDDD", fontFace: "Segoe UI",
    });
  });
}

// ==================== SLIDE 2: PROBLEM / BEFORE-AFTER ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slideBg };
  addSlideNumber(slide, 2, 22);
  addEyebrow(slide, "THE PROBLEM WE SOLVE");

  slide.addText("Traditional Automation vs. Agentic QA", {
    x: 0.7, y: 0.85, w: 10, h: 0.5,
    fontSize: 28, bold: true, color: COLORS.accent, fontFace: "Segoe UI",
  });

  // Traditional column
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.7, y: 1.6, w: 5.7, h: 3.2,
    fill: { color: COLORS.redSoft }, line: { color: "D4A0A0", width: 1 }, rectRadius: 0.1,
  });
  slide.addText("❌ Traditional Test Automation", {
    x: 0.9, y: 1.7, w: 5.3, h: 0.35,
    fontSize: 13, bold: true, color: COLORS.red, fontFace: "Segoe UI",
  });
  const tradItems = [
    "✗  Requires Playwright/Selenium engineering skills",
    "✗  Breaks on every CSS class / selector change",
    "✗  High maintenance cost — devs, not QA, fix tests",
    "✗  Adding a test suite = writing hundreds of lines of code",
    "✗  Can't reason about business logic violations",
    "✗  No contextual understanding — only matches patterns",
  ];
  slide.addText(tradItems.join("\n"), {
    x: 0.9, y: 2.1, w: 5.3, h: 2.5,
    fontSize: 12, color: COLORS.text2, fontFace: "Segoe UI", lineSpacingMultiple: 1.5,
  });

  // Agentic column
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 6.8, y: 1.6, w: 5.7, h: 3.2,
    fill: { color: COLORS.greenSoft }, line: { color: "A0C4B0", width: 1 }, rectRadius: 0.1,
  });
  slide.addText("✅ Agentic QA", {
    x: 7.0, y: 1.7, w: 5.3, h: 0.35,
    fontSize: 13, bold: true, color: COLORS.green, fontFace: "Segoe UI",
  });
  const agentItems = [
    "✓  Plain English prompts — no coding required",
    "✓  Self-healing — agents find elements by context",
    "✓  Low maintenance — update the prompt, not the code",
    "✓  Adding a test suite = adding a CSV file",
    "✓  Agents apply business invariants (BL-* rules)",
    "✓  Contextual reasoning: \"this price is wrong because…\"",
  ];
  slide.addText(agentItems.join("\n"), {
    x: 7.0, y: 2.1, w: 5.3, h: 2.5,
    fontSize: 12, color: COLORS.text2, fontFace: "Segoe UI", lineSpacingMultiple: 1.5,
  });

  // Code comparison
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.7, y: 5.0, w: 5.7, h: 2.0,
    fill: { color: COLORS.codeBg }, line: { color: "E0DDD8", width: 1 }, rectRadius: 0.1,
  });
  slide.addText(
    "// Traditional Playwright script (140 lines)\nawait page.goto('/login');\nawait page.fill('[data-id=\"email\"]', user);\nawait page.fill('[data-id=\"pass\"]', pass);\nawait page.click('.submit-btn-v2'); // breaks when renamed\nawait expect(page).toHaveURL('/dashboard');\n// ... 135 more lines of fragile code",
    {
      x: 0.9, y: 5.1, w: 5.3, h: 1.8,
      fontSize: 10, color: COLORS.text2, fontFace: "Consolas",
    }
  );

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 6.8, y: 5.0, w: 5.7, h: 2.0,
    fill: { color: COLORS.greenSoft }, line: { color: "A0C4B0", width: 1 }, rectRadius: 0.1,
  });
  slide.addText(
    '// Agentic test instruction (3 lines)\n"Sign in to the storefront using the QA test\naccount. Verify the dashboard loads and the\ncart icon shows correct item count."',
    {
      x: 7.0, y: 5.1, w: 5.3, h: 1.8,
      fontSize: 10, color: COLORS.text2, fontFace: "Consolas",
    }
  );
}

// ==================== SLIDE 3: PROJECT OVERVIEW ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slideBg };
  addSlideNumber(slide, 3, 22);
  addEyebrow(slide, "PROJECT OVERVIEW");

  slide.addText("What Is the Agentic QA System?", {
    x: 0.7, y: 0.85, w: 10, h: 0.5,
    fontSize: 28, bold: true, color: COLORS.accent, fontFace: "Segoe UI",
  });
  slide.addText("An LLM-powered testing platform where AI agents execute test cases through real browsers — no test code, no fragile selectors.", {
    x: 0.7, y: 1.4, w: 11, h: 0.5,
    fontSize: 15, color: COLORS.text2, fontFace: "Segoe UI",
  });

  // Three cards
  const cards = [
    { icon: "🧠", title: "AI-Native", desc: "Tests are plain English prompts executed by Claude through MCP browser tools. The LLM reasons about what to click, what to verify, and what constitutes a bug.", color: COLORS.accentSoft, border: COLORS.accent },
    { icon: "🏗️", title: "Modular Architecture", desc: "14 specialized agents, 97 CSV test suites, 20 methodology skills, and 23 shared knowledge files — all coordinated by an orchestrator.", color: COLORS.blueSoft, border: COLORS.blue },
    { icon: "⚙️", title: "CI Pipeline (Planned)", desc: "GitHub Actions triggers daily smoke tests and weekly full regression. Docker container + Claude Agent SDK run suites headlessly with Teams notifications.", color: COLORS.accentSoft, border: COLORS.accent },
  ];
  cards.forEach((c, i) => {
    const x = 0.7 + i * 4.0;
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y: 2.1, w: 3.7, h: 2.5,
      fill: { color: c.color }, line: { color: c.border, width: 1 }, rectRadius: 0.1,
    });
    slide.addText(c.icon, { x, y: 2.2, w: 3.7, h: 0.4, fontSize: 20, align: "left", fontFace: "Segoe UI Emoji", margin: [0, 0, 0, 15] });
    slide.addText(c.title, { x: x + 0.2, y: 2.6, w: 3.3, h: 0.35, fontSize: 14, bold: true, color: COLORS.text, fontFace: "Segoe UI" });
    slide.addText(c.desc, { x: x + 0.2, y: 3.0, w: 3.3, h: 1.5, fontSize: 11, color: COLORS.text2, fontFace: "Segoe UI" });
  });

  // Scope + Number
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.7, y: 4.9, w: 11.9, h: 1.8,
    fill: { color: COLORS.codeBg }, line: { color: "E0DDD8", width: 1 }, rectRadius: 0.1,
  });
  slide.addText("Scope: Virto Commerce B2B e-commerce platform", {
    x: 0.9, y: 5.0, w: 8, h: 0.35,
    fontSize: 14, bold: true, color: COLORS.text, fontFace: "Segoe UI",
  });
  const badges = ["Storefront", "Admin SPA", "REST API", "GraphQL xAPI", "Checkout / Payment", "B2B Multi-org", "GA4 Tracking", "WCAG 2.1 AA", "Storybook (55)"];
  const badgeColors = [COLORS.accent, COLORS.blue, COLORS.green, COLORS.accent, COLORS.blue, COLORS.green, COLORS.text2, COLORS.text2, COLORS.text2];
  const badgeBgs = [COLORS.accentSoft, COLORS.blueSoft, COLORS.greenSoft, COLORS.accentSoft, COLORS.blueSoft, COLORS.greenSoft, COLORS.codeBg, COLORS.codeBg, COLORS.codeBg];
  badges.forEach((b, i) => {
    const col = i % 5;
    const row = Math.floor(i / 5);
    slide.addText(b, {
      x: 0.9 + col * 2.0, y: 5.45 + row * 0.4, w: 1.85, h: 0.32,
      fontSize: 9, color: badgeColors[i], fontFace: "Segoe UI", bold: true,
      fill: { color: badgeBgs[i] }, shape: pptx.ShapeType.roundRect, rectRadius: 0.15,
      align: "center", valign: "middle",
    });
  });

  slide.addText("~3,000", {
    x: 10.5, y: 5.1, w: 2, h: 0.6,
    fontSize: 32, bold: true, color: COLORS.accent, fontFace: "Segoe UI", align: "center",
  });
  slide.addText("test cases across\n97 suites", {
    x: 10.5, y: 5.7, w: 2, h: 0.5,
    fontSize: 11, color: COLORS.text2, fontFace: "Segoe UI", align: "center",
  });
}

// ==================== SLIDE 4: ARCHITECTURE ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slideBg };
  addSlideNumber(slide, 4, 22);
  addEyebrow(slide, "ARCHITECTURE");

  slide.addText("Three Testing Modes, One Foundation", {
    x: 0.7, y: 0.85, w: 10, h: 0.5,
    fontSize: 28, bold: true, color: COLORS.accent, fontFace: "Segoe UI",
  });

  const modes = [
    { badge: "Interactive", title: "Engineer in IDE", steps: ["Claude Code CLI", "14 Specialized Agents", "10 MCP Servers", "3 Real Browsers"], color: COLORS.accent, bg: COLORS.accentSoft },
    { badge: "Agent Teams", title: "Autonomous Regression", steps: ["autonomous-orchestrator", "TeamCreate API", "Token bucket (3+1 slots)", "Exponential backoff"], color: COLORS.blue, bg: COLORS.blueSoft },
    { badge: "CI Pipeline · Planned", title: "GitHub Actions", steps: ["Docker Container", "Claude Agent SDK", "Headless Chromium", "Teams notification"], color: COLORS.accent, bg: COLORS.accentSoft },
  ];

  modes.forEach((m, i) => {
    const x = 0.7 + i * 4.0;
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y: 1.6, w: 3.7, h: 3.6,
      fill: { color: m.bg }, line: { color: m.color, width: 1 }, rectRadius: 0.1,
    });
    slide.addText(m.badge.toUpperCase(), {
      x: x + 0.15, y: 1.7, w: 1.8, h: 0.3,
      fontSize: 9, bold: true, color: m.color, fontFace: "Segoe UI",
    });
    slide.addText(m.title, {
      x: x + 0.15, y: 2.05, w: 3.4, h: 0.35,
      fontSize: 14, bold: true, color: COLORS.text, fontFace: "Segoe UI",
    });
    m.steps.forEach((step, j) => {
      slide.addShape(pptx.ShapeType.roundRect, {
        x: x + 0.2, y: 2.5 + j * 0.6, w: 3.2, h: 0.35,
        fill: { color: COLORS.codeBg }, line: { color: "E0DDD8", width: 1 }, rectRadius: 0.05,
      });
      slide.addText(step, {
        x: x + 0.2, y: 2.5 + j * 0.6, w: 3.2, h: 0.35,
        fontSize: 11, color: COLORS.text, fontFace: "Segoe UI", align: "center", valign: "middle",
      });
      if (j < m.steps.length - 1) {
        slide.addText("↓", {
          x: x + 1.4, y: 2.85 + j * 0.6, w: 0.5, h: 0.2,
          fontSize: 12, color: m.color, fontFace: "Segoe UI", align: "center",
        });
      }
    });
  });

  // Foundation bar
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.7, y: 5.5, w: 11.9, h: 1.3,
    fill: { color: COLORS.codeBg }, line: { color: "E0DDD8", width: 1 }, rectRadius: 0.1,
  });
  slide.addText("SHARED FOUNDATION — USED BY ALL THREE MODES", {
    x: 0.9, y: 5.6, w: 8, h: 0.3,
    fontSize: 10, bold: true, color: COLORS.text2, fontFace: "Segoe UI", charSpacing: 2,
  });
  const foundation = ["test-suites.json (97 suites)", "regression/suites/ (CSV)", ".claude/agents/ (definitions)", "knowledge/ (23 files)", ".claude/skills/ (20 skills)"];
  foundation.forEach((f, i) => {
    slide.addText(f, {
      x: 0.9 + i * 2.35, y: 6.0, w: 2.2, h: 0.3,
      fontSize: 9, color: COLORS.text2, fontFace: "Segoe UI",
      fill: { color: COLORS.white }, shape: pptx.ShapeType.roundRect, rectRadius: 0.15,
      align: "center", valign: "middle",
    });
  });
}

// ==================== SLIDE 5: BY THE NUMBERS ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slideBg };
  addSlideNumber(slide, 5, 22);
  addEyebrow(slide, "SYSTEM SCALE");

  slide.addText("Agentic QA at a Glance", {
    x: 0.7, y: 0.85, w: 10, h: 0.5,
    fontSize: 28, bold: true, color: COLORS.accent, fontFace: "Segoe UI",
  });

  const stats = [
    { num: "14", label: "Specialized AI Agents\n(10 QA + 4 BA)" },
    { num: "97", label: "Test Suites\n(45 frontend + 52 backend)" },
    { num: "~3,000", label: "Test Cases\n(~1,500 frontend + ~1,500 backend)" },
    { num: "10", label: "MCP Server Integrations\n(browsers + Figma + Azure + …)" },
  ];
  stats.forEach((s, i) => {
    const x = 0.7 + i * 3.1;
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y: 1.6, w: 2.8, h: 1.6,
      fill: { color: COLORS.codeBg }, line: { color: "E0DDD8", width: 1 }, rectRadius: 0.1,
    });
    slide.addText(s.num, {
      x, y: 1.7, w: 2.8, h: 0.7,
      fontSize: 32, bold: true, color: COLORS.accent, fontFace: "Segoe UI", align: "center",
    });
    slide.addText(s.label, {
      x, y: 2.4, w: 2.8, h: 0.7,
      fontSize: 10, color: COLORS.text2, fontFace: "Segoe UI", align: "center",
    });
  });

  // Intelligence Layer
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.7, y: 3.6, w: 6.0, h: 1.2,
    fill: { color: COLORS.greenSoft }, line: { color: "A0C4B0", width: 1 }, rectRadius: 0.1,
  });
  slide.addText("🧠 Intelligence Layer", {
    x: 0.9, y: 3.7, w: 5.6, h: 0.3,
    fontSize: 11, bold: true, color: COLORS.green, fontFace: "Segoe UI",
  });
  slide.addText("20 methodology skills (ISTQB · WCAG · SBTM) · 23 shared knowledge files · BL-* business rules enforcement", {
    x: 0.9, y: 4.05, w: 5.6, h: 0.6,
    fontSize: 12, color: COLORS.text2, fontFace: "Segoe UI",
  });

  // Coverage Selection
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 7.0, y: 3.6, w: 5.6, h: 1.2,
    fill: { color: COLORS.blueSoft }, line: { color: "A0B0D0", width: 1 }, rectRadius: 0.1,
  });
  slide.addText("🔄 Coverage Selection", {
    x: 7.2, y: 3.7, w: 5.2, h: 0.3,
    fontSize: 11, bold: true, color: COLORS.blue, fontFace: "Segoe UI",
  });
  slide.addText("smoke: ~140 tests  |  critical: ~230 tests  |  sprint: plan-driven (~2,700)  |  full: ~3,000 tests", {
    x: 7.2, y: 4.05, w: 5.2, h: 0.6,
    fontSize: 12, color: COLORS.text2, fontFace: "Segoe UI",
  });
}

// ==================== SLIDE 6: AGENT TEAMS ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slideBg };
  addSlideNumber(slide, 6, 22);
  addEyebrow(slide, "AGENT TEAMS");

  slide.addText("14 Specialized Agents — Four-Layer Architecture", {
    x: 0.7, y: 0.85, w: 11, h: 0.5,
    fontSize: 26, bold: true, color: COLORS.accent, fontFace: "Segoe UI",
  });

  // Orchestrators label
  slide.addText("🎯 ORCHESTRATORS — COORDINATE THE TEAM", {
    x: 0.7, y: 1.5, w: 8, h: 0.3,
    fontSize: 9, bold: true, color: COLORS.blue, fontFace: "Segoe UI", charSpacing: 3,
  });

  const orchestrators = [
    { name: "qa-lead-orchestrator", desc: "JIRA workflow · go/no-go decisions · delegates to specialists" },
    { name: "regression-orchestrator", desc: "36-suite parallel runs · browser pool · retry & fallback" },
    { name: "autonomous-orchestrator", desc: "Agent Teams API · token bucket · exponential backoff" },
  ];
  orchestrators.forEach((o, i) => {
    const x = 0.7 + i * 4.0;
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y: 1.9, w: 3.7, h: 1.1,
      fill: { color: COLORS.blueSoft }, line: { color: "A0B0D0", width: 1 }, rectRadius: 0.1,
    });
    slide.addText(o.name, {
      x: x + 0.15, y: 1.95, w: 3.4, h: 0.35,
      fontSize: 12, bold: true, color: "3D4B8A", fontFace: "Segoe UI",
    });
    slide.addText(o.desc, {
      x: x + 0.15, y: 2.35, w: 3.4, h: 0.55,
      fontSize: 11, color: COLORS.text2, fontFace: "Segoe UI",
    });
  });

  // Execution Specialists
  slide.addText("🔬 EXECUTION SPECIALISTS — EACH GETS ITS OWN BROWSER", {
    x: 0.7, y: 3.2, w: 10, h: 0.3,
    fontSize: 9, bold: true, color: COLORS.accent, fontFace: "Segoe UI", charSpacing: 3,
  });

  const specialists = [
    { name: "qa-frontend-expert", desc: "Storefront · checkout · cart · mobile", browser: "🌐 Chrome" },
    { name: "qa-backend-expert", desc: "REST API · GraphQL · Admin SPA", browser: "⚡ Edge" },
    { name: "qa-testing-expert", desc: "UI testing · Figma comparison · HAR", browser: "🦊 Firefox" },
    { name: "ui-ux-expert", desc: "Storybook · WCAG 2.1 AA · design", browser: "🔧 DevTools" },
  ];
  specialists.forEach((s, i) => {
    const x = 0.7 + i * 3.1;
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y: 3.6, w: 2.8, h: 1.8,
      fill: { color: COLORS.accentSoft }, line: { color: COLORS.accent, width: 1 }, rectRadius: 0.1,
    });
    slide.addText(s.name, {
      x: x + 0.1, y: 3.7, w: 2.6, h: 0.35,
      fontSize: 11, bold: true, color: COLORS.accent, fontFace: "Segoe UI",
    });
    slide.addText(s.desc, {
      x: x + 0.1, y: 4.05, w: 2.6, h: 0.6,
      fontSize: 10, color: COLORS.text2, fontFace: "Segoe UI",
    });
    slide.addText(s.browser, {
      x: x + 0.1, y: 4.7, w: 1.3, h: 0.3,
      fontSize: 9, bold: true, color: COLORS.accent, fontFace: "Segoe UI",
      fill: { color: COLORS.white }, shape: pptx.ShapeType.roundRect, rectRadius: 0.15,
      align: "center", valign: "middle",
    });
  });

  // Bottom bar
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.7, y: 5.7, w: 11.9, h: 0.7,
    fill: { color: COLORS.codeBg }, line: { color: "E0DDD8", width: 1 }, rectRadius: 0.1,
  });
  slide.addText("+ 4 BA agents: system-analyzer · api-specialist · story-writer · doc-writer     |     + test-management-specialist: test plans · RTM · coverage matrix", {
    x: 0.9, y: 5.8, w: 11.5, h: 0.5,
    fontSize: 11, color: COLORS.text2, fontFace: "Segoe UI",
  });
}

// ==================== SLIDE 7: COMMANDS ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slideBg };
  addSlideNumber(slide, 7, 22);
  addEyebrow(slide, "ONE-COMMAND INTERFACE");

  slide.addText("16 Slash Commands — Full QA Lifecycle from the IDE", {
    x: 0.7, y: 0.85, w: 11, h: 0.5,
    fontSize: 26, bold: true, color: COLORS.accent, fontFace: "Segoe UI",
  });
  slide.addText("Type a command in VS Code or Cursor — the system does the rest. No scripts, no dashboards, no context switching.", {
    x: 0.7, y: 1.4, w: 11, h: 0.4,
    fontSize: 14, color: COLORS.text2, fontFace: "Segoe UI",
  });

  const commands = [
    { cmd: "/qa-smoke", desc: "12 P0 tests in 2 parallel tracks", extra: "→ GO / NO-GO in ~15 min", bg: COLORS.accentSoft, cmdColor: COLORS.accent, extraColor: COLORS.green },
    { cmd: "/qa-test VCST-XXXX", desc: "Read JIRA ticket → dispatch agents → file bugs", extra: "Closes the ticket automatically", bg: COLORS.codeBg, cmdColor: COLORS.text },
    { cmd: "/qa-regression sprint", desc: "Plan-driven (~88 suites · ~2,700 tests) · 3 browsers in parallel", extra: "Also: smoke · critical · full · custom IDs", bg: COLORS.codeBg, cmdColor: COLORS.text },
    { cmd: "/qa-bug [description]", desc: "Reproduce · HAR + screenshots · file JIRA", extra: "P0–P3 severity + root cause analysis", bg: COLORS.codeBg, cmdColor: COLORS.text },
    { cmd: "/qa-status  auto", desc: "Live dashboard: runs · JIRA queue · env health", extra: "No browser required · read-only", bg: COLORS.blueSoft, cmdColor: COLORS.blue },
    { cmd: "/qa-env-check  auto", desc: "Validate 33 env vars · endpoints · MCP servers", extra: "Run before every presentation", bg: COLORS.greenSoft, cmdColor: COLORS.green },
  ];
  commands.forEach((c, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 0.7 + col * 4.0;
    const y = 2.0 + row * 2.4;

    slide.addShape(pptx.ShapeType.roundRect, {
      x, y, w: 3.7, h: 2.1,
      fill: { color: c.bg }, line: { color: "E0DDD8", width: 1 }, rectRadius: 0.1,
    });
    slide.addText(c.cmd, {
      x: x + 0.15, y: y + 0.1, w: 3.4, h: 0.35,
      fontSize: 13, bold: true, color: c.cmdColor, fontFace: "Consolas",
    });
    slide.addText(c.desc, {
      x: x + 0.15, y: y + 0.55, w: 3.4, h: 0.6,
      fontSize: 12, color: COLORS.text2, fontFace: "Segoe UI",
    });
    slide.addText(c.extra, {
      x: x + 0.15, y: y + 1.2, w: 3.4, h: 0.4,
      fontSize: 11, color: c.extraColor || COLORS.text3, fontFace: "Segoe UI",
    });
  });
}

// ==================== SLIDE 8: PIPELINE & QUALITY COMMANDS ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slideBg };
  addSlideNumber(slide, 8, 22);
  addEyebrow(slide, "PIPELINE & QUALITY COMMANDS");

  slide.addText("Test Lifecycle, Design Audit, Fix Verification", {
    x: 0.7, y: 0.85, w: 11, h: 0.5,
    fontSize: 26, bold: true, color: COLORS.accent, fontFace: "Segoe UI",
  });
  slide.addText("Three commands that round out the QA cycle — keeping suites in sync with code, catching design bugs in both Storybook and the live storefront, and closing the loop on every bug fix.", {
    x: 0.7, y: 1.4, w: 11, h: 0.5,
    fontSize: 14, color: COLORS.text2, fontFace: "Segoe UI",
  });

  const lifecycleCommands = [
    {
      cmd: "/qa-test-lifecycle",
      desc: "Unified pipeline for a suite, domain, ticket, PR, module, or diff",
      extra: "scope → sync → analyze → generate → review → fix → verify → approve",
      bg: COLORS.accentSoft, cmdColor: COLORS.accent,
    },
    {
      cmd: "/qa-design",
      desc: "Dual Storybook + Storefront BL-UI audit",
      extra: "Catches isolation-only vs integration-only bugs · matrix-driven scope",
      bg: COLORS.blueSoft, cmdColor: COLORS.blue,
    },
    {
      cmd: "/qa-verify-fix VCST-XXXX",
      desc: "Verify a bug fix end-to-end",
      extra: "Fetch ticket → reproduce STR → confirm fix → regression checks → transition JIRA",
      bg: COLORS.greenSoft, cmdColor: COLORS.green,
    },
  ];
  lifecycleCommands.forEach((c, i) => {
    const x = 0.7 + i * 4.0;
    const y = 2.1;
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y, w: 3.7, h: 2.5,
      fill: { color: c.bg }, line: { color: "E0DDD8", width: 1 }, rectRadius: 0.1,
    });
    slide.addText(c.cmd, {
      x: x + 0.15, y: y + 0.15, w: 3.4, h: 0.35,
      fontSize: 13, bold: true, color: c.cmdColor, fontFace: "Consolas",
    });
    slide.addText(c.desc, {
      x: x + 0.15, y: y + 0.6, w: 3.4, h: 0.6,
      fontSize: 12, color: COLORS.text2, fontFace: "Segoe UI",
    });
    slide.addText(c.extra, {
      x: x + 0.15, y: y + 1.3, w: 3.4, h: 1.0,
      fontSize: 11, color: COLORS.text3, fontFace: "Segoe UI",
    });
  });

  // Bottom rationale bar
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.7, y: 5.0, w: 11.9, h: 1.4,
    fill: { color: COLORS.codeBg }, line: { color: "E0DDD8", width: 1 }, rectRadius: 0.1,
  });
  slide.addText([
    { text: "Why these matter: ", options: { bold: true, color: COLORS.text } },
    { text: "/qa-test-lifecycle keeps the test suite in sync with code changes — no more stale Steps or Assertions after a PR merges. /qa-design spots bugs that hide either in component isolation or only at integration. /qa-verify-fix closes the feedback loop with developers and JIRA — verified fixes ship, regressions stay caught.", options: { color: COLORS.text2 } },
  ], {
    x: 0.9, y: 5.15, w: 11.5, h: 1.1,
    fontSize: 12, fontFace: "Segoe UI",
  });
}

// ==================== SLIDE 9: MCP SERVERS ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slideBg };
  addSlideNumber(slide, 9, 22);
  addEyebrow(slide, "POWER FEATURE #1");

  slide.addText("10 MCP Servers — Claude's Eyes, Hands & Memory", {
    x: 0.7, y: 0.85, w: 11, h: 0.5,
    fontSize: 26, bold: true, color: COLORS.accent, fontFace: "Segoe UI",
  });

  // Flow diagram
  const flowItems = [
    { text: "👨‍💻\nEngineer\ntypes command", x: 0.7, w: 1.5, bg: COLORS.codeBg },
    { text: "→", x: 2.3, w: 0.3, bg: null },
    { text: "🧠\nClaude\nReasons · Plans\nExecutes · Judges", x: 2.7, w: 2.0, bg: COLORS.accentSoft },
    { text: "↔", x: 4.8, w: 0.3, bg: null },
    { text: "10 MCP SERVERS\nplaywright ×3 · DevTools\nfigma · github · postman\ncontext7 · azure · atlassian", x: 5.2, w: 3.0, bg: COLORS.blueSoft },
    { text: "→", x: 8.3, w: 0.3, bg: null },
    { text: "🌐 Chrome\n🦊 Firefox\n⚡ Edge", x: 8.7, w: 1.5, bg: COLORS.codeBg },
    { text: "→", x: 10.3, w: 0.3, bg: null },
    { text: "📋\nReports\nScreenshots\nHAR · JIRA", x: 10.7, w: 1.8, bg: COLORS.greenSoft },
  ];
  flowItems.forEach((item) => {
    if (item.bg) {
      slide.addShape(pptx.ShapeType.roundRect, {
        x: item.x, y: 1.6, w: item.w, h: 1.6,
        fill: { color: item.bg }, line: { color: "E0DDD8", width: 1 }, rectRadius: 0.1,
      });
    }
    slide.addText(item.text, {
      x: item.x, y: 1.6, w: item.w, h: 1.6,
      fontSize: item.bg ? 10 : 16, color: item.bg ? COLORS.text : COLORS.text3,
      fontFace: "Segoe UI", align: "center", valign: "middle",
    });
  });

  // Four capability cards
  const caps = [
    { icon: "🌐", title: "Browser Automation", desc: "Chrome · Firefox · Edge run in parallel with full HAR capture and screenshot evidence" },
    { icon: "🎨", title: "Design Comparison", desc: "Figma MCP compares live UI screenshots pixel-by-pixel against design specs", bg: COLORS.blueSoft },
    { icon: "🔗", title: "API & Code", desc: "Postman runs API collections · GitHub searches code and reviews PRs automatically" },
    { icon: "☁️", title: "Cloud & Docs", desc: "Azure App Insights for error logs · Context7 for live VC documentation lookup", bg: COLORS.greenSoft },
  ];
  caps.forEach((c, i) => {
    const x = 0.7 + i * 3.1;
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y: 3.6, w: 2.8, h: 2.2,
      fill: { color: c.bg || COLORS.codeBg }, line: { color: "E0DDD8", width: 1 }, rectRadius: 0.1,
    });
    slide.addText(c.icon, {
      x, y: 3.7, w: 2.8, h: 0.5,
      fontSize: 22, fontFace: "Segoe UI Emoji", align: "center",
    });
    slide.addText(c.title, {
      x: x + 0.1, y: 4.2, w: 2.6, h: 0.3,
      fontSize: 12, bold: true, color: COLORS.text, fontFace: "Segoe UI", align: "center",
    });
    slide.addText(c.desc, {
      x: x + 0.1, y: 4.55, w: 2.6, h: 1.1,
      fontSize: 10, color: COLORS.text2, fontFace: "Segoe UI", align: "center",
    });
  });
}

// ==================== SLIDE 10: BUSINESS RULES ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slideBg };
  addSlideNumber(slide, 10, 22);
  addEyebrow(slide, "POWER FEATURE #2");

  slide.addText("Business Rules & Edge Case Libraries", {
    x: 0.7, y: 0.85, w: 10, h: 0.5,
    fontSize: 26, bold: true, color: COLORS.accent, fontFace: "Segoe UI",
  });
  slide.addText("All agents share a central business-logic.md — testable platform invariants (BL-* IDs). Violations are flagged as bugs automatically.", {
    x: 0.7, y: 1.4, w: 11, h: 0.4,
    fontSize: 13, color: COLORS.text2, fontFace: "Segoe UI",
  });

  // BL-* Rules table
  slide.addText("Business Logic Invariants (BL-* Rules)", {
    x: 0.7, y: 1.95, w: 6, h: 0.35,
    fontSize: 13, bold: true, color: COLORS.accent, fontFace: "Segoe UI",
  });

  const blRules = [
    ["BL-PRICE-001", "Pricing", "Discount stacking must never exceed 100%"],
    ["BL-PRICE-002", "Pricing", "Sale price must always be lower than list price"],
    ["BL-CART-004", "Cart", "Out-of-stock items must not be purchasable"],
    ["BL-ORD-001", "Orders", "Order cancellation must reverse inventory"],
    ["BL-AUTH-002", "Auth", "Unauthenticated users redirected to login"],
    ["BL-B2B-003", "B2B", "Org users can't see other org's data"],
    ["BL-CHECKOUT-001", "Checkout", "Address validated before payment step"],
    ["BL-SEARCH-001", "Search", "Facet counts must match actual result count"],
  ];

  const tableRows = [
    [
      { text: "Rule ID", options: { fontSize: 9, bold: true, color: COLORS.text2, fill: { color: COLORS.codeBg } } },
      { text: "Domain", options: { fontSize: 9, bold: true, color: COLORS.text2, fill: { color: COLORS.codeBg } } },
      { text: "Invariant", options: { fontSize: 9, bold: true, color: COLORS.text2, fill: { color: COLORS.codeBg } } },
    ],
    ...blRules.map((r) => [
      { text: r[0], options: { fontSize: 9, color: COLORS.accent, fontFace: "Consolas" } },
      { text: r[1], options: { fontSize: 9, color: COLORS.text2 } },
      { text: r[2], options: { fontSize: 9, color: COLORS.text } },
    ]),
  ];
  slide.addTable(tableRows, {
    x: 0.7, y: 2.35, w: 6.2, colW: [1.5, 0.8, 3.9],
    border: { type: "solid", pt: 0.5, color: "E0DDD8" },
    fontFace: "Segoe UI",
  });

  // ECL-* table (right side)
  slide.addText("Edge Case Library (ECL-* Patterns)", {
    x: 7.2, y: 1.95, w: 5, h: 0.35,
    fontSize: 13, bold: true, color: COLORS.blue, fontFace: "Segoe UI",
  });
  slide.addText("13 generic e-commerce edge case categories + 7 VC-specific patterns (ECL-* IDs). Cross-referenced to BL-* invariants.", {
    x: 7.2, y: 2.35, w: 5.3, h: 0.55,
    fontSize: 10, color: COLORS.text2, fontFace: "Segoe UI",
  });

  const eclRows = [
    [
      { text: "ECL ID", options: { fontSize: 9, bold: true, color: COLORS.text2, fill: { color: COLORS.codeBg } } },
      { text: "Category", options: { fontSize: 9, bold: true, color: COLORS.text2, fill: { color: COLORS.codeBg } } },
      { text: "Example", options: { fontSize: 9, bold: true, color: COLORS.text2, fill: { color: COLORS.codeBg } } },
    ],
    [{ text: "ECL-1.1", options: { fontSize: 9, color: COLORS.blue, fontFace: "Consolas" } }, { text: "Payment", options: { fontSize: 9 } }, { text: "Expired credit card at checkout", options: { fontSize: 9 } }],
    [{ text: "ECL-2.3", options: { fontSize: 9, color: COLORS.blue, fontFace: "Consolas" } }, { text: "Pricing", options: { fontSize: 9 } }, { text: "Zero-price product in cart", options: { fontSize: 9 } }],
    [{ text: "ECL-3.1", options: { fontSize: 9, color: COLORS.blue, fontFace: "Consolas" } }, { text: "Inventory", options: { fontSize: 9 } }, { text: "Last item reserved during checkout", options: { fontSize: 9 } }],
    [{ text: "ECL-5.1", options: { fontSize: 9, color: COLORS.blue, fontFace: "Consolas" } }, { text: "Concurrency", options: { fontSize: 9 } }, { text: "Concurrent cart modification", options: { fontSize: 9 } }],
    [{ text: "ECL-7.2", options: { fontSize: 9, color: COLORS.blue, fontFace: "Consolas" } }, { text: "B2B / Auth", options: { fontSize: 9 } }, { text: "Viewer attempts purchase", options: { fontSize: 9 } }],
  ];
  slide.addTable(eclRows, {
    x: 7.2, y: 3.0, w: 5.3, colW: [0.9, 1.1, 3.3],
    border: { type: "solid", pt: 0.5, color: "E0DDD8" },
    fontFace: "Segoe UI",
  });

  // Bottom cards
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.7, y: 5.6, w: 6.2, h: 0.9,
    fill: { color: COLORS.greenSoft }, line: { color: "A0C4B0", width: 1 }, rectRadius: 0.1,
  });
  slide.addText("Agents don't just pass/fail — they explain why in business terms:\n\"BL-PRICE-001 violated — applied coupon caused net price below $0.\"", {
    x: 0.9, y: 5.65, w: 5.8, h: 0.8,
    fontSize: 11, color: COLORS.green, fontFace: "Segoe UI", italic: true,
  });

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 7.2, y: 5.6, w: 5.3, h: 0.9,
    fill: { color: COLORS.accentSoft }, line: { color: COLORS.accent, width: 1 }, rectRadius: 0.1,
  });
  slide.addText("How they work together:\nJIRA ticket → Auto-detect BL-* + ECL-* → Test cases with cited rules", {
    x: 7.4, y: 5.65, w: 4.9, h: 0.8,
    fontSize: 11, color: COLORS.text2, fontFace: "Segoe UI",
  });
}

// ==================== SLIDE 11: PARALLEL REGRESSION ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slideBg };
  addSlideNumber(slide, 11, 22);
  addEyebrow(slide, "POWER FEATURE #3");

  slide.addText("Parallel Regression with Automated Quality Gates", {
    x: 0.7, y: 0.85, w: 11, h: 0.5,
    fontSize: 26, bold: true, color: COLORS.accent, fontFace: "Segoe UI",
  });

  // Browser pool visualization
  slide.addText("PARALLEL BROWSER POOL — SIMULTANEOUS SUITE EXECUTION", {
    x: 0.7, y: 1.55, w: 8, h: 0.25,
    fontSize: 9, bold: true, color: COLORS.text2, fontFace: "Segoe UI", charSpacing: 2,
  });

  const browsers = [
    { name: "🌐 Chrome", color: COLORS.accent, bg: COLORS.accentSoft, suites: ["Suite 01 · Smoke", "Suite 04 · Cart", "Suite 07 · Perf"] },
    { name: "🦊 Firefox", color: COLORS.blue, bg: COLORS.blueSoft, suites: ["Suite 02 · Auth", "Suite 05 · Checkout", "Suite 06 · Payment"] },
    { name: "⚡ Edge", color: COLORS.green, bg: COLORS.greenSoft, suites: ["Suite 03 · Catalog", "Suite 08 · Security", "Suite 14 · Platform API"] },
  ];
  browsers.forEach((b, i) => {
    const y = 1.9 + i * 0.55;
    slide.addText(b.name, {
      x: 0.7, y, w: 1.2, h: 0.4,
      fontSize: 10, bold: true, color: b.color, fontFace: "Segoe UI",
    });
    b.suites.forEach((s, j) => {
      slide.addShape(pptx.ShapeType.roundRect, {
        x: 2.0 + j * 2.2, y, w: 2.0, h: 0.4,
        fill: { color: b.bg }, line: { color: b.color, width: 1 }, rectRadius: 0.05,
      });
      slide.addText(s, {
        x: 2.0 + j * 2.2, y, w: 2.0, h: 0.4,
        fontSize: 9, color: b.color, fontFace: "Segoe UI", align: "center", valign: "middle",
      });
    });
    slide.addText("…", {
      x: 8.6, y, w: 0.5, h: 0.4,
      fontSize: 10, color: COLORS.text3, fontFace: "Segoe UI", align: "center", valign: "middle",
    });
  });

  // Selection table
  const selRows = [
    [
      { text: "Selection", options: { fontSize: 10, bold: true, color: COLORS.text2, fill: { color: COLORS.codeBg } } },
      { text: "Suites", options: { fontSize: 10, bold: true, color: COLORS.text2, fill: { color: COLORS.codeBg } } },
      { text: "Tests", options: { fontSize: 10, bold: true, color: COLORS.text2, fill: { color: COLORS.codeBg } } },
      { text: "Use Case", options: { fontSize: 10, bold: true, color: COLORS.text2, fill: { color: COLORS.codeBg } } },
    ],
    [{ text: "smoke" }, { text: "2" }, { text: "~140" }, { text: "Daily pre-deploy" }],
    [{ text: "critical" }, { text: "5 (P0)" }, { text: "~230" }, { text: "Pre-release P0 gate" }],
    [{ text: "sprint" }, { text: "~88 (plan)" }, { text: "~2,700" }, { text: "Sprint release gate" }],
    [{ text: "full" }, { text: "97" }, { text: "~3,000" }, { text: "Production release" }],
  ];
  slide.addTable(selRows, {
    x: 0.7, y: 3.7, w: 8.0, colW: [1.5, 1.0, 1.0, 4.5],
    border: { type: "solid", pt: 0.5, color: "E0DDD8" },
    fontFace: "Segoe UI", fontSize: 10,
  });

  // Quality Gates
  slide.addText("Quality Gate Verdicts", {
    x: 9.3, y: 1.55, w: 3.5, h: 0.35,
    fontSize: 13, bold: true, color: COLORS.text, fontFace: "Segoe UI",
  });

  const gates = [
    { verdict: "✅ APPROVED", desc: "≥95% pass rate · 0 P0 bugs · safe to deploy", color: COLORS.green, bg: COLORS.greenSoft },
    { verdict: "⚠️ CONDITIONAL", desc: "P2/P3 issues only · deploy with tracked follow-ups", color: COLORS.yellow, bg: COLORS.yellowSoft },
    { verdict: "🚫 BLOCKED", desc: "P0/P1 failure · No deployment, regardless of schedule", color: COLORS.red, bg: COLORS.redSoft },
  ];
  gates.forEach((g, i) => {
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 9.3, y: 2.0 + i * 1.0, w: 3.5, h: 0.8,
      fill: { color: g.bg }, line: { color: g.color, width: 1 }, rectRadius: 0.1,
    });
    slide.addText(g.verdict, {
      x: 9.45, y: 2.05 + i * 1.0, w: 3.2, h: 0.3,
      fontSize: 12, bold: true, color: g.color, fontFace: "Segoe UI",
    });
    slide.addText(g.desc, {
      x: 9.45, y: 2.38 + i * 1.0, w: 3.2, h: 0.35,
      fontSize: 10, color: COLORS.text2, fontFace: "Segoe UI",
    });
  });

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 9.3, y: 5.1, w: 3.5, h: 0.7,
    fill: { color: COLORS.blueSoft }, line: { color: "A0B0D0", width: 1 }, rectRadius: 0.1,
  });
  slide.addText("Retry logic: max 2 retries\nbrowser fallback chain:\nchrome → firefox → edge", {
    x: 9.45, y: 5.15, w: 3.2, h: 0.6,
    fontSize: 10, color: COLORS.blue, fontFace: "Segoe UI",
  });
}

// ==================== SLIDE 12: CI/CD ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slideBg };
  addSlideNumber(slide, 12, 22);
  addEyebrow(slide, "CI/CD PIPELINE · PLANNED");

  slide.addText("Full CI/CD Automation Pipeline", {
    x: 0.7, y: 0.85, w: 10, h: 0.5,
    fontSize: 28, bold: true, color: COLORS.accent, fontFace: "Segoe UI",
  });

  // Pipeline diagram
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.7, y: 1.6, w: 7.5, h: 4.2,
    fill: { color: COLORS.codeBg }, line: { color: "E0DDD8", width: 1 }, rectRadius: 0.1,
  });
  slide.addText(
    "GitHub Actions (schedule / manual trigger)\n      │\n      ▼\nDocker Container (Playwright + Node.js 18+)\n      │\n      ▼\nClaude Agent SDK — run-regression.ts\n      │\n      ├─── Budget tracking ($5 smoke / $80 full)\n      ├─── Suite batching (max 3 parallel)\n      │\n      ▼\nHeadless Chromium — execute CSV test suites\n      │\n      ▼\nreports/regression/ci-YYYY-MM-DD/\n      │\n      ▼\nTeams Adaptive Card notification → QA channel",
    {
      x: 0.9, y: 1.7, w: 7.1, h: 4.0,
      fontSize: 11, color: COLORS.text, fontFace: "Consolas",
    }
  );

  // Schedule cards
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.7, y: 6.0, w: 3.5, h: 0.9,
    fill: { color: COLORS.codeBg }, line: { color: "E0DDD8", width: 1 }, rectRadius: 0.1,
  });
  slide.addText("Daily Smoke\nMon–Fri 6:00 AM UTC · Suite 01 · $5 budget", {
    x: 0.9, y: 6.05, w: 3.1, h: 0.8,
    fontSize: 11, color: COLORS.text2, fontFace: "Segoe UI",
  });

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 4.5, y: 6.0, w: 3.5, h: 0.9,
    fill: { color: COLORS.codeBg }, line: { color: "E0DDD8", width: 1 }, rectRadius: 0.1,
  });
  slide.addText("Weekly Full\nSunday 2:00 AM UTC · All 97 suites · $80", {
    x: 4.7, y: 6.05, w: 3.1, h: 0.8,
    fontSize: 11, color: COLORS.text2, fontFace: "Segoe UI",
  });

  // CI Key Features
  slide.addText("CI Key Features", {
    x: 8.8, y: 1.6, w: 4, h: 0.35,
    fontSize: 14, bold: true, color: COLORS.text, fontFace: "Segoe UI",
  });

  const ciFeatures = [
    "✓  Budget-controlled per-suite allocation",
    "✓  90-day rolling regression history",
    "✓  Artifacts with 30-day retention",
    "✓  Manual trigger: any selection, any env",
    "✓  Teams webhook Adaptive Card",
    "✓  Suite-by-suite breakdown in report",
  ];
  slide.addText(ciFeatures.join("\n"), {
    x: 8.8, y: 2.1, w: 4, h: 2.5,
    fontSize: 11, color: COLORS.text2, fontFace: "Segoe UI", lineSpacingMultiple: 1.5,
  });

  // Docker command
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 8.8, y: 4.9, w: 4, h: 1.2,
    fill: { color: COLORS.accentSoft }, line: { color: COLORS.accent, width: 1 }, rectRadius: 0.1,
  });
  slide.addText("# One command to run any scope\ndocker run --env-file .env \\\n  -e SUITE_SELECTION=critical \\\n  -e TEST_ENVIRONMENT=qa \\\n  vc-regression", {
    x: 9.0, y: 5.0, w: 3.6, h: 1.0,
    fontSize: 9, color: COLORS.accent, fontFace: "Consolas",
  });
}

// ==================== SLIDE 13: KNOWLEDGE + SKILLS ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slideBg };
  addSlideNumber(slide, 13, 22);
  addEyebrow(slide, "POWER FEATURE #5");

  slide.addText("Shared Knowledge + 18 Methodology Skills", {
    x: 0.7, y: 0.85, w: 11, h: 0.5,
    fontSize: 26, bold: true, color: COLORS.accent, fontFace: "Segoe UI",
  });

  // Left: Knowledge files
  slide.addText("12 Shared Knowledge Files", {
    x: 0.7, y: 1.55, w: 6, h: 0.35,
    fontSize: 14, bold: true, color: COLORS.text, fontFace: "Segoe UI",
  });
  slide.addText("All QA agents consult these files simultaneously. Update once — all agents benefit.", {
    x: 0.7, y: 1.95, w: 6, h: 0.35,
    fontSize: 12, color: COLORS.text2, fontFace: "Segoe UI",
  });

  const knowledgeFiles = [
    { icon: "📋", title: "Business Rules", desc: "Testable BL-* invariants enforced on every test" },
    { icon: "🎯", title: "Edge Case Library", desc: "13 generic + 7 VC-specific ECL-* patterns" },
    { icon: "🗺️", title: "Platform Patterns", desc: "Storefront sitemap · admin flows · browser quirks" },
    { icon: "⚡", title: "Performance Thresholds", desc: "LCP · CLS · API latency · debug signals" },
  ];
  knowledgeFiles.forEach((k, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.7 + col * 3.1;
    const y = 2.5 + row * 1.5;
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y, w: 2.8, h: 1.3,
      fill: { color: COLORS.codeBg }, line: { color: "E0DDD8", width: 1 }, rectRadius: 0.1,
    });
    slide.addText(k.icon + " " + k.title, {
      x: x + 0.1, y: y + 0.1, w: 2.6, h: 0.3,
      fontSize: 11, bold: true, color: COLORS.text, fontFace: "Segoe UI",
    });
    slide.addText(k.desc, {
      x: x + 0.1, y: y + 0.5, w: 2.6, h: 0.7,
      fontSize: 10, color: COLORS.text2, fontFace: "Segoe UI",
    });
  });

  // Right: Skills
  slide.addText("20 Skills — Encoded Methodology", {
    x: 7.0, y: 1.55, w: 6, h: 0.35,
    fontSize: 14, bold: true, color: COLORS.text, fontFace: "Segoe UI",
  });

  const skillGroups = [
    { title: "🧪 Testing Skills (8)", desc: "Storybook · Accessibility (WCAG) · Design review · Test plans · Checklists · API testing · Coverage gap · Seed data", bg: COLORS.accentSoft, color: COLORS.accent },
    { title: "📐 QA Methodology Skills (9)", desc: "ISTQB lifecycle · Bug investigation · Evidence capture · Defect workflow · Test design · AI test generation · Risk matrix · Metrics · SBTM", bg: COLORS.blueSoft, color: COLORS.blue },
    { title: "📚 /vc-docs — auto-invocable", desc: "Semantic search over live Virto Commerce documentation via Context7", bg: COLORS.greenSoft, color: COLORS.green },
  ];
  skillGroups.forEach((s, i) => {
    const y = 2.1 + i * 1.5;
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 7.0, y, w: 5.6, h: 1.3,
      fill: { color: s.bg }, line: { color: s.color, width: 1 }, rectRadius: 0.1,
    });
    slide.addText(s.title, {
      x: 7.15, y: y + 0.1, w: 5.3, h: 0.3,
      fontSize: 11, bold: true, color: s.color, fontFace: "Segoe UI",
    });
    slide.addText(s.desc, {
      x: 7.15, y: y + 0.45, w: 5.3, h: 0.7,
      fontSize: 11, color: COLORS.text2, fontFace: "Segoe UI",
    });
  });
}

// ==================== SLIDE 14: GRAPHQL SCHEMA + RUNNER-NATIVE TESTS ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slideBg };
  addSlideNumber(slide, 14, 22);
  addEyebrow(slide, "KNOWLEDGE FILE · RUNNER CONTRACT");

  slide.addText("GraphQL xAPI — Schema Truth + Runner-Native Tests", {
    x: 0.7, y: 0.85, w: 11, h: 0.5,
    fontSize: 24, bold: true, color: COLORS.accent, fontFace: "Segoe UI",
  });
  slide.addText("Two knowledge files plus a canonical runner turn the xAPI GraphQL surface into deterministic, schema-validated CSV test cases — no custom JS scripts needed.", {
    x: 0.7, y: 1.4, w: 11, h: 0.5,
    fontSize: 13, color: COLORS.text2, fontFace: "Segoe UI",
  });

  // Left column — knowledge files
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.7, y: 2.1, w: 6.0, h: 1.5,
    fill: { color: COLORS.blueSoft }, line: { color: "A0B0D0", width: 1 }, rectRadius: 0.1,
  });
  slide.addText("📐 knowledge/graphql-schema.md", {
    x: 0.9, y: 2.2, w: 5.6, h: 0.3, fontSize: 12, bold: true, color: COLORS.blue, fontFace: "Segoe UI",
  });
  slide.addText("Live introspection snapshot of the xAPI GraphQL schema. Every agent that writes or reviews a GraphQL query consults this first.", {
    x: 0.9, y: 2.55, w: 5.6, h: 1.0, fontSize: 11, color: COLORS.text2, fontFace: "Segoe UI",
  });

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.7, y: 3.75, w: 6.0, h: 1.6,
    fill: { color: COLORS.accentSoft }, line: { color: "D4A88E", width: 1 }, rectRadius: 0.1,
  });
  slide.addText("📋 knowledge/graphql-test-cases-runner.md", {
    x: 0.9, y: 3.85, w: 5.6, h: 0.3, fontSize: 12, bold: true, color: COLORS.accent, fontFace: "Segoe UI",
  });
  slide.addText("Canonical authoring contract for runner-native GraphQL CSV cases. Full tag grammar, predicate shapes, capture chaining, common failure modes + worked example.", {
    x: 0.9, y: 4.2, w: 5.6, h: 1.1, fontSize: 11, color: COLORS.text2, fontFace: "Segoe UI",
  });

  // Right column — tag grammar + runner
  slide.addText("Tag Grammar", {
    x: 7.0, y: 2.1, w: 6, h: 0.3, fontSize: 13, bold: true, color: COLORS.text, fontFace: "Segoe UI",
  });
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 7.0, y: 2.45, w: 5.6, h: 1.8,
    fill: { color: COLORS.codeBg }, line: { color: "E0DDD8", width: 1 }, rectRadius: 0.1,
  });
  slide.addText([
    { text: "Steps: ", options: { bold: true, color: COLORS.accent } },
    { text: "[AUTH] · [GQL-OP] · [GQL-VARS]\n[GQL-EXEC] · [GQL-CAPTURE]\n[REST-OP] · [REST-EXEC] · [REST-CAPTURE]\n\n", options: { color: COLORS.text2 } },
    { text: "Assertions: ", options: { bold: true, color: COLORS.blue } },
    { text: "[ERRORS] · [DATA] · [NULL] · [COUNT] · [VAR]", options: { color: COLORS.text2 } },
  ], {
    x: 7.2, y: 2.55, w: 5.2, h: 1.6,
    fontSize: 10, fontFace: "Consolas", lineSpacingMultiple: 1.4,
  });

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 7.0, y: 4.35, w: 5.6, h: 1.4,
    fill: { color: COLORS.greenSoft }, line: { color: "A0C4B0", width: 1 }, rectRadius: 0.1,
  });
  slide.addText("🛠 scripts/graphql-runner.ts", {
    x: 7.2, y: 4.45, w: 5.2, h: 0.3, fontSize: 12, bold: true, color: COLORS.green, fontFace: "Segoe UI",
  });
  slide.addText("Canonical runner — schema validation, var substitution, @td() resolution, evidence capture. Never write custom JS.", {
    x: 7.2, y: 4.78, w: 5.2, h: 0.55, fontSize: 10, color: COLORS.text2, fontFace: "Segoe UI",
  });
  slide.addText("npx tsx scripts/graphql-runner.ts --case <csv>:<ID>", {
    x: 7.2, y: 5.35, w: 5.2, h: 0.3, fontSize: 9, color: COLORS.green, fontFace: "Consolas",
  });

  slide.addText("Gold-standard reference suite: 050i-graphql-configurations.csv", {
    x: 0.7, y: 5.55, w: 11.9, h: 0.4, fontSize: 11, italic: true, color: COLORS.text3, fontFace: "Segoe UI", align: "center",
  });
}

// ==================== SLIDE 15: LIVE TEST-DATA DISCOVERY ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slideBg };
  addSlideNumber(slide, 15, 22);
  addEyebrow(slide, "KNOWLEDGE FILE · RUNTIME HELPERS");

  slide.addText("Live Test-Data Discovery — No Hardcoded IDs", {
    x: 0.7, y: 0.85, w: 11, h: 0.5,
    fontSize: 24, bold: true, color: COLORS.accent, fontFace: "Segoe UI",
  });
  slide.addText("Catalogs get reseeded. B2B orgs get re-created. Virtual-catalog roots migrate. Hardcoded IDs rot. Live discovery resolves entities at runtime against the actual env.", {
    x: 0.7, y: 1.4, w: 11, h: 0.5,
    fontSize: 13, color: COLORS.text2, fontFace: "Segoe UI",
  });

  // Left — knowledge file + data layers
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.7, y: 2.1, w: 6.0, h: 1.3,
    fill: { color: COLORS.accentSoft }, line: { color: "D4A88E", width: 1 }, rectRadius: 0.1,
  });
  slide.addText("📖 knowledge/live-discovery.md", {
    x: 0.9, y: 2.2, w: 5.6, h: 0.3, fontSize: 12, bold: true, color: COLORS.accent, fontFace: "Segoe UI",
  });
  slide.addText("Decision tree + recipes: when to pick {{VAR}} vs @td() vs live-discover vs random-data. Parallel-run isolation, AGENT-TEST-* cleanup.", {
    x: 0.9, y: 2.55, w: 5.6, h: 0.75, fontSize: 11, color: COLORS.text2, fontFace: "Segoe UI",
  });

  slide.addText("Four Data Layers", {
    x: 0.7, y: 3.55, w: 6, h: 0.3, fontSize: 13, bold: true, color: COLORS.text, fontFace: "Segoe UI",
  });
  const layerRows = [
    [{ text: "Layer", options: { bold: true, fill: { color: COLORS.codeBg } } }, { text: "Source", options: { bold: true, fill: { color: COLORS.codeBg } } }, { text: "Use for", options: { bold: true, fill: { color: COLORS.codeBg } } }],
    [{ text: "{{VAR}}" }, { text: ".env" }, { text: "URLs, creds, env context" }],
    [{ text: "@td()" }, { text: "aliases.json + CSV" }, { text: "Named entities" }],
    [{ text: "live-discover" }, { text: "xAPI at runtime" }, { text: "Shape, not value" }],
    [{ text: "random-data" }, { text: "Zero-dep generators" }, { text: "Unique inputs" }],
  ];
  slide.addTable(layerRows, {
    x: 0.7, y: 3.9, w: 6.0, colW: [1.6, 2.0, 2.4],
    border: { type: "solid", pt: 0.5, color: "E0DDD8" },
    fontFace: "Consolas", fontSize: 10,
  });

  // Right — scripts
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 7.0, y: 2.1, w: 5.6, h: 1.4,
    fill: { color: COLORS.blueSoft }, line: { color: "A0B0D0", width: 1 }, rectRadius: 0.1,
  });
  slide.addText("🛠 scripts/lib/live-discover.ts", {
    x: 7.2, y: 2.2, w: 5.2, h: 0.3, fontSize: 12, bold: true, color: COLORS.blue, fontFace: "Segoe UI",
  });
  slide.addText("Typed xAPI primitives — catalog root, products by filter, addresses, cart state, active coupons. Real entities from the current env.", {
    x: 7.2, y: 2.55, w: 5.2, h: 0.85, fontSize: 11, color: COLORS.text2, fontFace: "Segoe UI",
  });

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 7.0, y: 3.6, w: 5.6, h: 1.4,
    fill: { color: COLORS.greenSoft }, line: { color: "A0C4B0", width: 1 }, rectRadius: 0.1,
  });
  slide.addText("🎲 scripts/lib/random-data.ts", {
    x: 7.2, y: 3.7, w: 5.2, h: 0.3, fontSize: 12, bold: true, color: COLORS.green, fontFace: "Segoe UI",
  });
  slide.addText("Zero-dep generators: emails, org names, SKUs, quantities, comments. Defaults to AGENT-TEST-{date} prefix for safe teardown.", {
    x: 7.2, y: 4.05, w: 5.2, h: 0.85, fontSize: 11, color: COLORS.text2, fontFace: "Segoe UI",
  });

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 7.0, y: 5.1, w: 5.6, h: 0.8,
    fill: { color: COLORS.redSoft }, line: { color: "D4A0A0", width: 1 }, rectRadius: 0.1,
  });
  slide.addText("Anti-pattern: hardcoded GUIDs/SKUs in Test_Data — review failure (Dim 6: Data Validity).", {
    x: 7.2, y: 5.2, w: 5.2, h: 0.6, fontSize: 10, italic: true, color: COLORS.red, fontFace: "Segoe UI",
  });
}

// ==================== SLIDE 16: TEST RUNNER TAGS + @td() RESOLVER ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slideBg };
  addSlideNumber(slide, 16, 22);
  addEyebrow(slide, "KNOWLEDGE FILE · RESOLVER");

  slide.addText("Test Runner Tags + @td() Resolver", {
    x: 0.7, y: 0.85, w: 11, h: 0.5,
    fontSize: 24, bold: true, color: COLORS.accent, fontFace: "Segoe UI",
  });
  slide.addText("Two knowledge files plus a resolver and validator turn CSV rows into deterministic, executable test cases — interpretable by both runners.", {
    x: 0.7, y: 1.4, w: 11, h: 0.5,
    fontSize: 13, color: COLORS.text2, fontFace: "Segoe UI",
  });

  // Left — tags
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.7, y: 2.1, w: 6.0, h: 1.3,
    fill: { color: COLORS.accentSoft }, line: { color: "D4A88E", width: 1 }, rectRadius: 0.1,
  });
  slide.addText("🏷️ knowledge/test-runner-tags.md", {
    x: 0.9, y: 2.2, w: 5.6, h: 0.3, fontSize: 12, bold: true, color: COLORS.accent, fontFace: "Segoe UI",
  });
  slide.addText("Shared CSV column / step / assertion / cross-layer tag reference. Used by test-runner-agent + autonomous-test-runner.", {
    x: 0.9, y: 2.55, w: 5.6, h: 0.75, fontSize: 11, color: COLORS.text2, fontFace: "Segoe UI",
  });

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.7, y: 3.55, w: 6.0, h: 2.3,
    fill: { color: COLORS.codeBg }, line: { color: "E0DDD8", width: 1 }, rectRadius: 0.1,
  });
  slide.addText([
    { text: "Step tags:\n", options: { bold: true, color: COLORS.accent } },
    { text: "[NAV] · [ACT] · [WAIT] · [LOGIN] · [SETUP]\n\n", options: { color: COLORS.text2 } },
    { text: "Assertion tags:\n", options: { bold: true, color: COLORS.blue } },
    { text: "[DOM] · [STATE] · [MATH] · [API] · [CONSOLE]\n\n", options: { color: COLORS.text2 } },
    { text: "Cross-layer:\n", options: { bold: true, color: COLORS.green } },
    { text: "[HAR] · [SCREEN] · [PERF]", options: { color: COLORS.text2 } },
  ], {
    x: 0.9, y: 3.65, w: 5.6, h: 2.15,
    fontSize: 10, fontFace: "Consolas", lineSpacingMultiple: 1.3,
  });

  // Right — resolver + validation
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 7.0, y: 2.1, w: 5.6, h: 1.6,
    fill: { color: COLORS.blueSoft }, line: { color: "A0B0D0", width: 1 }, rectRadius: 0.1,
  });
  slide.addText("🔗 @td(ALIAS.field) resolver", {
    x: 7.2, y: 2.2, w: 5.2, h: 0.3, fontSize: 12, bold: true, color: COLORS.blue, fontFace: "Segoe UI",
  });
  slide.addText("Test data resolved at runtime, never hardcoded. Reads aliases.json → CSV rows. Catalogs reseed, IDs change — alias stays stable. One CSV update propagates everywhere.", {
    x: 7.2, y: 2.55, w: 5.2, h: 1.05, fontSize: 11, color: COLORS.text2, fontFace: "Segoe UI",
  });

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 7.0, y: 3.85, w: 5.6, h: 1.0,
    fill: { color: COLORS.codeBg }, line: { color: "E0DDD8", width: 1 }, rectRadius: 0.1,
  });
  slide.addText([
    { text: "scripts/lib/test-data-resolver.ts\n", options: { color: COLORS.text2 } },
    { text: "test-data/aliases.json\n", options: { color: COLORS.text2 } },
    { text: "test-data/*.csv", options: { color: COLORS.text2 } },
  ], {
    x: 7.2, y: 3.95, w: 5.2, h: 0.85,
    fontSize: 10, fontFace: "Consolas", lineSpacingMultiple: 1.3,
  });

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 7.0, y: 5.0, w: 5.6, h: 0.85,
    fill: { color: COLORS.greenSoft }, line: { color: "A0C4B0", width: 1 }, rectRadius: 0.1,
  });
  slide.addText("✅ Validation", {
    x: 7.2, y: 5.05, w: 5.2, h: 0.3, fontSize: 12, bold: true, color: COLORS.green, fontFace: "Segoe UI",
  });
  slide.addText("npx tsx scripts/validate-td-refs.ts", {
    x: 7.2, y: 5.4, w: 5.2, h: 0.3, fontSize: 10, color: COLORS.green, fontFace: "Consolas",
  });
}

// ==================== SLIDE 17: CRITICAL UI SCOPE — LAYOUT STABILITY ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slideBg };
  addSlideNumber(slide, 17, 22);
  addEyebrow(slide, "KNOWLEDGE FILE · LAYOUT HELPERS");

  slide.addText("Critical UI Scope — Regression-Enforced Checklist", {
    x: 0.7, y: 0.85, w: 11, h: 0.5,
    fontSize: 24, bold: true, color: COLORS.accent, fontFace: "Segoe UI",
  });
  slide.addText("A 7×8 matrix that pins down which BL-UI invariants apply to which component on which page. A validator and a layout-measurement helper keep the matrix from drifting.", {
    x: 0.7, y: 1.4, w: 11, h: 0.5,
    fontSize: 13, color: COLORS.text2, fontFace: "Segoe UI",
  });

  // Left — scope file + matrix
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.7, y: 2.1, w: 7.5, h: 1.0,
    fill: { color: COLORS.accentSoft }, line: { color: "D4A88E", width: 1 }, rectRadius: 0.1,
  });
  slide.addText("🎯 knowledge/critical-ui-scope.md", {
    x: 0.9, y: 2.2, w: 7.1, h: 0.3, fontSize: 12, bold: true, color: COLORS.accent, fontFace: "Segoe UI",
  });
  slide.addText("Regression-enforced checklist of 7 components × 8 pages, with applicable BL-UI-* invariants per cell.", {
    x: 0.9, y: 2.55, w: 7.1, h: 0.5, fontSize: 11, color: COLORS.text2, fontFace: "Segoe UI",
  });

  const matrixRows = [
    [{ text: "Components (7)", options: { bold: true, fill: { color: COLORS.codeBg } } }, { text: "Pages (8)", options: { bold: true, fill: { color: COLORS.codeBg } } }],
    [{ text: "VcButton · VcProductCard\nVcLineItem · VcTable\nVcDialog · Popover\nVcSidebar" }, { text: "/ · /catalog · PDP\n/cart · /account/orders\n/account/lists\n/company/members\n/company/info" }],
  ];
  slide.addTable(matrixRows, {
    x: 0.7, y: 3.2, w: 7.5, colW: [3.5, 4.0],
    border: { type: "solid", pt: 0.5, color: "E0DDD8" },
    fontFace: "Consolas", fontSize: 10,
  });

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.7, y: 5.3, w: 7.5, h: 1.0,
    fill: { color: COLORS.blueSoft }, line: { color: "A0B0D0", width: 1 }, rectRadius: 0.1,
  });
  slide.addText("BL-UI-001..010 invariants", {
    x: 0.9, y: 5.4, w: 7.1, h: 0.3, fontSize: 12, bold: true, color: COLORS.blue, fontFace: "Segoe UI",
  });
  slide.addText("Focus-ring · hover · disabled · loading skeleton · layout stability · empty state · error state · keyboard nav.", {
    x: 0.9, y: 5.7, w: 7.1, h: 0.55, fontSize: 10, color: COLORS.text2, fontFace: "Segoe UI",
  });

  // Right — script + suite
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 8.5, y: 2.1, w: 4.1, h: 1.4,
    fill: { color: COLORS.greenSoft }, line: { color: "A0C4B0", width: 1 }, rectRadius: 0.1,
  });
  slide.addText("🛠 scripts/lib/measure-layout.ts", {
    x: 8.7, y: 2.2, w: 3.7, h: 0.3, fontSize: 11, bold: true, color: COLORS.green, fontFace: "Segoe UI",
  });
  slide.addText("Layout-measurement helper — dimensions, position deltas, CLS contributions per component.", {
    x: 8.7, y: 2.55, w: 3.7, h: 0.85, fontSize: 10, color: COLORS.text2, fontFace: "Segoe UI",
  });

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 8.5, y: 3.6, w: 4.1, h: 1.3,
    fill: { color: COLORS.codeBg }, line: { color: "E0DDD8", width: 1 }, rectRadius: 0.1,
  });
  slide.addText("Coverage suite", {
    x: 8.7, y: 3.7, w: 3.7, h: 0.3, fontSize: 11, bold: true, color: COLORS.text, fontFace: "Segoe UI",
  });
  slide.addText("048b-layout-stability.csv", {
    x: 8.7, y: 4.0, w: 3.7, h: 0.3, fontSize: 11, color: COLORS.accent, fontFace: "Consolas",
  });
  slide.addText("selection: layout-stability", {
    x: 8.7, y: 4.3, w: 3.7, h: 0.3, fontSize: 9, color: COLORS.text3, fontFace: "Consolas",
  });

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 8.5, y: 5.0, w: 4.1, h: 1.3,
    fill: { color: COLORS.redSoft }, line: { color: "D4A0A0", width: 1 }, rectRadius: 0.1,
  });
  slide.addText("Enforcement", {
    x: 8.7, y: 5.1, w: 3.7, h: 0.3, fontSize: 11, bold: true, color: COLORS.red, fontFace: "Segoe UI",
  });
  slide.addText("npm run scope:validate exits non-zero if any matrix cell points at a missing test ID.", {
    x: 8.7, y: 5.4, w: 3.7, h: 0.85, fontSize: 10, color: COLORS.text2, fontFace: "Segoe UI",
  });
}

// ==================== SLIDE 18: TEST CASE GENERATION ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slideBg };
  addSlideNumber(slide, 18, 22);
  addEyebrow(slide, "AI-GENERATED TEST CASES");

  slide.addText("/qa-test-cases-generator — From Ticket to Test Suite", {
    x: 0.7, y: 0.85, w: 11, h: 0.5,
    fontSize: 24, bold: true, color: COLORS.accent, fontFace: "Segoe UI",
  });
  slide.addText("One skill derives structured, agent-executable test cases from a JIRA ticket, BDD scenario, domain checklist, or legacy suite.", {
    x: 0.7, y: 1.4, w: 11, h: 0.4,
    fontSize: 13, color: COLORS.text2, fontFace: "Segoe UI",
  });

  // Flow
  const genFlow = [
    { text: "JIRA Ticket\nVCST-XXXX", bg: COLORS.codeBg },
    { text: "Parse ACs\n+ detect layers", bg: COLORS.accentSoft },
    { text: "Generate Cases\nBL-* + ECL-* refs", bg: COLORS.blueSoft },
    { text: "Route to Agent\nby layer type", bg: COLORS.greenSoft },
  ];
  genFlow.forEach((f, i) => {
    const x = 0.7 + i * 3.0;
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y: 2.0, w: 2.4, h: 0.9,
      fill: { color: f.bg }, line: { color: "E0DDD8", width: 1 }, rectRadius: 0.1,
    });
    slide.addText(f.text, {
      x, y: 2.0, w: 2.4, h: 0.9,
      fontSize: 11, color: COLORS.text, fontFace: "Segoe UI", align: "center", valign: "middle",
    });
    if (i < genFlow.length - 1) {
      slide.addText("→", {
        x: x + 2.4, y: 2.0, w: 0.6, h: 0.9,
        fontSize: 18, color: COLORS.accent, fontFace: "Segoe UI", align: "center", valign: "middle",
      });
    }
  });

  // Left: Works with any input
  slide.addText("Works with any input", {
    x: 0.7, y: 3.3, w: 6, h: 0.35,
    fontSize: 13, bold: true, color: COLORS.text, fontFace: "Segoe UI",
  });
  const inputs = [
    "✓  VCST-XXXX — JIRA ticket → parse acceptance criteria",
    "✓  domain — checklist → 1–3 cases per item",
    "✓  suite NN — existing CSV → find gaps → fill them",
    "✓  from-checklist cart — happy path + negative per item",
    "✓  from-bdd \"Given…\" — BDD scenario → structured test case",
  ];
  slide.addText(inputs.join("\n"), {
    x: 0.7, y: 3.7, w: 6, h: 2.2,
    fontSize: 11, color: COLORS.text2, fontFace: "Segoe UI", lineSpacingMultiple: 1.5,
  });

  // Right: What every generated case includes
  slide.addText("What every generated case includes", {
    x: 7.0, y: 3.3, w: 6, h: 0.35,
    fontSize: 13, bold: true, color: COLORS.text, fontFace: "Segoe UI",
  });
  const includes = [
    "✓  BL-* rule reference — business invariant enforced",
    "✓  ECL-* edge case pattern — known failure scenario",
    "✓  Typed step tags: [NAV] [ACT] [WAIT]",
    "✓  Typed assertions: [DOM] [STATE] [MATH]",
    "✓  At least 2 failure signals — ready for agent execution",
  ];
  slide.addText(includes.join("\n"), {
    x: 7.0, y: 3.7, w: 5.6, h: 2.2,
    fontSize: 11, color: COLORS.text2, fontFace: "Segoe UI", lineSpacingMultiple: 1.5,
  });
}

// ==================== SLIDE 19: TEST DATA GENERATION ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slideBg };
  addSlideNumber(slide, 19, 22);
  addEyebrow(slide, "TEST INFRASTRUCTURE");

  slide.addText("/qa-seed-data — Full Test Environment in One Command", {
    x: 0.7, y: 0.85, w: 11, h: 0.5,
    fontSize: 24, bold: true, color: COLORS.accent, fontFace: "Segoe UI",
  });
  slide.addText("Generates a complete test environment via Postman MCP: catalogs, products, pricing, B2B organizations, users — then tears it all down safely.", {
    x: 0.7, y: 1.4, w: 11, h: 0.4,
    fontSize: 13, color: COLORS.text2, fontFace: "Segoe UI",
  });

  // Flow
  const seedFlow = [
    { text: "Pick profile\nminimal / b2b / full", bg: COLORS.codeBg },
    { text: "Postman MCP\nbuilds & runs collection", bg: COLORS.blueSoft },
    { text: "Test data ready\nAGENT-TEST-* prefix", bg: COLORS.greenSoft },
    { text: "Run tests", bg: COLORS.codeBg },
    { text: "Teardown\nsafe cleanup", bg: COLORS.accentSoft },
  ];
  seedFlow.forEach((f, i) => {
    const x = 0.7 + i * 2.4;
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y: 2.0, w: 2.0, h: 0.9,
      fill: { color: f.bg }, line: { color: "E0DDD8", width: 1 }, rectRadius: 0.1,
    });
    slide.addText(f.text, {
      x, y: 2.0, w: 2.0, h: 0.9,
      fontSize: 10, color: COLORS.text, fontFace: "Segoe UI", align: "center", valign: "middle",
    });
    if (i < seedFlow.length - 1) {
      slide.addText("→", {
        x: x + 2.0, y: 2.0, w: 0.4, h: 0.9,
        fontSize: 14, color: COLORS.accent, fontFace: "Segoe UI", align: "center", valign: "middle",
      });
    }
  });

  // Profiles table
  const profileRows = [
    [
      { text: "Profile", options: { fontSize: 10, bold: true, color: COLORS.text2, fill: { color: COLORS.codeBg } } },
      { text: "Creates", options: { fontSize: 10, bold: true, color: COLORS.text2, fill: { color: COLORS.codeBg } } },
      { text: "Use Case", options: { fontSize: 10, bold: true, color: COLORS.text2, fill: { color: COLORS.codeBg } } },
    ],
    [{ text: "minimal" }, { text: "1 catalog · 1 product · price · inventory" }, { text: "Smoke tests, API connectivity" }],
    [{ text: "catalog" }, { text: "3-level category tree · 5 products · multi-currency" }, { text: "Search, browse, cart tests" }],
    [{ text: "b2b" }, { text: "1 organization · 3 users (admin/buyer/viewer)" }, { text: "B2B multi-org, RBAC tests" }],
    [{ text: "pricing" }, { text: "2 price lists (USD+EUR) · tiered prices" }, { text: "Pricing module tests" }],
    [{ text: "full" }, { text: "All profiles combined — complete environment" }, { text: "Full regression run" }],
    [{ text: "teardown" }, { text: "Deletes all AGENT-TEST-* entities" }, { text: "Post-test cleanup" }],
  ];
  slide.addTable(profileRows, {
    x: 0.7, y: 3.2, w: 11.9, colW: [1.5, 5.7, 4.7],
    border: { type: "solid", pt: 0.5, color: "E0DDD8" },
    fontFace: "Segoe UI", fontSize: 11,
  });
}

// ==================== SLIDE 20: QA-TEST FLOW ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slideBg };
  addSlideNumber(slide, 20, 22);
  addEyebrow(slide, "END-TO-END FLOW");

  slide.addText("/qa-test VCST-XXXX — From Ticket to Verdict", {
    x: 0.7, y: 0.85, w: 11, h: 0.5,
    fontSize: 26, bold: true, color: COLORS.accent, fontFace: "Segoe UI",
  });
  slide.addText("One command reads the JIRA ticket, dispatches the right agents, executes all acceptance criteria, files bugs with evidence, and closes the ticket.", {
    x: 0.7, y: 1.4, w: 11, h: 0.4,
    fontSize: 13, color: COLORS.text2, fontFace: "Segoe UI",
  });

  const steps = [
    { title: "Step 1: Read JIRA Ticket", desc: "Atlassian MCP fetches title, description, acceptance criteria · identifies feature scope: storefront / admin / API", color: COLORS.accent },
    { title: "Step 2: Dispatch Specialists", desc: "qa-frontend-expert (Chrome) → storefront ACs · qa-backend-expert (Edge) → API + admin ACs · run in parallel", color: COLORS.blue },
    { title: "Step 3: Execute Tests", desc: "Navigate to feature · verify each AC through real browser · capture screenshots + HAR · check console for errors", color: COLORS.blue },
    { title: "Step 4: File Bugs (if any)", desc: "Failed AC → bug report with P0–P3 severity · screenshots · HAR · BL-* rule reference · auto-created in JIRA", color: COLORS.accent },
    { title: "Step 5: Close the Ticket", desc: "All ACs pass → transition ticket to \"Testing Complete\" · link evidence · notify team. Bugs found → block release.", color: COLORS.green },
  ];
  steps.forEach((s, i) => {
    const y = 2.1 + i * 1.0;
    // Dot
    slide.addShape(pptx.ShapeType.ellipse, {
      x: 1.5, y: y + 0.15, w: 0.2, h: 0.2,
      fill: { color: s.color },
    });
    // Line
    if (i < steps.length - 1) {
      slide.addShape(pptx.ShapeType.line, {
        x: 1.6, y: y + 0.35, w: 0, h: 0.65,
        line: { color: "E0DDD8", width: 1 },
      });
    }
    slide.addText(s.title, {
      x: 2.0, y: y, w: 9, h: 0.35,
      fontSize: 13, bold: true, color: COLORS.text, fontFace: "Segoe UI",
    });
    slide.addText(s.desc, {
      x: 2.0, y: y + 0.35, w: 9, h: 0.55,
      fontSize: 11, color: COLORS.text2, fontFace: "Segoe UI",
    });
  });
}

// ==================== SLIDE 21: BENEFITS ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slideBg };
  addSlideNumber(slide, 21, 22);
  addEyebrow(slide, "VALUE DELIVERED");

  slide.addText("Strong Sides of AI-Driven Testing", {
    x: 0.7, y: 0.85, w: 10, h: 0.5,
    fontSize: 28, bold: true, color: COLORS.accent, fontFace: "Segoe UI",
  });

  const benefits = [
    { icon: "🔧", title: "Zero Maintenance", desc: "UI changes don't break tests. Agents adapt through contextual reasoning, not brittle selectors.", bg: COLORS.greenSoft, titleColor: COLORS.green },
    { icon: "⚡", title: "Speed at Scale", desc: "3 browsers run in parallel. A full sprint regression of ~2,700 tests runs automatically.", bg: COLORS.accentSoft, titleColor: COLORS.accent },
    { icon: "🧠", title: "Business Awareness", desc: "Agents don't just detect failures — they reason about why in business terms.", bg: COLORS.blueSoft, titleColor: COLORS.blue },
    { icon: "📋", title: "No Coding Required", desc: "QA engineers write prompts, not Playwright scripts. Adding a test = adding a CSV row.", bg: COLORS.codeBg, titleColor: COLORS.text },
    { icon: "🔗", title: "Full JIRA Loop", desc: "Agents read tickets, execute tests, file bugs with evidence, and transition statuses.", bg: COLORS.codeBg, titleColor: COLORS.text },
    { icon: "📐", title: "Methodology Built-in", desc: "20 skills encode ISTQB, SBTM, WCAG 2.1 AA, risk-based testing, and BDD.", bg: COLORS.codeBg, titleColor: COLORS.text },
  ];
  benefits.forEach((b, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 0.7 + col * 4.0;
    const y = 1.6 + row * 2.2;
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y, w: 3.7, h: 1.9,
      fill: { color: b.bg }, line: { color: "E0DDD8", width: 1 }, rectRadius: 0.1,
    });
    slide.addText(b.icon, { x, y: y + 0.1, w: 3.7, h: 0.35, fontSize: 18, fontFace: "Segoe UI Emoji", margin: [0, 0, 0, 15] });
    slide.addText(b.title, { x: x + 0.15, y: y + 0.45, w: 3.4, h: 0.3, fontSize: 13, bold: true, color: b.titleColor, fontFace: "Segoe UI" });
    slide.addText(b.desc, { x: x + 0.15, y: y + 0.8, w: 3.4, h: 1.0, fontSize: 11, color: COLORS.text2, fontFace: "Segoe UI" });
  });

  // Bottom stats bar
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.7, y: 6.1, w: 11.9, h: 0.9,
    fill: { color: COLORS.codeBg }, line: { color: "E0DDD8", width: 1 }, rectRadius: 0.1,
  });
  const bottomStats = [
    { num: "~0", label: "Selector maintenance\nincidents per sprint", color: COLORS.accent },
    { num: "15 min", label: "From command to\nGO/NO-GO verdict", color: COLORS.green },
    { num: "1 CSV row", label: "Cost of adding\na new test case", color: COLORS.blue },
  ];
  bottomStats.forEach((s, i) => {
    const x = 1.0 + i * 4.0;
    slide.addText(s.num, {
      x, y: 6.1, w: 3.5, h: 0.4,
      fontSize: 20, bold: true, color: s.color, fontFace: "Segoe UI", align: "center",
    });
    slide.addText(s.label, {
      x, y: 6.5, w: 3.5, h: 0.5,
      fontSize: 10, color: COLORS.text2, fontFace: "Segoe UI", align: "center",
    });
  });
}

// ==================== SLIDE 22: ROADMAP ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slideBg };
  addSlideNumber(slide, 22, 22);
  addEyebrow(slide, "FUTURE DEVELOPMENT");

  slide.addText("Roadmap — What's Next for Agentic QA", {
    x: 0.7, y: 0.85, w: 10, h: 0.5,
    fontSize: 28, bold: true, color: COLORS.accent, fontFace: "Segoe UI",
  });

  const leftItems = [
    { badge: "Shipped ✓", badgeColor: COLORS.green, badgeBg: COLORS.greenSoft, title: "AI Test Case Generator", desc: "/qa-test-cases-generator — derives enriched CSV test cases from JIRA tickets automatically", dotColor: COLORS.green },
    { badge: "Shipped ✓", badgeColor: COLORS.green, badgeBg: COLORS.greenSoft, title: "Agent Teams Mode", desc: "Autonomous regression with TeamCreate API, token bucket, exponential backoff, JIRA integration", dotColor: COLORS.green },
    { badge: "Q2 2026", badgeColor: COLORS.blue, badgeBg: COLORS.blueSoft, title: "Multi-Browser CI", desc: "Expand CI from single headless Chromium to full 3-browser pool in GitHub Actions", dotColor: COLORS.blue },
    { badge: "Q2 2026", badgeColor: COLORS.blue, badgeBg: COLORS.blueSoft, title: "Visual Regression Baselines", desc: "Persistent Storybook component snapshots with automated pixel-diff comparison", dotColor: COLORS.blue },
    { badge: "Q2 2026", badgeColor: COLORS.blue, badgeBg: COLORS.blueSoft, title: "Sprint Coverage Reports", desc: "Auto-select regression scope based on git diff analysis", dotColor: COLORS.blue },
  ];
  leftItems.forEach((item, i) => {
    const y = 1.55 + i * 1.05;
    slide.addShape(pptx.ShapeType.ellipse, {
      x: 0.9, y: y + 0.12, w: 0.15, h: 0.15,
      fill: { color: item.dotColor },
    });
    if (i < leftItems.length - 1) {
      slide.addShape(pptx.ShapeType.line, {
        x: 0.975, y: y + 0.27, w: 0, h: 0.78,
        line: { color: "E0DDD8", width: 1 },
      });
    }
    slide.addText(item.badge, {
      x: 1.2, y: y - 0.05, w: 1.0, h: 0.25,
      fontSize: 8, bold: true, color: item.badgeColor, fontFace: "Segoe UI",
      fill: { color: item.badgeBg }, shape: pptx.ShapeType.roundRect, rectRadius: 0.12,
      align: "center", valign: "middle",
    });
    slide.addText(item.title, {
      x: 2.3, y: y - 0.05, w: 4.0, h: 0.3,
      fontSize: 12, bold: true, color: COLORS.text, fontFace: "Segoe UI",
    });
    slide.addText(item.desc, {
      x: 1.2, y: y + 0.3, w: 5.3, h: 0.6,
      fontSize: 10, color: COLORS.text2, fontFace: "Segoe UI",
    });
  });

  const rightItems = [
    { badge: "Q3 2026", badgeColor: COLORS.accent, badgeBg: COLORS.accentSoft, title: "Mobile Testing", desc: "BrowserStack integration for real device testing — iOS Safari, Android Chrome", dotColor: COLORS.accent },
    { badge: "Q3 2026", badgeColor: COLORS.accent, badgeBg: COLORS.accentSoft, title: "Self-Updating Suites", desc: "Regression suites that evolve automatically — agent analyzes code changes, proposes new tests", dotColor: COLORS.accent },
    { badge: "Future", badgeColor: COLORS.text3, badgeBg: COLORS.codeBg, title: "Performance Regression", desc: "Automated Core Web Vitals tracking: LCP, CLS, FID baselines per release", dotColor: COLORS.text3 },
    { badge: "Future", badgeColor: COLORS.text3, badgeBg: COLORS.codeBg, title: "Test Impact Analysis", desc: "ML-based prediction of which test suites are most likely to fail given a code change", dotColor: COLORS.text3 },
    { badge: "Future", badgeColor: COLORS.text3, badgeBg: COLORS.codeBg, title: "Multi-Tenant Testing", desc: "Parallel testing across multiple storefronts / white-label brands", dotColor: COLORS.text3 },
  ];
  rightItems.forEach((item, i) => {
    const y = 1.55 + i * 1.05;
    slide.addShape(pptx.ShapeType.ellipse, {
      x: 7.2, y: y + 0.12, w: 0.15, h: 0.15,
      fill: { color: item.dotColor },
    });
    if (i < rightItems.length - 1) {
      slide.addShape(pptx.ShapeType.line, {
        x: 7.275, y: y + 0.27, w: 0, h: 0.78,
        line: { color: "E0DDD8", width: 1 },
      });
    }
    slide.addText(item.badge, {
      x: 7.5, y: y - 0.05, w: 1.0, h: 0.25,
      fontSize: 8, bold: true, color: item.badgeColor, fontFace: "Segoe UI",
      fill: { color: item.badgeBg }, shape: pptx.ShapeType.roundRect, rectRadius: 0.12,
      align: "center", valign: "middle",
    });
    slide.addText(item.title, {
      x: 8.6, y: y - 0.05, w: 4.0, h: 0.3,
      fontSize: 12, bold: true, color: COLORS.text, fontFace: "Segoe UI",
    });
    slide.addText(item.desc, {
      x: 7.5, y: y + 0.3, w: 5.3, h: 0.6,
      fontSize: 10, color: COLORS.text2, fontFace: "Segoe UI",
    });
  });

  // Vision bar
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.7, y: 6.85, w: 11.9, h: 0.5,
    fill: { color: COLORS.accentSoft }, line: { color: COLORS.accent, width: 1 }, rectRadius: 0.1,
  });
  slide.addText("🚀  Vision: A fully autonomous QA system that continuously tests, learns from failures, updates its own test cases, and provides real-time quality signals — with zero manual scripting.", {
    x: 0.9, y: 6.85, w: 11.5, h: 0.5,
    fontSize: 11, color: COLORS.text, fontFace: "Segoe UI", valign: "middle",
  });
}

// Write file
const outPath = "c:/Users/mutyk/My Projects/vc-mcp-testing-module/docs/presentation/agentic-qa-v2.pptx";
pptx.writeFile({ fileName: outPath }).then(() => {
  console.log(`✅ PowerPoint saved to: ${outPath}`);
}).catch((err) => {
  console.error("Error:", err);
});
