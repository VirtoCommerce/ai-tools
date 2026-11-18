// One brief per planned agent, under agents/<id>.md in the units directory: its files with their
// tier and reasons, what to read, its part of impact.md, the risk questions its files matched, its
// lens sections from lenses.md, the inputs its lenses need, and the shared rules (agent-brief.md).
// Each agent reads its own brief and nothing it does not need: every turn re-reads the whole context,
// so a lean brief is the cheapest saving there is.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { impactMarkdown } from "./impact.mjs";

const SKILL_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const code = (s) => "`" + String(s).replace(/`/g, "'") + "`";

// `## name` sections of lenses.md, and the shared "Not a finding" section.
export function lensSections(text) {
  const out = new Map();
  const parts = text.split(/^(?=## )/m).slice(1);
  for (const p of parts) out.set(p.match(/^## (\S+)/)[1], p.trim());
  return out;
}

const STYLE_RULES = ["styles.md", "designs-and-presets.md", "ui-kit.md", "ui-kit-internals.md", "markup.md"];

// r: the classify result; questions: parsed risk questions (id, text); opts.lenses / opts.common: the
// texts of lenses.md and agent-brief.md (read from the skill when not given).
export function agentBriefs(r, questions, { lenses = readFileSync(path.join(SKILL_DIR, "lenses.md"), "utf8"), common = readFileSync(path.join(SKILL_DIR, "agent-brief.md"), "utf8") } = {}) {
  const sections = lensSections(lenses);
  const shared = [...sections.entries()].find(([k]) => k === "Not")?.[1] ?? "";
  const byPath = new Map(r.files.map((f) => [f.path, f]));
  const qText = new Map(questions.map((q) => [q.id, q.text]));
  const out = new Map();
  for (const a of r.plan?.agents ?? []) {
    const files = a.files.map((p) => byPath.get(p)).filter(Boolean);
    const mine = new Set(a.files);
    const lines = [`# Review agent ${a.id}: ${a.kind}${a.cluster ? ` — ${a.cluster}` : ""}`, "", `Lenses: ${a.lenses.join(", ") || "—"}. Model: ${a.model}.`];

    lines.push("", "## Your files", "", "Review only these; your diffs may hold others.", "", "| Tier | File | Why |", "|---|---|---|");
    for (const f of files) lines.push(`| ${f.tier} | ${code(f.path)} (${f.status}, +${f.added}/−${f.deleted}) | ${f.reasons.join("; ")} |`);

    const rules = (r.rules ?? []).filter((x) => x.files.some((p) => mine.has(p))).map((x) => `rules/${x.file}`);
    lines.push("", "## Read first", "", `- Diffs: ${a.diffFiles.map(code).join(", ")} (units directory).`, "- Each file before the change: `base/<path>` (units directory); after it: the repository.");
    if (rules.length) lines.push(`- Rules that apply to your files (base branch): ${rules.map(code).join(", ")}, and \`rules/CLAUDE.md\`.`);

    const impact = (r.impact ?? []).filter((e) => mine.has(e.path));
    if (impact.length && a.kind !== "global") lines.push("", impactMarkdown(impact).replace(/^# Impact map/, "## Impact of your hunks").trim());

    const qs = [...new Set(files.flatMap((f) => f.questions ?? []))].filter((id) => qText.has(id));
    if (qs.length) {
      lines.push("", "## Risk questions your files matched", "", "The orchestrator's message says which it answered yes; check those first, but every one applies.");
      for (const id of qs) lines.push("", qText.get(id), "", `Your files: ${files.filter((f) => f.questions?.includes(id)).map((f) => code(f.path)).join(", ")}`);
    }

    if (a.lenses.includes("consumers") || a.kind === "consumers") {
      lines.push("", "## Consumers of your files");
      for (const f of files) lines.push(`- ${code(f.path)}: ${f.consumers.length ? f.consumers.map(code).join(", ") : "none in this repository"}${f.external.length ? `; visible outside: ${f.external.join("; ")}` : ""}`);
    }
    if (a.lenses.includes("conventions")) {
      const hits = (r.checks ?? []).filter((c) => mine.has(c.path));
      lines.push("", "## Script checks on your files", "", hits.length ? "Literal rule hits on added lines: confirm or drop each, do not hunt for them again." : "None.");
      for (const c of hits) lines.push(`- ${code(`${c.path}:${c.line}`)} ${c.check} (${c.rule}: ${c.says}): ${code(c.text)}`);
    }
    if (a.lenses.includes("styles")) {
      const styled = files.filter((f) => f.styling).map((f) => code(f.path));
      lines.push("", "## Styling inputs", "", `- Files with styling lines: ${styled.join(", ") || "none"}.`, `- Style rules: ${STYLE_RULES.map((n) => code(`rules/.claude/rules/${n}`)).join(", ")} (those that exist).`);
      if (r.tokens?.length) lines.push(`- Changed tokens: ${r.tokens.map((t) => code(t.name)).join(", ")}; users in the classification JSON (\`tokens\`).`);
    }

    lines.push("", "## Your lenses", "");
    for (const l of a.lenses) if (sections.has(l)) lines.push(sections.get(l), "");
    if (shared) lines.push(shared, "");
    lines.push(common.trim());
    out.set(a.id, lines.join("\n") + "\n");
  }
  return out;
}
