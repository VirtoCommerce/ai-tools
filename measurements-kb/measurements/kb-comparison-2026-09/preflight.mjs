#!/usr/bin/env node
/**
 * Pre-flight for an arm. EXERCISES the environment; does not read it and hope.
 *
 *   node preflight.mjs B      the QA repository arm
 *   node preflight.mjs A|C    the arena arms
 *
 * Written after two launches in a row died on configuration I had hand-written and never run:
 * a brief naming one identity where the task needs two, and an .mcp.json whose backslashes a
 * quoted heredoc had eaten. Both were visible in thirty seconds to anything that actually tried
 * the thing rather than reading it.
 *
 * Every check either PASSES on evidence or FAILS loudly. There is no "looks fine": a check that
 * cannot run reports SKIPPED and the whole run reports NOT READY, because an unrun check is not
 * a passed one — the same rule the extractor has lived under since step 1.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const arm = (process.argv[2] ?? '').toUpperCase();
if (!['A', 'B', 'C'].includes(arm)) {
  console.error('usage: preflight.mjs A|B|C');
  process.exit(2);
}

const ARENA = 'C:/_VIRTO/_arena';
const REPO = 'C:/_VIRTO/vc-mcp-testing-module';
const LAB = 'C:/_VIRTO/vc-kb-lab';
const BASE = 'C:/_VIRTO/vc-knowledge';
const KB = `${LAB}/bin/kb.mjs`;

const rows = [];
const ok = (name, detail) => rows.push({ state: 'PASS', name, detail });
const bad = (name, detail) => rows.push({ state: 'FAIL', name, detail });
const skip = (name, detail) => rows.push({ state: 'SKIP', name, detail });
const check = (name, fn) => {
  try { fn(ok.bind(null, name), bad.bind(null, name)); }
  catch (e) { bad(name, e.message); }
};

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

// ---- configuration parses, and every path it names exists ---------------------------------
const dir = arm === 'B' ? REPO : ARENA;

check('working directory exists', (pass, fail) =>
  existsSync(dir) ? pass(dir) : fail(`${dir} is not there`));

if (arm === 'B') {
  check('repository is on main with the tool absent', (pass, fail) => {
    const b = spawnSync('git', ['-C', REPO, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' });
    const branch = (b.stdout || '').trim();
    const ported = existsSync(`${REPO}/plugins/vc-kb`);
    if (branch !== 'main') return fail(`on ${branch}, not main`);
    if (ported) return fail('plugins/vc-kb is present — this arm would find the tool');
    pass('main, plugins/vc-kb absent');
  });
} else {
  check('.mcp.json parses', (pass, fail) => {
    const p = `${ARENA}/.mcp.json`;
    let cfg;
    try { cfg = readJson(p); } catch (e) { return fail(`${e.message} — the browser server will not load`); }
    const args = cfg.mcpServers?.['playwright-chrome']?.args ?? [];
    const missing = [];
    for (const flag of ['--secrets', '--output-dir']) {
      const v = args[args.indexOf(flag) + 1];
      if (!v) missing.push(`${flag} has no value`);
      else if (flag === '--secrets' && !existsSync(v)) missing.push(`${flag} -> ${v} does not exist`);
    }
    missing.length ? fail(missing.join('; ')) : pass('valid, and every path it names is there');
  });

  check('settings.json parses and carries the instrument', (pass, fail) => {
    const s = readJson(`${ARENA}/.claude/settings.json`);
    const hook = s.hooks?.PostToolUse?.[0]?.hooks?.[0]?.command ?? '';
    if (!hook.includes('tool-log.mjs')) return fail('no PostToolUse logging hook — the run would not be counted');
    const out = s.env?.VC_MEASURE_OUT;
    if (!out) return fail('VC_MEASURE_OUT unset — the log has nowhere to go');
    const wantBase = arm === 'C';
    const hasBase = Boolean(s.env?.KB_BASE);
    if (wantBase !== hasBase) return fail(`arm ${arm} ${wantBase ? 'needs' : 'must not have'} KB_BASE, and ${hasBase ? 'has' : 'has not'} got it`);
    if (!s.permissions?.deny?.some((d) => d.includes('browser_evaluate')))
      return fail('browser_evaluate is not denied — arm B could not script the page and this one could');
    pass(`log -> ${out}${hasBase ? `, KB_BASE -> ${s.env.KB_BASE}` : ', no KB_BASE'}`);
  });

  // THE TWO ARENA FILES MUST DIFFER BY KB_BASE AND THE LOG PATH, AND BY NOTHING ELSE. The arm C
  // file was missing the browser_network_request deny for both rounds, so arm C had a tool arms A
  // and B did not -- and it is the tool that returned a sign-in POST body in plaintext in run 02.
  // A comment inside the file asserted the two were identical but for KB_BASE. A sentence is not a
  // check; this is. Round one's validity page made the same assertion and invited anybody to run
  // the diff, and nobody ran it for five weeks.
  check('the two arena settings differ by KB_BASE and the log path only', (pass, fail) => {
    const dir = `${LAB}/measurements/kb-comparison-2026-09/arena-settings`;
    const a = readJson(`${dir}/settings.arm-a.json`);
    const c = readJson(`${dir}/settings.arm-c.json`);
    const sorted = (x) => JSON.stringify([...(x ?? [])].sort());
    const diffs = [];
    if (sorted(a.permissions?.deny) !== sorted(c.permissions?.deny)) diffs.push('deny lists differ');
    if (sorted(a.permissions?.allow) !== sorted(c.permissions?.allow)) diffs.push('allow lists differ');
    if (sorted(a.enabledMcpjsonServers) !== sorted(c.enabledMcpjsonServers)) diffs.push('MCP server lists differ');
    const keys = new Set([...Object.keys(a.env ?? {}), ...Object.keys(c.env ?? {})]);
    for (const k of keys) {
      if (k === 'KB_BASE' || k === 'VC_MEASURE_OUT') continue;
      if (a.env?.[k] !== c.env?.[k]) diffs.push(`env ${k} differs`);
    }
    if (!c.env?.KB_BASE) diffs.push('arm C file has no KB_BASE');
    if (a.env?.KB_BASE) diffs.push('arm A file has a KB_BASE');
    const hook = (x) => x.hooks?.PostToolUse?.[0]?.hooks?.[0]?.command;
    if (hook(a) !== hook(c)) diffs.push('the logging hook differs -- two arms counted by two builds');
    diffs.length ? fail(diffs.join('; ')) : pass('KB_BASE and VC_MEASURE_OUT, and nothing else');
  });

  check('no project context leaked into the arena', (pass, fail) => {
    const bad = ['CLAUDE.md', '.git', '.claude/skills', '.claude/knowledge', '.claude/rules']
      .filter((f) => existsSync(`${ARENA}/${f}`));
    bad.length ? fail(`present: ${bad.join(', ')}`) : pass('no CLAUDE.md, no skills, no rules, not a git repo');
  });

}

// A WORKING DIRECTORY IS READABLE, and an earlier arm's material holds every answer this one is
// supposed to establish. Written for the arena after arm B's report turned up inside arm C's
// working directory; extended to the repository after arm B's 108 browser artifacts turned out to
// name its order number and its exact figures in 18 files.
//
// THE FIRST VERSION KEYED ON FILENAMES and flagged 41 of the repository's own BA reports, because
// "report" is this repository's vocabulary. A guard shaped like the last failure catches the wrong
// things -- so the repository is checked on CONTENT (does the file carry an order number from this
// comparison?) and the arena, which has no legitimate content of its own, on both.
// The orders THIS comparison has placed, and nothing else. The first content version matched any
// September order and flagged nine of the repository's own bug reports, which carry order numbers
// from ordinary QA work -- CO260902-00011, CO260909-00001 and so on. Two wrong guards in a row on
// the same check, both because it was easier to describe the shape than to name the thing. Append
// an arm's order here when it places one.
const ARM_ORDERS = ['CO260915-00001', 'CO260915-00002', 'CO260915-00003', 'CO260915-00004'];
// ROUND THREE identifiers. The orders above are named IN the round-three task, so they stopped being
// a leak signal; what leaks now is the answer, and the answer is a member's account state. These
// two members are the ones the roster lies about, so an earlier arm's material naming either of
// them alongside a lock word is the leak this check exists to catch.
const ARM_MEMBERS = ['imp-target-blocked-20260514', 'imp-target-invited-20260514'];
const ORDER_RE = new RegExp([...ARM_ORDERS, ...ARM_MEMBERS].join('|'));
const ARM_NAME_RE = /report|tool-log|kb-log|oracle|condition|predict|arm-[ABC]|order-verification|ground-truth|acct-|members-roster/i;

// THE WALK STOPPED AT DEPTH 4, and the QA repository drops browser artefacts at depth 5:
// reports/bugs/screenshots/_incoming/chrome. So the one directory an arm actually writes into was
// the one directory this check could not see, and it reported PASS on an unexamined folder. Found
// by a background grep run for a different reason, not by this file -- an unrun check is not a
// passed one, and a check that cannot reach the place is an unrun check.
//
// Depth is 8 now, and the skip list is explicit rather than a shape: `artifacts` alone was never
// what the repository calls it. `.fix-workspace` and the build outputs are skipped because they
// are vendored source, not arm material -- they carry field names like discountAmountWithTax
// legitimately, and that is the repository's own content, which is arm B's treatment.
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'artifacts', 'test-results', 'results',
  '.fix-workspace', '.local-env', '.nuke', 'dist', 'bin', 'obj',
  // test-data is the REPOSITORY'S OWN seed data, not an earlier arm's material. For round three it
  // names both members the task turns on, with their account states -- which is arm B's TREATMENT,
  // exactly like the GraphQL schemas were in round two. Removing it to protect the comparison would
  // be curating one arm's context to flatter another, so it stays and CONDITIONS-MEMBERS.md records
  // what it holds and where it is stale. The check surfaced it, which is the check working.
  'test-data',
]);

check('no earlier arm material is readable from the working directory', (pass, fail) => {
  const root = arm === 'B' ? REPO : ARENA;
  const byName = arm !== 'B';
  const hits = [];
  const walk = (d, depth = 0) => {
    if (depth > 8 || !existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (SKIP_DIRS.has(e.name)) continue;
      const full = `${d}/${e.name}`;
      if (e.isDirectory()) { walk(full, depth + 1); continue; }
      if (byName && ARM_NAME_RE.test(e.name)) { hits.push(full); continue; }
      if (!/\.(yml|log|png|json|md|txt|csv)$/i.test(e.name)) continue;
      try { if (ORDER_RE.test(readFileSync(full, 'utf8').slice(0, 200000))) hits.push(full); }
      catch { /* binary or unreadable: not a leak this check can see, and it says so */ }
    }
  };
  walk(root);
  const uniq = [...new Set(hits)];
  uniq.length
    ? fail(`${uniq.length} file(s) carry an earlier arm's order or name its material: ${uniq.slice(0, 3).map((f) => f.replace(root + '/', '')).join(', ')}`)
    : pass(`nothing from an earlier arm is reachable${byName ? '' : ' (checked by order number; this repository has reports of its own)'}`);
});

