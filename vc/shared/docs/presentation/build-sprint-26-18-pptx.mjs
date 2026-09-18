/**
 * Builds sprint-demo26-18.pptx from the same content as sprint-demo26-18.html.
 *
 * The HTML deck stays the source of truth for wording; this script mirrors it into
 * PowerPoint for people who want the file rather than a browser. Palette, slide order
 * and speaker notes are kept in sync by hand — if you edit the HTML, edit here too.
 *
 * Four slides: domain maps · the knowledge base · tracker-comment policy · the /qa-test flow.
 * Every diagram is drawn with NATIVE PowerPoint shapes rather than an exported image, so it
 * stays editable in the file and survives a theme change — the same reason the HTML draws
 * them as inline SVG.
 *
 * Speaker notes are RUSSIAN, matching the `notes` array in the HTML deck.
 *
 * Run:  node vc/shared/docs/presentation/build-sprint-26-18-pptx.mjs
 */
import PptxGenJS from "pptxgenjs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "sprint-demo26-18.pptx");

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
  crit:       "D1495B",
  critSoft:   "FBEEF0",
};

const SANS = "Segoe UI";
const MONO = "Consolas";

const pptx = new PptxGenJS();
pptx.defineLayout({ name: "WIDE", width: 13.33, height: 7.5 });
pptx.layout = "WIDE";
pptx.author = "Virto Commerce QA Engineering";
pptx.company = "Virto Commerce";
pptx.subject = "Sprint 26-18 — Agentic QA";
pptx.title = "Sprint 26-18 Demo — Agentic QA";

const M = 0.72;              // left margin
const W = 13.33 - M * 2;     // content width

let slideNo = 0;
const TOTAL = 4;

/* ---------- layout guard ----------
   PowerPoint silently lets a shape hang off the slide, and the only way to notice is to
   open the file. So every slide records the lowest and right-most edge it actually used,
   and the build FAILS if anything crosses into the footer strip or off the page. The
   chrome (progress bar, page number) is added before the tracking wrapper and is exempt. */
const SLIDE_H = 7.5;
const SAFE_BOTTOM = 6.88;           // the page number sits at 6.95
const SAFE_RIGHT = 13.33 - 0.4;
const extents = [];

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

  const rec = { n: slideNo, bottom: 0, right: 0, worst: null };
  extents.push(rec);
  const addText = s.addText.bind(s);
  const addShape = s.addShape.bind(s);
  const track = (o, what) => {
    if (!o || typeof o !== "object") return;
    const b = (o.y || 0) + (o.h || 0);
    const r = (o.x || 0) + (o.w || 0);
    if (b > rec.bottom) { rec.bottom = b; rec.worst = what; }
    if (r > rec.right) rec.right = r;
  };
  s.addText = (t, o) => { track(o, String(t).slice(0, 44)); return addText(t, o); };
  s.addShape = (t, o) => { track(o, "shape"); return addShape(t, o); };
  return s;
}

function eyebrow(s, text, tint = null) {
  s.addShape(pptx.ShapeType.rect, {
    x: M, y: 0.62, w: 0.26, h: 0.028,
    fill: { color: tint === "agent" ? C.agent : C.accent }, line: { type: "none" },
  });
  s.addText(text.toUpperCase(), {
    x: M + 0.38, y: 0.44, w: W - 0.38, h: 0.32,
    fontSize: 9.5, color: tint === "agent" ? C.agent : C.accentInk,
    fontFace: MONO, bold: true, charSpacing: 2.2,
  });
}

function heading(s, text, { y = 0.9, size = 27, h = 1.0 } = {}) {
  s.addText(text, {
    x: M, y, w: W, h,
    fontSize: size, color: C.text, fontFace: SANS, bold: true, valign: "top",
    lineSpacingMultiple: 1.04,
  });
}

/** a labelled band that spans the content width */
function band(s, { y, h, label, lines, tint = "accent" }) {
  const isAgent = tint === "agent";
  s.addShape(pptx.ShapeType.roundRect, {
    x: M, y, w: W, h, rectRadius: 0.05,
    fill: { color: isAgent ? C.agentSoft : C.accentSoft },
    line: { color: isAgent ? C.agent : C.accent, width: 0.9 },
  });
  s.addText(label.toUpperCase(), {
    x: M + 0.22, y: y + 0.08, w: W - 0.44, h: 0.22,
    fontSize: 8.5, color: isAgent ? C.agent : C.accentInk,
    fontFace: MONO, bold: true, charSpacing: 1.6,
  });
  lines.forEach((t, i) => {
    s.addText(t, {
      x: M + 0.22, y: y + 0.3 + i * 0.2, w: W - 0.44, h: 0.2,
      fontSize: 8.5, color: C.textSoft, fontFace: MONO, valign: "middle",
    });
  });
}

