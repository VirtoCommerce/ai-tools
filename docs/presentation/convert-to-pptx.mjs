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

// Helper for bilingual speaker notes (EN + RU)
function addBilingualNotes(slide, en, ru) {
  slide.addNotes(`[EN]\n${en}\n\n[RU]\n${ru}`);
}

// ==================== SLIDE 1: TITLE ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.dark };
  addSlideNumber(slide, 1, 19, "666666");

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
  addBilingualNotes(slide,
    "Welcome. This deck covers our Agentic QA system — an AI-driven testing platform built on Claude and MCP servers. Total runtime is roughly 15 minutes. The core thesis: replace brittle Playwright scripts with natural-language test cases executed by AI agents that reason about business rules, not selectors.",
    "Добро пожаловать. Презентация посвящена нашей системе Agentic QA — AI-управляемой платформе тестирования на базе Claude и MCP-серверов. Длительность примерно 15 минут. Основная идея — заменить хрупкие Playwright-скрипты на тест-кейсы на естественном языке, которые выполняются AI-агентами, рассуждающими в терминах бизнес-правил, а не селекторов."
  );
}

// ==================== SLIDE 2: PROJECT OVERVIEW ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slideBg };
  addSlideNumber(slide, 2, 19);
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
  addBilingualNotes(slide,
    "Three pillars: AI-native — the LLM reasons about what to click and what to verify, not a hardcoded selector path. Modular architecture — 14 agents, ~79 CSV suites, 20 skills, 23 shared knowledge files. CI pipeline is on the near-term roadmap. Scope is the full Virto Commerce B2B platform: storefront, admin SPA, REST + GraphQL APIs, checkout, B2B multi-org, GA4, WCAG, Storybook.",
    "Три опоры: AI-нативность — LLM сам решает, что кликать и что проверять, без захардкоженного селектора. Модульная архитектура — 14 агентов, ~79 CSV-сьютов, 20 скиллов, 23 общих файла знаний. CI-пайплайн — в ближайшем роадмапе. Охват — вся B2B-платформа Virto Commerce: сторфронт, админка, REST + GraphQL API, чекаут, мульти-орг B2B, GA4, WCAG, Storybook."
  );
}

// ==================== SLIDE 4: ARCHITECTURE ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slideBg };
  addSlideNumber(slide, 3, 19);
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
  addBilingualNotes(slide,
    "Three testing modes share one foundation. Interactive mode is for engineers working in their IDE — Cursor, Windsurf, or VS Code with the Claude Code extension. Agent Teams mode runs autonomous regression with isolated browsers per agent. CI pipeline is the GitHub Actions track — daily smoke and weekly full. All three modes read the same test-suites.json, same CSV cases, same agents, same knowledge files.",
    "Три режима тестирования живут на общем фундаменте. Интерактивный — для инженера в IDE (Cursor, Windsurf или VS Code с расширением Claude Code). Agent Teams — автономный регресс с изолированным браузером на каждого агента. CI — GitHub Actions: ежедневный smoke и еженедельный full. Все три читают один и тот же test-suites.json, те же CSV-кейсы, тех же агентов и те же файлы знаний."
  );
}

// ==================== SLIDE 5: BY THE NUMBERS ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slideBg };
  addSlideNumber(slide, 4, 19);
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
  addBilingualNotes(slide,
    "Scale at a glance: 14 specialized agents, ~79 CSV suites with ~2,400 cases total, 10 MCP integrations covering browsers, design tools, ticketing, and clouds. Coverage selectors range from smoke (~140 tests for daily pre-deploy) to critical (P0 gate), sprint (plan-driven from JIRA), and full (everything before a major release). The 'sprint' selection auto-reads docs/Sprint plans/sprint-*-summary.json.",
    "Масштаб: 14 специализированных агентов, ~79 CSV-сьютов с ~2,400 кейсами, 10 MCP-интеграций — браузеры, дизайн-инструменты, тикеты, облака. Селекторы покрытия — от smoke (~140 тестов перед деплоем) до critical (P0-гейт), sprint (по плану из JIRA) и full (всё перед мажорным релизом). 'Sprint' читает docs/Sprint plans/sprint-*-summary.json автоматически."
  );
}

// ==================== SLIDE 6: AGENT TEAMS ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slideBg };
  addSlideNumber(slide, 5, 19);
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
  addBilingualNotes(slide,
    "14 agents across two teams. Three orchestrators coordinate: qa-lead handles JIRA workflow and go/no-go decisions; regression-orchestrator and autonomous-orchestrator manage parallel suite execution. Four execution specialists each own a dedicated browser — frontend on Chrome, backend on Edge, testing-expert on Firefox, ui-ux on DevTools — so they never collide on parallel runs. Plus four BA agents for analysis and a test-management specialist for plans and coverage matrices.",
    "14 агентов в двух командах. Три оркестратора координируют: qa-lead — JIRA-воркфлоу и go/no-go; regression-orchestrator и autonomous-orchestrator — параллельное выполнение сьютов. Четыре исполнителя имеют выделенный браузер каждый: frontend — Chrome, backend — Edge, testing-expert — Firefox, ui-ux — DevTools. Это исключает конфликты при параллельном запуске. Плюс 4 BA-агента и test-management-specialist для планов и матриц покрытия."
  );
}