// AN ARM FOLDER MUST ONLY EVER BE WRITTEN BY ITS ARM. The QA repository's settings.local.json was
// left pointing VC_MEASURE_OUT at _comparison-logs/round3/arm-B after round three, and the next
// session to open that repository -- the independent reviewer -- logged its own 30 calls into arm B's
// folder. Nobody noticed until the reviewer found their own log there and reported it. The restore
// step existed in RUNNING.md and was not run; the backup it names was itself taken from an already
// instrumented file, so restoring it would not have helped either.
check('no OTHER working directory is logging into an arm folder', (pass, fail) => {
  const p = `${REPO}/.claude/settings.local.json`;
  if (!existsSync(p)) return pass('the repository carries no local settings');
  let out;
  try { out = readJson(p).env?.VC_MEASURE_OUT; } catch (e) { return fail(`unreadable: ${e.message}`); }
  if (!out) return pass('VC_MEASURE_OUT unset');
  const isThisArm = arm === 'B' && /[\/]arm-B$/.test(out);
  if (isThisArm) return pass(`arm B, logging to its own folder: ${out}`);
  if (/[\/]arm-[ABC]2?$/.test(out))
    return fail(`the repository logs into ${out}, which is an arm folder and not this arm's. Any session opened there contaminates a recorded run.`);
  pass(`logs to ${out}, which is not an arm folder`);
});

