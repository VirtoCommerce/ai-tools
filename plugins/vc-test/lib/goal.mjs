// plugins/vc-test/lib/goal.mjs — the only writer of a /vc-test:qa-goal run's journal, `goal.json`.
// A run's folder is `<workDir>/goal/<runId>/` (workDir = `.vc-fix/vc-test/<KEY>/<env>/`, lib/paths.mjs); it holds goal.json,
// run-plan.json (`{"waves":[]}`, what write-zones.mjs check reads), evidence/. The journal's shape is goal.schema.json.
// What an agent hands over goes through a FILE it wrote with an editor tool (`--file <json>`), never JSON on a command
// line: the text comes from a ticket or a page, and a quote in it would break — or inject into — a shell command.
// Every input is, in this order: refused if a key is a forbidden field name (token, authorization, password, cookie),
// refused if any string is JWT-shaped (exit 2, nothing written), scrubbed of the project's secret values and token
// shapes (knowledge-store.mjs), merged into the journal, checked against the schema, and only then saved (atomic).
// A path inside the run's `.tokens/` (an evidence path, `judge --file`, `close`'s two paths) is refused, never echoed.
// CLI: node goal.mjs <command> …; prints ONE JSON object. Exit 0 done · 1 usage · 2 refused (`errors` names every
// reason) · 3 could not run (I/O).
//   init --key <KEY> [--env <env>] [--new]            → { dir, runId, resumed }  (resumes the newest unclosed run)
//   contract --file <json> | contract --approve --who <name>
//   ac add --file <json> → { id } · ac set --id AC-n --file <json>
//   strategy set --file <json>                        (an array of risks; replaces the strategy)
//   finding add --file <json> → { id } · finding set --id F-n --file <json>
//   replay add --file <json> → { id } · replay --id RP-n → { id, status, expectStatus, match } (GET/HEAD, no credentials)
//   check --before strategy|write|verdict|close [--what <label>]   → { ok, errors, warnings }; exit 2 when a gate fails
//   checkpoint --stop S1|S2|S3 --decision approved|rejected|edited --who <name> [--note <text>]
//   cost --file <json> · judge --verdict APPROVE|REJECT --file <judge.md> · close --write-zones <path> --teardown <path>
//   every command but init takes --dir <runDir>.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { knowledgeSecretValues, scrubValues } from "./knowledge-store.mjs";
import { argOf, outputRoot, workDir, currentEnv } from "./paths.mjs";
import { SECRET_NAME } from "../skills/ticket-context/lib/scrub.mjs";

export const GOAL_FILE = "goal.json";
const SCHEMA = JSON.parse(readFileSync(new URL("./goal.schema.json", import.meta.url), "utf8"));
const FORBIDDEN = new Set(SCHEMA["x-forbiddenFieldNames"].map((n) => n.toLowerCase()));
const JWT = /eyJ[\w-]+\.eyJ[\w-]+\./;
const USAGE = "usage: goal.mjs init|contract|ac|strategy|finding|replay|check|checkpoint|cost|judge|close … --dir <runDir> (init: --key <KEY> [--env <env>] [--new])";

/** A refusal carries every reason; exit 1 is a usage error, 2 a refusal, 3 an I/O failure. */
class GoalError extends Error {
  constructor(exit, errors, extra = {}) { super(errors[0]); this.exit = exit; this.errors = errors; this.extra = extra; }
}
const refuse = (...errors) => new GoalError(2, errors);
const usage = (msg) => new GoalError(1, [msg]);