// ==================== SLIDE 7: COMMANDS ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slideBg };
  addSlideNumber(slide, 6, 19);
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
  addBilingualNotes(slide,
    "16 slash commands cover the entire QA lifecycle from the IDE. /qa-smoke is a daily 12-test pre-deploy gate. /qa-test runs everything tied to a JIRA ticket. /qa-regression executes selected suites in parallel. /qa-bug reproduces, captures evidence, and files the ticket. /qa-status and /qa-env-check are read-only and auto-invocable — agents can call them without explicit user permission.",
    "16 slash-команд покрывают весь QA-цикл прямо из IDE. /qa-smoke — ежедневный гейт из 12 тестов перед деплоем. /qa-test — все ACs из JIRA-тикета. /qa-regression — параллельное выполнение выбранных сьютов. /qa-bug — воспроизводит, собирает evidence, заводит тикет. /qa-status и /qa-env-check — read-only и авто-инвокабельны, агент может звать их без явного разрешения."
  );
}

// ==================== SLIDE 8: PIPELINE & QUALITY COMMANDS ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slideBg };
  addSlideNumber(slide, 7, 19);
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
  addBilingualNotes(slide,
    "Three commands that round out the QA cycle. /qa-test-lifecycle keeps the suite in sync with code — no more stale Steps after a PR. /qa-design is unique: a dual Storybook + storefront audit catching bugs that only show in one of the two contexts. /qa-verify-fix closes the JIRA loop — fetches the ticket, reproduces the original STR, confirms the fix, runs regression checks, transitions JIRA.",
    "Три команды, замыкающие QA-цикл. /qa-test-lifecycle держит сьют в синхронизации с кодом — после PR не остаётся протухших Steps. /qa-design — уникальный двойной аудит Storybook + сторфронта, ловит баги, видимые только в одном из контекстов. /qa-verify-fix закрывает цикл JIRA — читает тикет, воспроизводит STR, подтверждает фикс, прогоняет регресс-проверки и переводит тикет."
  );
}

// ==================== SLIDE 8: MCP TOP 5 + VIRTOOZ ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slideBg };
  addSlideNumber(slide, 8, 19);
  addEyebrow(slide, "POWER FEATURE #1");

  slide.addText("Top 5 MCP Servers — Claude's Eyes, Hands & Memory", {
    x: 0.7, y: 0.85, w: 12, h: 0.5,
    fontSize: 24, bold: true, color: COLORS.accent, fontFace: "Segoe UI",
  });

  slide.addText("MCP servers are tools Claude calls during a test. They give the agent the ability to drive browsers, read live documentation, manage tickets, and reach across the platform — without leaving the conversation.", {
    x: 0.7, y: 1.35, w: 12, h: 0.5,
    fontSize: 12, color: COLORS.text2, fontFace: "Segoe UI",
  });

  // Top 5 cards
  const top5 = [
    { icon: "🌐", title: "Playwright ×3", sub: "Chrome · Firefox · Edge", desc: "Real browsers, isolated contexts, HAR capture, screenshots, parallel execution", badge: "#1 Eyes & Hands", bg: COLORS.accentSoft, titleColor: COLORS.accent },
    { icon: "📚", title: "VirtoOZ", sub: "12 topic-scoped tools", desc: "Primary VC docs source. Platform / Storefront / Marketplace user & developer guides + source code search", badge: "#2 VC Brain", bg: COLORS.greenSoft, titleColor: COLORS.green },
    { icon: "🎫", title: "Atlassian", sub: "JIRA + Confluence", desc: "Read tickets · file bugs with evidence · transition statuses · close the QA loop", badge: "#3 Ticket Loop", bg: COLORS.blueSoft, titleColor: COLORS.blue },
    { icon: "🐙", title: "GitHub", sub: "vc-module-* repos", desc: "Search module source code · review PRs · pull file contents · cross-reference behavior", badge: "#4 Source", bg: COLORS.codeBg, titleColor: COLORS.text },
    { icon: "📮", title: "Postman", sub: "REST + GraphQL", desc: "Author collections · seed test data · generate APIs · drive /qa-seed-data", badge: "#5 API", bg: COLORS.codeBg, titleColor: COLORS.text },
  ];
  top5.forEach((c, i) => {
    const x = 0.4 + i * 2.55;
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y: 2.0, w: 2.45, h: 3.3,
      fill: { color: c.bg }, line: { color: "E0DDD8", width: 1 }, rectRadius: 0.1,
    });
    slide.addText(c.icon, {
      x, y: 2.1, w: 2.45, h: 0.5,
      fontSize: 24, fontFace: "Segoe UI Emoji", align: "center",
    });
    slide.addText(c.title, {
      x: x + 0.1, y: 2.65, w: 2.25, h: 0.35,
      fontSize: 14, bold: true, color: c.titleColor, fontFace: "Segoe UI", align: "center",
    });
    slide.addText(c.sub, {
      x: x + 0.1, y: 3.0, w: 2.25, h: 0.3,
      fontSize: 9, color: COLORS.text3, fontFace: "Segoe UI", align: "center",
    });
    slide.addText(c.desc, {
      x: x + 0.15, y: 3.35, w: 2.15, h: 1.4,
      fontSize: 10, color: COLORS.text2, fontFace: "Segoe UI", align: "center",
    });
    slide.addText(c.badge, {
      x: x + 0.3, y: 4.85, w: 1.85, h: 0.3,
      fontSize: 9, bold: true, color: c.titleColor, fontFace: "Segoe UI", align: "center",
    });
  });

  // Supporting servers bar
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.4, y: 5.55, w: 12.5, h: 0.6,
    fill: { color: COLORS.codeBg }, line: { color: "E0DDD8", width: 1 }, rectRadius: 0.1,
  });
  slide.addText("SUPPORTING:   Chrome DevTools (console · network · HAR) · Figma (pixel-diff) · Azure (App Insights) · Context7 (third-party libs) · Microsoft Learn", {
    x: 0.6, y: 5.55, w: 12.1, h: 0.6,
    fontSize: 10, color: COLORS.text2, fontFace: "Segoe UI", valign: "middle",
  });

  // VirtoOZ callout
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.4, y: 6.3, w: 12.5, h: 1.0,
    fill: { color: COLORS.greenSoft }, line: { color: "A0C4B0", width: 1 }, rectRadius: 0.1,
  });
  slide.addText("Why VirtoOZ matters", {
    x: 0.6, y: 6.35, w: 12.1, h: 0.3,
    fontSize: 11, bold: true, color: COLORS.green, fontFace: "Segoe UI",
  });
  slide.addText("Agents stop guessing about Virto Commerce internals. They consult live, topic-scoped documentation — PlatformUserGuide, StorefrontDeveloperGuide, BackendSourceCode, B2BExperts, DeploymentGuide — before writing a test, filing a bug, or proposing a fix. Accessed via the /vc-docs skill.", {
    x: 0.6, y: 6.65, w: 12.1, h: 0.6,
    fontSize: 10, color: COLORS.text2, fontFace: "Segoe UI",
  });
  addBilingualNotes(slide,
    "MCP — Model Context Protocol — is the standard for Claude to invoke external tools. Top 5: Playwright trio (×3 real browsers), VirtoOZ (primary Virto Commerce documentation source, 12 topic-scoped tools), Atlassian (JIRA + Confluence loop), GitHub (vc-module-* source search), Postman (REST + GraphQL + seed data). VirtoOZ is the headline change — agents no longer guess about VC internals. They consult live, topic-scoped docs via /vc-docs. Supporting servers: Chrome DevTools (HAR, perf), Figma (pixel-diff), Azure (App Insights), Context7 (third-party libs), Microsoft Learn.",
    "MCP — Model Context Protocol — стандарт, по которому Claude вызывает внешние инструменты. Топ-5: трио Playwright (3 настоящих браузера), VirtoOZ (главный источник документации Virto Commerce, 12 узкоспециализированных инструментов), Atlassian (JIRA + Confluence), GitHub (поиск по vc-module-*), Postman (REST + GraphQL + сидинг данных). VirtoOZ — главное обновление: агенты больше не угадывают, как устроен VC. Они читают живую тематическую документацию через /vc-docs. Вспомогательные: Chrome DevTools (HAR, перф), Figma (pixel-diff), Azure (App Insights), Context7 (сторонние библиотеки), Microsoft Learn."
  );
}