// ---- the instrument actually writes ---------------------------------------------------------
check('the logging hook runs and is fail-open', (pass, fail) => {
  const r = spawnSync(process.execPath, [`${LAB}/vendor/agent-log/tool-log.mjs`], {
    input: '{}', encoding: 'utf8', timeout: 15000,
  });
  if (r.status !== 0) return fail(`exited ${r.status} on an empty payload — a hook that can fail blocks the work it measures`);
  pass('exit 0 on an empty payload');
});

// ---- the secrets the brief names ------------------------------------------------------------
check('the browser can substitute every secret the brief names', (pass, fail) => {
  const p = `${REPO}/.env.playwright.local`;
  if (!existsSync(p)) return fail(`${p} is missing`);
  const names = new Set([...readFileSync(p, 'utf8').matchAll(/^([A-Z_0-9]+)=/gm)].map((m) => m[1]));
  const need = ['ADMIN', 'ADMIN_PASSWORD', 'IMPERSONATION_ADMIN_PASSWORD'];
  const missing = need.filter((n) => !names.has(n));
  missing.length ? fail(`not in the secrets file: ${missing.join(', ')}`) : pass(need.join(', '));
});

// ---- the deployment answers -----------------------------------------------------------------
const reach = async (url) => {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 15000);
    const r = await fetch(url, { signal: ac.signal, redirect: 'manual' });
    clearTimeout(t);
    return r.status;
  } catch (e) { return `unreachable (${e.name})`; }
};