/** UTC `YYYYMMDDTHHMMSSZ`. */
export function newRunId(now = new Date()) {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function loadGoal(dir) {
  return JSON.parse(readFileSync(join(dir, GOAL_FILE), "utf8"));
}

/** Atomic: a temp file in the same folder, then a rename over the journal. */
export function saveGoal(dir, goal) {
  const tmp = join(dir, `${GOAL_FILE}.${process.pid}.tmp`);
  writeFileSync(tmp, `${JSON.stringify(goal, null, 2)}\n`);
  renameSync(tmp, join(dir, GOAL_FILE));
}

// ---- schema validation: the subset goal.schema.json uses (type, enum, required, additionalProperties, items, $ref, bounds) ----
const typeOk = (t, v) => {
  switch (t) {
    case "null": return v === null;
    case "array": return Array.isArray(v);
    case "object": return v !== null && typeof v === "object" && !Array.isArray(v);
    case "integer": return Number.isInteger(v);
    case "number": return typeof v === "number" && Number.isFinite(v);
    default: return typeof v === t;
  }
};

function check(schema, value, path, errors) {
  const types = schema.type === undefined ? null : [].concat(schema.type);
  if (types && value === null && types.includes("null")) return;
  if (types && !types.some((t) => typeOk(t, value))) {
    const object = types.filter((t) => t !== "null");
    errors.push(`${path}: expected ${object.join(" or ")}, got ${value === null ? "null" : Array.isArray(value) ? "array" : typeof value}`);
    return;
  }
  if (schema.$ref) check(SCHEMA.$defs[schema.$ref.replace("#/$defs/", "")], value, path, errors);
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: "${value}" is not one of ${schema.enum.join(", ")}`);
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: must not be empty`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: "${value}" does not match ${schema.pattern}`);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: ${value} is below ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: ${value} is above ${schema.maximum}`);
  }
  if (Array.isArray(value) && schema.items) value.forEach((v, i) => check(schema.items, v, `${path}[${i}]`, errors));
  if (typeOk("object", value) && (schema.properties || schema.required)) {
    for (const r of schema.required ?? []) if (!(r in value)) errors.push(`${path}: missing required field "${r}"`);
    for (const [k, v] of Object.entries(value)) {
      if (schema.properties?.[k]) check(schema.properties[k], v, `${path}.${k}`, errors);
      else if (schema.additionalProperties === false) errors.push(`${path}: unknown field "${k}"`);
    }
  }
}

/** Every reason the journal does not fit the schema, or []. */
export function validateGoal(goal) {
  const errors = [];
  check(SCHEMA, goal, "goal", errors);
  return errors;
}

// ---- what is allowed to be stored ----
function walk(v, onKey, onString, path) {
  if (typeof v === "string") onString(v, path);
  else if (Array.isArray(v)) v.forEach((x, i) => walk(x, onKey, onString, `${path}[${i}]`));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { onKey(k, `${path}.${k}`); walk(x, onKey, onString, `${path}.${k}`); }
}

/** Input that may not be stored at all: a forbidden field name, a JWT-shaped value. Every reason, not the first. */
export function refusals(input) {
  const errors = [];
  walk(input, (k, p) => { if (FORBIDDEN.has(k.toLowerCase())) errors.push(`${p}: a field named "${k}" is never stored`); },
    (s, p) => { if (JWT.test(s)) errors.push(`${p}: token-shaped value refused — a token is never stored; describe it instead`); }, "input");
  return errors;
}

/** The input with the project's secret values and token shapes masked in every string (keys stay). */
function scrubbed(input, secrets) {
  if (typeof input === "string") return scrubValues(input, secrets);
  if (Array.isArray(input)) return input.map((x) => scrubbed(x, secrets));
  if (input && typeof input === "object") return Object.fromEntries(Object.entries(input).map(([k, x]) => [k, scrubbed(x, secrets)]));
  return input;
}

// ---- the commands ----
const nextId = (prefix, items) => `${prefix}-${items.reduce((m, x) => Math.max(m, Number(String(x.id).split("-")[1]) || 0), 0) + 1}`;
const now = () => new Date().toISOString();
const posix = (p) => p.split("\\").join("/");
/** A path inside the run folder is stored relative to it; anything else (or a plain word) as given. */
const stored = (dir, p) => {
  if (!isAbsolute(p)) return posix(p);
  const rel = relative(resolve(dir), resolve(p));
  return rel && !rel.startsWith("..") && !isAbsolute(rel) ? posix(rel) : posix(p);
};