// ==================== SLIDE 10: BUSINESS RULES ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slideBg };
  addSlideNumber(slide, 9, 19);
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
  addBilingualNotes(slide,
    "All agents share one central business-logic.md with testable BL-* invariants. When a test fails, the agent doesn't say 'failed' — it cites which BL- rule was violated. Update one rule once, and every agent enforces it on every future test. Edge cases get their own ECL-* identifiers — 13 generic e-commerce categories plus 7 VC-specific patterns, cross-referenced to BL- invariants. Every generated test case cites both.",
    "Все агенты используют общий business-logic.md с тестируемыми BL-инвариантами. При падении агент не пишет 'failed', а цитирует, какое BL-правило нарушено. Поправил правило один раз — каждый агент применяет его во всех будущих тестах. Edge-кейсы — отдельные ECL-* идентификаторы: 13 общих e-commerce категорий + 7 специфичных для VC, с перекрёстными ссылками на BL. Каждый сгенерированный тест-кейс цитирует оба."
  );
}

// ==================== SLIDE 11: PARALLEL REGRESSION ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slideBg };
  addSlideNumber(slide, 10, 19);
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
  addBilingualNotes(slide,
    "Three browser slots run simultaneously — Chrome, Firefox, Edge. Orchestrator queues remaining suites; each agent gets an isolated context with HAR capture. Quality gate verdicts are non-negotiable. APPROVED needs ≥95% pass + zero P0 bugs. CONDITIONAL allows deploy with tracked P2/P3 follow-ups. BLOCKED means a P0/P1 hit — no deploy regardless of schedule. Retry chain falls back across browsers up to twice.",
    "Три слота-браузера работают параллельно — Chrome, Firefox, Edge. Оркестратор ставит остальные сьюты в очередь; каждый агент получает изолированный контекст с HAR-записью. Вердикты quality gate неизменяемы. APPROVED — ≥95% pass + ноль P0-багов. CONDITIONAL — деплой возможен с зафиксированными P2/P3. BLOCKED — есть P0/P1, деплой запрещён вне зависимости от расписания. Ретраи проходят по цепочке браузеров до двух раз."
  );
}