const storefront = await reach('https://vcptcore-stable-storefront.govirto.com/');
const admin = await reach('https://vcptcore-stable.govirto.com/');
(typeof storefront === 'number' ? ok : bad)('storefront answers', `HTTP ${storefront}`);
(typeof admin === 'number' ? ok : bad)('platform answers', `HTTP ${admin}`);

// ---- the base, for arm C --------------------------------------------------------------------
if (arm === 'C') {
  check('the base is where KB_BASE says, and is clean', (pass, fail) => {
    if (!existsSync(`${BASE}/kb.json`)) return fail(`${BASE} carries no kb.json — it is not a base`);
    const st = spawnSync('git', ['-C', BASE, 'status', '--porcelain'], { encoding: 'utf8' });
    const dirty = (st.stdout || '').trim().split('\n').filter(Boolean);
    const counts = `${readdirSync(`${BASE}/captured`).filter((f) => f.endsWith('.md')).length} captured, ` +
      `${readdirSync(`${BASE}/flows`).filter((f) => f.endsWith('.md')).length} flows`;
    dirty.length
      ? fail(`${dirty.length} modified file(s) — snapshot the base before the arm, or its writes cannot be told apart: ${dirty.join(' ')}`)
      : pass(`${counts}, working tree clean`);
  });

  check('kb answers from the arena, against a COPY', (pass, fail) => {
    const copy = 'C:/_VIRTO/_arena/.preflight-base';
    spawnSync('cmd', ['/c', 'rmdir', '/s', '/q', copy.replace(/\//g, '\\')], { encoding: 'utf8' });
    const cp = spawnSync('cmd', ['/c', 'xcopy', BASE.replace(/\//g, '\\'), copy.replace(/\//g, '\\'), '/E', '/I', '/Q', '/Y'], { encoding: 'utf8', timeout: 120000 });
    if (cp.status !== 0) return fail('could not copy the base to probe it without writing to the live one');
    const r = spawnSync(process.execPath, [KB, 'how', 'place an order on the storefront', '--base', copy], {
      cwd: ARENA, encoding: 'utf8', timeout: 60000,
    });
    spawnSync('cmd', ['/c', 'rmdir', '/s', '/q', copy.replace(/\//g, '\\')], { encoding: 'utf8' });
    const out = (r.stdout || '') + (r.stderr || '');
    if (!/^KB-[0-9A-F]+/m.test(out)) return fail(`kb returned no entry:\n${out.slice(0, 300)}`);
    pass(`served ${out.match(/^KB-[0-9A-F]+/m)[0]} — probed against a copy, the live base untouched`);
  });
}

// ---- report ----------------------------------------------------------------------------------
const w = Math.max(...rows.map((r) => r.name.length));
console.log(`\nPRE-FLIGHT — arm ${arm}\n`);
for (const r of rows) console.log(`  ${r.state}  ${r.name.padEnd(w)}  ${r.detail}`);
const failed = rows.filter((r) => r.state !== 'PASS');
console.log(failed.length
  ? `\nNOT READY — ${failed.length} check(s) did not pass. An unrun check is not a passed one.\n`
  : `\nREADY — ${rows.length} checks, all exercised rather than read.\n`);
process.exit(failed.length ? 1 : 0);