/** a box in a diagram: title + wrapped body lines */
function box(s, { x, y, w, h, title, lines, fill = C.card, stroke = C.line, dash = null,
                  titleColor = C.text, titleSize = 11 }) {
  s.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.05,
    fill: { color: fill },
    line: { color: stroke, width: dash ? 0.9 : 0.75, dashType: dash || "solid" },
  });
  s.addText(title, {
    x: x + 0.14, y: y + 0.1, w: w - 0.28, h: 0.24,
    fontSize: titleSize, color: titleColor, fontFace: SANS, bold: true, valign: "middle",
  });
  if (lines?.length) {
    s.addText(lines.join("\n"), {
      x: x + 0.14, y: y + 0.36, w: w - 0.28, h: h - 0.46,
      fontSize: 8, color: C.textSoft, fontFace: MONO, valign: "top", lineSpacingMultiple: 1.22,
    });
  }
}

function arrow(s, { x, y, w, color = C.accent }) {
  s.addShape(pptx.ShapeType.line, {
    x, y, w, h: 0,
    line: { color, width: 1.1, endArrowType: "triangle" },
  });
}

function callout(s, { x, y, w, h, text, tint = null }) {
  const isAgent = tint === "agent";
  s.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.05,
    fill: { color: isAgent ? C.agentSoft : C.accentSoft },
    line: { color: isAgent ? C.agent : C.accent, width: 0.75, dashType: "dash" },
  });
  s.addText(text, {
    x: x + 0.22, y: y + 0.1, w: w - 0.44, h: h - 0.2,
    fontSize: 10, color: isAgent ? C.agent : C.accentInk, fontFace: SANS,
    valign: "middle", lineSpacingMultiple: 1.2,
  });
}

/** a rule, laid out as one column of a side-by-side row: key, sub-label, prose */
function ruleCol(s, { x, y, w, hText, key, sub, text }) {
  s.addText(key, {
    x, y, w, h: 0.18,
    fontSize: 9.5, color: C.accentInk, fontFace: MONO, bold: true, valign: "middle",
  });
  s.addText(sub.toUpperCase(), {
    x, y: y + 0.17, w, h: 0.16,
    fontSize: 7, color: C.textFaint, fontFace: MONO, charSpacing: 1.1, valign: "middle",
  });
  s.addText(text, {
    x, y: y + 0.35, w, h: hText,
    fontSize: 8.5, color: C.textSoft, fontFace: SANS, valign: "top", lineSpacingMultiple: 1.16,
  });
}