// ==================== SLIDE 11: TOP 4 KNOWLEDGE FILES + VIRTOOZ ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slideBg };
  addSlideNumber(slide, 11, 19);
  addEyebrow(slide, "POWER FEATURE #4");

  slide.addText("Top 4 Knowledge Files + VirtoOZ — Shared Brain", {
    x: 0.7, y: 0.85, w: 12, h: 0.5,
    fontSize: 24, bold: true, color: COLORS.accent, fontFace: "Segoe UI",
  });

  slide.addText("All 14 agents consult the same knowledge base. Update once — every agent benefits. Below are the four files that drive the largest share of agent decisions, plus VirtoOZ MCP for live Virto Commerce reference.", {
    x: 0.7, y: 1.4, w: 12, h: 0.5,
    fontSize: 12, color: COLORS.text2, fontFace: "Segoe UI",
  });

  // 4 top knowledge files (2x2 grid)
  const top4 = [
    { icon: "📋", title: "business-logic.md", desc: "Testable platform invariants (BL-* IDs) across 15+ domains — pricing, cart, checkout, orders, auth, B2B, catalog, UI. Violations are flagged as bugs automatically, with the BL-ID cited.", consumer: "Consumed by: every QA agent on every test", bg: COLORS.accentSoft, color: COLORS.accent },
    { icon: "📐", title: "graphql-schema.md + runner doc", desc: "Live introspection snapshot of xAPI GraphQL schema + canonical authoring contract for runner-native CSV cases. Every GraphQL query consults schema FIRST to avoid invented field names.", consumer: "Consumed by: backend-expert, test-management-specialist, test-runner-agent", bg: COLORS.blueSoft, color: COLORS.blue },
    { icon: "🎯", title: "live-discovery.md", desc: "Decision tree + recipes for runtime test-data resolution. When to use {{VAR}} vs @td() vs live-discover vs random-data. Stops hardcoded IDs from rotting between catalog reseeds.", consumer: "Consumed by: any agent that writes Steps / Test_Data columns", bg: COLORS.codeBg, color: COLORS.accent },
    { icon: "🏷️", title: "test-runner-tags.md", desc: "Canonical tag grammar for both browser-mode runners: step tags ([NAV]·[ACT]·[WAIT]), assertion tags ([DOM]·[STATE]·[MATH]·[API]), cross-layer ([HAR]·[SCREEN]).", consumer: "Consumed by: test-runner-agent + autonomous-test-runner", bg: COLORS.codeBg, color: COLORS.green },
  ];
  top4.forEach((k, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.4 + col * 6.4;
    const y = 2.05 + row * 1.85;
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y, w: 6.2, h: 1.7,
      fill: { color: k.bg }, line: { color: k.color, width: 1 }, rectRadius: 0.1,
    });
    slide.addText(k.icon + "  " + k.title, {
      x: x + 0.15, y: y + 0.1, w: 5.9, h: 0.3,
      fontSize: 12, bold: true, color: k.color, fontFace: "Segoe UI",
    });
    slide.addText(k.desc, {
      x: x + 0.15, y: y + 0.45, w: 5.9, h: 0.9,
      fontSize: 10, color: COLORS.text2, fontFace: "Segoe UI",
    });
    slide.addText(k.consumer, {
      x: x + 0.15, y: y + 1.35, w: 5.9, h: 0.3,
      fontSize: 9, color: COLORS.text3, fontFace: "Segoe UI",
    });
  });

  // VirtoOZ callout
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.4, y: 5.85, w: 12.5, h: 1.1,
    fill: { color: COLORS.greenSoft }, line: { color: "A0C4B0", width: 1 }, rectRadius: 0.1,
  });
  slide.addText("📚  VirtoOZ MCP — /vc-docs skill", {
    x: 0.6, y: 5.9, w: 12.1, h: 0.3,
    fontSize: 12, bold: true, color: COLORS.green, fontFace: "Segoe UI",
  });
  slide.addText("Primary Virto Commerce documentation source. 12 topic-scoped retrieval tools — PlatformUserGuide, PlatformDeveloperGuide, StorefrontUserGuide, StorefrontDeveloperGuide, BackendSourceCode, FrontendSourceCode, MarketplaceUserGuide, MarketplaceDeveloperGuide, DeploymentGuide, B2BExperts. Every agent that needs Virto-specific architecture, module behavior, API contract, or deployment knowledge calls VirtoOZ first.", {
    x: 0.6, y: 6.2, w: 12.1, h: 0.7,
    fontSize: 10, color: COLORS.text2, fontFace: "Segoe UI",
  });

  // Footer mentioning other knowledge files
  slide.addText("23 knowledge files total — beyond the top 4: e-commerce-edge-cases-library (ECL-*), platform-patterns, sitemap, products, graphiql-interaction, order-creation-matrix, critical-ui-scope, module-suite-map, browser-quirks, performance-thresholds, …", {
    x: 0.4, y: 7.05, w: 12.5, h: 0.4,
    fontSize: 9, color: COLORS.text3, fontFace: "Segoe UI", italic: true,
  });
  addBilingualNotes(slide,
    "All 14 agents consult the same knowledge base. Update once — everyone benefits. Top 4 files drive most decisions: business-logic.md (BL- invariants), graphql-schema.md plus the runner doc (xAPI truth), live-discovery.md (no hardcoded IDs), test-runner-tags.md (CSV grammar). VirtoOZ MCP is the fifth pillar — primary Virto Commerce documentation source via the /vc-docs skill. 12 topic-scoped tools cover Platform/Storefront/Marketplace user and developer guides plus source code search.",
    "Все 14 агентов используют одну базу знаний. Обновил — польза всем. Топ-4 файла, на которые опирается большинство решений: business-logic.md (BL-инварианты), graphql-schema.md + runner doc (источник истины xAPI), live-discovery.md (никаких захардкоженных ID), test-runner-tags.md (грамматика CSV). Пятый столп — VirtoOZ MCP, главный источник документации Virto Commerce через скилл /vc-docs. 12 узкоспециализированных инструментов: Platform/Storefront/Marketplace user/developer guides + поиск по исходникам."
  );
}

