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
 * WHAT IT READS: GIT-TRACKED FILES ONLY. Every listing (components, a skill's supporting files,
 * decision records) comes from `git ls-files`, never the disk — a `.DS_Store`, a `bin/` from a local
 * build or an untracked scratch file would otherwise be written into a row locally and then fail the
 * check on CI's clean checkout. So `git add` a new component before running `npm run docs:index`.
 *
 * WHAT IT DOES NOT DO. It never writes a description. A row's text is the first sentence of the
 * component's own `description:` (its `[Category]` tag dropped), so a wrong row is fixed in that
 * component's frontmatter, not here — the same rule `gen-knowledge-index.mjs` applies to scope lines.
 * And it never degrades quietly: a source it cannot read fails, rather than rendering a "—" row.
 *
 * CHECKS
 *   DOC-IDX-001  a generated block differs from what the sources derive        (hard, --check only)
 *   DOC-IDX-002  a hand-written index does not mention a component it covers   (hard)
 *   DOC-IDX-003  a host file is missing a block's BEGIN/END markers            (hard)
 *   DOC-IDX-004  a component's frontmatter is missing, unparseable or has no description  (hard)
 *   DOC-IDX-005  a manifest suite is filed where the suites roster has no row for it      (hard)
 */

import "../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { firstSentence, splitFrontmatter, spliceBlock } from "../lib/doc-index.mjs";

// fileURLToPath, not .pathname — the repo path has a space ("My Projects"), see gen-knowledge-index.mjs.
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const check = process.argv.includes("--check");
const json = process.argv.includes("--json");
const MAX_TEXT = 160;
const findings = [];

const rd = (rel) => readFileSync(join(ROOT, rel), "utf8");

// -z: no path quoting, so a non-ASCII or spaced name arrives verbatim. A git failure throws — a silent
// fallback to the disk listing would bring back exactly the machine-dependence this exists to remove.
const TRACKED = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 })
  .split("\0")
  .filter(Boolean);
const IS_TRACKED = new Set(TRACKED);

/** The tracked immediate children of a folder, dotfiles excluded: [{ name, dir }], sorted by name. */
function children(rel) {
  const prefix = `${rel}/`;
  const seen = new Map();
  for (const p of TRACKED) {
    if (!p.startsWith(prefix)) continue;
    const rest = p.slice(prefix.length);
    const cut = rest.indexOf("/");
    const name = cut === -1 ? rest : rest.slice(0, cut);
    if (!name.startsWith(".")) seen.set(name, seen.get(name) || cut !== -1);
  }
  return [...seen.keys()].sort().map((name) => ({ name, dir: seen.get(name) }));
}

// ---------------------------------------------------------------- sources

/** A component's frontmatter. Anything that would degrade its row is a finding, never a quiet `{}`. */
function frontmatter(rel) {
  const fail = (why) => {
    findings.push({ code: "DOC-IDX-004", file: rel, msg: why });
    return {};
  };
  const raw = rd(rel);
  if (raw.charCodeAt(0) === 0xfeff) return fail("starts with a UTF-8 BOM, so the `---` fence is not at byte 0");
  const { fm } = splitFrontmatter(raw.replace(/\r\n/g, "\n"));
  if (fm === null) return fail("no frontmatter — the file must open with a closed `---` fence");
  let data;
  try {
    data = YAML.parse(fm);
  } catch (e) {
    return fail(`frontmatter is not valid YAML — ${String(e.message).split("\n")[0].replace(/:\s*$/, "")}`);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return fail("frontmatter is not a key/value mapping");
  if (!String(data.description ?? "").trim()) return fail("frontmatter has no `description`");
  return data;
}

const TAG_RE = /^\s*\[([A-Za-z ]+)\]\s*/;
// The two spellings of one category (skills/README.md says so); the tag is the category, not a label.
const TAG_ALIAS = { "QA Method": "QA Methodology" };

/** Text safe inside a table cell: `|` escaped, and `<`/`>` escaped outside code spans. */
function cell(text) {
  // Outside code spans a bare `<X.Y>` is an HTML tag to GitHub's renderer — the text vanishes.
  return String(text)
    .split(/(`[^`]*`)/)
    .map((part, i) => (i % 2 ? part : part.replace(/</g, "&lt;").replace(/>/g, "&gt;")))
    .join("")
    .replace(/\|/g, "\\|");
}

/** First sentence of a description, tag dropped, safe inside a table cell. */
function summary(desc) {
  let t = firstSentence(String(desc ?? "").replace(TAG_RE, "").replace(/\s+/g, " ").trim(), MAX_TEXT);
  // A cut can land inside a code span; an unclosed backtick swallows the rest of the table.
  if ((t.match(/`/g) ?? []).length % 2) t += "`";
  return cell(t) || "—";
}

const tagOf = (desc) => {
  const m = String(desc ?? "").match(TAG_RE);
  return m ? (TAG_ALIAS[m[1]] ?? m[1]) : null;
};

function skillsIn(dirRel) {
  return children(dirRel)
    .filter((c) => c.dir && IS_TRACKED.has(`${dirRel}/${c.name}/SKILL.md`))
    .map(({ name }) => {
      const fm = frontmatter(`${dirRel}/${name}/SKILL.md`);
      const support = children(`${dirRel}/${name}`)
        .filter((c) => c.name !== "SKILL.md")
        .map((c) => (c.dir ? `${c.name}/` : c.name));
      return { name, tag: tagOf(fm.description), text: summary(fm.description), support };
    });
}

