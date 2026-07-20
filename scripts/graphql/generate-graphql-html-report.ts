/**
 * GraphQL Regression HTML Report Generator
 *
 * Reads suite-050*-results.json from a regression run directory and renders a
 * single self-contained HTML report (inline CSS/JS, no external assets) for
 * browser viewing.
 *
 * Usage:
 *   npx tsx scripts/generate-graphql-html-report.ts                          # latest run
 *   npx tsx scripts/generate-graphql-html-report.ts --run-id REG-20260515-1438
 *   npx tsx scripts/generate-graphql-html-report.ts --run-id <ID> --out report.html
 *   npx tsx scripts/generate-graphql-html-report.ts --run-id <ID> --open     # opens in default browser
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

interface TestCase {
  id: string;
  title: string;
  section: string;
  priority: string;
  status: "PASS" | "FAIL" | "BLOCKED" | "SKIPPED";
  notes: string;
  screenshot: string | null;
  consoleErrors: string[];
}

interface Bug {
  id: string;
  title: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  testCaseId: string;
  stepsToReproduce: string;
  expected: string;
  actual: string;
  consoleErrors: string[];
}

interface SuiteResult {
  suiteId: string;
  suiteName: string;
  runId: string;
  browser: string;
  environment: string;
  attempt: number;
  startedAt: string;
  completedAt: string;
  totalCases: number;
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  passRate: string;
  bugs: Bug[];
  testCases: TestCase[];
}

interface Args {
  runId?: string;
  out?: string;
  openInBrowser: boolean;
  reportsRoot: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { openInBrowser: false, reportsRoot: "reports/regression" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--run-id") args.runId = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--reports-root") args.reportsRoot = argv[++i];
    else if (a === "--open") args.openInBrowser = true;
    else if (a === "--help" || a === "-h") {
      console.log(
        [
          "Usage: npx tsx scripts/generate-graphql-html-report.ts [options]",
          "  --run-id <ID>        Specific run (default: latest REG-* directory)",
          "  --out <path>         Output file (default: <run>/graphql-report.html)",
          "  --reports-root <p>   Reports root (default: reports/regression)",
          "  --open               Open generated file in default browser",
        ].join("\n")
      );
      process.exit(0);
    }
  }
  return args;
}

function findLatestRun(root: string): string {
  if (!existsSync(root)) throw new Error(`Reports root not found: ${root}`);
  const runs = readdirSync(root)
    .filter((d) => d.startsWith("REG-"))
    .map((d) => ({ name: d, mtime: statSync(join(root, d)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (runs.length === 0) throw new Error(`No REG-* runs found in ${root}`);
  return runs[0].name;
}

function loadGraphqlSuites(runDir: string): SuiteResult[] {
  return readdirSync(runDir)
    .filter((f) => /^suite-050[a-z0-9]*-results\.json$/.test(f))
    .map((f) => JSON.parse(readFileSync(join(runDir, f), "utf-8")) as SuiteResult)
    .sort((a, b) => a.suiteId.localeCompare(b.suiteId));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDuration(startIso: string, endIso: string): string {
  const ms = Math.max(0, new Date(endIso).getTime() - new Date(startIso).getTime());
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}m ${rs}s`;
}

function statusBadge(status: TestCase["status"]): string {
  const cls = status.toLowerCase();
  return `<span class="badge badge-${cls}">${status}</span>`;
}

function severityBadge(sev: Bug["severity"]): string {
  return `<span class="badge sev-${sev.toLowerCase()}">${sev}</span>`;
}

function progressBar(passed: number, failed: number, skipped: number, blocked: number, total: number): string {
  if (total === 0) return `<div class="bar"><div class="bar-empty">no data</div></div>`;
  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;
  return `<div class="bar" title="${passed}P / ${failed}F / ${skipped}S / ${blocked}B">
      ${passed ? `<div class="bar-pass" style="width:${pct(passed)}"></div>` : ""}
      ${failed ? `<div class="bar-fail" style="width:${pct(failed)}"></div>` : ""}
      ${blocked ? `<div class="bar-blocked" style="width:${pct(blocked)}"></div>` : ""}
      ${skipped ? `<div class="bar-skip" style="width:${pct(skipped)}"></div>` : ""}
    </div>`;
}

function renderHtml(runId: string, suites: SuiteResult[]): string {
  // Aggregate totals
  const total = suites.reduce(
    (acc, s) => ({
      cases: acc.cases + s.totalCases,
      pass: acc.pass + s.passed,
      fail: acc.fail + s.failed,
      blocked: acc.blocked + s.blocked,
      skip: acc.skip + s.skipped,
      bugs: acc.bugs + s.bugs.length,
    }),
    { cases: 0, pass: 0, fail: 0, blocked: 0, skip: 0, bugs: 0 }
  );

  const executed = total.cases - total.skip - total.blocked;
  const overallRate = executed > 0 ? (total.pass / executed) * 100 : 0;
  const inclusiveRate = total.cases > 0 ? (total.pass / total.cases) * 100 : 0;
  const suitesPassed = suites.filter((s) => s.failed === 0 && s.totalCases > 0).length;
  const suitesFailed = suites.length - suitesPassed;
  const gateThreshold = 95;
  const gateVerdict = overallRate >= gateThreshold ? "PASSED" : "BLOCKED";
  const env = suites[0]?.environment ?? "unknown";
  const browser = [...new Set(suites.map((s) => s.browser).filter(Boolean))].join(", ");

  const earliest = suites.reduce((min, s) => (s.startedAt && (!min || s.startedAt < min) ? s.startedAt : min), "" as string);
  const latest = suites.reduce((max, s) => (s.completedAt && (!max || s.completedAt > max) ? s.completedAt : max), "" as string);
  const durationStr = earliest && latest ? formatDuration(earliest, latest) : "n/a";

  // All bugs flat list
  const allBugs = suites.flatMap((s) => s.bugs.map((b) => ({ ...b, suiteId: s.suiteId, suiteName: s.suiteName })));

  const suiteRows = suites
    .map((s) => {
      const rate = parseFloat(s.passRate);
      const rateClass = rate >= 90 ? "rate-good" : rate >= 70 ? "rate-warn" : "rate-bad";
      return `
        <tr class="suite-row" data-suite="${s.suiteId}" data-rate="${rate}">
          <td><button class="toggle" aria-label="Expand">▶</button></td>
          <td class="mono">${s.suiteId}</td>
          <td>${escapeHtml(s.suiteName)}</td>
          <td class="mono small">${escapeHtml(s.browser ?? "")}</td>
          <td class="num">${s.totalCases}</td>
          <td class="num pass">${s.passed}</td>
          <td class="num fail">${s.failed || ""}</td>
          <td class="num skip">${s.skipped || ""}</td>
          <td class="num blocked">${s.blocked || ""}</td>
          <td>${progressBar(s.passed, s.failed, s.skipped, s.blocked, s.totalCases)}</td>
          <td class="num ${rateClass}"><strong>${s.passRate}%</strong></td>
        </tr>
        <tr class="suite-detail hidden" data-detail-for="${s.suiteId}">
          <td colspan="11">
            <div class="detail-wrap">
              <table class="cases">
                <thead>
                  <tr><th>Test ID</th><th>Title</th><th>Status</th><th>Evidence</th></tr>
                </thead>
                <tbody>
                  ${s.testCases
                    .map(
                      (tc) => `<tr class="tc-row" data-status="${tc.status}">
                        <td class="mono">${escapeHtml(tc.id)}</td>
                        <td>${escapeHtml(tc.title)}</td>
                        <td>${statusBadge(tc.status)}</td>
                        <td class="mono small">${tc.notes ? `<a href="graphql-evidence/${escapeHtml(tc.notes)}" target="_blank">${escapeHtml(tc.notes)}</a>` : ""}</td>
                      </tr>`
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          </td>
        </tr>`;
    })
    .join("\n");

  const bugRows = allBugs
    .map(
      (b) => `<tr>
        <td class="mono">${escapeHtml(b.id)}</td>
        <td class="mono">${escapeHtml(b.suiteId)}</td>
        <td>${severityBadge(b.severity)}</td>
        <td class="mono">${escapeHtml(b.testCaseId)}</td>
        <td>${escapeHtml(b.title)}</td>
        <td class="small mono">${escapeHtml(b.expected)}</td>
      </tr>`
    )
    .join("\n");

  const gateColor = gateVerdict === "PASSED" ? "ok" : "bad";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>GraphQL Regression Report — ${escapeHtml(runId)}</title>
<style>
  :root {
    --bg: #0f1419;
    --surface: #1a2027;
    --surface-2: #232a33;
    --border: #2d3741;
    --text: #e8eef5;
    --text-dim: #8a96a5;
    --pass: #4ade80;
    --fail: #f87171;
    --skip: #fbbf24;
    --blocked: #c084fc;
    --info: #60a5fa;
    --accent: #38bdf8;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    font-size: 14px; line-height: 1.5; }
  .container { max-width: 1400px; margin: 0 auto; padding: 32px 24px; }
  header { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px;
    border-bottom: 1px solid var(--border); padding-bottom: 16px; margin-bottom: 24px; }
  h1 { margin: 0; font-size: 24px; font-weight: 600; letter-spacing: -0.02em; }
  h2 { font-size: 18px; margin: 32px 0 12px; font-weight: 600; }
  .subtitle { color: var(--text-dim); font-size: 13px; margin-top: 4px; }
  .gate { display: inline-flex; align-items: center; gap: 8px;
    padding: 6px 14px; border-radius: 6px; font-weight: 600; font-size: 13px;
    letter-spacing: 0.05em; text-transform: uppercase; }
  .gate.ok { background: rgba(74, 222, 128, 0.15); color: var(--pass); border: 1px solid rgba(74, 222, 128, 0.4); }
  .gate.bad { background: rgba(248, 113, 113, 0.15); color: var(--fail); border: 1px solid rgba(248, 113, 113, 0.4); }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 28px; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
  .card-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-dim); margin-bottom: 6px; }
  .card-value { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; }
  .card-sub { font-size: 11px; color: var(--text-dim); margin-top: 4px; }
  .card.pass .card-value { color: var(--pass); }
  .card.fail .card-value { color: var(--fail); }
  .card.skip .card-value { color: var(--skip); }
  .card.info .card-value { color: var(--info); }
  .meta { display: grid; grid-template-columns: auto 1fr; gap: 4px 16px; margin-bottom: 24px; font-size: 13px; }
  .meta dt { color: var(--text-dim); }
  .meta dd { margin: 0; font-family: ui-monospace, "SF Mono", Menlo, monospace; }
  table { width: 100%; border-collapse: collapse; background: var(--surface); border-radius: 8px; overflow: hidden; }
  th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--border); }
  th { background: var(--surface-2); font-weight: 600; font-size: 12px; text-transform: uppercase;
    letter-spacing: 0.05em; color: var(--text-dim); }
  tr:last-child td { border-bottom: none; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.pass { color: var(--pass); }
  td.fail { color: var(--fail); font-weight: 600; }
  td.skip { color: var(--skip); }
  td.blocked { color: var(--blocked); }
  td.mono, .mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 13px; }
  .small { font-size: 12px; }
  .rate-good { color: var(--pass); }
  .rate-warn { color: var(--skip); }
  .rate-bad { color: var(--fail); }
  .bar { display: flex; height: 8px; border-radius: 4px; overflow: hidden; background: var(--surface-2); min-width: 140px; }
  .bar > div { height: 100%; }
  .bar-pass { background: var(--pass); }
  .bar-fail { background: var(--fail); }
  .bar-skip { background: var(--skip); }
  .bar-blocked { background: var(--blocked); }
  .bar-empty { color: var(--text-dim); font-size: 11px; padding: 0 8px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px;
    font-weight: 600; letter-spacing: 0.03em; }
  .badge-pass { background: rgba(74, 222, 128, 0.15); color: var(--pass); }
  .badge-fail { background: rgba(248, 113, 113, 0.15); color: var(--fail); }
  .badge-skipped { background: rgba(251, 191, 36, 0.15); color: var(--skip); }
  .badge-blocked { background: rgba(192, 132, 252, 0.15); color: var(--blocked); }
  .sev-critical { background: rgba(220, 38, 38, 0.2); color: #fca5a5; }
  .sev-high { background: rgba(248, 113, 113, 0.15); color: var(--fail); }
  .sev-medium { background: rgba(251, 191, 36, 0.15); color: var(--skip); }
  .sev-low { background: rgba(96, 165, 250, 0.15); color: var(--info); }
  .toggle { background: transparent; border: none; color: var(--text-dim); cursor: pointer;
    font-size: 10px; padding: 0; width: 18px; transition: transform 0.15s; }
  .toggle.open { transform: rotate(90deg); color: var(--accent); }
  .suite-detail.hidden { display: none; }
  .detail-wrap { padding: 8px 24px 20px; background: var(--bg); }
  .cases { background: transparent; }
  .cases th { background: transparent; border-bottom: 1px solid var(--border); }
  .controls { display: flex; gap: 12px; margin-bottom: 16px; align-items: center; flex-wrap: wrap; }
  .controls input, .controls select { background: var(--surface); border: 1px solid var(--border);
    color: var(--text); padding: 8px 12px; border-radius: 6px; font-size: 13px; font-family: inherit; }
  .controls input { min-width: 240px; }
  .controls label { font-size: 12px; color: var(--text-dim); }
  .legend { display: flex; gap: 16px; font-size: 12px; color: var(--text-dim); }
  .legend-item { display: flex; align-items: center; gap: 6px; }
  .legend-dot { width: 10px; height: 10px; border-radius: 2px; }
  footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid var(--border);
    color: var(--text-dim); font-size: 12px; text-align: center; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .donut-wrap { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
  .donut { width: 140px; height: 140px; }
  @media (max-width: 800px) {
    table { font-size: 12px; }
    th, td { padding: 6px 8px; }
    .card-value { font-size: 22px; }
  }
</style>
</head>
<body>
<div class="container">
  <header>
    <div>
      <h1>GraphQL Regression Report</h1>
      <div class="subtitle">Run <span class="mono">${escapeHtml(runId)}</span> &middot; ${escapeHtml(env)} &middot; ${escapeHtml(browser || "n/a")}</div>
    </div>
    <div class="gate ${gateColor}">Quality Gate: ${gateVerdict}</div>
  </header>

  <div class="cards">
    <div class="card">
      <div class="card-label">Suites</div>
      <div class="card-value">${suites.length}</div>
      <div class="card-sub">${suitesPassed} clean &middot; ${suitesFailed} with failures</div>
    </div>
    <div class="card info">
      <div class="card-label">Test Cases</div>
      <div class="card-value">${total.cases}</div>
      <div class="card-sub">${executed} executed &middot; ${total.skip} skipped</div>
    </div>
    <div class="card pass">
      <div class="card-label">Passed</div>
      <div class="card-value">${total.pass}</div>
      <div class="card-sub">${overallRate.toFixed(1)}% of executed</div>
    </div>
    <div class="card fail">
      <div class="card-label">Failed</div>
      <div class="card-value">${total.fail}</div>
      <div class="card-sub">${total.bugs} bugs filed</div>
    </div>
    <div class="card skip">
      <div class="card-label">Skipped</div>
      <div class="card-value">${total.skip}</div>
      <div class="card-sub">Pre-requisites unmet</div>
    </div>
    <div class="card">
      <div class="card-label">Duration</div>
      <div class="card-value">${durationStr}</div>
      <div class="card-sub">Inclusive pass: ${inclusiveRate.toFixed(1)}%</div>
    </div>
  </div>

  <div class="donut-wrap">
    ${renderDonut(total.pass, total.fail, total.skip, total.blocked)}
    <div class="legend">
      <div class="legend-item"><span class="legend-dot" style="background: var(--pass)"></span>Pass (${total.pass})</div>
      <div class="legend-item"><span class="legend-dot" style="background: var(--fail)"></span>Fail (${total.fail})</div>
      <div class="legend-item"><span class="legend-dot" style="background: var(--skip)"></span>Skip (${total.skip})</div>
      ${total.blocked ? `<div class="legend-item"><span class="legend-dot" style="background: var(--blocked)"></span>Blocked (${total.blocked})</div>` : ""}
    </div>
  </div>

  <h2>Suite Results</h2>
  <div class="controls">
    <input type="text" id="filter" placeholder="Filter suites by name or ID..."/>
    <label><input type="checkbox" id="failed-only"/> Failed only</label>
    <span class="legend-item" style="margin-left:auto;color:var(--text-dim);font-size:12px;">Click ▶ to drill into test cases</span>
  </div>
  <table>
    <thead>
      <tr>
        <th></th>
        <th>Suite</th>
        <th>Name</th>
        <th>Browser</th>
        <th class="num">Total</th>
        <th class="num">Pass</th>
        <th class="num">Fail</th>
        <th class="num">Skip</th>
        <th class="num">Blocked</th>
        <th>Distribution</th>
        <th class="num">Rate</th>
      </tr>
    </thead>
    <tbody>
      ${suiteRows}
    </tbody>
  </table>

  ${
    allBugs.length > 0
      ? `<h2>Bugs (${allBugs.length})</h2>
  <table>
    <thead>
      <tr>
        <th>Bug ID</th>
        <th>Suite</th>
        <th>Severity</th>
        <th>Test Case</th>
        <th>Title</th>
        <th>Expected</th>
      </tr>
    </thead>
    <tbody>${bugRows}</tbody>
  </table>`
      : ""
  }

  <footer>
    Generated ${new Date().toISOString()} &middot;
    Source: <span class="mono">reports/regression/${escapeHtml(runId)}/</span>
  </footer>
</div>

<script>
  document.querySelectorAll('.toggle').forEach(btn => {
    btn.addEventListener('click', e => {
      const row = e.target.closest('tr');
      const suite = row.dataset.suite;
      const detail = document.querySelector('tr.suite-detail[data-detail-for="' + suite + '"]');
      detail.classList.toggle('hidden');
      btn.classList.toggle('open');
    });
  });

  const filterInput = document.getElementById('filter');
  const failedOnly = document.getElementById('failed-only');
  function applyFilters() {
    const q = filterInput.value.toLowerCase();
    const onlyFailed = failedOnly.checked;
    document.querySelectorAll('tr.suite-row').forEach(row => {
      const text = row.textContent.toLowerCase();
      const rate = parseFloat(row.dataset.rate);
      const matchQ = !q || text.includes(q);
      const matchFail = !onlyFailed || rate < 100;
      const show = matchQ && matchFail;
      row.style.display = show ? '' : 'none';
      const suite = row.dataset.suite;
      const detail = document.querySelector('tr.suite-detail[data-detail-for="' + suite + '"]');
      if (detail && !show) detail.style.display = 'none';
      else if (detail && !detail.classList.contains('hidden')) detail.style.display = '';
    });
  }
  filterInput.addEventListener('input', applyFilters);
  failedOnly.addEventListener('change', applyFilters);
</script>
</body>
</html>`;
}

function renderDonut(pass: number, fail: number, skip: number, blocked: number): string {
  const total = pass + fail + skip + blocked;
  if (total === 0) return "";
  const r = 60;
  const c = 2 * Math.PI * r;
  const segs = [
    { val: pass, color: "var(--pass)" },
    { val: fail, color: "var(--fail)" },
    { val: skip, color: "var(--skip)" },
    { val: blocked, color: "var(--blocked)" },
  ];
  let offset = 0;
  const circles = segs
    .filter((s) => s.val > 0)
    .map((s) => {
      const len = (s.val / total) * c;
      const el = `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${s.color}" stroke-width="18"
        stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 70 70)"/>`;
      offset += len;
      return el;
    })
    .join("");
  const pct = ((pass / total) * 100).toFixed(0);
  return `<svg class="donut" viewBox="0 0 140 140">
    <circle cx="70" cy="70" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="18"/>
    ${circles}
    <text x="70" y="68" text-anchor="middle" fill="var(--text)" font-size="22" font-weight="700">${pct}%</text>
    <text x="70" y="86" text-anchor="middle" fill="var(--text-dim)" font-size="10" text-transform="uppercase">Pass Rate</text>
  </svg>`;
}

function openInBrowser(path: string): void {
  const cmd = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", path] : [path];
  spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const reportsRoot = resolve(args.reportsRoot);
  const runId = args.runId ?? findLatestRun(reportsRoot);
  const runDir = join(reportsRoot, runId);
  if (!existsSync(runDir)) throw new Error(`Run directory not found: ${runDir}`);

  const suites = loadGraphqlSuites(runDir);
  if (suites.length === 0) {
    console.error(`No GraphQL suite results (suite-050*-results.json) found in ${runDir}`);
    process.exit(1);
  }

  const outPath = args.out ? resolve(args.out) : join(runDir, "graphql-report.html");
  const html = renderHtml(runId, suites);
  writeFileSync(outPath, html, "utf-8");

  const totals = suites.reduce(
    (a, s) => ({ c: a.c + s.totalCases, p: a.p + s.passed, f: a.f + s.failed, s: a.s + s.skipped }),
    { c: 0, p: 0, f: 0, s: 0 }
  );
  console.log(`GraphQL HTML report written: ${outPath}`);
  console.log(`  Suites: ${suites.length}  Cases: ${totals.c}  Pass: ${totals.p}  Fail: ${totals.f}  Skip: ${totals.s}`);

  if (args.openInBrowser) openInBrowser(outPath);
}

main();