// ==================== SLIDE 14: GRAPHQL SCHEMA + RUNNER-NATIVE TESTS ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slideBg };
  addSlideNumber(slide, 12, 19);
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
  addBilingualNotes(slide,
    "Two knowledge files plus scripts/graphql-runner.ts turn xAPI testing into deterministic, schema-validated CSV cases. Never write custom JS to execute GraphQL cases — the canonical runner handles schema validation, var substitution, @td() resolution, and evidence capture. Schema-update workflow: when the xAPI evolves, re-run introspection against the backend, regenerate graphql-schema.md, and CI catches any test referencing dropped fields. The CSV example shows the full grammar: [AUTH], [GQL-OP], [GQL-VARS], [GQL-CAPTURE] in Steps; [ERRORS], [NULL], [COUNT], [DATA], [VAR] in Assertions.",
    "Два knowledge-файла + scripts/graphql-runner.ts превращают xAPI-тестирование в детерминированные CSV-кейсы со schema-валидацией. Никаких кастомных JS — канонический runner делает schema validation, подстановку переменных, разрешение @td() и сбор evidence. Обновление схемы: при изменении xAPI перезапускаем интроспекцию, перегенерируем graphql-schema.md, и CI ловит тесты с удалёнными полями. Пример CSV: [AUTH], [GQL-OP], [GQL-VARS], [GQL-CAPTURE] в Steps; [ERRORS], [NULL], [COUNT], [DATA], [VAR] в Assertions."
  );
}

// ==================== SLIDE 15: LIVE TEST-DATA DISCOVERY ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slideBg };
  addSlideNumber(slide, 13, 19);
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
  addBilingualNotes(slide,
    "Catalogs get reseeded. B2B orgs get re-created. Virtual-catalog roots migrate between environments. Hardcoded IDs rot fast — within a sprint or two. Live discovery resolves entities at runtime against the actual environment. Four data layers: {{VAR}} for env config (URLs, creds, store IDs), @td() for named entities you assert by name, live-discover for 'first available' shape assertions, random-data for unique inputs with the AGENT-TEST-* prefix that /qa-seed-data teardown sweeps cleanly.",
    "Каталоги пересиживаются. B2B-организации пересоздаются. Virtual-catalog roots мигрируют между средами. Захардкоженные ID протухают за спринт-два. Live-discovery вытаскивает сущности в рантайме из реальной среды. Четыре слоя данных: {{VAR}} — для env-конфига (URL, креды, store IDs), @td() — именованные сущности с ассерт-by-name, live-discover — 'first available' со структурными ассертами, random-data — уникальные входы с префиксом AGENT-TEST-* для чистого teardown."
  );
}

// ==================== SLIDE 16: TEST RUNNER TAGS + @td() RESOLVER ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slideBg };
  addSlideNumber(slide, 14, 19);
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
  addBilingualNotes(slide,
    "test-runner-tags.md defines the browser-mode CSV grammar — typed step tags ([NAV], [ACT], [WAIT], [LOGIN], [SETUP]), assertion tags ([DOM], [STATE], [MATH], [API], [CONSOLE]), and cross-layer tags ([HAR], [SCREEN], [PERF]). Both standard and autonomous test runners speak the same grammar. The @td() resolver reads test-data/aliases.json plus CSV rows in test-data/. validate-td-refs.ts verifies every @td() reference before a run; graphql-runner rejects unresolved tokens at lint time. One CSV update propagates to every consumer.",
    "test-runner-tags.md задаёт CSV-грамматику для браузерных тестов — типизированные теги шагов ([NAV], [ACT], [WAIT], [LOGIN], [SETUP]), ассертов ([DOM], [STATE], [MATH], [API], [CONSOLE]) и кросс-слойные ([HAR], [SCREEN], [PERF]). Стандартный и автономный runner говорят на одной грамматике. Резолвер @td() читает test-data/aliases.json + CSV-строки в test-data/. validate-td-refs.ts проверяет все @td()-ссылки перед запуском; graphql-runner отказывает по неразрешённым токенам на lint-стадии. Один CSV-апдейт прорастает во все потребители."
  );
}

// ==================== SLIDE 17: CRITICAL UI SCOPE — LAYOUT STABILITY ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slideBg };
  addSlideNumber(slide, 15, 19);
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
  addBilingualNotes(slide,
    "A 7×8 matrix pins down exactly which BL-UI invariant applies to which component on which page. 7 components — VcButton, VcProductCard, VcLineItem, VcTable, VcDialog, Popover, VcSidebar. 8 pages — home, catalog, PDP, cart, orders, lists, members, company info. Validator script npm run scope:validate exits non-zero if any covered matrix cell points at a missing test ID. Covered exclusively by suite 048b-layout-stability.csv with the layout-stability selection.",
    "Матрица 7×8 фиксирует, какое BL-UI правило применяется к какому компоненту на какой странице. 7 компонентов — VcButton, VcProductCard, VcLineItem, VcTable, VcDialog, Popover, VcSidebar. 8 страниц — home, catalog, PDP, cart, orders, lists, members, company info. Валидатор npm run scope:validate падает, если какая-то покрытая ячейка матрицы указывает на отсутствующий test ID. Покрытие — только сьют 048b-layout-stability.csv через selection layout-stability."
  );
}

