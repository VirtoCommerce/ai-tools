#!/usr/bin/env node
/**
 * gen-doc-indexes — the rosters in the repo's READMEs, derived instead of typed.
 *
 *   npm run docs:index          rewrite every generated block in place
 *   npm run docs:index:check    exit 1 when a block is stale or a hand-written index lags   (CI gate)
 *   npm run docs:index -- --json
 *
 * WHY. `npm run knowledge:index` proved the pattern for one folder: a roster that is DERIVED on every
 * run and GATED in CI cannot lag. Every other roster in the repo was still typed, and the 2026-10-09
 * README audit found every one of them behind: 2 of the skills, 6 of the commands and ~30 suites
 * missing; agent colours, supporting-file lists and a 19-agent count wrong; the root README deleted
 * without anyone noticing. None of that was a DANGLING link, so `context:check` (DOC-003) saw none of
 * it — a typed list is only ever caught SHRINKING, never LAGGING. This script closes both halves:
 *
 *   1. GENERATED BLOCKS — the lists. Each block sits between
 *        <!-- BEGIN GENERATED: <id> — npm run docs:index -->  and  <!-- END GENERATED: <id> -->
 *      and is rebuilt from what the files already declare: SKILL.md / command / agent frontmatter,
 *      the skill directory listing, and `config/test-suites.json`. Text outside the markers is
 *      hand-written and never touched.
 *   2. COVERAGE — the prose indexes no generator can write (`.claude/ROUTING.md` says WHEN to use a
 *      tool, not just that it exists). They stay hand-written, but a command, skill, agent, plugin or
 *      decision record they never mention fails the check. That is the lag DOC-003 cannot see.
 *
 * WHAT IT DOES NOT DO. It never writes a description. A row's text is the first sentence of the
 * component's own `description:` (its `[Category]` tag dropped), so a wrong row is fixed in that
 * component's frontmatter, not here — the same rule `gen-knowledge-index.mjs` applies to scope lines.
 *
 * CHECKS
 *   DOC-IDX-001  a generated block differs from what the sources derive        (hard, --check only)
 *   DOC-IDX-002  a hand-written index does not mention a component it covers   (hard)
 *   DOC-IDX-003  a host file is missing a block's BEGIN/END markers            (hard)
 */

import "../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

// fileURLToPath, not .pathname — the repo path has a space ("My Projects"), see gen-knowledge-index.mjs.
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const check = process.argv.includes("--check");
const json = process.argv.includes("--json");
const MAX_TEXT = 160;
const findings = [];

const rd = (rel) => readFileSync(join(ROOT, rel), "utf8");
const ls = (rel) => (existsSync(join(ROOT, rel)) ? readdirSync(join(ROOT, rel)).sort() : []);
const isDir = (rel) => statSync(join(ROOT, rel)).isDirectory();

// ---------------------------------------------------------------- sources

function frontmatter(rel) {
  const text = rd(rel).replace(/\r\n/g, "\n");
  if (!text.startsWith("---\n")) return {};
  const end = text.indexOf("\n---", 4);
  if (end === -1) return {};
  try {
    return YAML.parse(text.slice(4, end)) ?? {};
  } catch {
    return {};
  }
}

const TAG_RE = /^\s*\[([A-Za-z ]+)\]\s*/;
// The two spellings of one category (skills/README.md says so); the tag is the category, not a label.
const TAG_ALIAS = { "QA Method": "QA Methodology" };

