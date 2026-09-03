#!/usr/bin/env node
/**
 * summary:validate — validate `/qa-test`'s own artifact against the schema that already existed.
 *
 * `.claude/templates/qa-test-summary.schema.json` has been the declared contract for
 * `reports/tickets/**\/summary.json` and was cited by five files. Nothing ever validated against it,
 * so the artifacts drifted: the live files share only a handful of keys, field names exist in three
 * spellings (`ac_dod_estimate` / `ac_dod` / `ac_analysis`), and one file carries 40 top-level keys
 * against another's 27.
 *
 * The template is an EXAMPLE-shaped document, not JSON Schema — every value is a placeholder and every
 * block carries a `$comment` explaining itself. So this validates SHAPE against that example:
 *   - unknown top-level keys                     (drift: a new field nobody declared)
 *   - known-key aliases                          (the same field under a second spelling)
 *   - required keys absent                       (the six every run must carry)
 *   - a block present but of the wrong JSON type (an array where the contract says object)
 *
 * Ratcheted like CSV_LINT_BASELINE / XREF_BASELINE: a file already in BASELINE may not get WORSE,
 * a file not listed must be clean. Day-one drift does not block; new drift does.
 *
 *   node scripts/qa-test/validate-summary.mjs            # all runs
 *   node scripts/qa-test/validate-summary.mjs --json
 *   node scripts/qa-test/validate-summary.mjs --update-baseline
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SCHEMA = '.claude/templates/qa-test-summary.schema.json';
const TICKETS = 'reports/tickets';
const BASELINE_PATH = 'scripts/qa-test/.summary-baseline.json';

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const updateBaseline = argv.includes('--update-baseline');

/** Field names that mean the same thing — declared, so a run cannot invent a third spelling. */
const ALIASES = {
  ac_dod: 'ac_dod_estimate',
  ac_analysis: 'ac_analysis',
  verdictReason: 'verdict_reason',
  ticketType: 'ticket_type',
  type: 'ticket_type',
  testModel: 'test_model',
  rebased_into_artifact_c: 'rebased_into_c1',
};

/** Present in every run, on both paths. Absence is a defect, not a variation. */
const REQUIRED = ['ticket', 'path', 'verdict', 'date', 'environment', 'regression'];

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name === 'summary.json') out.push(full);
  }
  return out;
}

const jsonType = (v) =>
  v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;

function check(file, schemaKeys, schemaTypes) {
  const findings = [];
  let doc;
  try {
    doc = readJson(file);
  } catch (err) {
    return [{ code: 'SUM-000', key: '-', detail: 'unparsable JSON: ' + err.message }];
  }
  if (jsonType(doc) !== 'object') {
    return [{ code: 'SUM-000', key: '-', detail: 'top level is ' + jsonType(doc) + ', expected object' }];
  }

  const keys = Object.keys(doc);

  for (const k of REQUIRED) {
    if (!(k in doc)) findings.push({ code: 'SUM-001', key: k, detail: 'required key absent' });
  }

  for (const k of keys) {
    if (k.startsWith('$')) continue;
    if (k in ALIASES && ALIASES[k] !== k) {
      findings.push({
        code: 'SUM-002',
        key: k,
        detail: 'alias of `' + ALIASES[k] + '` — one field, one spelling',
      });
      continue;
    }
    if (!schemaKeys.has(k)) {
      findings.push({ code: 'SUM-003', key: k, detail: 'not declared in the schema' });
      continue;
    }
    const want = schemaTypes.get(k);
    const got = jsonType(doc[k]);
    // null is always legal: the contract uses it for "this axis never ran".
    if (got !== 'null' && want !== 'null' && got !== want) {
      findings.push({ code: 'SUM-004', key: k, detail: 'is ' + got + ', schema says ' + want });
    }
  }
  return findings;
}

const schema = readJson(SCHEMA);
const schemaKeys = new Set(Object.keys(schema).filter((k) => !k.startsWith('$')));
const schemaTypes = new Map(
  Object.entries(schema)
    .filter(([k]) => !k.startsWith('$'))
    .map(([k, v]) => [k, jsonType(v)])
);

const baseline = fs.existsSync(BASELINE_PATH) ? readJson(BASELINE_PATH) : {};
const files = walk(TICKETS).sort();
const report = {};
let regressions = 0;
let totalFindings = 0;

for (const f of files) {
  const rel = f.split(path.sep).join('/');
  const findings = check(f, schemaKeys, schemaTypes);
  totalFindings += findings.length;
  const allowed = baseline[rel] ?? 0;
  const over = findings.length > allowed;
  if (over) regressions++;
  report[rel] = { findings, allowed, regressed: over };
}

if (updateBaseline) {
  const next = {};
  for (const [rel, r] of Object.entries(report)) if (r.findings.length) next[rel] = r.findings.length;
  fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(next, null, 2) + '\n');
  console.log('baseline written: ' + Object.keys(next).length + ' file(s), ' + totalFindings + ' finding(s)');
  process.exit(0);
}

if (asJson) {
  console.log(JSON.stringify({ files: files.length, totalFindings, regressions, report }, null, 2));
  process.exit(regressions ? 1 : 0);
}

console.log('summary:validate — ' + files.length + ' file(s) against ' + SCHEMA + '\n');
for (const [rel, r] of Object.entries(report)) {
  if (!r.findings.length) {
    console.log('  OK    ' + rel);
    continue;
  }
  const tag = r.regressed ? 'FAIL  ' : 'base  ';
  console.log(
    tag + rel + '  (' + r.findings.length + ' finding' + (r.findings.length === 1 ? '' : 's') +
    ', baseline ' + r.allowed + ')'
  );
  for (const f of r.findings) console.log('          ' + f.code + '  ' + f.key + ' — ' + f.detail);
}

console.log(
  '\n' + totalFindings + ' finding(s) across ' + files.length + ' file(s); ' +
  regressions + ' file(s) worse than baseline.'
);
if (regressions) {
  console.log('A file may not get worse than its baseline. Fix the drift, or re-baseline deliberately');
  console.log('with --update-baseline once the finding is genuinely accepted.');
}
process.exit(regressions ? 1 : 0);