// ==================== SLIDE 16: /qa-test-lifecycle ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slideBg };
  addSlideNumber(slide, 16, 19);
  addEyebrow(slide, "UNIFIED TEST-CASE PIPELINE");

  slide.addText("/qa-test-lifecycle — Keep Tests in Sync with Code, Always", {
    x: 0.7, y: 0.85, w: 12, h: 0.5,
    fontSize: 22, bold: true, color: COLORS.accent, fontFace: "Segoe UI",
  });
  slide.addText("One command for the entire test-case lifecycle. Run it against a suite, domain, ticket, PR, module, or git diff — and the system carries it all the way from change detection to approved coverage.", {
    x: 0.7, y: 1.4, w: 12, h: 0.55,
    fontSize: 12, color: COLORS.text2, fontFace: "Segoe UI",
  });

  // 8-step pipeline flow
  const lcFlow = [
    { text: "scope", bg: COLORS.codeBg },
    { text: "sync stale", bg: COLORS.accentSoft },
    { text: "analyze gaps", bg: COLORS.accentSoft },
    { text: "generate", bg: COLORS.blueSoft },
    { text: "review\n(7-dim)", bg: COLORS.blueSoft },
    { text: "fix", bg: COLORS.blueSoft },
    { text: "verify", bg: COLORS.greenSoft },
    { text: "approve", bg: COLORS.greenSoft },
  ];
  lcFlow.forEach((f, i) => {
    const x = 0.4 + i * 1.6;
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y: 2.15, w: 1.4, h: 0.8,
      fill: { color: f.bg }, line: { color: "E0DDD8", width: 1 }, rectRadius: 0.1,
    });
    slide.addText(f.text, {
      x, y: 2.15, w: 1.4, h: 0.8,
      fontSize: 11, color: COLORS.text, fontFace: "Segoe UI", align: "center", valign: "middle",
    });
    if (i < lcFlow.length - 1) {
      slide.addText("→", {
        x: x + 1.4, y: 2.15, w: 0.2, h: 0.8,
        fontSize: 14, color: COLORS.accent, fontFace: "Segoe UI", align: "center", valign: "middle",
      });
    }
  });

  // Left: Accepts any scope
  slide.addText("Accepts any scope", {
    x: 0.7, y: 3.35, w: 6, h: 0.35,
    fontSize: 13, bold: true, color: COLORS.text, fontFace: "Segoe UI",
  });
  const scopes = [
    "✓  suite <ID> — direct quality review of an existing CSV",
    "✓  domain <name> — coverage audit per business domain",
    "✓  VCST-XXXX — derive cases from a JIRA ticket's ACs",
    "✓  PR #NNN — change-driven sync against a pull request",
    "✓  module <name> — vc-module-* repo coverage",
    "✓  diff · changelog <ver> — git-driven gap analysis",
  ];
  slide.addText(scopes.join("\n"), {
    x: 0.7, y: 3.75, w: 6, h: 2.6,
    fontSize: 11, color: COLORS.text2, fontFace: "Segoe UI", lineSpacingMultiple: 1.5,
  });

  // Right: What it produces
  slide.addText("What it produces", {
    x: 7.0, y: 3.35, w: 6, h: 0.35,
    fontSize: 13, bold: true, color: COLORS.text, fontFace: "Segoe UI",
  });
  const outputs = [
    "✓  Updated Steps / Assertions for stale cases",
    "✓  New cases with BL-* + ECL-* citations",
    "✓  Typed step + assertion tags ([NAV]·[ACT]·[DOM]·[MATH])",
    "✓  7-dimension quality review report",
    "✓  Live verification + approval gate before merge",
  ];
  slide.addText(outputs.join("\n"), {
    x: 7.0, y: 3.75, w: 5.6, h: 2.6,
    fontSize: 11, color: COLORS.text2, fontFace: "Segoe UI", lineSpacingMultiple: 1.5,
  });

  // Bottom rationale
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.4, y: 6.4, w: 12.5, h: 0.8,
    fill: { color: COLORS.codeBg }, line: { color: "E0DDD8", width: 1 }, rectRadius: 0.1,
  });
  slide.addText("Why it matters: tests stop rotting after PRs land. Delegates to test-management-specialist (authoring + review) and qa-testing-expert (live verification). Replaces the deprecated /qa-sync-tests command.", {
    x: 0.6, y: 6.4, w: 12.1, h: 0.8,
    fontSize: 11, color: COLORS.text2, fontFace: "Segoe UI", valign: "middle",
  });
  addBilingualNotes(slide,
    "One command for the entire test-case lifecycle. Run it against a suite, domain, JIRA ticket, PR, module, or git diff — it carries you all the way from change detection to approved coverage. Pipeline: scope → sync stale → analyze gaps → generate → 7-dimension review → fix → live verify → approve. Replaces the deprecated /qa-sync-tests. Delegates to test-management-specialist for authoring and review, and qa-testing-expert for live verification before merge.",
    "Одна команда на весь цикл работы с тест-кейсами. Принимает сьют, домен, JIRA-тикет, PR, модуль или git diff — ведёт от обнаружения изменения до одобренного покрытия. Пайплайн: scope → sync stale → analyze gaps → generate → 7-dimension review → fix → live verify → approve. Заменяет устаревший /qa-sync-tests. Делегирует test-management-specialist на авторинг и ревью и qa-testing-expert на live-верификацию перед мерджем."
  );
}

