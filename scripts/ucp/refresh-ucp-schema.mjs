#!/usr/bin/env node
/**
 * Refresh / check / probe the UCP contract surface.
 *
 * WHY THIS EXISTS. `schema:check` introspects `/graphql` and covers xAPI. **Nothing covered
 * `/ucp/mcp`.** So the 18 MCP tools, their input schemas, and the 19 operations discovery declares
 * had no contract test at all: a tool could lose an argument, rename a response field or change a
 * type and no gate would notice. Measured 2026-09-22 (VCST-5378) — an authored suite carried
 * `shipping_address:{street:…}` for days, and `street` is not in the tool's schema at all
 * (it declares `line1`). A snapshot would have caught that the moment it was written.
 *
 * Same shape as refresh-graphql-schema.mjs on purpose: derive from the live surface, render a
 * deterministic snapshot, and diff. Per .claude/rules/test-data.md GOLDEN RULE the contract is read
 * from its source of truth, never transcribed into a test case.
 *
 *   npm run ucp:schema:refresh          # write the snapshot
 *   npm run ucp:schema:check            # diff against it; non-zero on drift
 *   npm run ucp:schema:probe            # additionally CALL every declared endpoint + tool
 *   … -- --json                         # machine-readable
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import '../../config.js';

const ROOT = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const OUT = resolve(ROOT, '.claude/knowledge/api/ucp-schema.md');
const argv = process.argv.slice(2);
const MODE = argv.includes('--check') ? 'check' : argv.includes('--probe') ? 'probe' : 'refresh';
const AS_JSON = argv.includes('--json');

const FRONT = (process.env.FRONT_URL ?? '').replace(/\/+$/, '');
const BACK = (process.env.BACK_URL ?? '').replace(/\/+$/, '');
if (!FRONT) { console.error('FRONT_URL is not set'); process.exit(2); }

const MCP = FRONT + '/ucp/mcp';

async function rpc(method, params = {}, token) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(MCP, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const text = await r.text();
  const m = text.match(/data: (.*)/); // the endpoint may answer as SSE
  let j; try { j = JSON.parse(m ? m[1] : text); } catch { return { _raw: text.slice(0, 200), _status: r.status }; }
  return j;
}

const toolResult = (j) => {
  try { return JSON.parse(j.result.content[0].text); } catch { return j?.result ?? j; }
};

/** Render one JSON-schema property line, recursing into objects and array items. */
function renderProps(schema, indent = '') {
  const out = [];
  const req = new Set(schema?.required ?? []);
  for (const [k, v] of Object.entries(schema?.properties ?? {})) {
    const type = Array.isArray(v.type) ? v.type.join('|') : (v.type ?? (v.oneOf ? 'oneOf' : '?'));
    out.push(`${indent}${req.has(k) ? '*' : ' '} ${k}: ${type}${v.enum ? ` enum[${v.enum.join('|')}]` : ''}`);
    if (v.type === 'object' && v.properties) out.push(...renderProps(v, indent + '    '));
    if (v.type === 'array' && v.items?.properties) {
      out.push(`${indent}    [item]`);
      out.push(...renderProps(v.items, indent + '      '));
    }
  }
  return out;
}

async function collect() {
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'ucp-schema', version: '1' } });
  const tools = (await rpc('tools/list')).result?.tools ?? [];
  const caps = toolResult(await rpc('tools/call', { name: 'get_store_capabilities', arguments: {} }));

  const manifests = {};
  for (const [label, host] of [['front', FRONT], ['back', BACK]]) {
    if (!host) continue;
    try {
      const j = await (await fetch(host + '/.well-known/ucp')).json();
      manifests[label] = j?.ucp?.services?.['com.virtocommerce.ucp']?.[0]?.endpoint ?? null;
    } catch { manifests[label] = 'UNREACHABLE'; }
  }

  return { init: init.result ?? {}, tools, caps, manifests };
}

