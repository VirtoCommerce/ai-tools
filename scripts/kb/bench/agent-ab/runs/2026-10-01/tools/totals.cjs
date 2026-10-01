// Totals over the demo set for the "What the base buys" slide. One source of rows per task and arm:
// T1 = rule-v2 kb runs (05-T1-short-question) against the nokb runs of 03-T1-long-question (the rule does not touch nokb);
// T7 kb.3 excluded by the operator's decision (search miss + background wait, no answer).
const fs = require('fs'); const path = require('path');
const src = [['T1', '03-T1-long-question', 'nokb'], ['T1', '05-T1-short-question', 'kb'], ['T4', '06-T4'], ['T6', '07-T6'], ['T7', '08-T7'], ['T8', '09-T8']];
const EXCLUDE = new Set(['T7-lockout.kb.3.json']);
const rows = [];
for (const [task, dir, onlyArm] of src) for (const f of fs.readdirSync(path.join(__dirname, '..', dir)).filter((x) => /\.(kb|nokb)\.\d+\.json$/.test(x))) {
  if (EXCLUDE.has(f)) continue;
  const r = JSON.parse(fs.readFileSync(path.join(__dirname, '..', dir, f), 'utf8'));
  if (onlyArm && r.arm !== onlyArm) continue;
  rows.push({ task, arm: r.arm, score: r.grade.score, falseClaim: !!r.grade.falseClaim, evidence: r.grade.evidence ?? 0, cost: r.costUsd, writes: r.envWrites, steps: r.toolCalls, sec: r.durationSec });
}
for (const arm of ['nokb', 'kb']) {
  const rs = rows.filter((r) => r.arm === arm);
  const tasks = [...new Set(rs.map((r) => r.task))];
  const allRight = tasks.filter((t) => rs.filter((r) => r.task === t).every((r) => r.score === 2)).length;
  const cost = rs.reduce((s, r) => s + r.cost, 0); const right = rs.reduce((s, r) => s + r.score, 0) / 2;
  const spreads = tasks.map((t) => { const c = rs.filter((r) => r.task === t).map((r) => r.cost); return Math.max(...c) - Math.min(...c); });
  console.log(arm, JSON.stringify({
    runs: rs.length, tasksRightEveryRun: `${allRight}/${tasks.length}`, wrongClaims: rs.filter((r) => r.falseClaim).length,
    evidence: +(rs.reduce((s, r) => s + r.evidence, 0) / (2 * rs.length)).toFixed(2),
    costPerRight: +(cost / right).toFixed(2), avgCostSpread: +(spreads.reduce((a, b) => a + b, 0) / spreads.length).toFixed(2),
    writes: rs.reduce((s, r) => s + r.writes, 0), totalCost: +cost.toFixed(2), totalMin: +(rs.reduce((s, r) => s + r.sec, 0) / 60).toFixed(0),
    totalSteps: rs.reduce((s, r) => s + r.steps, 0) }));
}