// ==================== SLIDE 19: TEST DATA GENERATION ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slideBg };
  addSlideNumber(slide, 17, 19);
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
  addBilingualNotes(slide,
    "Postman MCP builds and runs a collection to seed a complete test environment — catalogs, products, pricing, B2B organizations, users with roles. Five profiles: minimal (smoke), catalog (search/browse), b2b (RBAC), pricing (multi-currency), full (everything combined). Every seeded entity carries the AGENT-TEST-* prefix so /qa-seed-data teardown sweeps cleanly without touching real data. Safe to run on any QA environment.",
    "Postman MCP собирает и выполняет коллекцию для сидинга полного тестового окружения — каталоги, продукты, цены, B2B-организации, пользователи с ролями. Пять профилей: minimal (smoke), catalog (поиск/каталог), b2b (RBAC), pricing (мультивалюта), full (всё вместе). Каждая сущность с префиксом AGENT-TEST-*, поэтому teardown через /qa-seed-data подчищает чисто, не затрагивая реальные данные. Безопасно для любой QA-среды."
  );
}

// ==================== SLIDE 20: QA-TEST FLOW ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slideBg };
  addSlideNumber(slide, 18, 19);
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
  addBilingualNotes(slide,
    "End-to-end demo for /qa-test VCST-XXXX. Step 1: Atlassian MCP fetches the ticket — title, description, acceptance criteria. Step 2: orchestrator dispatches specialists in parallel — frontend on Chrome for storefront ACs, backend on Edge for API + admin ACs. Step 3: each agent navigates real browsers, captures screenshots plus HAR, watches console for errors. Step 4: failed ACs become JIRA bugs with P0–P3 severity, BL- references, and full evidence. Step 5: all ACs pass — transition the ticket to Testing Complete, link evidence, notify the team.",
    "Демо end-to-end для /qa-test VCST-XXXX. Шаг 1: Atlassian MCP читает тикет — заголовок, описание, acceptance criteria. Шаг 2: оркестратор параллельно отправляет специалистов — frontend на Chrome для сторфронт-ACs, backend на Edge для API + админка. Шаг 3: каждый агент работает с реальным браузером, снимает скриншоты + HAR, следит за консолью. Шаг 4: упавшие AC становятся JIRA-багами с P0–P3, BL-ссылками и полным evidence. Шаг 5: все AC проходят — тикет переводится в Testing Complete, evidence линкуется, команда оповещается."
  );
}

