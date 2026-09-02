#!/usr/bin/env node
/**
 * scripts/docs/gen-kb-v3-diagrams.mjs — the KB v3 architecture diagrams, generated.
 *
 * The model below is the source of truth; `docs/adr/adr-knowledge-base-v3.drawio` is
 * generated output. Edit the model and re-run — never hand-edit the .drawio, for the
 * same reason `.claude/rules/test-data.md` §GOLDEN RULE gives for every other derived
 * artifact in this repo: a transcribed picture is correct exactly once, and it goes
 * stale silently while still looking authoritative.
 *
 * Cosmetic nudges made in the draw.io editor are expected to be lost on the next
 * regeneration; structural changes belong here. (Same contract draw.io itself applies
 * to its Mermaid containers: styles survive a regenerate, geometry does not.)
 *
 * Layout notes, learned by rendering rather than by guessing:
 *   - labels are HTML (html=1), so a line break is <br>, never a newline entity;
 *   - edge labels carry a background, or they become unreadable where lines cross;
 *   - long feedback edges run in reserved corridors (left x=24, right x=1396) instead
 *     of cutting through lanes;
 *   - the gate ladder lives on its own page: drawn inline on page 1 it forced every
 *     other connector across the full canvas.
 *
 * Five pages, one file:
 *   1. Процесс целиком          — the end-to-end loop, sources to answer and back
 *   2. Жизненный цикл записи    — the state machine with its two overlays
 *   3. Гейты консолидации       — the ladder, and what each failure does
 *   4. Перепроверка и споры     — the three initiating layers and the three verdicts
 *   5. Две базы и промоушен     — platform/client split, containment, upward channel
 *
 * Zero dependencies. `node scripts/docs/gen-kb-v3-diagrams.mjs`
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../../docs/adr/adr-knowledge-base-v3.drawio");
const ONE_PAGE = process.argv.includes("--page") ? Number(process.argv[process.argv.indexOf("--page") + 1]) : null;
const OUT_OVERRIDE = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : null;

/* ------------------------------------------------------------------ styles */

const FONT = "fontFamily=Helvetica;";
const S = {
  src: `rounded=1;whiteSpace=wrap;html=1;fillColor=#f2f5f4;strokeColor=#7d8d87;fontColor=#3f4d49;dashed=1;fontSize=12;${FONT}`,
  det: `rounded=1;whiteSpace=wrap;html=1;fillColor=#e3f1ee;strokeColor=#0f6f63;fontColor=#0b4d45;fontSize=12;${FONT}`,
  agent: `rounded=1;whiteSpace=wrap;html=1;fillColor=#fbf0e6;strokeColor=#a85a22;fontColor=#7a3f16;fontSize=12;${FONT}`,
  gate: `rounded=1;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#3d5a55;fontColor=#16211e;fontSize=12;${FONT}`,
  store: `shape=cylinder3;boundedLbl=1;backgroundOutline=1;size=10;whiteSpace=wrap;html=1;fillColor=#eef2f1;strokeColor=#3d5a55;fontColor=#16211e;fontSize=12;${FONT}`,
  human: `rounded=1;arcSize=40;whiteSpace=wrap;html=1;fillColor=#f7e6ea;strokeColor=#8e2b3e;fontColor=#6b1f2e;fontSize=12;${FONT}`,
  state: `rounded=1;arcSize=30;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#3d5a55;fontColor=#16211e;fontSize=13;${FONT}`,
  stateOk: `rounded=1;arcSize=30;whiteSpace=wrap;html=1;fillColor=#e3f1ee;strokeColor=#0f6f63;fontColor=#0b4d45;fontSize=13;${FONT}`,
  stateEnd: `rounded=1;arcSize=30;whiteSpace=wrap;html=1;fillColor=#eef2f1;strokeColor=#7d8d87;fontColor=#4b5c57;fontSize=13;${FONT}`,
  overlay: `rounded=1;whiteSpace=wrap;html=1;fillColor=#f7e6ea;strokeColor=#8e2b3e;fontColor=#6b1f2e;fontSize=12;dashed=1;${FONT}`,
  note: `rounded=0;whiteSpace=wrap;html=1;fillColor=#fbfaf7;strokeColor=#c8cfcc;fontColor=#4b5c57;align=left;verticalAlign=top;spacingLeft=12;spacingTop=8;spacingRight=10;fontSize=11;${FONT}`,
  lane: `rounded=0;whiteSpace=wrap;html=1;fillColor=none;strokeColor=#9db3ad;dashed=1;verticalAlign=top;align=left;spacingLeft=12;spacingTop=6;fontColor=#4b5c57;fontStyle=2;fontSize=12;${FONT}`,
  laneWarm: `rounded=0;whiteSpace=wrap;html=1;fillColor=none;strokeColor=#cf9a6a;dashed=1;verticalAlign=top;align=left;spacingLeft=12;spacingTop=6;fontColor=#7a3f16;fontStyle=2;fontSize=12;${FONT}`,
  laneDet: `rounded=0;whiteSpace=wrap;html=1;fillColor=none;strokeColor=#5fa79c;dashed=1;verticalAlign=top;align=left;spacingLeft=12;spacingTop=6;fontColor=#0b4d45;fontStyle=2;fontSize=12;${FONT}`,
  title: `text;html=1;align=left;verticalAlign=middle;fontSize=18;fontStyle=1;fontColor=#16211e;${FONT}`,
  sub: `text;html=1;align=left;verticalAlign=top;fontSize=11;fontColor=#4b5c57;${FONT}`,
};

