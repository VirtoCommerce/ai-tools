// .claude/skills/ticket-context/lib/agent-output.mjs — reads an analyst's returned JSON from its own transcript, so the
// orchestrator saves it with `cli.mjs save` instead of retyping it (a retyped 25 KB output is paid twice: as the
// orchestrator's output and in every later turn's context — measured on the vc-test dry run, VCST-5904).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const AGENT_ID_RE = /^[A-Za-z0-9_-]+$/;
/** Claude Code's projects folder: under CLAUDE_CONFIG_DIR when it is set, else ~/.claude. */
export const projectsRoot = () => join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "projects");
const subdirs = (dir) => { try { return readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => join(dir, d.name)); } catch { return []; } };

/** The returned JSON object, as text: the last SubagentHandback message, else the last assistant message's text. */
export function extractAgentOutput(lines) {
  const records = lines.flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } }).filter((r) => r.type === "assistant");
  let candidate = null;
  for (const r of records) for (const b of r.message?.content ?? []) {
    if (b.type === "tool_use" && b.name === "SubagentHandback" && typeof b.input?.message === "string") candidate = b.input.message;
  }
  if (candidate === null) {
    const lastId = records.filter((r) => (r.message?.content ?? []).some((b) => b.type === "text")).at(-1)?.message?.id;
    if (lastId !== undefined) candidate = records.filter((r) => r.message?.id === lastId)
      .flatMap((r) => r.message.content.filter((b) => b.type === "text").map((b) => b.text)).join("");
  }
  if (candidate === null) return null;
  const text = candidate.trim().replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/, "").trim();
  try { const v = JSON.parse(text); return v && typeof v === "object" && !Array.isArray(v) ? text : null; } catch { return null; }
}

/**
 * `<projects>/<any project>/<any session>/subagents/agent-<id>.jsonl`, newest first; null when there is none. Every
 * project folder is searched, not the one the cwd names: the session's folder is keyed by where it STARTED, so a `cd`
 * or a worktree entered mid-session would miss it. An agent id is unique, so this finds one file.
 */
export function findAgentTranscript(agentId, { projectsDir = projectsRoot() } = {}) {
  if (!AGENT_ID_RE.test(String(agentId))) throw new Error(`not an agent id: "${agentId}"`);
  const hits = subdirs(projectsDir).flatMap(subdirs)
    .map((session) => join(session, "subagents", `agent-${agentId}.jsonl`)).filter((p) => existsSync(p));
  return hits.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0] ?? null;
}

export const readTranscript = (path) => readFileSync(path, "utf8").split("\n").filter(Boolean);
