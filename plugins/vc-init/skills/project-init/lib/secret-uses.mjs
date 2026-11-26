/**
 * skills/project-init/lib/secret-uses.mjs — launchables a PROJECT asks to run with one of its PAT axes.
 *
 * A repository can need a process of its own to get the token /project-init stored — this repo's kb
 * pushes with the GitHub PAT. Hand-editing `.claude/vc-secrets.local.json` is the operator's job (the
 * vc-secrets guard refuses an agent) and gets forgotten, so the project states the need as DATA, one file
 * per consumer in `config/vc-secrets-uses/`, and write-secrets-decl declares it beside its own entries:
 *
 *   { "axis": "github",
 *     "servers": { "kb":      { "command": "node", "args": ["scripts/kb/mcp.mjs"], "env": ["GITHUB_TOKEN"] } },
 *     "tasks":   { "kb-push": { "command": "node", "args": ["scripts/kb/kb.mjs", "push"], "env": ["GITHUB_TOKEN"] } } }
 *
 * `env` lists variable NAMES only; each is bound to the axis's secret (`secret:github-pat`). So a file can
 * hand a process exactly the token the operator stored for that axis and nothing else — no other secret,
 * no literal. What the process runs is still the operator's call: the entries launch only after
 * `vc-secrets trust`, which shows command, args and env. An axis that is not a PAT declares none of a
 * file's entries (there is no secret to bind). A file that does not parse or breaks a rule is skipped
 * with a warning, never fatal: a typo in a project file must not stop onboarding.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const USES_DIR = join("config", "vc-secrets-uses");

const NAME_RE = /^[a-z0-9][a-z0-9._-]*$/;
const ENV_RE = /^[A-Z_][A-Z0-9_]*$/;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

/** A launchable name write-secrets-decl owns itself — a project file may not take it. */
export function reservedName(kind, name) {
  if (kind === "tasks") return /^vc-init-/.test(name);
  return name === "github" || /^playwright-/.test(name);
}

/** One file's content checked against the rules above. Pure. @returns {{ use?: object, problem?: string }} */
export function validateUse(doc, axes) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return { problem: "not a JSON object" };
  if (!Object.hasOwn(axes, doc.axis)) return { problem: `axis must be one of ${Object.keys(axes).join(", ")}` };
  const use = { axis: doc.axis, servers: {}, tasks: {} };
  for (const kind of ["servers", "tasks"]) {
    const block = doc[kind] ?? {};
    if (typeof block !== "object" || Array.isArray(block)) return { problem: `${kind} must be an object` };
    for (const [name, e] of Object.entries(block)) {
      const where = `${kind}.${name}`;
      if (!NAME_RE.test(name)) return { problem: `${where}: not a launchable name ([a-z0-9._-])` };
      if (reservedName(kind, name)) return { problem: `${where}: the name is /project-init's own` };
      if (!e || typeof e.command !== "string" || !e.command || CONTROL_RE.test(e.command)) return { problem: `${where}: command must be a plain string` };
      if (!Array.isArray(e.args) || !e.args.every((a) => typeof a === "string")) return { problem: `${where}: args must be an array of strings` };
      if (!Array.isArray(e.env) || !e.env.length || !e.env.every((n) => typeof n === "string" && ENV_RE.test(n))) {
        return { problem: `${where}: env must list variable names (UPPER_SNAKE), each bound to the axis secret` };
      }
      use[kind][name] = { command: e.command, args: [...e.args], env: [...e.env] };
    }
  }
  return { use };
}

/**
 * Every use file of the project, validated. A name two files claim keeps the first (files in name order)
 * and the second is skipped with a warning.
 * @returns {{ uses: object[], skipped: { file: string, why: string }[] }}
 */
export function readSecretUses(root, axes, { exists = existsSync, list = readdirSync, read = readFileSync } = {}) {
  const dir = join(root, USES_DIR);
  const uses = [];
  const skipped = [];
  if (!exists(dir)) return { uses, skipped };
  const taken = new Set();
  for (const file of list(dir).filter((f) => f.endsWith(".json")).sort()) {
    let doc;
    try {
      doc = JSON.parse(read(join(dir, file), "utf8"));
    } catch (e) {
      skipped.push({ file, why: `not valid JSON (${e.message})` });
      continue;
    }
    const { use, problem } = validateUse(doc, axes);
    if (!use) { skipped.push({ file, why: problem }); continue; }
    const clash = ["servers", "tasks"].flatMap((k) => Object.keys(use[k]).map((n) => `${k}.${n}`)).find((n) => taken.has(n));
    if (clash) { skipped.push({ file, why: `${clash} is already declared by another file` }); continue; }
    for (const k of ["servers", "tasks"]) for (const n of Object.keys(use[k])) taken.add(`${k}.${n}`);
    uses.push({ file, ...use });
  }
  return { uses, skipped };
}

/** One use's entries as vc-secrets declarations: each env name bound to `secret:<the axis secret>`. Pure. */
export function useEntries(use, secret) {
  const bind = (names) => Object.fromEntries(names.map((n) => [n, `secret:${secret}`]));
  const map = (block) => Object.fromEntries(Object.entries(block).map(([n, e]) => [n, { command: e.command, args: [...e.args], env: bind(e.env) }]));
  return { servers: map(use.servers), tasks: map(use.tasks) };
}
