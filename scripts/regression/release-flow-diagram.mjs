/**
 * release-flow-diagram — draws the parallel release-regression diagram (regression/releases/README.md).
 *
 *   npm run release:diagram                      # rewrite regression/releases/release-regression-flow.svg
 *   npm run release:diagram -- --html <file>     # also write the page version (dark/light, web fonts)
 *
 * Edit the boxes, lanes and labels below, run it, and commit the SVG it writes. The SVG is standalone
 * (no web fonts, light and dark through the media query), because GitHub renders it as an image.
 */
import fs from 'fs';
import path from 'path';

const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
const ROOT = process.env.QA_RUN_HOME || process.cwd();
const SVG_OUT = flag('--svg') || path.join(ROOT, 'regression', 'releases', 'release-regression-flow.svg');
const HTML_OUT = flag('--html');

const W = 1280, H = 1010;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
let svg = [];
const add = (s) => svg.push(s);

// text block: lines[0] is the title (bold), the rest are detail lines
const text = (x, y, lines, opts = {}) => {
  const { anchor = 'middle', cls = 't', lh = 16, titleCls = 'tt' } = opts;
  const out = lines.map((l, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : lh}" class="${i === 0 ? titleCls : cls}">${esc(l)}</tspan>`).join('');
  add(`<text x="${x}" y="${y}" text-anchor="${anchor}">${out}</text>`);
};
const box = (x, y, w, h, lines, kind = 'box') => {
  add(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" class="${kind}"/>`);
  const n = lines.length, lh = 16;
  const top = y + h / 2 - ((n - 1) * lh) / 2 + 5;
  text(x + w / 2, top, lines, { titleCls: kind === 'cmd' ? 'tc' : 'tt', cls: kind === 'cmd' ? 'tw' : 't' });
};
const diamond = (cx, cy, r, lines) => {
  add(`<polygon points="${cx},${cy - r} ${cx + r * 1.25},${cy} ${cx},${cy + r} ${cx - r * 1.25},${cy}" class="gate"/>`);
  const n = lines.length, lh = 14;
  text(cx, cy - ((n - 1) * lh) / 2 + 4, lines, { titleCls: 'tg', cls: 'tg2', lh });
};
const arrow = (d, cls = 'ar') => add(`<path d="${d}" class="${cls}" marker-end="url(#${cls === 'ar' ? 'h' : cls === 'arg' ? 'hg' : 'hd'})"/>`);
const label = (x, y, s, cls = 'lbl') => add(`<text x="${x}" y="${y}" class="${cls}" text-anchor="middle">${esc(s)}</text>`);
const lane = (y, h, title, sub) => {
  add(`<rect x="10" y="${y}" width="${W - 20}" height="${h}" rx="16" class="lane"/>`);
  add(`<text x="30" y="${y + 26}" class="lt">${esc(title)}</text>`);
  if (sub) add(`<text x="30" y="${y + 44}" class="ls">${esc(sub)}</text>`);
};

add(`<defs>
  <marker id="h" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="hd-a"/></marker>
  <marker id="hg" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="hd-g"/></marker>
  <marker id="hd" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="hd-d"/></marker>
</defs>`);

// ---- 1. Planner lane
lane(10, 150, '1 · PLAN', 'one planner, once per release');
box(150, 60, 190, 70, ['/qa-test-plan', 'stable 17  ·  or a sprint'], 'cmd');
box(380, 60, 190, 70, ['What changed', 'release:diff — code vs rebuild', 'per component, candidate suites']);
box(610, 60, 200, 70, ['Waves: tier × domain', 'critical → high → rest', 'W0 first · WX last']);
diamond(925, 95, 44, ['Open PR +', 'Jira sub-task', 'per wave?']);
box(1060, 60, 180, 70, ['Hand out', 'one sub-task per wave', 'unassigned'], 'side');
arrow('M340,95 L376,95'); arrow('M570,95 L606,95'); arrow('M810,95 L866,95'); arrow('M980,95 L1056,95');
label(1018, 86, 'yes');

// ---- 2. main
const mY = 190, mH = 140;
add(`<rect x="10" y="${mY}" width="${W - 20}" height="${mH}" rx="16" class="main"/>`);
add(`<text x="30" y="${mY + 30}" class="mt">main · regression/releases/&lt;release&gt;/</text>`);
add(`<text x="30" y="${mY + 50}" class="ms">the whole release lives in git — anyone can pick up any wave</text>`);
const chips = [
  ['release.json', 'wave plan', 'planner'], ['PLAN.md · scope.json', 'how scope was decided', 'planner'], ['module-diff.json', 'release:diff output', 'planner'],
  ['waves/<W>/state.json', 'owner · status · totals', 'wave owner'], ['waves/<W>/ledger.csv', 'every verdict, filed or not', 'wave owner'], ['waves/<W>/report.md', 'results · what is left', 'wave owner'],
  ['PROGRESS.md', 'generated, never edited', 'release:status --write'],
];
chips.forEach(([a, b, c], i) => {
  const x = 30 + i * 175, y = mY + 66;
  add(`<rect x="${x}" y="${y}" width="165" height="60" rx="8" class="chip"/>`);
  add(`<text x="${x + 10}" y="${y + 20}" class="cf">${esc(a)}</text><text x="${x + 10}" y="${y + 37}" class="cd">${esc(b)}</text><text x="${x + 10}" y="${y + 52}" class="co">${esc(c)}</text>`);
});
add(`<rect x="1140" y="${mY + 14}" width="110" height="26" rx="13" class="ci"/><text x="1195" y="${mY + 32}" class="cit" text-anchor="middle">CI: release:check</text>`);
arrow(`M925,139 L925,${mY - 4}`); label(940, 172, 'yes', 'lbl');

// ---- 3. Wave lanes
const lanes = [
  ['QA A · C-purchase', 'purchase flow', 'RUNNING'],
  ['QA B · C-catalog', 'catalog, search', 'TRIAGED'],
  ['QA C · C-accounts', 'accounts, B2B', 'CLAIMED'],
];
const L0 = 360, LH = 150;
add(`<text x="${W / 2}" y="${L0 - 8}" class="sec" text-anchor="middle">2 · WAVES — tiers in order (critical → high → rest); the domain waves of one tier run in parallel</text>`);
lanes.forEach(([who, scope, st], i) => {
  const y = L0 + i * (LH + 12);
  lane(y, LH, who, scope);
  add(`<rect x="30" y="${y + 56}" width="84" height="22" rx="11" class="pill"/><text x="72" y="${y + 71}" class="pt" text-anchor="middle">${st}</text>`);
  const cy = y + LH / 2 + 4;
  box(140, cy - 40, 150, 80, ['Claim', '/qa-run stable:17', '<wave> --claim', 'own personas'], 'cmd');
  box(310, cy - 40, 150, 80, ['Pre-flight', 'settings · yml · seed', 'users · one OK, I fix', 'known BLOCKs: not run']);
  box(480, cy - 40, 150, 80, ['Run', '--cases <tier>', 'machine lane first', 'no exclusive cases']);
  box(650, cy - 40, 170, 80, ['Triage — automatic', 'classifier on Sonnet', 'seeded with the ledger', 'a row for every finding']);
  diamond(905, cy, 42, ['Put it in', 'GitHub?']);
  box(990, cy - 40, 250, 80, ['Wave PR', 'state · ledger · report', '+ case repairs', 'never merged by Claude'], 'side');
  arrow(`M290,${cy} L306,${cy}`); arrow(`M460,${cy} L476,${cy}`); arrow(`M630,${cy} L646,${cy}`);
  arrow(`M820,${cy} L850,${cy}`); arrow(`M958,${cy} L986,${cy}`); label(972, cy - 8, 'yes');
});
// PRs merge back into main
const prX = 1160;
arrow(`M1245,${L0 + 75} C1272,${L0 + 30} 1272,${mY + mH + 30} 1240,${mY + mH + 2}`, 'arg');
add(`<text x="1262" y="${mY + mH + 22}" class="lblg" text-anchor="end">merge</text>`);

// ---- 4. Shared stores
const sY = L0 + 3 * (LH + 12) + 6;
add(`<text x="${W / 2}" y="${sY + 6}" class="sec" text-anchor="middle">WHERE EVERYTHING ELSE LANDS</text>`);
const stores = [
  ['Jira', ['wave sub-tasks = claims,', 'in progress = running', 'bugs linked to the release ticket']],
  ['kb (public)', ['observed behaviour:', 'by-design answers, env quirks', 'read before triage, written after']],
  ['Shared environment', ['own personas per owner', 'env-wide changes only in WX', 'seed once, before the waves']],
  ['Local only', ['HAR, traces, screenshots,', 'raw results stay in', 'reports/regression/<runId>/']],
];
stores.forEach(([t, ls], i) => {
  const x = 20 + i * 312, y = sY + 18;
  add(`<rect x="${x}" y="${y}" width="300" height="88" rx="12" class="store s${i}"/>`);
  text(x + 16, y + 26, [t, ...ls], { anchor: 'start', titleCls: 'st', cls: 'sd', lh: 17 });
});

// legend
add(`<g transform="translate(20 ${H - 20})"><polygon points="0,-8 10,0 0,8 -10,0" transform="translate(10 0)" class="gate"/><text x="28" y="5" class="lg">always-asked question — never skipped; triage itself starts on its own</text>
<rect x="520" y="-9" width="26" height="18" rx="5" class="cmd"/><text x="556" y="5" class="lg">a step the owner starts</text>
<rect x="760" y="-9" width="26" height="18" rx="5" class="side"/><text x="796" y="5" class="lg">outward-facing: needs the user's yes</text></g>`);

const html = `<title>Parallel Release Regression</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&family=JetBrains+Mono:wght@500;600&display=swap">
<style>
/* Layout: one swimlane diagram — plan, the repo as the shared spine, three parallel wave lanes, the stores underneath. */
:root {
  --bg: #FFFFFF; --ink: #050A40; --soft: #4A4F78; --lane: #F3F5FF; --line: #C7D3FA; --card: #FFFFFF;
  --accent: #3D5FD9; --accent-ink: #FFFFFF; --gate: #FFEDE0; --gate-line: #FF7E13; --gate-ink: #8A3B00;
  --main: #050A40; --main-ink: #FFFFFF; --main-soft: #B9C4F5; --chip: #12164F; --chip-line: #2B3AA8;
  --ok: #15803D; --side: #EAF8EF; --side-line: #8FD4A8;
  --mono: "JetBrains Mono", "Courier New", monospace; --sans: Inter, "Segoe UI", Arial, sans-serif;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #0B1030; --ink: #E8ECFF; --soft: #A9B1DA; --lane: #131A47; --line: #2E3A80; --card: #182055;
  --accent: #7B97FA; --accent-ink: #0B1030; --gate: #3A2412; --gate-line: #FF9A3B; --gate-ink: #FFC48A;
  --main: #1F2A72; --main-ink: #FFFFFF; --main-soft: #C3CCF7; --chip: #121A55; --chip-line: #4B5BC9;
  --ok: #5FD38A; --side: #12321F; --side-line: #2F7A4C; color-scheme: dark } }
:root[data-theme="dark"] {
  --bg: #0B1030; --ink: #E8ECFF; --soft: #A9B1DA; --lane: #131A47; --line: #2E3A80; --card: #182055;
  --accent: #7B97FA; --accent-ink: #0B1030; --gate: #3A2412; --gate-line: #FF9A3B; --gate-ink: #FFC48A;
  --main: #1F2A72; --main-ink: #FFFFFF; --main-soft: #C3CCF7; --chip: #121A55; --chip-line: #4B5BC9;
  --ok: #5FD38A; --side: #12321F; --side-line: #2F7A4C; color-scheme: dark }
body { background: var(--bg); color: var(--ink); font-family: var(--sans); margin: 0;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 28px 40px }
.wrap { max-width: 1320px; margin: 0 auto; display: flex; flex-direction: column; gap: 18px }
.eyebrow { font-size: 12px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--accent); margin: 0 }
h1 { font-size: clamp(26px, 3.4vw, 40px); font-weight: 400; letter-spacing: -.02em; margin: 6px 0 0; text-wrap: balance }
.lede { color: var(--soft); max-width: 75ch; margin: 8px 0 0; line-height: 1.5 }
.scroll { overflow-x: auto; border-radius: 18px }
svg { display: block; width: 100%; min-width: 1100px; height: auto }
svg text { font-family: var(--sans) }
.lane { fill: var(--lane) } .lt { font-size: 15px; font-weight: 700; fill: var(--ink); letter-spacing: .06em } .ls { font-size: 12.5px; fill: var(--soft) }
.box { fill: var(--card); stroke: var(--line); stroke-width: 1.2 } .cmd { fill: var(--accent); stroke: none } .side { fill: var(--side); stroke: var(--side-line); stroke-width: 1.2 }
.tt { font-size: 13.5px; font-weight: 700; fill: var(--ink) } .tc { font-size: 13.5px; font-weight: 700; fill: var(--accent-ink) }
.tw { font-size: 12px; fill: var(--accent-ink); opacity: .9 }
.t { font-size: 12px; fill: var(--soft) }
.gate { fill: var(--gate); stroke: var(--gate-line); stroke-width: 1.8; stroke-dasharray: 5 3 } .tg { font-size: 12.5px; font-weight: 700; fill: var(--gate-ink) } .tg2 { font-size: 12.5px; font-weight: 700; fill: var(--gate-ink) }
.ar { fill: none; stroke: var(--soft); stroke-width: 1.6 } .hd-a { fill: var(--soft) }
.ard { fill: none; stroke: var(--gate-line); stroke-width: 1.4; stroke-dasharray: 4 3 } .hd-d { fill: var(--gate-line) }
.arg { fill: none; stroke: var(--ok); stroke-width: 2.2 } .hd-g { fill: var(--ok) }
.lbl { font-size: 11.5px; font-weight: 700; fill: var(--soft) } .lbls { font-size: 11.5px; fill: var(--gate-ink) } .lblg { font-size: 12px; font-weight: 700; fill: var(--ok) }
.main { fill: var(--main) } .mt { font-family: var(--mono) !important; font-size: 17px; font-weight: 600; fill: var(--main-ink) } .ms { font-size: 12.5px; fill: var(--main-soft) }
.chip { fill: var(--chip); stroke: var(--chip-line) } .cf { font-family: var(--mono) !important; font-size: 11.5px; font-weight: 600; fill: var(--main-ink) } .cd { font-size: 11.5px; fill: var(--main-soft) } .co { font-size: 10.5px; fill: #FFC48A; font-weight: 600 }
.ci { fill: var(--ok) } .cit { font-size: 11px; font-weight: 700; fill: #FFFFFF }
.sec { font-size: 12px; font-weight: 700; letter-spacing: .14em; fill: var(--soft) }
.pill { fill: var(--card); stroke: var(--accent) } .pt { font-size: 10.5px; font-weight: 700; fill: var(--accent); letter-spacing: .04em }
.store { fill: var(--card); stroke: var(--line); stroke-width: 1.2 } .store.s0 { stroke: var(--accent); stroke-width: 2 } .store.s1 { stroke: var(--ok); stroke-width: 2 } .store.s2 { stroke: var(--gate-line); stroke-width: 2 }
.st { font-size: 14px; font-weight: 700; fill: var(--ink) } .sd { font-size: 12px; fill: var(--soft) }
.lg { font-size: 12px; fill: var(--soft) }
.foot { color: var(--soft); font-size: 13px } code { font-family: var(--mono); font-size: .9em }
</style>
<div class="wrap">
  <div>
    <p class="eyebrow">Stable bundle regression · VCST-6042 onward</p>
    <h1>One bundle, several QA, one environment</h1>
    <p class="lede">A release regression is split into waves. Each QA claims a wave and runs it in parallel with the others. The plan, the state of every wave and every triage verdict — filed or not — live in git, so anyone can continue where someone else stopped.</p>
  </div>
  <div class="scroll"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Swimlane diagram: a planner creates the release folder in main and one Jira sub-task per wave; three QA owners each claim a wave, read earlier verdicts, pre-flight it, run it, triage starts on its own, then they are asked to publish a wave PR that merges back into main; Jira, the kb, the shared environment and local run folders hold the rest.">${svg.join('\n')}</svg></div>
  <p class="foot">Commands: <code>/qa-test-plan</code> (sprint or <code>stable &lt;N&gt;</code>), <code>/qa-run</code> (any regression; <code>stable:&lt;N&gt; &lt;wave&gt;</code> for a wave) · scripts: <code>release:diff</code>, <code>release:status</code>, <code>release:check</code> · skill: <code>.claude/skills/qa-run/</code> · first instance: <code>regression/releases/stable-16/</code></p>
</div>
`;
if (HTML_OUT) { fs.writeFileSync(HTML_OUT, html); console.log('wrote', HTML_OUT); }

// Standalone SVG for the repo: the page's diagram rules, the same tokens, no web fonts (GitHub
// renders an SVG as an image, which loads nothing external), light and dark via the media query.
{
  const css = html.slice(html.indexOf('<style>') + 7, html.indexOf('</style>'))
    .replace(/body \{[^}]*\}\n?/, '').replace(/\.wrap \{[^}]*\}\n?/, '').replace(/\.eyebrow[^\n]*\n/, '').replace(/h1 \{[^}]*\}\n?/, '')
    .replace(/\.lede[^\n]*\n/, '').replace(/\.scroll[^\n]*\n/, '').replace(/svg \{[^}]*\}\n?/, '').replace(/\.foot[^\n]*\n/, '')
    .replace(/--sans: Inter, /, '--sans: "Segoe UI", Inter, -apple-system, ')
    .replace(/:root\b/g, 'svg');
  const standalone = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Parallel release regression: plan, release folder in main, three wave lanes, where everything else lands">
<style>${css}
svg { background: var(--bg) } text { font-family: var(--sans) }</style>
<rect width="100%" height="100%" style="fill: var(--bg)"/>
${svg.join('\n')}
</svg>
`;
  fs.writeFileSync(SVG_OUT, standalone);
  console.log('wrote', SVG_OUT);
}
