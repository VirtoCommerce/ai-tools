// plugins/vc-test/lib/goal.mjs — the only writer of a /vc-test:qa-goal run's journal, `goal.json`.
// A run's folder is `<workDir>/goal/<runId>/` (workDir = `.vc-fix/vc-test/<KEY>/<env>/`, lib/paths.mjs); it holds goal.json,
// run-plan.json (`{"waves":[]}`, what write-zones.mjs check reads), evidence/. The journal's shape is goal.schema.json.
// What an agent hands over goes through a FILE it wrote with an editor tool (`--file <json>`), never JSON on a command
// line: the text comes from a ticket or a page, and a quote in it would break — or inject into — a shell command.
// Every input is, in this order: refused if a key is a forbidden field name (token, authorization, password, cookie),
// refused if any string is JWT-shaped (exit 2, nothing written), scrubbed of the project's secret values and token
// shapes (knowledge-store.mjs), merged into the journal, checked against the schema, and only then saved (atomic).
// CLI: node goal.mjs <command> …; prints ONE JSON object. Exit 0 done · 1 usage · 2 refused (`errors` names every
// reason) · 3 could not run (I/O).
//   init --key <KEY> [--env <env>] [--new]            → { dir, runId, resumed }  (resumes the newest unclosed run)
//   contract --file <json> | contract --approve --who <name>
//   ac add --file <json> → { id } · ac set --id AC-n --file <json>
//   strategy set --file <json>                        (an array of risks; replaces the strategy)
//   finding add --file <json> → { id } · finding set --id F-n --file <json>
//   replay add --file <json> → { id }
//   checkpoint --stop S1|S2|S3 --decision approved|rejected|edited --who <name> [--note <text>]
//   cost --file <json> · judge --verdict APPROVE|REJECT --file <judge.md> · close --write-zones <path> --teardown <path>
//   every command but init takes --dir <runDir>.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { knowledgeSecretValues, scrubValues } from "./knowledge-store.mjs";
import { argOf, outputRoot, workDir, currentEnv } from "./paths.mjs";
import { SECRET_NAME } from "../skills/ticket-context/lib/scrub.mjs";

export const GOAL_FILE = "goal.json";
const SCHEMA = JSON.parse(readFileSync(new URL("./goal.schema.json", import.meta.url), "utf8"));
const FORBIDDEN = new Set(SCHEMA["x-forbiddenFieldNames"].map((n) => n.toLowerCase()));
const JWT = /eyJ[\w-]+\.eyJ[\w-]+\./;
const USAGE = "usage: goal.mjs init|contract|ac|strategy|finding|replay|checkpoint|cost|judge|close … --dir <runDir> (init: --key <KEY> [--env <env>] [--new])";

/** A refusal carries every reason; exit 1 is a usage error, 2 a refusal, 3 an I/O failure. */
class GoalError extends Error {
  constructor(exit, errors) { super(errors[0]); this.exit = exit; this.errors = errors; }
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
    if (key && SECRET_NAME.test(key) && !keys.includes(key)) keys.push(key);
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
        return mutate(argv, objectInput(readFileArg(argv), "ac"), (g, c) => {
          const ac = setById(g.acs, id, "AC", "criterion");
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
        return mutate(argv, objectInput(readFileArg(argv), "finding"), (g, c) => {
          if ("id" in c) throw refuse("finding add: the id is assigned, not given");
          const f = { id: nextId("F", g.findings), evidence: [], reproduced: 0, ...c };
          g.findings.push(f);
          return { id: f.id };
        });
      }
      if (sub === "set") {
        const id = need(argv, "id");
        return mutate(argv, objectInput(readFileArg(argv), "finding"), (g, c) => {
          const f = setById(g.findings, id, "F", "finding");
          if ("id" in c) throw refuse("finding set: the id cannot be changed");
          Object.assign(f, c);
          return { id };
        });
      }
      throw usage("finding add --file <json> | finding set --id F-n --file <json>");
    }
    case "replay": {
      if (sub !== "add") throw usage("replay add --file <json>");
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
      return mutate(argv, { verdict }, (g, c, dir) => {
        if (!existsSync(file)) throw refuse(`judge file not found: ${file}`);
        g.judge = { verdict: c.verdict, at: now(), path: stored(dir, file) };
        return { verdict: c.verdict };
      });
    }
    case "close": {
      const writeZones = need(argv, "write-zones");
      const teardown = need(argv, "teardown");
      return mutate(argv, { writeZones, teardown }, (g, c, dir) => {
        g.closed = { writeZones: stored(dir, c.writeZones), teardown: stored(dir, c.teardown), at: now() };
      });
    }
    default: throw usage(USAGE);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    console.log(JSON.stringify(cli(process.argv.slice(2)), null, 2));
  } catch (e) {
    if (e instanceof GoalError) {
      console.log(JSON.stringify({ ok: false, errors: e.errors }, null, 2));
      process.exit(e.exit);
    }
    console.log(JSON.stringify({ ok: false, errors: [e.message] }));
    process.exit(3);
  }
}