/* =======================================================================
   SLIDE 1 — domain maps
   ======================================================================= */
{
  const s = newSlide();
  eyebrow(s, "Sprint 26-18 · domain maps");
  heading(s, "A new artifact: what a feature IS, written\nonce and cited — not re-derived per ticket.", { h: 1.1 });

  band(s, {
    y: 2.02, h: 0.56,
    label: "Frontmatter — what makes it citable and expirable",
    lines: ["domain_slug · rev · generated · stale_after_days · expires_after_days · sources[] · applicability"],
  });

  const secs = [
    ["§0 · Changed since rev N", ["what this pass closed,", "corrected or newly found —", "a diff, not a re-read"], false],
    ["§1 · Purpose & value chain", ["the links a user traverses,", "plus ACTORS — who can act,", "and who only appears to"], false],
    ["§2 · Surface inventory", ["one subsection PER LAYER:", "back office · storefront · API", "· jobs · published docs"], false],
    ["§3 · Where layers DISAGREE", ["nothing else in the repo", "holds this. D1…Dn, never", "renumbered, each a verdict"], true],
    ["§4 · Coverage shape", ["which suites, how many cases,", "what the obvious selection", "group MISSES"], false],
    ["§5 · Open gaps", ["G1…Gn, carried forward", "until CLOSED, with the", "evidence that closed it"], false],
    ["§6 · Prior-art verdicts", ["every earlier analysis doc", "judged current / stale / wrong", "— so nobody re-reads them"], false],
    ["§7 · Amendments", ["what a later run changed", "and why — versioned, never", "quietly overwritten"], false],
  ];
  const bw = (W - 0.24 * 3) / 4;
  secs.forEach(([title, lines, hot], i) => {
    const col = i % 4, row = Math.floor(i / 4);
    box(s, {
      x: M + col * (bw + 0.24), y: 2.74 + row * 1.16, w: bw, h: 1.02,
      title, lines,
      fill: hot ? C.agentSoft : C.card,
      stroke: hot ? C.agent : C.line,
      titleColor: hot ? C.agent : C.text,
      titleSize: 10,
    });
  });

  band(s, {
    y: 5.02, h: 0.64,
    label: "Freshness gate — npm run domain:check",
    lines: [
      "a STALE map FAILS — it is read as current and arrives with a written deliverable's authority",
      "a MISSING map PASSES — twelve of thirteen domains had none; a hard gate on absence stops every ticket on day one",
    ],
  });

  /* the real excerpt */
  s.addText("REAL EXCERPT — .claude/knowledge/domain/loyalty-missions.md, rev 2", {
    x: M, y: 5.76, w: W, h: 0.2,
    fontSize: 8, color: C.textFaint, fontFace: MONO, bold: true, charSpacing: 1.2,
  });
  s.addShape(pptx.ShapeType.roundRect, {
    x: M, y: 5.98, w: 8.6, h: 0.84, rectRadius: 0.04,
    fill: { color: C.card }, line: { color: C.line, width: 0.6 },
  });
  s.addShape(pptx.ShapeType.rect, {
    x: M, y: 6.03, w: 0.04, h: 0.74, fill: { color: C.agent }, line: { type: "none" },
  });
  s.addText("§3 · D11 — the brief's premise about deployed org-level loyalty is FALSE", {
    x: M + 0.2, y: 6.04, w: 8.3, h: 0.2,
    fontSize: 9, color: C.agent, fontFace: MONO, bold: true, valign: "middle",
  });
  s.addText(
    "The commits are real, but they live on an OPEN, unmerged PR dated after the deployed build. No organization-level " +
    "accrual code, GraphQL argument or Admin surface exists on this environment. A map built on the brief's premise " +
    "would have invented a whole surface family that does not exist.",
    { x: M + 0.2, y: 6.26, w: 8.3, h: 0.54, fontSize: 8.5, color: C.textSoft, fontFace: SANS,
      valign: "top", lineSpacingMultiple: 1.14 }
  );

  callout(s, {
    x: M + 8.86, y: 5.98, w: W - 8.86, h: 0.84,
    text: "0 → 6 maps built. It is not a summary of documents — it is a set of claims with verdicts, each naming what confirmed it.",
  });

  s.addNotes(
    "Раньше всё выглядело так. Приходит задача — и мы каждый раз заново перечитываем одни и те же девять документов, " +
    "больше двух тысяч строк, ради одного небольшого вопроса. А когда работа закончена, всё понимание пропадает вместе " +
    "с ней, и следующая задача начинает с чистого листа.\n\n" +
    "Теперь у каждой крупной темы — заказы, лояльность, организации — есть своя карта. Это один документ, который " +
    "отвечает: что это за функциональность, кто ею пользуется и где её можно увидеть — в админке, в магазине, в API, " +
    "в фоновых задачах, в документации. Самый ценный раздел — третий: где эти части противоречат друг другу. Больше " +
    "нигде в проекте такого списка нет.\n\n" +
    "Внизу слайда — настоящая выдержка из карты, прочитайте её вслух. В задаче было написано, что начисление баллов " +
    "на уровне компании уже работает на стенде. Карта это проверила: кода там нет — он существует только в непринятом " +
    "пулл-реквесте, который сделали позже, чем собрали сам стенд. Поверь мы задаче на слово, мы бы написали тесты на " +
    "то, чего не существует.\n\n" +
    "И про проверку скажите отдельно. Если карта устарела — сборка падает. Если карты нет совсем — не падает ничего. " +
    "Так сделано намеренно: карт не было ни у одной темы, и строгая проверка в первый же день остановила бы всю работу. " +
    "Было ноль карт — стало шесть."
  );
}