/** First sentence of a description, tag dropped, safe inside a table cell. */
function summary(desc) {
  let t = String(desc ?? "")
    .replace(TAG_RE, "")
    .replace(/\s+/g, " ")
    .trim();
  // "e.g." / "i.e." / "vs." are not sentence ends — shield them, split, then restore.
  t = t.replace(/\b(e\.g|i\.e|etc|vs)\./g, "$1\u0000");
  const m = t.match(/^(.{25,}?[.!?])(\s|$)/);
  if (m) t = m[1];
  t = t.replace(/\u0000/g, ".");
  if (t.length > MAX_TEXT) t = t.slice(0, MAX_TEXT - 1).replace(/\s+\S*$/, "") + "…";
  // A cut can land inside a code span; an unclosed backtick swallows the rest of the table.
  if ((t.match(/`/g) ?? []).length % 2) t += "`";
  // Outside code spans a bare `<X.Y>` is an HTML tag to GitHub's renderer — the text vanishes.
  t = t
    .split(/(`[^`]*`)/)
    .map((part, i) => (i % 2 ? part : part.replace(/</g, "&lt;").replace(/>/g, "&gt;")))
    .join("");
  return t.replace(/\|/g, "\\|") || "—";
}

const tagOf = (desc) => {
  const m = String(desc ?? "").match(TAG_RE);
  return m ? (TAG_ALIAS[m[1]] ?? m[1]) : null;
};

function skillsIn(dirRel) {
  return ls(dirRel)
    .filter((n) => isDir(`${dirRel}/${n}`) && existsSync(join(ROOT, dirRel, n, "SKILL.md")))
    .map((name) => {
      const fm = frontmatter(`${dirRel}/${name}/SKILL.md`);
      const support = ls(`${dirRel}/${name}`)
        .filter((f) => f !== "SKILL.md")
        .map((f) => (isDir(`${dirRel}/${name}/${f}`) ? `${f}/` : f));
      return { name, tag: tagOf(fm.description), text: summary(fm.description), support };
    });
}

function mdComponents(dirRel) {
  return ls(dirRel)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .map((f) => ({ name: f.replace(/\.md$/, ""), fm: frontmatter(`${dirRel}/${f}`), rel: `${dirRel}/${f}` }))
    .sort((a, b) => (a.name < b.name ? -1 : 1)); // by name, so "qa-hotfix" precedes "qa-hotfix-check"
}

const PLUGINS = JSON.parse(rd(".claude-plugin/marketplace.json")).plugins.map((p) => ({
  name: p.name,
  dir: p.source.replace(/^\.\//, ""),
}));

const localSkills = skillsIn(".claude/skills");
const localCommands = mdComponents(".claude/commands");
const localAgents = mdComponents(".claude/agents");
const plugin = Object.fromEntries(
  PLUGINS.map((p) => [
    p.name,
    { skills: skillsIn(`${p.dir}/skills`), commands: mdComponents(`${p.dir}/commands`), agents: mdComponents(`${p.dir}/agents`) },
  ]),
);

// ---------------------------------------------------------------- renderers

const supportCell = (s) => (s.support.length ? s.support.map((f) => `\`${f}\``).join(", ") : "—");

function skillTable(skills) {
  const out = ["| Skill | What it is | Supporting files |", "|---|---|---|"];
  for (const s of skills) out.push(`| \`/${s.name}\` | ${s.text} | ${supportCell(s)} |`);
  return out;
}

// Order of the category sections; an unknown tag sorts after these, untagged skills come last.
const TAG_ORDER = ["VC Knowledge", "Testing", "QA Methodology", "KB"];

function renderSkills() {
  const groups = new Map();
  for (const s of localSkills) {
    const k = s.tag ?? "";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  const keys = [...groups.keys()].sort((a, b) => {
    const ia = a === "" ? 99 : TAG_ORDER.indexOf(a) === -1 ? 50 : TAG_ORDER.indexOf(a);
    const ib = b === "" ? 99 : TAG_ORDER.indexOf(b) === -1 ? 50 : TAG_ORDER.indexOf(b);
    return ia - ib || a.localeCompare(b);
  });
  const out = [];
  for (const k of keys) {
    out.push(`### ${k ? `[${k}]` : "No category tag (root-level)"}`, "");
    out.push(...skillTable(groups.get(k)), "");
  }
  return out;
}

function renderPluginSkills() {
  const out = [];
  for (const p of PLUGINS) {
    const skills = plugin[p.name].skills;
    if (!skills.length) continue;
    out.push(`### \`${p.name}\` — \`${p.dir}/skills/\``, "", ...skillTable(skills), "");
  }
  return out;
}

const mentions = (text, name) => new RegExp(`(^|[^a-z0-9-])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9-]|$)`).test(text);

function skillMapRows(agents, skills) {
  return agents.map((a) => {
    const body = rd(a.rel);
    const hits = skills.map((s) => s.name).filter((n) => n !== "vc-docs" && mentions(body, n));
    return `| \`${a.name}\` | ${hits.length ? hits.join(", ") : "—"} |`;
  });
}

function renderSkillMap() {
  const out = ["| Agent | Skills its definition names |", "|---|---|", ...skillMapRows(localAgents, localSkills)];
  for (const p of PLUGINS) {
    const { agents, skills } = plugin[p.name];
    if (!agents.length || !skills.length) continue;
    for (const row of skillMapRows(agents, skills)) out.push(row.replace(/^\| `([^`]+)`/, `| \`${p.name}:$1\``));
  }
  return [...out, ""];
}

function agentTable(agents, prefix = "") {
  const out = ["| Agent | Model | Color | What it does |", "|---|---|---|---|"];
  for (const a of agents)
    out.push(`| \`${prefix}${a.name}\` | ${a.fm.model ?? "—"} | ${a.fm.color ?? "—"} | ${summary(a.fm.description)} |`);
  return out;
}

const renderAgents = () => [...agentTable(localAgents), ""];

function renderPluginAgents() {
  const out = [];
  for (const p of PLUGINS) {
    const agents = plugin[p.name].agents;
    if (!agents.length) continue;
    out.push(`### \`${p.name}\` — \`${p.dir}/agents/\` (picker name \`${p.name}:<agent>\`)`, "", ...agentTable(agents), "");
  }
  return out;
}

function commandTable(cmds) {
  const out = ["| Command | Arguments | What it does |", "|---|---|---|"];
  for (const c of cmds) {
    const hint = c.fm["argument-hint"] ? `\`${String(c.fm["argument-hint"]).replace(/\|/g, "\\|")}\`` : "—";
    out.push(`| \`/${c.name}\` | ${hint} | ${summary(c.fm.description)} |`);
  }
  return out;
}

const renderCommands = () => [...commandTable(localCommands), ""];

function renderPluginCommands() {
  const out = [];
  for (const p of PLUGINS) {
    const cmds = plugin[p.name].commands;
    if (!cmds.length) continue;
    out.push(`### \`${p.name}\` — \`${p.dir}/commands/\``, "", ...commandTable(cmds), "");
  }
  return out;
}

function renderSuites() {
  const manifest = JSON.parse(rd("config/test-suites.json"));
  const suites = Array.isArray(manifest.suites) ? manifest.suites : Object.values(manifest.suites);
  const byLayer = { Frontend: new Map(), Backend: new Map() };
  for (const s of suites) {
    const m = String(s.file ?? "").match(/^regression\/suites\/(Frontend|Backend)\/([^/]+)\//);
    const layer = m ? m[1] : null;
    if (!layer) continue;
    if (!byLayer[layer].has(m[2])) byLayer[layer].set(m[2], []);
    byLayer[layer].get(m[2]).push(s);
  }
  const out = [];
  for (const layer of ["Frontend", "Backend"]) {
    out.push(`## ${layer}`, "", "| Module | Suites |", "|--------|--------|");
    for (const mod of [...byLayer[layer].keys()].sort()) {
      const cells = byLayer[layer]
        .get(mod)
        .sort((a, b) => String(a.id).localeCompare(String(b.id), "en", { numeric: true }))
        .map((s) => `${s.id} ${String(s.name).replace(/\|/g, "\\|")} (${s.priority ?? "—"})`);
      out.push(`| \`${mod}/\` | ${cells.join(" · ")} |`);
    }
    out.push("");
  }
  return out;
}

// ---------------------------------------------------------------- blocks

const BLOCKS = [
  { id: "skills", file: ".claude/skills/README.md", render: renderSkills },
  { id: "plugin-skills", file: ".claude/skills/README.md", render: renderPluginSkills },
  { id: "agent-skill-map", file: ".claude/skills/README.md", render: renderSkillMap },
  { id: "agents", file: ".claude/knowledge/agents/README.md", render: renderAgents },
  { id: "plugin-agents", file: ".claude/knowledge/agents/README.md", render: renderPluginAgents },
  { id: "commands", file: ".claude/knowledge/agents/README.md", render: renderCommands },
  { id: "plugin-commands", file: ".claude/knowledge/agents/README.md", render: renderPluginCommands },
  { id: "suites", file: "regression/suites/README.md", render: renderSuites },
];

const begin = (id) => `<!-- BEGIN GENERATED: ${id} — npm run docs:index -->`;
const end = (id) => `<!-- END GENERATED: ${id} -->`;
const NOTE = "_Generated by `npm run docs:index` — **do not hand-edit**; fix a row in the component it describes._";

const pending = new Map(); // file -> text, so several blocks in one file are written once
let blocksChecked = 0;

for (const b of BLOCKS) {
  const text = pending.get(b.file) ?? rd(b.file);
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const norm = text.replace(/\r\n/g, "\n");
  const bi = norm.indexOf(begin(b.id));
  const ei = norm.indexOf(end(b.id));
  if (bi === -1 || ei === -1 || ei < bi) {
    findings.push({ code: "DOC-IDX-003", file: b.file, msg: `missing markers for block "${b.id}"` });
    continue;
  }
  blocksChecked++;
  const block = [begin(b.id), "", NOTE, "", ...b.render(), end(b.id)].join("\n");
  const current = norm.slice(bi, ei + end(b.id).length);
  if (current === block) continue;
  if (check) {
    findings.push({ code: "DOC-IDX-001", file: b.file, msg: `block "${b.id}" is stale — run \`npm run docs:index\`` });
  } else {
    pending.set(b.file, (norm.slice(0, bi) + block + norm.slice(ei + end(b.id).length)).replace(/\n/g, eol));
  }
}

for (const [file, text] of pending) writeFileSync(join(ROOT, file), text, "utf8");

// ---------------------------------------------------------------- coverage of the hand-written indexes

const slash = (n) => `/${n}`;
const COVERAGE = [
  { file: ".claude/ROUTING.md", what: "command", names: localCommands.map((c) => c.name), form: slash },
  { file: ".claude/ROUTING.md", what: "skill", names: localSkills.map((s) => s.name), form: slash },
  { file: ".claude/ROUTING.md", what: "agent", names: localAgents.map((a) => a.name), form: (n) => n },
  {
    file: ".claude/ROUTING.md",
    what: "plugin command",
    names: PLUGINS.flatMap((p) => plugin[p.name].commands.map((c) => c.name)),
    form: slash,
  },
  ...[".claude/ROUTING.md", "INDEX.md", "README.md"].map((file) => ({
    file,
    what: "plugin",
    names: PLUGINS.map((p) => p.name),
    form: (n) => n,
  })),
  {
    file: "docs/decisions/README.md",
    what: "decision record",
    names: ls("docs/decisions").filter((f) => f.endsWith(".md") && f !== "README.md"),
    form: (n) => n,
  },
];

let coverageChecked = 0;
for (const c of COVERAGE) {
  if (!existsSync(join(ROOT, c.file))) {
    findings.push({ code: "DOC-IDX-002", file: c.file, msg: "the index file itself is missing" });
    continue;
  }
  const text = rd(c.file);
  for (const n of c.names) {
    coverageChecked++;
    const needle = c.form(n);
    const hit = needle.startsWith("/")
      ? new RegExp(`${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9-]|$)`).test(text)
      : mentions(text, needle);
    if (!hit) findings.push({ code: "DOC-IDX-002", file: c.file, msg: `never mentions the ${c.what} \`${needle}\`` });
  }
}

// ---------------------------------------------------------------- report

if (json) {
  console.log(JSON.stringify({ blocks: blocksChecked, written: [...pending.keys()], coverageChecked, findings }, null, 2));
} else {
  const mode = check ? "docs:index:check" : "docs:index";
  console.log(`[${mode}] ${blocksChecked} generated block(s), ${coverageChecked} coverage mention(s)`);
  for (const f of pending.keys()) console.log(`  wrote  ${f}`);
  for (const f of findings) console.log(`  ${f.code}  ${f.file}  ${f.msg}`);
  if (!findings.length) console.log(`[${mode}] OK — ${check ? "every index is current" : "indexes written"}`);
}

process.exit(findings.length ? 1 : 0);