function render({ init, tools, caps, manifests }) {
  const L = [];
  L.push('# UCP contract surface — GENERATED, do not edit by hand');
  L.push('');
  L.push('> Written by `npm run ucp:schema:refresh`; `ucp:schema:check` fails on drift, `ucp:schema:probe`');
  L.push('> additionally CALLS every declared endpoint and tool. This file is the SOURCE OF TRUTH for the');
  L.push('> UCP tool and endpoint contract — a test case cites it and never transcribes it');
  L.push('> (`.claude/rules/test-data.md` GOLDEN RULE).');
  L.push('');
  L.push('## Server');
  L.push('');
  L.push(`- protocol: \`${init.protocolVersion ?? '?'}\``);
  L.push(`- serverInfo: \`${init.serverInfo?.name ?? '?'}\` v\`${init.serverInfo?.version ?? '?'}\``);
  L.push(`- capabilities: ${Object.keys(init.capabilities ?? {}).sort().map((c) => `\`${c}\``).join(', ') || '(none)'}`);
  L.push('');
  L.push('### Tool-count agreement across the three surfaces that publish one');
  L.push('');
  const listed = tools.map((t) => t.name).sort();
  const advertised = (caps.mcp_tools ?? []).map((t) => (typeof t === 'string' ? t : t.name ?? t.tool)).sort();
  const prose = (init.instructions ?? '').match(/Available tools:([^.]*)\./)?.[1] ?? '';
  const proseNames = prose.split(/,|\band\b/).map((s) => s.trim()).filter((s) => /^[a-z_]+$/.test(s)).sort();
  L.push('| surface | count |');
  L.push('|---|---|');
  L.push(`| \`tools/list\` | ${listed.length} |`);
  L.push(`| \`get_store_capabilities.mcp_tools\` | ${advertised.length} |`);
  L.push(`| \`initialize.instructions\` prose | ${proseNames.length} |`);
  L.push('');
  const missAdv = listed.filter((x) => !advertised.includes(x));
  const missProse = listed.filter((x) => !proseNames.includes(x));
  L.push(`- in \`tools/list\` but NOT advertised: ${missAdv.length ? missAdv.map((x) => `\`${x}\``).join(', ') : '(none)'}`);
  L.push(`- in \`tools/list\` but NOT in the prose list: ${missProse.length ? missProse.map((x) => `\`${x}\``).join(', ') : '(none)'}`);
  L.push('');
  L.push('### Discovery manifest endpoint, per host');
  L.push('');
  for (const [k, v] of Object.entries(manifests)) L.push(`- \`${k}\`: ${v ?? '(absent)'}`);
  L.push('');
  L.push('## Tools');
  L.push('');
  for (const t of [...tools].sort((a, b) => a.name.localeCompare(b.name))) {
    const s = t.inputSchema ?? {};
    const req = (s.required ?? []).slice().sort();
    L.push(`### \`${t.name}\``);
    L.push('');
    L.push(`required: ${req.length ? req.map((r) => `\`${r}\``).join(', ') : '(none)'}`);
    L.push('');
    const props = renderProps(s);
    L.push('```');
    L.push(props.length ? props.join('\n') : '(no arguments)');
    L.push('```');
    L.push('');
  }
  L.push('## Declared operations (`get_store_capabilities.endpoints.operations`)');
  L.push('');
  L.push('| method | path | name | capability | status |');
  L.push('|---|---|---|---|---|');
  for (const o of (caps.endpoints?.operations ?? []).slice().sort((a, b) => (a.path + a.name).localeCompare(b.path + b.name))) {
    L.push(`| \`${o.method}\` | \`${o.path}\` | \`${o.name}\` | ${o.capability ?? '—'} | ${o.status ?? '—'} |`);
  }
  L.push('');
  L.push('## Error codes');
  L.push('');
  L.push((caps.errors?.codes ?? []).map((c) => `\`${c}\``).join(' · ') || '(none declared)');
  L.push('');
  L.push('## Advertised headers');
  L.push('');
  for (const [k, v] of Object.entries(caps.headers ?? {})) L.push(`- \`${k}\`: ${JSON.stringify(v)}`);
  L.push('');
  return L.join('\n') + '\n';
}

/**
 * Call every DECLARED REST operation and record how it answers.
 *
 * Discovery claims `status: "available"` for each. That claim was never checked — an operation can be
 * advertised and 404, or be a real handler discovery never mentions (domain map D7). This turns the
 * claim into an assertion. A 4xx is a PASS for liveness: it means the route exists and validated the
 * request. Only 404/405 (route absent / wrong verb) and 5xx are failures.
 */
async function probeEndpoints(caps, token) {
  const ops = (caps.endpoints?.operations ?? []).filter((o) => o.method !== 'MCP');
  const rows = [];
  for (const o of ops) {
    // Substitute a syntactically valid placeholder for every path parameter; we are testing that the
    // ROUTE resolves, not that the id exists.
    const path = o.path.replace(/\{[^}]+\}/g, '00000000-0000-0000-0000-000000000000');
    const url = path.startsWith('http') ? path : FRONT + path;
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    let status = 0, body = '';
    try {
      const r = await fetch(url, { method: o.method === 'GET' ? 'GET' : o.method, headers, ...(o.method === 'GET' ? {} : { body: '{}' , headers: { ...headers, 'Content-Type': 'application/json' } }) });
      status = r.status;
      body = (await r.text()).replace(/\s+/g, ' ').slice(0, 120);
    } catch (e) { body = 'NETWORK: ' + e.message; }
    // A 404 alone does NOT mean the route is absent. Measured 2026-09-22: substituting a GUID for
    // {countryId} gave 404 `{"code":"invalid_request","message":"Country 'X' was not found."}` —
    // a LIVE route correctly rejecting a bad id (this API keys countries by ISO-3, e.g. USA, not a
    // GUID). Reporting that as a dead route was a false positive on the probe's part, not a defect.
    // The discriminator is the BODY: a structured UCP error means the handler ran.
    const structuredReject = /"code"\s*:\s*"[a-z_]+"/.test(body);
    const routeMissing = status === 405 || (status === 404 && !structuredReject);
    rows.push({
      method: o.method, path: o.path, name: o.name, declared: o.status ?? '—',
      status, routeMissing, serverError: status >= 500, sample: body,
    });
  }
  return rows;
}