// ==================== SLIDE 19: ROADMAP ====================
{
  const slide = pptx.addSlide();
  slide.background = { fill: COLORS.slideBg };
  addSlideNumber(slide, 19, 19);
  addEyebrow(slide, "FUTURE DEVELOPMENT");

  slide.addText("Roadmap — What's Next for Agentic QA", {
    x: 0.7, y: 0.85, w: 10, h: 0.5,
    fontSize: 28, bold: true, color: COLORS.accent, fontFace: "Segoe UI",
  });

  const leftItems = [
    { badge: "Shipped ✓", badgeColor: COLORS.green, badgeBg: COLORS.greenSoft, title: "Unified Test-Case Lifecycle", desc: "/qa-test-lifecycle — scope → sync → analyze → generate → review → fix → verify → approve, driven by PRs / diffs / modules / tickets", dotColor: COLORS.green },
    { badge: "Shipped ✓", badgeColor: COLORS.green, badgeBg: COLORS.greenSoft, title: "Runner-Native GraphQL Suite", desc: "Schema-validated CSV cases via scripts/graphql-runner.ts; full tag grammar ([GQL-OP], [GQL-CAPTURE], [ERRORS], [DATA]) + @td() resolver", dotColor: COLORS.green },
    { badge: "Shipped ✓", badgeColor: COLORS.green, badgeBg: COLORS.greenSoft, title: "Agent Teams Autonomous Regression", desc: "TeamCreate API · 3+1 token bucket · exponential backoff · failure recovery · JIRA integration", dotColor: COLORS.green },
    { badge: "Q2 2026", badgeColor: COLORS.blue, badgeBg: COLORS.blueSoft, title: "CI/CD GitHub Actions", desc: "Daily smoke + weekly full regression, headless Chromium, Teams notifications, 90-day rolling history", dotColor: COLORS.blue },
    { badge: "Q2 2026", badgeColor: COLORS.blue, badgeBg: COLORS.blueSoft, title: "GraphQL Runner v2", desc: "Schema-diff alerts · custom predicate plugins · cross-case [GQL-CAPTURE] chaining · auto-cleanup of AGENT-TEST-* entities", dotColor: COLORS.blue },
    { badge: "Q2 2026", badgeColor: COLORS.blue, badgeBg: COLORS.blueSoft, title: "Multi-Browser CI & Visual Diff", desc: "Full 3-browser pool in CI (Chrome + Firefox + Edge) · Figma + Storybook pixel-diff baselines for all 55 components", dotColor: COLORS.blue },
  ];
  leftItems.forEach((item, i) => {
    const y = 1.55 + i * 0.85;
    slide.addShape(pptx.ShapeType.ellipse, {
      x: 0.9, y: y + 0.12, w: 0.15, h: 0.15,
      fill: { color: item.dotColor },
    });
    if (i < leftItems.length - 1) {
      slide.addShape(pptx.ShapeType.line, {
        x: 0.975, y: y + 0.27, w: 0, h: 0.58,
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
      fontSize: 11, bold: true, color: COLORS.text, fontFace: "Segoe UI",
    });
    slide.addText(item.desc, {
      x: 1.2, y: y + 0.27, w: 5.3, h: 0.55,
      fontSize: 9, color: COLORS.text2, fontFace: "Segoe UI",
    });
  });

  const rightItems = [
    { badge: "Q3 2026", badgeColor: COLORS.accent, badgeBg: COLORS.accentSoft, title: "AI Root-Cause Analyzer", desc: "Cross-references HAR + console + Azure App Insights + git blame to pre-classify each bug with severity, module, and a likely root-cause hypothesis", dotColor: COLORS.accent },
    { badge: "Q3 2026", badgeColor: COLORS.accent, badgeBg: COLORS.accentSoft, title: "Mobile & Real Device Testing", desc: "BrowserStack integration — iOS Safari (iPhone 15 Pro), Android Chrome (Galaxy S24). Critical for B2C checkout, BOPIS, configurable products", dotColor: COLORS.accent },
    { badge: "Q3 2026", badgeColor: COLORS.accent, badgeBg: COLORS.accentSoft, title: "Self-Updating Suites", desc: "Agents observe failures + code churn, propose Steps/Assertions updates, open a PR against regression/suites/ for QA review", dotColor: COLORS.accent },
    { badge: "Future", badgeColor: COLORS.text3, badgeBg: COLORS.codeBg, title: "Continuous Production QA", desc: "Read-only agents shadow production traffic via App Insights, detect anomalies, propose synthetic regression cases", dotColor: COLORS.text3 },
    { badge: "Future", badgeColor: COLORS.text3, badgeBg: COLORS.codeBg, title: "Test Impact & Cost Optimizer", desc: "ML predicts which suites are most likely to fail per PR + cost-per-suite — orchestrator picks the cheapest sufficient scope", dotColor: COLORS.text3 },
    { badge: "Future", badgeColor: COLORS.text3, badgeBg: COLORS.codeBg, title: "Multi-Tenant / White-Label Testing", desc: "Parallel regression across multiple VC storefronts and white-label brands with shared logic + brand-specific overrides", dotColor: COLORS.text3 },
  ];
  rightItems.forEach((item, i) => {
    const y = 1.55 + i * 0.85;
    slide.addShape(pptx.ShapeType.ellipse, {
      x: 7.2, y: y + 0.12, w: 0.15, h: 0.15,
      fill: { color: item.dotColor },
    });
    if (i < rightItems.length - 1) {
      slide.addShape(pptx.ShapeType.line, {
        x: 7.275, y: y + 0.27, w: 0, h: 0.58,
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
      fontSize: 11, bold: true, color: COLORS.text, fontFace: "Segoe UI",
    });
    slide.addText(item.desc, {
      x: 7.5, y: y + 0.27, w: 5.3, h: 0.55,
      fontSize: 9, color: COLORS.text2, fontFace: "Segoe UI",
    });
  });

  // Vision bar
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.7, y: 6.85, w: 11.9, h: 0.5,
    fill: { color: COLORS.accentSoft }, line: { color: COLORS.accent, width: 1 }, rectRadius: 0.1,
  });
  slide.addText("🚀  Vision: A fully autonomous QA system that continuously tests, learns from failures, updates its own test cases against real production signals, and provides real-time quality + cost signals — with zero manual scripting.", {
    x: 0.9, y: 6.85, w: 11.5, h: 0.5,
    fontSize: 11, color: COLORS.text, fontFace: "Segoe UI", valign: "middle",
  });
  addBilingualNotes(slide,
    "Shipped: unified /qa-test-lifecycle, runner-native GraphQL with schema validation, Agent Teams autonomous regression. Q2 2026: CI/CD pipeline (daily smoke, weekly full, Teams notifications), GraphQL Runner v2 with schema-diff alerts and capture chaining, multi-browser CI plus pixel-diff visual baselines. Q3 2026: AI root-cause analyzer cross-referencing HAR + console + App Insights + git blame, mobile testing via BrowserStack, self-updating suites that propose Steps/Assertions updates as PRs. Long term: continuous production QA shadowing real traffic, ML-based test impact + cost optimizer, multi-tenant white-label testing.",
    "Поставлено: единый /qa-test-lifecycle, runner-native GraphQL со schema-валидацией, Agent Teams автономный регресс. Q2 2026: CI/CD пайплайн (ежедневный smoke, еженедельный full, нотификации в Teams), GraphQL Runner v2 со schema-diff алертами и chaining-захватом, мульти-браузерный CI + pixel-diff визуальные baseline. Q3 2026: AI root-cause аналитик, сопоставляющий HAR + консоль + App Insights + git blame, мобильное тестирование через BrowserStack, self-updating сьюты, предлагающие апдейты Steps/Assertions в виде PR. Долгосрочно: continuous production QA, ML test impact + cost optimizer, мульти-тенантное white-label тестирование."
  );
}

// Write file
const outPath = "c:/Users/mutyk/My Projects/vc-mcp-testing-module/docs/presentation/agentic-qa-v2.pptx";
pptx.writeFile({ fileName: outPath }).then(() => {
  console.log(`✅ PowerPoint saved to: ${outPath}`);
}).catch((err) => {
  console.error("Error:", err);
});