/* =======================================================================
   SLIDE 2 — the knowledge base
   ======================================================================= */
{
  const s = newSlide({ tint: "agent" });
  eyebrow(s, "Sprint 26-18 · knowledge", "agent");
  heading(s, "A domain map is one file in a knowledge base —\nand where a file sits decides what it costs.", { h: 1.1 });

  /* left: the four tiers */
  s.addText("FOUR TIERS — WHAT IS PAID, AND WHEN", {
    x: M, y: 2.04, w: 6.0, h: 0.22,
    fontSize: 8, color: C.textFaint, fontFace: MONO, bold: true, charSpacing: 1.3,
  });

  const tiers = [
    ["ALWAYS LOADED", ["CLAUDE.md + .claude/rules/*.md", "re-paid on EVERY turn and EVERY dispatch"],
     "64,173", "chars · cap 80,000", C.critSoft, C.crit, C.crit],
    ["LOADED WHOLE WHEN REACHED", ["commands · agents · SKILL.md", "cannot be read in part, so each has a budget"],
     "80", "files · ≤19,000 each", C.agentSoft, C.agent, C.agent],
    ["ON DEMAND — .claude/knowledge/**", ["read by the step that needs it, and nothing else", "task-conditional rules live here, CITED not restated"],
     "1.84M", "chars · 56 files", C.accentSoft, C.accent, C.accentInk],
    ["NEVER LOADED — docs/decisions/", ["measured rationale, post-mortems, retired designs", "read by humans deciding whether to change it"],
     "168K", "chars · 7 files", C.card, C.line, C.text],
  ];
  tiers.forEach(([title, lines, num, sub, fill, stroke, col], i) => {
    const y = 2.26 + i * 0.92;
    s.addShape(pptx.ShapeType.roundRect, {
      x: M, y, w: 6.0, h: 0.84, rectRadius: 0.05,
      fill: { color: fill }, line: { color: stroke, width: 0.9 },
    });
    s.addText(title, {
      x: M + 0.18, y: y + 0.08, w: 4.0, h: 0.22,
      fontSize: 10, color: col, fontFace: SANS, bold: true, valign: "middle",
    });
    s.addText(lines.join("\n"), {
      x: M + 0.18, y: y + 0.32, w: 4.2, h: 0.46,
      fontSize: 7.5, color: C.textSoft, fontFace: MONO, valign: "top", lineSpacingMultiple: 1.2,
    });
    s.addText(num, {
      x: M + 4.3, y: y + 0.1, w: 1.55, h: 0.32,
      fontSize: 15, color: col, fontFace: MONO, bold: true, align: "right", valign: "middle",
    });
    s.addText(sub, {
      x: M + 3.7, y: y + 0.45, w: 2.15, h: 0.2,
      fontSize: 7.5, color: C.textFaint, fontFace: MONO, align: "right", valign: "middle",
    });
  });

  /* right: the real directory, by size */
  const RX = M + 6.4;
  const RW = W - 6.4;
  s.addText(".claude/knowledge/ IN THIS PROJECT — BY AREA", {
    x: RX, y: 2.04, w: RW, h: 0.22,
    fontSize: 8, color: C.textFaint, fontFace: MONO, bold: true, charSpacing: 1.3,
  });

  const areas = [
    ["oracles", 659, "4 · 659K", true],
    ["domain", 428, "14 · 428K", true],
    ["execution", 394, "22 · 394K", true],
    ["api", 102, "6 · 102K", false],
    ["agents", 96, "3 teams · 96K", false],
    ["automation", 64, "3 · 64K", false],
    ["diagnostics", 42, "1 · 42K", false],
    ["ba", 35, "1 · 35K", false],
    ["architecture", 19, "2 · 19K", false],
  ];
  const BAR_MAX = 3.0;
  areas.forEach(([name, val, label, hot], i) => {
    const y = 2.34 + i * 0.33;
    s.addText(name, {
      x: RX, y, w: 1.15, h: 0.22, fontSize: 9, color: C.text, fontFace: SANS, valign: "middle",
    });
    const bw2 = Math.max(0.05, (val / 659) * BAR_MAX);
    s.addShape(pptx.ShapeType.roundRect, {
      x: RX + 1.2, y: y + 0.045, w: bw2, h: 0.13, rectRadius: 0.02,
      fill: { color: hot ? C.accentSoft : C.card },
      line: { color: hot ? C.accent : C.line, width: 0.6 },
    });
    s.addText(label, {
      x: RX + 1.28 + bw2, y, w: 1.5, h: 0.22,
      fontSize: 8, color: C.textFaint, fontFace: MONO, valign: "middle",
    });
  });

  callout(s, {
    x: RX, y: 5.30, w: RW, h: 0.6, tint: "agent",
    text: "The two biggest are the ORACLES — the behavioural truth a case is judged against — and the DOMAIN maps, which did not exist a fortnight ago.",
  });

  /* the example */
  s.addText("EXAMPLE — THE SAME BRIEF, TWO WAYS OF NAMING THE ORACLE", {
    x: M, y: 6.02, w: 6.0, h: 0.2,
    fontSize: 8, color: C.textFaint, fontFace: MONO, bold: true, charSpacing: 1.2,
  });
  const ex = [
    ["a brief that cites the PATH", "read …/oracles/business-logic.md", "217 invariants · ~96,000 tokens", C.critSoft, C.crit, C.crit],
    ["a brief that carries the SLICE", "npm run bl:extract -- --domain cart", "15 invariants · ~7,200 tokens", C.accentSoft, C.accent, C.accentInk],
  ];
  ex.forEach(([k, cmd, num, fill, stroke, col], i) => {
    const x = M + i * 3.1;
    s.addShape(pptx.ShapeType.roundRect, {
      x, y: 6.22, w: 2.9, h: 0.62, rectRadius: 0.05,
      fill: { color: fill }, line: { color: stroke, width: 0.75 },
    });
    s.addText(k.toUpperCase(), {
      x: x + 0.14, y: 6.26, w: 2.62, h: 0.16,
      fontSize: 6.5, color: C.textFaint, fontFace: MONO, bold: true, charSpacing: 1,
    });
    s.addText(cmd, {
      x: x + 0.14, y: 6.43, w: 2.62, h: 0.18,
      fontSize: 7.5, color: C.text, fontFace: MONO, valign: "middle",
    });
    s.addText(num, {
      x: x + 0.14, y: 6.62, w: 2.62, h: 0.2,
      fontSize: 10, color: col, fontFace: MONO, bold: true, valign: "middle",
    });
  });
  s.addText(
    "The slicer reuses the linter's own parser, so an extract cannot silently drop an invariant the gate can see — " +
    "and every slice declares itself a SUBSET and lists its ids.",
    { x: M + 6.4, y: 6.22, w: RW, h: 0.62, fontSize: 9.5, color: C.textSoft, fontFace: SANS,
      valign: "middle", lineSpacingMultiple: 1.18 }
  );

  s.addNotes(
    "Этот слайд объясняет, где карта лежит и почему это важно для стоимости работы.\n\n" +
    "Уровней четыре, и отличаются они тем, когда мы за них платим.\n\n" +
    "Первый читается всегда, при каждом обращении к модели, — шестьдесят четыре тысячи знаков при разрешённых " +
    "восьмидесяти. За место здесь идёт настоящая борьба: сюда попадает только то, без чего ошибётся даже задача, " +
    "никак с этой темой не связанная.\n\n" +
    "Второй — инструкции команд и агентов. Их нельзя прочитать наполовину, поэтому у каждого файла свой предел: " +
    "девятнадцать тысяч знаков.\n\n" +
    "Третий — сама база знаний, почти два миллиона знаков. И она не стоит ничего, пока конкретный шаг работы её " +
    "не откроет. В этом вся идея.\n\n" +
    "Четвёртый — записи о принятых когда-то решениях. Их читают только люди.\n\n" +
    "Справа — как эта база выглядит у нас на самом деле. Самые большие части: описания правильного поведения " +
    "системы, по которым мы решаем, прошёл тест или нет, — и карты, которых две недели назад попросту не было.\n\n" +
    "Пример внизу совсем простой. Если дать агенту ссылку на весь свод правил, он прочитает двести семнадцать " +
    "правил, чтобы воспользоваться тремя. Если дать выдержку — пятнадцать. Выдержка берётся из того же файла слово " +
    "в слово, поэтому второй копии, которая со временем разойдётся с оригиналом, просто не возникает."
  );
}