/** Call every tool with NO arguments and record how it answers — a liveness + error-contract sweep. */
async function probe(tools, caps) {
  const rows = [];
  for (const t of [...tools].sort((a, b) => a.name.localeCompare(b.name))) {
    const j = await rpc('tools/call', { name: t.name, arguments: {} });
    const body = toolResult(j);
    const txt = typeof body === 'string' ? body : JSON.stringify(body);
    let code = '—';
    try { code = JSON.parse(typeof body === 'string' ? body : JSON.stringify(body)).code ?? '—'; } catch { /* not JSON */ }
    const structured = /"code"\s*:\s*"[a-z_]+"/.test(txt);
    const leaks = /Error trying to resolve field|StackTrace|at VirtoCommerce\./i.test(txt);
    rows.push({
      tool: t.name,
      required: (t.inputSchema?.required ?? []).length,
      answered: !!j.result || !!j.error,
      structuredError: structured,
      leaksInternals: leaks,
      sample: txt.replace(/\s+/g, ' ').slice(0, 110),
    });
  }
  return rows;
}

// ---------- main ----------
const data = await collect();
const rendered = render(data);

if (MODE === 'probe') {
  const rows = await probe(data.tools, data.caps);
  const eps = await probeEndpoints(data.caps);
  const leaky = rows.filter((r) => r.leaksInternals);
  const unstructured = rows.filter((r) => r.required > 0 && !r.structuredError && !r.leaksInternals);
  // A tool that rejects a field its own schema does not declare `required` is under-declaring:
  // an LLM client reading the schema cannot know the call will fail.
  const underDeclared = rows.filter((r) => r.required === 0 && /is required|are required/.test(r.sample));
  const deadRoutes = eps.filter((e) => e.routeMissing);
  const brokenRoutes = eps.filter((e) => e.serverError);

  if (AS_JSON) {
    console.log(JSON.stringify({ tools: rows, endpoints: eps, leaky, unstructured, underDeclared, deadRoutes, brokenRoutes }, null, 2));
  } else {
    console.log(`[ucp:schema:probe] ${rows.length} tools called with no arguments\n`);
    for (const r of rows) {
      const flag = r.leaksInternals ? 'LEAKS' : r.structuredError ? 'ok   ' : r.required ? '?????' : 'n/a  ';
      console.log(`  ${flag}  ${r.tool.padEnd(24)} req=${r.required}  ${r.sample.slice(0, 80)}`);
    }
    console.log(`\n  structured error contract: ${rows.length - leaky.length - unstructured.length}/${rows.length}`);
    if (leaky.length) console.log(`  LEAKS INTERNALS: ${leaky.map((r) => r.tool).join(', ')}`);
    if (underDeclared.length) {
      console.log(`  UNDER-DECLARED SCHEMA (required:[] but rejects a missing field): ${underDeclared.map((r) => r.tool).join(', ')}`);
    }

    console.log(`\n[ucp:schema:probe] ${eps.length} declared REST operations called\n`);
    for (const e of eps) {
      const flag = e.routeMissing ? 'DEAD ' : e.serverError ? '5xx  ' : 'live ';
      console.log(`  ${flag}  ${String(e.status).padEnd(4)} ${e.method.padEnd(6)}${e.path}`);
    }
    console.log(`\n  routes live: ${eps.length - deadRoutes.length - brokenRoutes.length}/${eps.length}`);
    if (deadRoutes.length) console.log(`  DECLARED BUT 404/405: ${deadRoutes.map((e) => e.method + ' ' + e.path).join(', ')}`);
    if (brokenRoutes.length) console.log(`  5xx: ${brokenRoutes.map((e) => e.method + ' ' + e.path).join(', ')}`);
  }
  process.exit(leaky.length || deadRoutes.length || brokenRoutes.length ? 1 : 0);
}

if (MODE === 'check') {
  if (!existsSync(OUT)) { console.error(`[ucp:schema:check] no snapshot at ${OUT} — run ucp:schema:refresh first`); process.exit(1); }
  const prev = readFileSync(OUT, 'utf8');
  if (prev === rendered) { console.log(`[ucp:schema:check] OK — ${data.tools.length} tools, ${(data.caps.endpoints?.operations ?? []).length} operations, no drift.`); process.exit(0); }
  const a = prev.split('\n'), b = rendered.split('\n');
  const diff = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) diff.push(`  line ${i + 1}\n    - ${a[i] ?? '(absent)'}\n    + ${b[i] ?? '(absent)'}`);
  console.error(`[ucp:schema:check] DRIFT — ${diff.length} differing line(s). The UCP contract changed:\n`);
  console.error(diff.slice(0, 40).join('\n'));
  if (diff.length > 40) console.error(`  … and ${diff.length - 40} more`);
  console.error('\n  If the change is intended: npm run ucp:schema:refresh, and re-read any case that asserts the old shape.');
  process.exit(1);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, rendered);
console.log(`[ucp:schema:refresh] wrote ${OUT}`);
console.log(`  ${data.tools.length} tools · ${(data.caps.endpoints?.operations ?? []).length} declared operations · ${(data.caps.errors?.codes ?? []).length} error codes`);