/**
 * True when a path lands in the run's `.tokens/` folder — its first run-relative segment is `.tokens` (any case: the
 * Windows file system does not tell `.Tokens` apart). A relative path is read against the run folder AND against the
 * working directory, so neither reading reaches a token file. The one check every stored path goes through.
 */
export function inTokens(dir, p) {
  if (typeof p !== "string" || !p) return false;
  return [resolve(dir, p), resolve(p)].some((abs) => {
    const first = relative(resolve(dir), abs).split(/[\\/]/)[0];
    return first.toLowerCase() === ".tokens";
  });
}
/** Refuses (exit 2) when any path is inside `.tokens/`; the message names where, never the path. */
function refuseTokenPaths(dir, where, paths) {
  if (paths.some((p) => inTokens(dir, p))) throw refuse(`${where}: a path inside the run's .tokens/ folder is never stored`);
}
const evidencePaths = (c) => (Array.isArray(c?.evidence) ? c.evidence.map((e) => e?.path) : []);

/** OAuth keys SECRET_NAME does not match: an authorization code and a PKCE verifier are never stored (exact key, any case). */
const OAUTH_SECRET_KEYS = new Set(["code", "code_verifier"]);

/** The secret-named parameter KEYS of a URL's query and fragment (never their values): a token pasted from a HAR. */
function secretUrlKeys(url) {
  const hash = url.indexOf("#");
  const beforeHash = hash < 0 ? url : url.slice(0, hash);
  const q = beforeHash.indexOf("?");
  const query = q < 0 ? "" : beforeHash.slice(q + 1);
  const fragment = hash < 0 ? "" : url.slice(hash + 1); // a fragment is `a=b&c=d`, or a hash route `/page?a=b`
  const keys = [];
  for (const part of `${query}&${fragment.split("?").join("&")}`.split("&")) {
    const raw = part.split("=")[0];
    let key = raw;
    try { key = decodeURIComponent(raw.split("+").join(" ")); } catch { /* keep the raw spelling */ }
    if (key && (SECRET_NAME.test(key) || OAUTH_SECRET_KEYS.has(key.toLowerCase())) && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

function readFileArg(argv) {
  const file = argOf(argv, "file");
  if (!file) throw usage("--file <json> is required (write the JSON with an editor tool, never on the command line)");
  let text;
  try { text = readFileSync(file, "utf8"); } catch (e) { throw new GoalError(3, [`cannot read --file ${file}: ${e.message}`]); }
  try { return JSON.parse(text); } catch (e) { throw refuse(`--file ${file} is not valid JSON: ${e.message}`); }
}

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const need = (argv, name) => { const v = argOf(argv, name); if (!v || v.startsWith("--")) throw usage(`--${name} is required`); return v; };

function dirOf(argv) {
  const dir = argOf(argv, "dir");
  if (!dir) throw usage("--dir <runDir> is required");
  if (!existsSync(join(dir, GOAL_FILE))) throw new GoalError(3, [`no ${GOAL_FILE} in ${dir} — run \`goal.mjs init\` first`]);
  return dir;
}

function emptyGoal({ key, env, runId }) {
  return {
    schema: 1, key, env, runId, createdAt: now(), goal: "", done: "", budget: null, stops: [], contract: null,
    acs: [], strategy: [], findings: [], replays: [], checkpoints: [], judge: null, cost: null, closed: null,
  };
}

/** Claim a fresh run folder: the id is the UTC second, bumped by a second while a folder already holds it. */
function createRun(base, key, env) {
  mkdirSync(base, { recursive: true });
  for (let t = Date.now(); ; t += 1000) {
    const runId = newRunId(new Date(t));
    const dir = join(base, runId);
    try { mkdirSync(dir); } catch (e) { if (e.code === "EEXIST") continue; throw e; }
    mkdirSync(join(dir, "evidence"));
    writeFileSync(join(dir, "run-plan.json"), `${JSON.stringify({ waves: [] })}\n`);
    saveGoal(dir, emptyGoal({ key, env, runId }));
    return { dir, runId };
  }
}

function init(argv) {
  const key = need(argv, "key");
  const env = argOf(argv, "env") ?? currentEnv();
  let base;
  try { base = join(workDir(key, { env }), "goal"); } catch (e) { throw usage(e.message); }
  if (!argv.includes("--new") && existsSync(base)) {
    for (const runId of readdirSync(base).sort().reverse()) {
      const dir = join(base, runId);
      let g;
      try { g = loadGoal(dir); } catch { continue; } // not a run folder, or an unreadable journal: not a run to resume
      if (g.closed === null && g.key === key && g.env === env) return { dir, runId: g.runId, resumed: true };
    }
  }
  return { ...createRun(base, key, env), resumed: false };
}

/** One command that changes the journal: refuse bad input, mutate a copy, validate the whole, save. */
function mutate(argv, input, apply) {
  const dir = dirOf(argv);
  const errors = refusals(input);
  if (errors.length) throw refuse(...errors);
  const goal = loadGoal(dir);
  const clean = scrubbed(input, knowledgeSecretValues(outputRoot()));
  const result = apply(goal, clean, dir) ?? {};
  const bad = validateGoal(goal);
  if (bad.length) throw refuse(...bad);
  saveGoal(dir, goal);
  return { ok: true, ...result };
}

const objectInput = (v, what) => { if (!isObject(v)) throw refuse(`${what}: the file must hold one JSON object`); return v; };

function setById(list, id, prefix, what) {
  const item = list.find((x) => x.id === id);
  if (!item) throw refuse(`no ${what} ${id}`);
  if (!new RegExp(`^${prefix}-\\d+$`).test(id)) throw usage(`--id must look like ${prefix}-<n>`);
  return item;
}

// ---- the stage gates ----
const STAGES = ["strategy", "write", "verdict", "close"];
const PCT = (n, of) => Math.round((n / of) * 100);

/** An evidence path counts only when it resolves inside the run folder (a relative path is read against it). */
const insideRun = (dir, p) => {
  const rel = relative(resolve(dir), resolve(dir, p));
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)); // a segment, not a prefix: `..cache/x` is inside
};

function budgetFindings(goal, enforce) {
  const errors = [];
  const warnings = [];
  const { budget, cost } = goal;
  if (!budget || !cost) return { errors, warnings };
  const meter = (used, limit, what, unit) => {
    if (typeof used !== "number" || typeof limit !== "number" || limit <= 0) return;
    const text = `${what} ${used} of ${limit} ${unit} (${PCT(used, limit)} %)`;
    if (used > limit) (enforce ? errors : warnings).push(`${what} budget exceeded: ${used} of ${limit} ${unit} (${PCT(used, limit)} %)`);
    else if (used > limit * 0.8) warnings.push(`${text} — over 80 % of the budget`);
  };
  meter(cost.inputTotal, budget.tokens, "token", "tokens");
  meter(cost.wallMin, budget.wallMin, "wall-clock", "min");
  return { errors, warnings };
}

/**
 * The gate before a stage. `{ ok, errors, warnings }`; every reason is named, none is a crash on a fresh journal
 * (budget, cost, contract, judge and closed are null until their command ran).
 */
export function checkGoal(goal, stage, { dir, what } = {}) {
  if (!STAGES.includes(stage)) throw usage(`--before must be one of ${STAGES.join(", ")}`);
  const errors = [];
  const acs = goal.acs ?? [];
  const known = new Set(acs.map((a) => a.id));
  const approved = (stop, note) => (goal.checkpoints ?? []).some((c) => c.stop === stop && c.decision === "approved" && (note === undefined || c.note === note));

  if (stage === "strategy") {
    if (!goal.contract?.approvedAt) errors.push("contract not approved");
    if (acs.length < 1) errors.push("no acceptance criteria");
    const covered = new Set((goal.strategy ?? []).flatMap((r) => r.acs ?? []));
    for (const a of acs) {
      if (!a.source) errors.push(`${a.id}: no source`);
      if (!covered.has(a.id)) errors.push(`${a.id}: not covered by any strategy risk`);
    }
    for (const r of goal.strategy ?? []) for (const id of r.acs ?? []) if (!known.has(id)) errors.push(`${r.id}: unknown AC ${id}`);
  }

  if (stage === "write" && !approved("S3", what)) errors.push("no approved S3 checkpoint for this write");

  if (stage === "verdict") {
    const outside = (list) => (list ?? []).some((e) => typeof e.path === "string" && !insideRun(dir, e.path));
    const tokens = (list) => (list ?? []).some((e) => inTokens(dir, e?.path));
    for (const a of acs) {
      if (a.status === "open") errors.push(`${a.id}: still open`);
      if (a.status === "GAP" && !a.gapReason) errors.push(`${a.id}: GAP without gapReason`);
      if (["PASS", "FAIL", "PARTIAL"].includes(a.status) && !(a.evidence ?? []).length) errors.push(`${a.id}: ${a.status} without evidence`);
      if (outside(a.evidence)) errors.push(`${a.id}: evidence outside the run folder`);
      if (tokens(a.evidence)) errors.push(`${a.id}: evidence inside the run's .tokens/ folder`);
    }
    for (const f of goal.findings ?? []) {
      if (!f.severity) errors.push(`${f.id}: no severity`);
      if (!(f.evidence ?? []).length) errors.push(`${f.id}: no evidence`);
      if (outside(f.evidence)) errors.push(`${f.id}: evidence outside the run folder`);
      if (tokens(f.evidence)) errors.push(`${f.id}: evidence inside the run's .tokens/ folder`);
      if (f.inScope === true && ["Critical", "High", "Medium"].includes(f.severity) && !(f.reproduced >= 2)) errors.push(`${f.id}: Medium or worse needs reproduced ≥ 2`);
      if (!known.has(f.ac)) errors.push(`${f.id}: unknown AC ${f.ac}`);
    }
    if (!approved("S2")) errors.push("no approved S2 checkpoint");
    if (!goal.cost) errors.push("cost not recorded");
  }

  if (stage === "close") {
    if (!goal.judge?.verdict) errors.push("judge verdict not recorded");
    if (!goal.closed?.writeZones) errors.push("closed.writeZones not recorded");
    if (!goal.closed?.teardown) errors.push("closed.teardown not recorded");
  }

  const budget = budgetFindings(goal, stage === "strategy" || stage === "verdict");
  return { ok: errors.length + budget.errors.length === 0, errors: [...errors, ...budget.errors], warnings: budget.warnings };
}

/** One read-only request of a stored replay; what it prints is the status, never the URL. */
async function runReplay(argv) {
  const dir = dirOf(argv);
  const id = need(argv, "id");
  const r = (loadGoal(dir).replays ?? []).find((x) => x.id === id);
  if (!r) throw refuse(`no replay ${id}`);
  // The journal may have been edited by hand since `replay add` checked it: check again before any request leaves.
  if (r.method !== "GET" && r.method !== "HEAD") throw refuse(`${id}: only GET and HEAD are replayed`);
  if (typeof r.url !== "string" || !/^https?:\/\//.test(r.url)) throw refuse(`${id}: the URL must be http(s)`);
  if (/^https?:\/\/[^/?#]*@/.test(r.url)) throw refuse(`${id}: a URL with credentials in it is never replayed`);
  const keys = secretUrlKeys(r.url);
  if (keys.length) throw refuse(...keys.map((k) => `${id}: the URL carries a secret-named parameter "${k}" — a replay is unauthenticated`));
  let res;
  try {
    // No Authorization, no cookie, no body; a redirect is reported as the server's own answer, never followed.
    res = await fetch(r.url, { method: r.method, redirect: "manual", signal: AbortSignal.timeout(20000) });
  } catch (e) {
    throw new GoalError(3, [`${id}: the request failed (${e?.name ?? "Error"}: ${e?.cause?.code ?? "no response"})`]);
  }
  try { await res.body?.cancel(); } catch { /* the status is what matters */ }
  return { id, status: res.status, expectStatus: r.expectStatus, match: res.status === r.expectStatus };
}

function cli(argv) {
  const [cmd, sub] = argv;
  switch (cmd) {
    case "init": return init(argv);
    case "contract": {
      if (argv.includes("--approve")) {
        const who = need(argv, "who");
        return mutate(argv, { who }, (g, c) => {
          if (!g.goal || !g.done || !g.budget) throw refuse("the contract is not drafted: goal, done and budget are required before approval");
          g.contract = { approvedBy: c.who, approvedAt: now() };
          return { approvedBy: c.who };
        });
      }
      const input = objectInput(readFileArg(argv), "contract");
      return mutate(argv, input, (g, c) => {
        const extra = Object.keys(c).filter((k) => !["goal", "done", "budget", "stops"].includes(k));
        if (extra.length) throw refuse(...extra.map((k) => `contract: unknown field "${k}" (goal, done, budget, stops)`));
        Object.assign(g, c);
        g.contract = null; // an edited contract is not the one that was approved
      });
    }
    case "ac": {
      if (sub === "add") {
        return mutate(argv, objectInput(readFileArg(argv), "ac"), (g, c) => {
          const extra = Object.keys(c).filter((k) => !["text", "source", "addedAt", "addedReason"].includes(k));
          if (extra.length) throw refuse(...extra.map((k) => `ac add: unknown field "${k}" (text, source, addedAt, addedReason)`));
          const ac = { ...c, id: nextId("AC", g.acs), status: "open", evidence: [], findings: [] };
          g.acs.push(ac);
          return { id: ac.id };
        });
      }
      if (sub === "set") {
        const id = need(argv, "id");
        return mutate(argv, objectInput(readFileArg(argv), "ac"), (g, c, dir) => {
          const ac = setById(g.acs, id, "AC", "criterion");
          refuseTokenPaths(dir, `ac set ${id}`, evidencePaths(c));
          const extra = Object.keys(c).filter((k) => !["status", "evidence", "gapReason", "findings"].includes(k));
          if (extra.length) throw refuse(...extra.map((k) => `ac set: "${k}" cannot be changed (status, evidence, gapReason, findings)`));
          Object.assign(ac, c);
          return { id };
        });
      }
      throw usage("ac add --file <json> | ac set --id AC-n --file <json>");
    }
    case "strategy": {
      if (sub !== "set") throw usage("strategy set --file <json>");
      const input = readFileArg(argv);
      if (!Array.isArray(input)) throw refuse("strategy: the file must hold a JSON array of risks");
      return mutate(argv, input, (g, c) => { g.strategy = c; return { risks: c.length }; });
    }
    case "finding": {
      if (sub === "add") {
        return mutate(argv, objectInput(readFileArg(argv), "finding"), (g, c, dir) => {
          if ("id" in c) throw refuse("finding add: the id is assigned, not given");
          refuseTokenPaths(dir, "finding add", evidencePaths(c));
          const f = { id: nextId("F", g.findings), evidence: [], reproduced: 0, ...c };
          g.findings.push(f);
          return { id: f.id };
        });
      }
      if (sub === "set") {
        const id = need(argv, "id");
        return mutate(argv, objectInput(readFileArg(argv), "finding"), (g, c, dir) => {
          const f = setById(g.findings, id, "F", "finding");
          refuseTokenPaths(dir, `finding set ${id}`, evidencePaths(c));
          if ("id" in c) throw refuse("finding set: the id cannot be changed");
          Object.assign(f, c);
          return { id };
        });
      }
      throw usage("finding add --file <json> | finding set --id F-n --file <json>");
    }
    case "check": {
      const dir = dirOf(argv);
      const stage = need(argv, "before");
      if (!STAGES.includes(stage)) throw usage(`--before must be one of ${STAGES.join(", ")}`);
      const what = stage === "write" ? need(argv, "what") : undefined;
      const result = checkGoal(loadGoal(dir), stage, { dir, what });
      if (!result.ok) throw new GoalError(2, result.errors, { warnings: result.warnings });
      return result;
    }
    case "replay": {
      if (sub !== "add") {
        if (argv.includes("--id")) return runReplay(argv);
        throw usage("replay add --file <json> | replay --dir <runDir> --id RP-n");
      }
      return mutate(argv, objectInput(readFileArg(argv), "replay"), (g, c) => {
        if (typeof c.url === "string") {
          if (/^https?:\/\/[^/?#]*@/.test(c.url)) throw refuse("replay: a URL with credentials in it is never stored");
          const keys = secretUrlKeys(c.url);
          if (keys.length) throw refuse(...keys.map((k) => `replay: the URL carries a secret-named parameter "${k}" — a replay is unauthenticated; remove it`));
        }
        const r = { ...c, id: nextId("RP", g.replays) };
        g.replays.push(r);
        return { id: r.id };
      });
    }
    case "checkpoint": {
      const input = { stop: need(argv, "stop"), decision: need(argv, "decision"), who: need(argv, "who"), ...(argOf(argv, "note") !== undefined ? { note: argOf(argv, "note") } : {}) };
      return mutate(argv, input, (g, c) => { g.checkpoints.push({ ...c, at: now() }); return { stop: c.stop, decision: c.decision }; });
    }
    case "cost": {
      const input = objectInput(readFileArg(argv), "cost");
      return mutate(argv, isObject(input.total) ? input.total : input, (g, c) => { g.cost = c; }); // a whole run-cost result or just its total
    }
    case "judge": {
      const verdict = need(argv, "verdict");
      const file = need(argv, "file");
      const dir = dirOf(argv);
      // The judge's notes are a file INSIDE the run folder (a relative --file is read against it); the journal keeps the
      // run-relative path, and that path goes through the same refusal + scrub as every other input. Messages never echo it.
      const abs = resolve(dir, file);
      refuseTokenPaths(dir, "judge", [file, abs]); // before any existence check: a token file is not even probed
      if (!insideRun(dir, abs) || abs === resolve(dir)) throw refuse("judge file must be inside the run folder");
      if (!existsSync(abs) || !statSync(abs).isFile()) throw refuse("judge file not found in the run folder");
      return mutate(argv, { verdict, path: posix(relative(resolve(dir), abs)) }, (g, c) => {
        g.judge = { verdict: c.verdict, at: now(), path: c.path };
        return { verdict: c.verdict };
      });
    }
    case "close": {
      const writeZones = need(argv, "write-zones");
      const teardown = need(argv, "teardown");
      return mutate(argv, { writeZones, teardown }, (g, c, dir) => {
        refuseTokenPaths(dir, "close", [c.writeZones, c.teardown]);
        g.closed = { writeZones: stored(dir, c.writeZones), teardown: stored(dir, c.teardown), at: now() };
      });
    }
    default: throw usage(USAGE);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    console.log(JSON.stringify(await cli(process.argv.slice(2)), null, 2));
  } catch (e) {
    if (e instanceof GoalError) {
      console.log(JSON.stringify({ ok: false, errors: e.errors, ...e.extra }, null, 2));
      process.exit(e.exit);
    }
    console.log(JSON.stringify({ ok: false, errors: [e.message] }));
    process.exit(3);
  }
}