const EBASE = `edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;labelBackgroundColor=#ffffff;fontSize=10;${FONT}`;
const E = {
  flow: `${EBASE}strokeColor=#3d5a55;fontColor=#3f4d49;`,
  det: `${EBASE}strokeColor=#0f6f63;fontColor=#0b4d45;`,
  warm: `${EBASE}strokeColor=#a85a22;fontColor=#7a3f16;`,
  back: `${EBASE}strokeColor=#8e2b3e;fontColor=#6b1f2e;dashed=1;`,
  soft: `${EBASE}strokeColor=#7d8d87;fontColor=#4b5c57;dashed=1;`,
  human: `${EBASE}strokeColor=#8e2b3e;fontColor=#6b1f2e;`,
};

/* -------------------------------------------------------------- primitives */

const esc = (s) =>
  String(s === undefined || s === null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const b = (s) => `<b>${s}</b>`;

function page(name) {
  const cells = [];
  let seq = 0;
  const uid = () => `${name.replace(/[^A-Za-zА-Яа-я]/g, "").slice(0, 3)}${++seq}`;

  return {
    name,
    box(id, x, y, w, h, label, style, parent) {
      cells.push(
        `        <mxCell id="${esc(id)}" value="${esc(label)}" style="${style}" vertex="1" parent="${esc(parent || "1")}">\n` +
          `          <mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry" />\n` +
          `        </mxCell>`,
      );
      return id;
    },
    /**
     * A block the way the team reads it: a title band on top, a rule under it, and
     * terse bullets below — "читает общее", never "общие может читать". Rendered as a
     * draw.io swimlane so the separator is a real shape feature rather than a drawn
     * line that drifts out of place when the box is resized by hand.
     */
    card(id, x, y, w, h, title, bullets, band, body, ink, head, optional) {
      const HEAD = head || 36;
      this.box(
        id, x, y, w, h, title,
        `swimlane;html=1;rounded=1;arcSize=6;startSize=${HEAD};horizontal=1;` +
          `fillColor=${band};swimlaneFillColor=${body};strokeColor=${ink};fontColor=${ink};` +
          `fontSize=13;fontStyle=1;align=center;verticalAlign=middle;strokeWidth=2;` +
          (optional ? "dashed=1;dashPattern=8 5;" : "") + FONT,
      );
      this.box(
        `${id}-b`, 0, HEAD, w, h - HEAD,
        bullets.map((t) => "•&nbsp; " + t).join("<br>"),
        `text;html=1;align=left;verticalAlign=top;whiteSpace=wrap;spacingLeft=14;spacingTop=10;` +
          `spacingRight=10;fontSize=12;fontColor=${ink};${FONT}`,
        id,
      );
      return id;
    },
    edge(from, to, label, style, opts) {
      const id = uid();
      const o = opts || {};
      const extra =
        (o.exitX !== undefined ? `exitX=${o.exitX};exitY=${o.exitY};exitDx=0;exitDy=0;` : "") +
        (o.entryX !== undefined ? `entryX=${o.entryX};entryY=${o.entryY};entryDx=0;entryDy=0;` : "");
      const points = (o.points || []).map((p) => `            <mxPoint x="${p[0]}" y="${p[1]}" />`).join("\n");
      const geom = points
        ? `          <mxGeometry relative="1" as="geometry">\n            <Array as="points">\n${points}\n            </Array>\n          </mxGeometry>`
        : `          <mxGeometry relative="1" as="geometry" />`;
      cells.push(
        `        <mxCell id="${id}" value="${esc(label || "")}" style="${(style || E.flow) + extra}" edge="1" parent="1" source="${esc(from)}" target="${esc(to)}">\n${geom}\n        </mxCell>`,
      );
      return id;
    },
    render(w, h) {
      return (
        `  <diagram id="${esc(name)}" name="${esc(name)}">\n` +
        `    <mxGraphModel dx="1200" dy="800" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${w}" pageHeight="${h}" math="0" shadow="0" adaptiveColors="auto">\n` +
        `      <root>\n        <mxCell id="0" />\n        <mxCell id="1" parent="0" />\n` +
        cells.join("\n") +
        `\n      </root>\n    </mxGraphModel>\n  </diagram>`
      );
    },
  };
}

/* ============================================ 0. Общий вид (для всех) */

/**
 * The overview is deliberately the least technical thing in this file: it is read by
 * managers and analysts, not only by engineers. Rules it follows, and they are what
 * keep it readable — one screen, nine blocks, no jargon (no "resolver", no "index",
 * no file names), every arrow labelled with what actually happens, and detail deferred
 * to the per-block pages. If a block needs a second sentence to be understood, it
 * belongs on its own page instead.
 */
function pageOverview() {
  const p = page("Общий вид");

  const C = {
    actor: ["#f0d3da", "#faeff2", "#7a2436"],
    agent: ["#f5dfc8", "#fdf6ef", "#8f4a1b"],
    window: ["#c9e4de", "#eef7f5", "#0d5f55"],
    store: ["#dde5e3", "#f4f7f6", "#2b3d39"],
    keeper: ["#c9e4de", "#eef7f5", "#0d5f55"],
    source: ["#e2e8e6", "#f6f8f7", "#3f4d49"],
  };
  const O = {
    lane: `rounded=1;arcSize=6;whiteSpace=wrap;html=1;fillColor=none;strokeColor=#9db3ad;dashed=1;verticalAlign=top;align=center;spacingTop=8;fontColor=#4b5c57;fontStyle=2;fontSize=12;${FONT}`,
  };
  const line = `edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;labelBackgroundColor=#ffffff;fontSize=12;strokeWidth=2;strokeColor=#3d5a55;fontColor=#2f3a37;${FONT}`;
  const rare = `${line}dashed=1;strokeColor=#8e2b3e;fontColor=#6b1f2e;`;

  p.box("t", 60, 24, 1000, 32, "Как это работает — общий вид", S.title);
  p.box("ts", 60, 62, 1180, 56,
    "Кто с кем разговаривает и что кому передаёт. Каждый блок потом раскрывается отдельной схемой — по запросу.<br>" +
    "Сплошные стрелки — то, что происходит само, без людей. Пунктирная стрелка — редкое вмешательство человека.<br>" +
    "Пунктирная рамка — блок есть не всегда.",
    S.sub);

  p.card("HUM", 60, 180, 240, 150,
    "Человек<br><span style=\"font-size:11px;font-weight:normal\">менеджер · разработчик<br>тестировщик · аналитик</span>", [
    "ставит задачу",
    "задаёт вопрос",
    "получает ответ с пояснением",
  ], ...C.actor, 68);

  p.card("AGT", 350, 180, 310, 160, "Агент-помощник", [
    "делает задачу: чинит, проверяет, объясняет",
    "спрашивает базу перед работой",
    "записывает новое — с доказательством",
    "спорит, если база расходится с продуктом",
    "поясняет человеку, откуда взят ответ",
  ], ...C.agent);

  p.card("WIN", 350, 400, 310, 165,
    "Справочная<br><span style=\"font-size:11px;font-weight:normal\">единая дверь к знаниям</span>", [
    "принимает все вопросы",
    "собирает ответ из доступных баз",
    "показывает обе стороны при переопределении",
    "говорит, насколько ответу верить",
    "говорит «не знаю», если ответа нет",
  ], ...C.window, 52);

  p.box("OPT", 760, 395, 710, 270,
    "Есть только у клиентского проекта",
    `rounded=1;arcSize=6;whiteSpace=wrap;html=1;fillColor=none;strokeColor=#7d8d87;dashed=1;dashPattern=8 5;strokeWidth=2;verticalAlign=top;align=center;spacingTop=6;fontColor=#4b5c57;fontStyle=2;fontSize=12;${FONT}`);
  p.card("KBP", 780, 200, 340, 125,
    "База знаний платформы<br><span style=\"font-size:11px;font-weight:normal\">верное для любого проекта</span>", [
    "отвечает справочной напрямую",
    "отдаёт знания проектам",
    "принимает предложения проектов как черновики",
  ], ...C.store, 52);
  p.card("KBC", 780, 435, 340, 190,
    "База знаний клиентского проекта<br><span style=\"font-size:11px;font-weight:normal\">верное только для этого проекта</span>", [
    "отвечает справочной напрямую",
    "читает общее",
    "переопределяет правила платформы у себя",
    "отменяет неприменимые правила",
    "дополняет общие правила",
    "не меняет общую базу",
    "предлагает наверх верное для всех",
  ], ...C.store, 52);

  p.card("KEEP", 350, 640, 310, 180,
    "Механизм проверки и обновления<br><span style=\"font-size:11px;font-weight:normal\">работает сам, без людей</span>", [
    "принимает новое только с доказательством",
    "кладёт подтверждённое в базу",
    "перепроверяет старое по изменениям и по кругу",
    "заменяет устаревшее, старое сохраняет",
    "помечает спорное, разрешает споры проверкой",
    "сообщает человеку, что изменилось",
  ], ...C.keeper, 52);

  p.card("OPP", 1180, 200, 270, 160,
    "Оператор платформы<br><span style=\"font-size:11px;font-weight:normal\">сотрудник Virto</span>", [
    "убирает неверное",
    "закрепляет важное",
    "ставит под сомнение",
    "читает сводку изменений",
    "вмешивается редко",
  ], ...C.actor, 52);

  p.card("OPC", 1180, 435, 270, 160,
    "Оператор проекта<br><span style=\"font-size:11px;font-weight:normal\">сотрудник клиента</span>", [
    "убирает неверное",
    "закрепляет важное",
    "ставит под сомнение",
    "читает сводку изменений",
    "вмешивается редко",
  ], ...C.actor, 52);

  p.card("SRC", 60, 860, 600, 100,
    "Источники<br><span style=\"font-size:11px;font-weight:normal\">код · стенд · документация · решения команды</span>", [
    "наполняют базу в первый раз",
    "служат проверкой для всех знаний",
  ], ...C.source, 52);

  p.edge("HUM", "AGT", "", line, { exitX: 1, exitY: 0.3, entryX: 0, entryY: 0.281 });
  p.edge("AGT", "HUM", "", line, { exitX: 0, exitY: 0.75, entryX: 1, entryY: 0.8 });
  p.edge("AGT", "WIN", "", line, { exitX: 0.25, exitY: 1, entryX: 0.25, entryY: 0 });
  p.edge("WIN", "AGT", "", line, { exitX: 0.75, exitY: 0, entryX: 0.75, entryY: 1 });
  p.edge("KBP", "WIN", "", line, { exitX: 0, exitY: 0.5, entryX: 1, entryY: 0.18, points: [[700, 262], [700, 430]] });
  p.edge("KBC", "WIN", "", line, { exitX: 0, exitY: 0.5, entryX: 1, entryY: 0.788 });
  p.edge("AGT", "KEEP", "", line, { exitX: 0, exitY: 0.5, entryX: 0, entryY: 0.5, points: [[315, 260], [315, 730]] });
  p.edge("KEEP", "KBP", "", line, { exitX: 1, exitY: 0.167, entryX: 0, entryY: 0.72, points: [[730, 670], [730, 290]] });
  p.edge("KEEP", "KBC", "", line, { exitX: 1, exitY: 0.333, entryX: 0.118, entryY: 1, points: [[820, 700]] });
  p.edge("KBC", "KBP", "", line, { exitX: 0.794, exitY: 0, entryX: 0.794, entryY: 1 });
  p.edge("SRC", "KEEP", "", line, { exitX: 0.742, exitY: 0, entryX: 0.5, entryY: 1 });
  p.edge("KEEP", "OPC", "", line, { exitX: 1, exitY: 0.667, entryX: 0.444, entryY: 1, points: [[1300, 760]] });
  p.edge("KEEP", "OPP", "", line, { exitX: 1, exitY: 0.833, entryX: 1, entryY: 0.5, points: [[1500, 790], [1500, 280]] });
  p.edge("OPC", "KBC", "", rare, { exitX: 0, exitY: 0.5, entryX: 1, entryY: 0.421 });
  p.edge("OPP", "KBP", "", rare, { exitX: 0, exitY: 0.5, entryX: 1, entryY: 0.64 });
  p.edge("KBP", "KBC", "", line, { exitX: 0.167, exitY: 1, entryX: 0.167, entryY: 0 });

  return p.render(1560, 1040);
}

/* =================================================== 1. Процесс целиком */

function pageProcess() {
  const p = page("Процесс целиком");
  const L = 24;
  const R = 1396;

  p.box("t", 60, 20, 900, 30, "База знаний v3 — процесс целиком", S.title);
  p.box("ts", 60, 54, 1260, 34,
    "Внутрь ведут ровно два пути: детерминированное извлечение и фиксация с доказательством. База стартует пустой; всё остальное — петли, которые удерживают её правильной.",
    S.sub);

  p.box("LS", 60, 100, 1300, 96, "Источники истины — вне базы. База никогда не ссылается на себя как на доказательство", S.lane);
  p.box("S1", 80, 132, 260, 52, "vc-platform · vc-module-*<br>vc-frontend · репозитории клиента", S.src);
  p.box("S2", 356, 132, 180, 52, "Живой деплоймент", S.src);
  p.box("S3", 552, 132, 180, 52, "Официальная<br>документация", S.src);
  p.box("S4", 748, 132, 280, 52, "ADR · обсуждения PR<br>решения в трекере", S.src);
  p.box("S5", 1044, 132, 296, 52, "Наблюдаемая практика<br>(как команда делает на самом деле)", S.src);

  p.box("LD", 60, 216, 640, 232, "Выводимый слой — регенерируется, статусов не имеет, протухнуть не может", S.laneDet);
  p.box("EXT", 80, 252, 280, 84, b("Экстракторы") + "<br>манифесты · REST · GraphQL SDL<br>настройки · права · маршруты витрины<br>детерминированно, без LLM", S.det);
  p.box("TBL", 384, 252, 296, 84, b("derived/") + "<br>сгенерированные таблицы<br>+ агрегатные записи на них", S.store);
  p.box("DIF", 80, 356, 600, 76, b("Дифф регенерации = поток событий") + "<br>серьёзность: breaking · dangerous · safe<br>--check сверяет побайтно: слой не может молча отстать", S.det);

  p.box("LA", 720, 216, 640, 232, "Агент в работе — единственное место, где есть модель и живая среда", S.laneWarm);
  p.box("ASK", 740, 252, 180, 84, b("1 · Спросить базу") + "<br>как читатель, своими словами", S.agent);
  p.box("NOV", 940, 252, 200, 84, b("2 · Протокол новизны") + "<br>канонизация → отпечаток<br>→ почти-дубликаты 0.90 / 0.70", S.agent);
  p.box("CAP", 1160, 252, 180, 84, b("3 · kb capture") + "<br>доказательство и refutableBy<br>обязательны, иначе отказ<br>оси: docs · live · source<br>артефакт · практика", S.agent);
  p.box("OUT", 740, 356, 600, 76, b("Четыре исхода, и только один создаёт запись") + "<br>дубль → подтверждение · другой аспект → черновик + связь<br>противоречие → спор · ничего → честно новый черновик", S.agent);

  p.box("RCK", 80, 476, 600, 76, b("Перепроверку инициирует система") + "<br>события дрейфа · ротация в CI · пометка на чтении<br>очередь: due → цитируемость → давность → задание туда, где есть среда", S.det);
  p.box("DRF", 740, 476, 600, 60, b("drafts/") + " — только дописывание, дедуп по отпечатку, тумбстоуны финальны", S.store);

  p.box("CONS", 60, 590, 1300, 104,
    b("Консолидация — CI внутри репозитория базы: детерминированный Node, ноль зависимостей, без LLM, без сети") +
    "<br><br>планка доказательств и пол плоскости · взвешенный счёт доверия · карантин аномального пакета · защита слоя" +
    "<br>бюджет продвижений на прогон · гейт экзамена до/после · один batch-коммит со сводкой" +
    "<br><br>что делает каждый провал — страница «Гейты консолидации»",
    S.gate);
  p.box("REV", 60, 716, 470, 56, "Регресс поиска → авто-откат батча, черновики возвращаются целыми.<br>Два отката подряд — громкая эскалация, а не бесконечный повтор", S.overlay);

  p.box("ENT", 740, 716, 620, 56, b("entries/") + " — KB-* (платформа) · KB-C-* (клиент)", S.store);
  p.box("IDX", 740, 796, 620, 56, "knowledge-index.json + catalog.md — генерируются, гейт дрейфа", S.det);

  p.box("LR", 60, 880, 1300, 150, "Выдача — единственная дверь; поиск детерминированный, без обучаемых частей", S.lane);
  p.box("RES", 80, 916, 230, 96, b("Резолвер") + "<br>@kb(id) · тема<br>клиентская дельта аннотирует,<br>а не прячет платформенную", S.det);
  p.box("ANS", 334, 916, 400, 96, b("Контракт ответа") + "<br>id · доверие · свежесть · провенанс · спорность<br>зацепки — отдельной секцией, не фактами<br>нет ответа → явный MISS, а не пустота", S.det);
  p.box("AGT", 758, 916, 170, 96, b("Агент-потребитель") + "<br>цитирует @kb(id)<br>проверка ∝ цене ошибки<br>доносит провенанс,<br>свежесть и спорность", S.agent);
  p.box("HUM", 952, 916, 150, 96, b("Человек") + "<br>только через агента", S.human);
  p.box("VET", 1126, 916, 214, 96, b("Инструменты вето") + "<br>retire · pin · dispute<br>+ читаемая сводка<br>машина обязана подчиниться", S.human);
  p.box("LEG", 60, 1046, 1300, 44,
    "Бирюзовый — детерминированный путь (работает офлайн, без модели) · оранжевый — путь, где нужна модель и живая среда · " +
    "бордовый пунктир — понижение доверия и откат · серый пунктир — обратная связь", S.note);

  p.edge("S1", "EXT", "", E.det);
  p.edge("EXT", "TBL", "", E.det);
  p.edge("EXT", "DIF", "", E.det);
  p.edge("DIF", "RCK", "изменился якорь", E.det);
  const toCap = { entryX: 0.5, entryY: 0 };
  p.edge("S2", "CAP", "", E.warm, { points: [[446, 204], [1250, 204]], ...toCap });
  p.edge("S3", "CAP", "", E.warm, { points: [[642, 210], [1250, 210]], ...toCap });
  p.edge("S4", "CAP", "", E.warm, { points: [[888, 216], [1250, 216]], ...toCap });
  p.edge("S5", "CAP", "", E.warm, { points: [[1192, 222], [1250, 222]], ...toCap });
  p.edge("ASK", "NOV", "", E.warm);
  p.edge("NOV", "CAP", "", E.warm);
  p.edge("NOV", "OUT", "", E.soft);
  p.edge("CAP", "DRF", "", E.warm, { points: [[1250, 460]] });
  p.edge("TBL", "IDX", "", E.det, {
    exitX: 0.9, exitY: 1, entryX: 1, entryY: 0.5,
    points: [[650, 562], [R, 562], [R, 824]],
  });
  p.edge("DRF", "CONS", "", E.flow, { points: [[1040, 560]] });
  p.edge("CONS", "ENT", "", E.flow, { points: [[1040, 704]] });
  p.edge("CONS", "REV", "", E.back, { points: [[295, 704]] });
  p.edge("REV", "DRF", "", E.back, { points: [[702, 744], [702, 570], [716, 570], [716, 506]], entryX: 0, entryY: 0.5 });
  p.edge("ENT", "IDX", "", E.flow);
  p.edge("IDX", "RES", "", E.det, { points: [[195, 824]] });
  p.edge("RES", "ANS", "", E.det);
  p.edge("ANS", "AGT", "", E.det);
  p.edge("AGT", "HUM", "", E.flow);
  p.edge("HUM", "VET", "", E.human);
  p.edge("VET", "ENT", "", E.human, { points: [[R, 964], [R, 744]] });
  p.edge("AGT", "ASK", "", E.soft, { points: [[843, 1030], [L, 1030], [L, 294]] });
  p.edge("RCK", "ASK", "", E.det, { points: [[710, 514], [710, 294]] });
  p.edge("ENT", "RCK", "якоря и давность", E.soft, { points: [[712, 744], [712, 570], [380, 570]] });

  return p.render(1440, 1110);
}

/* ============================================ 2. Жизненный цикл записи */

function pageLifecycle() {
  const p = page("Жизненный цикл записи");

  p.box("t", 60, 20, 900, 30, "Жизненный цикл записи", S.title);
  p.box("ts", 60, 54, 1220, 48,
    "Статусы машина проходит сама; overlay-флаги ортогональны статусу и не стирают позицию в цикле. Возраст не двигает статус никогда — двигают замещение и дрейф якоря.<br>" +
    "Под дрейфом память без механики инвалидации измеримо хуже, чем её отсутствие: 0.210 у append-only и last-write-wins против 0.309 без памяти вообще, при 0.950 у механики с отзывом (TEPA).",
    S.sub);

  p.box("PIN", 960, 130, 220, 56, b("+ pinned") + " (overlay)<br>ставит только человек", S.overlay);

  p.box("OBS", 80, 250, 170, 64, "наблюдение<br>в ходе задачи", S.src);
  p.box("DRAFT", 330, 250, 190, 64, b("draft") + "<br>доверие: низкое", S.state);
  p.box("CAND", 660, 250, 190, 64, b("candidate") + "<br>доверие: среднее", S.state);
  p.box("CONF", 970, 250, 200, 64, b("confirmed") + "<br>доверие: высокое", S.stateOk);
  p.box("SUP", 1290, 170, 200, 64, b("superseded") + "<br>читается как история", S.stateEnd);
  p.box("RET", 1290, 330, 200, 64, b("retired") + "<br>терминальный", S.stateEnd);
  p.box("TOMB", 330, 410, 190, 64, "тумбстоун<br>фингерпринт не воскресает", S.stateEnd);
  p.box("DISP", 960, 450, 220, 70, b("+ disputed") + " (overlay)<br>доверие: none, симметрично", S.overlay);

  p.box("N1", 80, 590, 640, 230,
    b("Что каждый статус разрешает агенту") + "<br><br>" +
    "confirmed без флагов — планировать можно молча, оговорок нет.<br>" +
    "confirmed + verification-due — одна строка предупреждения; перепроверить перед несущим использованием.<br>" +
    "candidate — пользоваться можно, но всегда с пометкой «не подтверждено»; во внешний артефакт как установленное правило — нет.<br>" +
    "draft — зацепка, а не ответ.<br>" +
    "disputed — не опираться НИ В КАКУЮ сторону: противоположное тоже не разрешено. Единственный ход — проверить живьём, и эта проверка сама является фиксацией.",
    S.note);

  p.box("N2", 760, 590, 730, 230,
    b("Правила, которые делают цикл безопасным") + "<br><br>" +
    "Замещение никогда не удаляет: файл, id и тело остаются, добавляется указатель вперёд и баннер в теле — инвалидация живёт в словах, а не только в поле.<br>" +
    "Возрождённый факт — это НОВАЯ запись с новым id, цитирующая старый. Id не переиспользуются никогда.<br>" +
    "pinned: машина не правит, не понижает, не замещает и не выводит из обращения; споры против такой записи уходят в сводку.<br>" +
    "Каждое понижение несёт машинный код причины: anchor_moved · contradicted_by_observation · superseded_by_entry · source_retracted · duplicate_of.",
    S.note);

  p.edge("OBS", "DRAFT", "фиксация с доказательством<br>и каналом опровержения", E.warm);
  p.edge("DRAFT", "CAND", "новизна пройдена, гейты чисты,<br>чеканится id — машина", E.flow);
  p.edge("CAND", "CONF", "счёт ≥ порога + пол плоскости<br>+ экзамен не упал — машина", E.det);
  p.edge("CAND", "DRAFT", "нужна доработка<br>или доказательство протухло", E.soft, { points: [[755, 360], [425, 360]] });
  p.edge("DRAFT", "TOMB", "отклонено", E.back);
  p.edge("CONF", "SUP", "замена подтверждена", E.flow);
  p.edge("CONF", "RET", "позитивное свидетельство<br>смерти предмета", E.flow);
  p.edge("CONF", "DISP", "противоречащее наблюдение · дрейф якоря<br>провал перепроверки · force-dispute", E.back);
  p.edge("CAND", "DISP", "", E.back, { points: [[755, 485]] });
  p.edge("DISP", "CONF", "свежие ≥2 оси<br>подтвердили исходное", E.det, { points: [[1220, 485], [1220, 282]] });
  p.edge("DISP", "SUP", "прав оспаривающий", E.flow, { points: [[1390, 485]] });
  p.edge("PIN", "CONF", "", E.human);

  return p.render(1560, 870);
}

/* =============================================== 3. Гейты консолидации */

function pageGates() {
  const p = page("Гейты консолидации");

  p.box("t", 60, 20, 1000, 30, "Гейты консолидации — и что делает каждый провал", S.title);
  p.box("ts", 60, 54, 1220, 34,
    "Ни один гейт не удаляет черновик. Провал означает «не в этот раз»: черновик остаётся видимым как непроверенный и пройдёт позже, когда кто-то его перепроверит.",
    S.sub);

  p.box("IN", 420, 110, 340, 50, "Пакет черновиков за прогон", S.store);

  const rows = [
    ["Q1", b("1 · Планка доказательств и пол плоскости") + "<br>свежесть · ≥2 независимые оси (или ось + проверка якоря) · провенанс для нормативного",
      "остаётся в drafts/ как непроверенное — с точной причиной"],
    ["Q2", b("2 · Это повтор уже подтверждённого?") + "<br>совпал отпечаток или почти-дубликат ≥ 0.90",
      "не отклонение, а событие подтверждения на существующей записи"],
    ["Q3", b("3 · Противоречит подтверждённой записи?"),
      "не перезапись, а спор: overlay + задание на перепроверку"],
    ["Q4", b("4 · Карантин: изменений больше порога?"),
      "применяется НИЧЕГО: пакет держится целиком и объявляет себя"],
    ["Q5", b("5 · Защита слоя: счёт подтверждённых по области не упал?"),
      "откат: падение без явного retire — это баг прогона, а не решение"],
    ["Q6", b("6 · Бюджет продвижений на домен исчерпан?"),
      "лишние ждут следующего прогона; сводка называет, сколько ждали"],
    ["Q7", b("7 · Экзамен: поиск не стал хуже?"),
      "git revert батча, черновики возвращаются; два отката подряд — эскалация"],
  ];
  rows.forEach(([id, q, fail], i) => {
    const y = 200 + i * 108;
    p.box(id, 340, y, 500, 76, q, S.gate);
    p.box(id + "f", 900, y + 8, 480, 60, fail, S.overlay);
  });

  p.box("OK", 420, 960, 340, 56, "Один batch-коммит, помеченный run id<br>+ сводка изменений", S.det);
  p.box("ENT", 420, 1046, 340, 50, "entries/ — запись подтверждена", S.store);

  p.edge("IN", "Q1", "", E.flow);
  for (let i = 0; i < rows.length - 1; i++) p.edge(rows[i][0], rows[i + 1][0], "прошло", E.flow);
  rows.forEach(([id]) => p.edge(id, id + "f", "нет", E.back));
  p.edge("Q7", "OK", "прошло", E.det);
  p.edge("OK", "ENT", "", E.det);

  p.box("N1", 60, 200, 250, 330,
    b("Почему гейты именно такие") + "<br><br>" +
    "Каждый закрывает конкретную аварию, а не гипотезу.<br><br>" +
    "Защита слоя — это класс «целый слой знаний утёк, а все приборы говорили ok».<br><br>" +
    "Карантин — «скопированная папка удвоила базу дублями за сутки».<br><br>" +
    "Эскалация подряд идущих откатов — «защита превратилась в замок: шесть откатов в день, ноль принятых пакетов, обучение встало».",
    S.note);

  p.box("N2", 60, 560, 250, 330,
    b("Чего гейты не делают") + "<br><br>" +
    "Не судят содержание: у консолидации нет ни модели, ни среды — она работает офлайн, детерминированно и без ключей.<br><br>" +
    "Доказательство прикладывается в момент фиксации, пока у агента ещё есть браузер и исходники.<br><br>" +
    "Поэтому фиксация без доказательства — отказ на входе, а не тихая потеря дальше по конвейеру.",
    S.note);

  return p.render(1440, 1140);
}

/* ============================================ 4. Перепроверка и споры */

function pageRecheck() {
  const p = page("Перепроверка и споры");

  p.box("t", 60, 20, 1000, 30, "Перепроверка и разрешение противоречий — без человека", S.title);
  p.box("ts", 60, 54, 1220, 34,
    "Система инициирует проверки сама, а не ждёт, пока агент случайно наткнётся на противоречие. Спор — не тупик, а сам по себе задание на перепроверку.",
    S.sub);

  p.box("L1", 60, 106, 1300, 176, "Три слоя инициативы — они покрывают разные пробелы, поэтому нужны все три", S.laneDet);
  p.box("T1", 80, 146, 400, 116, b("1 · События") + "<br>сдвинулся пин платформы, вышел релиз →<br>экстракторы регенерируют → дифф задевает якоря<br><br>точно и мгновенно, но только для заякоренного", S.det);
  p.box("T2", 500, 146, 400, 116, b("2 · Ротация в CI") + "<br>очередной срез корпуса по приоритету<br><br>покрывает беззякорное — процессы, соглашения,<br>наблюдаемое поведение; медленнее, зато без дыр", S.det);
  p.box("T3", 920, 146, 420, 116, b("3 · Пометка на чтении") + "<br>резолвер отдаёт запись с verification-due →<br>читающий агент проверяет живьём<br><br>у него есть среда, которой у CI нет: что читают — то и свежее", S.agent);

  p.box("QUE", 500, 320, 400, 64, b("recheck-queue.json") + "<br>приоритет: due → цитируемость → давность", S.store);
  p.box("EXEC", 500, 420, 400, 64, b("Исполняет агент в сессии") + "<br>CI умеет только детерминированные проверки якорей", S.agent);

  p.box("R1", 80, 530, 380, 84, b("Подтвердилось") + "<br>событие подтверждения, счёт растёт,<br>флаг снят, давность обнулена", S.det);
  p.box("R2", 500, 530, 400, 84, b("Не подтвердилось") + "<br>−3 к счёту, ставится overlay disputed,<br>причина едет с записью в каждую выдачу", S.overlay);
  p.box("R3", 940, 530, 400, 84, b("Источник уехал") + "<br>anchor_moved: verification-due,<br>счёт не меняется, пока проверка не провалилась", S.gate);

  p.box("L2", 60, 660, 1300, 250, "Разрешение противоречия — три исхода, и «неразрешимо» тоже честный ответ", S.lane);
  p.box("D0", 80, 700, 280, 76, b("Спор с доказательством") + "<br>агент · дрейф · человек", S.overlay);
  p.box("D1", 400, 700, 280, 76, b("Перепроверка из источников") + "<br>свежими доказательствами", S.agent);
  p.box("D2", 720, 690, 620, 60, "Прав оспаривающий → он становится записью, старая уходит в superseded;<br>обе связаны и обе читаются", S.det);
  p.box("D3", 720, 760, 620, 60, "Право исходное → overlay снят, спор в тумбстоун:<br>то же утверждение не вернётся снова", S.det);
  p.box("D4", 720, 830, 620, 66, "Не разрешилось → выдаются ОБЕ, сгруппированно, с датами и провенансом.<br>«Знание спорно» — это ответ, и он честнее тихого выбора победителя", S.gate);

  p.box("N", 60, 940, 1300, 84,
    "Чего здесь принципиально нет: правила «побеждает новое». Одна галлюцинирующая сессия не должна стирать год подтверждений — это задокументированный отказ агентских памятей, а не теоретический риск.<br>" +
    "И постулат Success из AGM (новое утверждение обязано оказаться в пересмотренном множестве) отвергнут сознательно: у пишущих агентов он и есть механизм дрейфа.",
    S.note);

  p.edge("T1", "QUE", "", E.det, { points: [[280, 294], [700, 294]] });
  p.edge("T2", "QUE", "", E.det);
  p.edge("T3", "QUE", "", E.warm, { points: [[1130, 294], [700, 294]] });
  p.edge("QUE", "EXEC", "", E.flow);
  p.edge("EXEC", "R1", "", E.det);
  p.edge("EXEC", "R2", "", E.back);
  p.edge("EXEC", "R3", "", E.flow);
  p.edge("R2", "D0", "", E.back, { points: [[220, 640]] });
  p.edge("D0", "D1", "спор = задание", E.flow);
  p.edge("D1", "D2", "", E.flow);
  p.edge("D1", "D3", "", E.flow);
  p.edge("D1", "D4", "", E.flow);

  return p.render(1440, 1070);
}

/* ========================================= 5. Две базы и промоушен */

function pageBrains() {
  const p = page("Две базы и промоушен");

  p.box("t", 60, 20, 1000, 30, "Две базы, изоляция и единственный путь наверх", S.title);
  p.box("ts", 60, 54, 1220, 34,
    "Границу пересекают ровно две вещи: вниз — чтение платформенной базы, закреплённое на коммите; наверх — issue строгого формата. Больше ничего и никогда.",
    S.sub);

  p.box("LP", 60, 106, 620, 330, "Платформенная база — VirtoCommerce/vc-knowledge", S.laneDet);
  p.box("P1", 80, 146, 270, 56, "derived/ — выводимые таблицы", S.store);
  p.box("P2", 370, 146, 290, 56, "entries/ — KB-*", S.store);
  p.box("P3", 80, 222, 270, 56, "drafts/", S.store);
  p.box("P4", 370, 222, 290, 56, "exam/ · goldens", S.store);
  p.box("P5", 80, 298, 580, 56, "index + catalog.md · гейты в собственном CI<br>о клиентах не знает ничего и никогда им не пишет", S.det);
  p.box("P6", 80, 366, 580, 50, b("Стартует ПУСТОЙ") + " — гейты обязаны проходить зелёными на нуле записей", S.gate);

  p.box("LC", 740, 106, 620, 330, "Клиентская база — репозиторий в организации клиента (GitHub или Azure Repos)", S.laneWarm);
  p.box("C1", 760, 146, 270, 56, "derived/ — та же схема", S.store);
  p.box("C2", 1050, 146, 290, 56, "entries/ — KB-C-*", S.store);
  p.box("C3", 760, 222, 270, 56, "drafts/", S.store);
  p.box("C4", 1050, 222, 290, 56, "exam/ · goldens", S.store);
  p.box("C5", 760, 298, 580, 56, "Дельты: override · extend · suppress<br>+ машинный пин {hash, commit} на платформенную запись", S.agent);
  p.box("C6", 760, 366, 580, 50, "Заводится и бутстрапится в /project-init: найти по маркеру или создать с нуля", S.gate);

  p.box("SYNC", 80, 480, 200, 64, b("SessionStart sync") + "<br>fail-open, ≤2 с", S.gate);
  p.box("CACHE", 320, 480, 360, 64, b("Локальный кэш платформенной базы") + "<br>readOnly: true, закреплён на коммите", S.det);
  p.box("RES", 740, 480, 300, 64, b("Один резолвер над обоими корнями") + "<br>приоритет + группировка", S.det);
  p.box("ANS", 1060, 480, 300, 64, b("Ответ: платформенная запись") + "<br>+ блок клиентской дельты", S.det);
  p.box("VIS", 740, 566, 620, 44, "Подавленное правило приглушается в ранжировании, но из выдачи не исчезает никогда", S.gate);

  p.box("LU", 60, 640, 1300, 300, "Промоушен: клиент → платформа. Единственный путь наверх, и он никогда не срабатывает сам", S.lane);
  p.box("U1", 80, 680, 280, 80, b("Запись помечена promotable") + "<br>«верно и на чистой платформе<br>версии клиента»", S.agent);
  p.box("U2", 390, 680, 280, 80, b("Линт на стороне клиента") + "<br>идентификаторы клиента в тексте<br>или ссылках → отказ до отправки", S.overlay);
  p.box("U3", 700, 680, 290, 80, b("GitHub issue строгой формы") + "<br>закрытые словари, ноль свободных полей<br>о клиенте не сообщается ничего", S.gate);
  p.box("U4", 1020, 680, 320, 80, b("kb ingest-issues в CI платформы") + "<br>валидация схемы → drafts/<br>никогда не сразу в entries/", S.det);
  p.box("U5", 390, 800, 600, 76, "Дальше — обычный жизненный цикл. Подтвердить такую запись можно только<br>платформенными доказательствами: клиентская проза не становится знанием<br>платформы по собственному праву", S.det);
  p.box("U6", 1020, 800, 320, 76, "Форма не распознана → метка kb-invalid,<br>не парсится: молчаливого приёма мусора нет", S.overlay);

  p.box("N", 60, 960, 1300, 84,
    "Изоляция обеспечена типом, а не аккуратностью: платформенный кэш объявляет readOnly, запись scope:client в платформенном корне отклоняется как ошибка контейнмента, а клиентский корень физически не может чеканить платформенный id.<br>" +
    "Ошибка маршрутизации трактуется как клиентская запись и останавливает работу: при сомнении содержимое остаётся у клиента.",
    S.note);

  p.edge("P2", "CACHE", "", E.det, { points: [[515, 450]] });
  p.edge("SYNC", "CACHE", "двигает пин", E.flow);
  p.edge("CACHE", "RES", "", E.det);
  p.edge("C2", "RES", "", E.warm, { points: [[1195, 450], [890, 450]] });
  p.edge("RES", "ANS", "", E.det);
  p.edge("ANS", "VIS", "", E.soft);
  p.edge("C5", "CACHE", "дрейф пина → ревизия", E.soft, { points: [[710, 326], [710, 512]] });
  p.edge("C2", "U1", "", E.warm, { points: [[1400, 174], [1400, 628], [220, 628]] });
  p.edge("U1", "U2", "", E.flow);
  p.edge("U2", "U3", "", E.flow);
  p.edge("U3", "U4", "", E.flow);
  p.edge("U4", "U5", "", E.det);
  p.edge("U4", "U6", "", E.back);
  p.edge("U5", "P3", "черновик платформенной базы", E.det, { points: [[340, 838], [30, 838], [30, 250]] });

  return p.render(1440, 1080);
}

/* -------------------------------------------------------------------- main */

const wrap = (list) =>
  `<mxfile host="app.diagrams.net" agent="scripts/docs/gen-kb-v3-diagrams.mjs" version="24.0.0">\n` +
  list.join("\n") +
  `\n</mxfile>\n`;

const write = (target, list, what) => {
  mkdirSync(dirname(target), { recursive: true });
  const doc = wrap(list);
  writeFileSync(target, doc, "utf8");
  process.stdout.write(`${what} — ${list.length} page(s), ${doc.split("\n").length} lines\n  ${target}\n`);
};

const detail = [pageProcess(), pageLifecycle(), pageGates(), pageRecheck(), pageBrains()];

if (OUT_OVERRIDE) {
  const one = ONE_PAGE === 0 ? pageOverview() : detail[(ONE_PAGE || 1) - 1];
  write(resolve(OUT_OVERRIDE), [one], "kb v3 — single page");
} else {
  write(resolve(dirname(OUT), "adr-knowledge-base-v3-overview.drawio"), [pageOverview()], "kb v3 — общий вид");
  write(OUT, detail, "kb v3 — подробные схемы");
}