function mdComponents(dirRel) {
  return children(dirRel)
    .filter((c) => !c.dir && c.name.endsWith(".md") && c.name !== "README.md")
    .map(({ name: f }) => ({ name: f.replace(/\.md$/, ""), fm: frontmatter(`${dirRel}/${f}`), rel: `${dirRel}/${f}` }))
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

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** `name` as a whole word — `perf-analyst` matches in `vc-perf:perf-analyst`, not in `perf-analyst-v2`. */
const mentions = (text, name) => new RegExp(`(^|[^a-z0-9-])${esc(name)}([^a-z0-9-]|$)`).test(text);
/**
 * `/name` used as an invocation, not as part of a path: `.claude/skills/qa-design/x.md`,
 * `commands/qa-test.md` and `https://host/qa-test/` all contain `/qa-design` or `/qa-test` but name a file.
 */
const invokes = (text, name) =>
  new RegExp(`(^|[^A-Za-z0-9_./~-])/${esc(name)}(?![A-Za-z0-9_/-]|\\.[A-Za-z])`).test(text);
// No Agent → Skill map is generated. Nothing declares that relationship (no agent lists its skills in
// frontmatter, and Claude Code's `skills:` key PRELOADS skills, so it is not one to add for an index),
// and every text rule tried on the agent bodies was wrong both ways: a bare word or a `/qa-test` counts
// the pipeline that DISPATCHES the agent, while excluding command names drops real invocations such as
// `/qa-seed-data`. skills/README.md points at the agent definitions instead.

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
    if (!m) {
      // Dropping it would shorten the roster while the check stays green — the lag this script exists to catch.
      findings.push({
        code: "DOC-IDX-005",
        file: "config/test-suites.json",
        msg: `suite ${s.id} (\`${s.file}\`) is not under regression/suites/{Frontend,Backend}/<module>/ — the roster has no row for it`,
      });
      continue;
    }
    if (!byLayer[m[1]].has(m[2])) byLayer[m[1]].set(m[2], []);
    byLayer[m[1]].get(m[2]).push(s);
  }
  const out = [];
  for (const layer of ["Frontend", "Backend"]) {
    out.push(`## ${layer}`, "", "| Module | Suites |", "|--------|--------|");
    for (const mod of [...byLayer[layer].keys()].sort()) {
      const cells = byLayer[layer]
        .get(mod)
        .sort((a, b) => String(a.id).localeCompare(String(b.id), "en", { numeric: true }))
        .map((s) => `${s.id} ${cell(s.name)} (${s.priority ?? "—"})`);
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
  const block = [begin(b.id), "", NOTE, "", ...b.render(), end(b.id)].join("\n");
  const spliced = spliceBlock(norm, begin(b.id), end(b.id), block);
  if (!spliced) {
    findings.push({ code: "DOC-IDX-003", file: b.file, msg: `missing markers for block "${b.id}"` });
    continue;
  }
  blocksChecked++;
  if (spliced.current === block) continue;
  if (check) {
    findings.push({ code: "DOC-IDX-001", file: b.file, msg: `block "${b.id}" is stale — run \`npm run docs:index\`` });
  } else {
    pending.set(b.file, spliced.next.replace(/\n/g, eol));
  }
}

for (const [file, text] of pending) writeFileSync(join(ROOT, file), text, "utf8");

// ---------------------------------------------------------------- coverage of the hand-written indexes

// Each entry: an index file and the names it must cover, each with how a mention is recognised. A slash
// name is covered only where it is USED as one — a path to the component's own file is not the "when to
// reach for it" a hand-written index exists to say. A plugin's skill or command also counts in its
// namespaced form (`/vc-secrets:doctor`), which is how a short name like `/install` is really invoked.
const asSlash = (name, pluginName) => ({
  label: `/${name}`,
  hit: (text) => invokes(text, name) || (pluginName !== undefined && invokes(text, `${pluginName}:${name}`)),
});
// A bare word: an agent, a plugin, a file name. `vc-perf:perf-analyst` (the picker form) contains it too.
const asWord = (name) => ({ label: name, hit: (text) => mentions(text, name) });
const fromPlugins = (kind, as) => PLUGINS.flatMap((p) => plugin[p.name][kind].map((c) => as(c.name, p.name)));

const COVERAGE = [
  { file: ".claude/ROUTING.md", what: "command", names: localCommands.map((c) => asSlash(c.name)) },
  { file: ".claude/ROUTING.md", what: "skill", names: localSkills.map((s) => asSlash(s.name)) },
  { file: ".claude/ROUTING.md", what: "agent", names: localAgents.map((a) => asWord(a.name)) },
  { file: ".claude/ROUTING.md", what: "plugin command", names: fromPlugins("commands", asSlash) },
  { file: ".claude/ROUTING.md", what: "plugin skill", names: fromPlugins("skills", asSlash) },
  { file: ".claude/ROUTING.md", what: "plugin agent", names: fromPlugins("agents", asWord) },
  ...[".claude/ROUTING.md", "INDEX.md", "README.md"].map((file) => ({
    file,
    what: "plugin",
    names: PLUGINS.map((p) => asWord(p.name)),
  })),
  {
    file: "docs/decisions/README.md",
    what: "decision record",
    names: children("docs/decisions")
      .map((c) => c.name)
      .filter((f) => f.endsWith(".md") && f !== "README.md")
      .map((f) => asWord(f)),
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
    if (!n.hit(text)) findings.push({ code: "DOC-IDX-002", file: c.file, msg: `never mentions the ${c.what} \`${n.label}\`` });
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