/* =======================================================================
   SLIDE 3 — tracker-comment policy
   ======================================================================= */
{
  const s = newSlide();
  eyebrow(s, "Sprint 26-18 · policy & rules");
  heading(s, "A Markdown image in a Jira comment renders\nas nothing — and posts 200 OK while doing it.", { h: 1.1 });

  band(s, {
    y: 2.02, h: 0.58,
    label: "Golden rule — one comment per ticket per run. Amend it; never append.",
    lines: ["the id is recorded at first post · no id ⇒ you have not posted · id recorded ⇒ you may not POST, only PUT"],
  });

  const stages = [
    ["1 · COMPOSE", ["locally — nothing posted mid-run", "Markdown · structured · outcome first", "stills carry the VALUES; a GIF only", "when the defect IS the transition", "≤1 GIF · ≤8 frames · ≤5 MB"], false],
    ["2 · ATTACH", ["there is no MCP attachment tool —", "REST directly, many files per request", "POST /rest/api/3/issue/<KEY>/attachments", "check what landed before retrying —", "a blind retry duplicates every file"], false],
    ["3 · EMBED", ["the v2 WIKI endpoint, not v3 Markdown", "!shot.png|width=700!", "Jira resolves the name against the", "issue's attachments → a real media node", "The carve-out: the WHOLE body is wiki"], false],
    ["4 · VERIFY", ["from the RENDERED body, never the", "status code", "?expand=renderedBody", "read the <img> src — it carries the", "attachment ID, not the filename"], true],
  ];
  const sw = (W - 0.3 * 3) / 4;
  stages.forEach(([title, lines, hot], i) => {
    const x = M + i * (sw + 0.3);
    box(s, {
      x, y: 2.76, w: sw, h: 1.5, title, lines,
      fill: hot ? C.agentSoft : C.card,
      stroke: hot ? C.agent : C.line,
      titleColor: hot ? C.agent : C.text,
      titleSize: 10.5,
    });
    if (i < 3) arrow(s, { x: x + sw + 0.05, y: 3.51, w: 0.2 });
  });

  /* hook layer */
  s.addShape(pptx.ShapeType.roundRect, {
    x: M, y: 4.34, w: W, h: 0.92, rectRadius: 0.05,
    fill: { color: C.accentSoft }, line: { color: C.accent, width: 0.9 },
  });
  s.addText("HOOK LAYER — THE RULE IS NOT ADDRESSED TO JUDGEMENT-IN-THE-MOMENT · ALL THREE FAIL OPEN · 22 TESTS", {
    x: M + 0.22, y: 4.42, w: W - 0.44, h: 0.22,
    fontSize: 8.5, color: C.accentInk, fontFace: MONO, bold: true, charSpacing: 1.4,
  });
  const hooks = [
    ["enforce-one-tracker-comment · PreToolUse", "blocks the second comment, prints the amend command"],
    ["record-tracker-comment · PostToolUse", "records the first id — the guard binds even if bypassed"],
    ["enforce-jira-markdown · PreToolUse", "blocks wiki markup on the Markdown (v3) path"],
  ];
  const hw = (W - 0.44 - 0.24 * 2) / 3;
  hooks.forEach(([t, b], i) => {
    const x = M + 0.22 + i * (hw + 0.24);
    s.addShape(pptx.ShapeType.roundRect, {
      x, y: 4.68, w: hw, h: 0.5, rectRadius: 0.04,
      fill: { color: C.card }, line: { color: C.line, width: 0.6 },
    });
    s.addText(t, {
      x: x + 0.12, y: 4.72, w: hw - 0.24, h: 0.2,
      fontSize: 7.5, color: C.text, fontFace: MONO, valign: "middle",
    });
    s.addText(b, {
      x: x + 0.12, y: 4.92, w: hw - 0.24, h: 0.2,
      fontSize: 7.5, color: C.textSoft, fontFace: MONO, valign: "middle",
    });
  });

  /* measured media verdicts */
  s.addText("MEASURED PER MEDIA TYPE — ALL FROM ?expand=renderedBody", {
    x: M, y: 5.26, w: W, h: 0.2,
    fontSize: 8, color: C.textFaint, fontFace: MONO, bold: true, charSpacing: 1.2,
  });
  const media = [
    [".png", "<img src=…/attachment/content/<id>>", "inline image", C.accentSoft, C.accent, C.pass],
    [".gif", "same shape, and Jira animates it inline", "THE motion-evidence format — travels the identical path", C.accentSoft, C.accent, C.pass],
  ];
  const mw = (W - 0.24) / 2;
  media.forEach(([k, shape, verdict, fill, stroke, col], i) => {
    const x = M + i * (mw + 0.24);
    s.addShape(pptx.ShapeType.roundRect, {
      x, y: 5.48, w: mw, h: 0.60, rectRadius: 0.05,
      fill: { color: fill }, line: { color: stroke, width: 0.8 },
    });
    s.addText(k, {
      x: x + 0.14, y: 5.53, w: mw - 0.28, h: 0.2,
      fontSize: 9.5, color: col, fontFace: SANS, bold: true, valign: "middle",
    });
    s.addText(shape, {
      x: x + 0.14, y: 5.72, w: mw - 0.28, h: 0.18,
      fontSize: 7, color: C.textSoft, fontFace: MONO, valign: "middle",
    });
    s.addText(verdict, {
      x: x + 0.14, y: 5.88, w: mw - 0.28, h: 0.18,
      fontSize: 7.5, color: col, fontFace: MONO, valign: "middle",
    });
  });

  const rcw = (W - 0.5) / 2;
  ruleCol(s, {
    x: M, y: 6.20, w: rcw, hText: 0.30, key: "VirtoOZ first", sub: "product behaviour",
    text: "When how the platform is SUPPOSED to behave is unclear, query the docs before acting on a guess — a verdict built on a guess reads as confident, and nobody re-checks it.",
  });
  ruleCol(s, {
    x: M + rcw + 0.5, y: 6.20, w: rcw, hText: 0.30, key: "BUDGET-004 · DOC-006", sub: "prompt hygiene",
    text: "Every prompt file capped at 19,000 chars on a per-file ratchet, and a derived count may no longer be transcribed into prose.",
  });

  s.addNotes(
    "Заголовок — это и есть главная находка. Картинка, вставленная в комментарий Jira обычным способом, не появляется " +
    "вовсе. Ошибки при этом нет, Jira отвечает, что всё хорошо. Мы потеряли на этом целый круг работы: два готовых " +
    "руководства ушли с двенадцатью невидимыми скриншотами.\n\n" +
    "Дальше идите по схеме слева направо — это четыре шага.\n\n" +
    "Сначала комментарий собирается целиком у нас; по ходу работы не публикуется ничего.\n\n" +
    "Второй шаг — приложить файлы. Готового инструмента для этого нет, приходится обращаться к Jira напрямую. Здесь " +
    "предупредите: если непонятно, получилось или нет, и попробовать ещё раз наугад — все файлы приложатся дважды.\n\n" +
    "Третий шаг самый неожиданный. Чтобы картинка появилась, приходится пользоваться старым способом публикации " +
    "комментариев — и тогда весь текст комментария тоже нужно писать по-старому.\n\n" +
    "Четвёртый — проверить. Смотреть надо на то, как комментарий выглядит в итоге, а не на ответ «всё хорошо». Наш " +
    "собственный инструмент сначала проверял неправильно и объявил сбоем две нормально вставленные картинки.\n\n" +
    "Полоса снизу — почему всё это держится. Правило не рассчитано на внимательность человека в нужную минуту, " +
    "потому что именно внимательность и подвела. Его соблюдают автоматические проверки — но сломайся сама проверка, " +
    "работу она не остановит, и это принципиально.\n\n" +
    "И последний ряд. Обычная картинка вставляется. Анимация вставляется и проигрывается — это единственный способ " +
    "показать что-то в движении. Если спросят про видео: его прикладывать не стоит, на его месте оказывается пустая " +
    "рамка, и Jira снова отвечает, что всё хорошо. Анимацию стоит прикладывать, только когда сама ошибка — это " +
    "переход из одного состояния в другое, и она никогда не заменяет обычные скриншоты: из анимации нельзя " +
    "скопировать число."
  );
}

/* =======================================================================
   SLIDE 4 — the /qa-test flow
   ======================================================================= */
{
  const s = newSlide();
  eyebrow(s, "Sprint 26-18 · /qa-test flow");
  heading(s, "Nothing touched the product until two\nartifacts it never reads were finished.", { h: 1.1 });

  /* BEFORE row — a time axis, width is the shape of the run */
  s.addText("BEFORE", {
    x: M, y: 2.06, w: 1.2, h: 0.2,
    fontSize: 8, color: C.textFaint, fontFace: MONO, bold: true, charSpacing: 1.3,
  });
  const beforeRow = [
    ["route · pre-flight", 1.25, C.card, C.line, C.textSoft],
    ["context wave", 1.45, C.card, C.line, C.textSoft],
    ["fault model", 1.15, C.card, C.line, C.textSoft],
    ["author the case corpus", 2.4, C.agentSoft, C.agent, C.agent],
    ["verifier", 0.9, C.card, C.line, C.textSoft],
    ["EXECUTE", 1.8, C.accentSoft, C.accent, C.accentInk],
    ["close", 0.7, C.card, C.line, C.textSoft],
    ["release sweep", 2.1, C.critSoft, C.crit, C.crit],
  ];
  let bx = M, execBeforeX = 0;
  beforeRow.forEach(([label, w, fill, stroke, col], i) => {
    s.addShape(pptx.ShapeType.roundRect, {
      x: bx, y: 2.3, w, h: 0.46, rectRadius: 0.04,
      fill: { color: fill },
      line: { color: stroke, width: 0.8, dashType: i === 7 ? "dash" : "solid" },
    });
    s.addText(label, {
      x: bx, y: 2.3, w, h: 0.46,
      fontSize: 8.5, color: col, fontFace: i === 5 ? SANS : MONO,
      bold: i === 5, align: "center", valign: "middle",
    });
    if (i === 5) execBeforeX = bx;
    bx += w + 0.05;
  });
  s.addText("93% of a FAST run's tokens", {
    x: bx - 2.15, y: 2.78, w: 2.1, h: 0.18,
    fontSize: 7, color: C.crit, fontFace: MONO, align: "center",
  });
  s.addText("first test — and the first moment a dead environment can be noticed", {
    x: M + 2.2, y: 2.8, w: execBeforeX - M - 2.2 + 1.8, h: 0.2,
    fontSize: 8, color: C.crit, fontFace: MONO, align: "right", valign: "middle",
  });

  /* AFTER row */
  s.addText("AFTER", {
    x: M, y: 3.66, w: 1.2, h: 0.2,
    fontSize: 8, color: C.textFaint, fontFace: MONO, bold: true, charSpacing: 1.3,
  });
  const afterRow = [
    ["route · pre-flight", 1.25, C.card, C.line, C.textSoft, "solid"],
    ["context wave", 1.45, C.card, C.line, C.textSoft, "solid"],
    ["discovery", 1.1, C.agentSoft, C.agent, C.agent, "solid"],
    ["checklist", 0.95, C.card, C.line, C.textSoft, "solid"],
    ["gate", 0.42, C.accentSoft, C.accent, C.accentInk, "solid"],
    ["EXECUTE", 3.5, C.accentSoft, C.accent, C.accentInk, "solid"],
    ["close-out", 0.95, C.card, C.line, C.textSoft, "solid"],
    ["release sweep — deleted", 2.0, C.surface, C.line, C.textFaint, "dash"],
  ];
  let ax = M, execAfterX = 0;
  afterRow.forEach(([label, w, fill, stroke, col, dash], i) => {
    s.addShape(pptx.ShapeType.roundRect, {
      x: ax, y: 3.9, w, h: 0.46, rectRadius: 0.04,
      fill: { color: fill }, line: { color: stroke, width: 0.8, dashType: dash },
    });
    s.addText(label, {
      x: ax, y: 3.9, w, h: 0.46,
      fontSize: 8.5, color: col, fontFace: i === 5 ? SANS : MONO,
      bold: i === 5, align: "center", valign: "middle",
    });
    if (i === 5) execAfterX = ax;
    ax += w + 0.05;
  });

  /* the recovered-time bracket, between the two EXECUTE starts */
  s.addShape(pptx.ShapeType.line, {
    x: execAfterX, y: 3.36, w: execBeforeX - execAfterX, h: 0,
    line: { color: C.accent, width: 1.2, beginArrowType: "triangle", endArrowType: "triangle" },
  });
  s.addText("time-to-first-test recovered", {
    x: execAfterX - 0.4, y: 3.12, w: execBeforeX - execAfterX + 0.8, h: 0.2,
    fontSize: 8.5, color: C.accentInk, fontFace: MONO, bold: true, align: "center", valign: "middle",
  });

  /* parallel authoring lane + the probe */
  s.addShape(pptx.ShapeType.roundRect, {
    x: execAfterX, y: 4.46, w: 3.1, h: 0.4, rectRadius: 0.04,
    fill: { color: C.agentSoft }, line: { color: C.agent, width: 0.8, dashType: "dash" },
  });
  s.addText("author the case corpus — in the background", {
    x: execAfterX, y: 4.46, w: 3.1, h: 0.4,
    fontSize: 7.5, color: C.agent, fontFace: MONO, align: "center", valign: "middle",
  });
  s.addShape(pptx.ShapeType.roundRect, {
    x: M + 1.3, y: 4.46, w: 1.3, h: 0.4, rectRadius: 0.04,
    fill: { color: C.accentSoft }, line: { color: C.accent, width: 0.8 },
  });
  s.addText("5-min probe", {
    x: M + 1.3, y: 4.46, w: 1.3, h: 0.4,
    fontSize: 7.5, color: C.accentInk, fontFace: MONO, align: "center", valign: "middle",
  });
  arrow(s, { x: M + 2.66, y: 4.66, w: 0.24 });
  s.addText("BLOCKED ⇒ exit here, not 40 min in", {
    x: M + 2.96, y: 4.46, w: 2.4, h: 0.4,
    fontSize: 7.5, color: C.textSoft, fontFace: MONO, valign: "middle",
  });

  s.addText(
    "Schematic — the bar widths are the shape of the run, not measured wall-clock. The one measured number on it " +
    "is the release sweep: ~24 runner dispatches, 93% of a FAST run's tokens, answering a release question the " +
    "ticket verdict never depended on.",
    { x: M, y: 4.98, w: W, h: 0.42, fontSize: 8, color: C.textFaint, fontFace: MONO,
      valign: "top", lineSpacingMultiple: 1.2 }
  );

  const rcw = (W - 0.5 * 2) / 3;
  [
    ["a condition, not a step", "gate 3-exec",
     "Execution is released by “the checklist exists and its data resolves” — and authoring runs in the background from that moment."],
    ["discovery moved first", "observed, not guessed",
     "It feeds a fifth routed output — conditions the acceptance criteria never named — so the verdict carries what was seen."],
    ["the sweep, deleted", "narrowed twice, then cut",
     "Its criterion ratifies as not-assessed — never as a pass, and never by substituting a number that answers a different question."],
  ].forEach(([key, sub, text], i) => {
    ruleCol(s, { x: M + i * (rcw + 0.5), y: 5.52, w: rcw, hText: 0.62, key, sub, text });
  });

  callout(s, {
    x: M, y: 6.56, w: W, h: 0.3,
    text: "And one defect the restructure exposed: a REPAIRED case could ship without ever running. The post-run set is now every case this run wrote OR changed.",
  });

  s.addNotes(
    "Сразу предупредите: это схема, а не замеры времени. Ширина полос показывает порядок работы, а не минуты.\n\n" +
    "Верхняя полоса — как было раньше. До самого продукта дело не доходило, пока не написан весь набор тестов и " +
    "пока его не проверили. То есть самая долгая работа в браузере стояла в очереди за двумя документами, которые " +
    "ей и не нужны. А если стенд не работает, мы узнавали об этом в конце этого ожидания, а не в начале.\n\n" +
    "Нижняя полоса — что изменили. Три вещи.\n\n" +
    "Первая: короткая пятиминутная проверка, жив ли стенд. Если нет — останавливаемся сразу, а не через сорок минут.\n\n" +
    "Вторая: тестирование начинается не по номеру шага, а как только выполнено условие — есть чек-лист и готовы " +
    "данные для него. Написание тестов идёт рядом, в фоне.\n\n" +
    "Третья: большой финальный прогон убрали совсем. Он отвечал на вопрос, от которого решение по задаче всё равно " +
    "не зависело, а стоил девяносто три процента всей работы быстрого сценария.\n\n" +
    "И честная часть в конце. Когда перестраивали, выяснилось: починенный тест мог уйти дальше, так ни разу и не " +
    "запустившись. Теперь в финальную проверку попадает каждый тест, который в этой работе написали или изменили."
  );
}

/* ---------- layout report ---------- */
let breached = false;
console.log("slide   bottom   right   lowest element");
for (const e of extents) {
  const bad = e.bottom > SAFE_BOTTOM || e.right > SAFE_RIGHT;
  if (bad) breached = true;
  console.log(
    `  ${e.n}     ${e.bottom.toFixed(2)}    ${e.right.toFixed(2)}   ${bad ? "OVERFLOW ← " : ""}${e.worst ?? ""}`
  );
}
if (breached) {
  console.error(
    `\nLayout breach: content must stay above ${SAFE_BOTTOM}" (slide is ${SLIDE_H}", page number at 6.95")` +
    ` and left of ${SAFE_RIGHT}". Nothing written.`
  );
  process.exit(1);
}

await pptx.writeFile({ fileName: OUT });
console.log(`\nWrote ${OUT} (${slideNo} slides)`);
