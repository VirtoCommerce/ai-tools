/**
 * scripts/lib/knowledge-base.mjs
 *
 * WHERE THE PLATFORM KNOWLEDGE LIVES — one answer, for every script that reads it.
 *
 * The oracles, the domain maps and the API references describe the PLATFORM, not this repository's
 * runs. What would make them untrue is a change out there, not a change in here, so they belong in
 * the knowledge base and travel with it: a machine that has run `kb sync` has them, whether or not
 * it has a checkout of this repository.
 *
 * TWO ROLES, KEPT APART, because conflating them is how a machine path ends up in text an agent
 * reads:
 *
 *   knowledgePath(rel)   the absolute path to OPEN. Machine-specific, resolved per call.
 *   knowledgeLabel(rel)  what to PRINT. Stable, identical on every machine, and what a reader or a
 *                        `@kb` citation should carry.
 *
 * `extract-bl.ts` needs both in the same function: it reads the oracle and stamps its output with
 * "verbatim slice of …". Before this file existed the same constant did both jobs, which was
 * harmless only while the file sat at a repo-relative path.
 *
 * THE BASE IS THE ONE VC-KB ALREADY RESOLVES. This imports `plugins/vc-kb/src/base.mjs` rather than
 * re-deriving the order, because two answers to "where is the base" is the failure the whole
 * arrangement is built to avoid — and a second copy of the rule would drift within a release.
 * `--base` is not available here (these are npm scripts, not the door), so it resolves
 * `KB_BASE` -> `knowledgeBase.path` -> `~/.claude/vc-knowledge`.
 *
 * A MISSING BASE IS AN ERROR, LOUDLY, AND NEVER AN EMPTY RESULT. Until the move, these files were
 * in the checkout and therefore always present; afterwards they need `kb sync`. A script that
 * returned "no invariants for this domain" because the corpus was absent would report an outage as
 * a gap in the knowledge — and a gap is the signal that means "go find out and write it down". That
 * is the same three-states-not-two rule `src/base.mjs` is built around, reaching one layer out.
 */
import { existsSync } from "node:fs";
import { join, posix } from "node:path";

import { resolveBase, baseNotFoundMessage } from "../../plugins/vc-kb/src/base.mjs";

/** The knowledge tree's name INSIDE the base. The layout under it is unchanged from `.claude/`. */
export const KNOWLEDGE_DIR = "knowledge";

export class KnowledgeBaseMissing extends Error {
  constructor(message) {
    super(message);
    this.name = "KnowledgeBaseMissing";
  }
}

/**
 * Said once, with the remedy first. Everything downstream throws this rather than inventing its own
 * wording, so "the base is not here" reads the same whoever hit it.
 * @param {string} [rel] the file that was wanted, named so the reader knows what they are missing
 * @returns {string}
 */
export function knowledgeMissingMessage(rel) {
  const want = rel ? `\n\nWanted: ${knowledgeLabel(rel)}` : "";
  return `${baseNotFoundMessage()}${want}`;
}

/**
 * The absolute path of a file in the base's knowledge tree.
 * @param {string} rel e.g. "oracles/business-logic.md"
 * @returns {string} absolute path
 * @throws {KnowledgeBaseMissing} when no base resolves — never a silent empty answer
 */
export function knowledgePath(rel) {
  const base = resolveBase();
  if (!base) throw new KnowledgeBaseMissing(knowledgeMissingMessage(rel));
  return join(base, KNOWLEDGE_DIR, ...String(rel).split(/[/\\]+/));
}

/**
 * What to PRINT for a knowledge file: stable across machines, and the form a citation should carry.
 * Deliberately posix-separated — this is text, not a path, and a backslash in a report renders
 * differently on the machine that reads it than on the one that wrote it.
 * @param {string} rel
 * @returns {string} e.g. "knowledge/oracles/business-logic.md"
 */
export function knowledgeLabel(rel) {
  return posix.join(KNOWLEDGE_DIR, ...String(rel).split(/[/\\]+/));
}

/**
 * Is the base reachable and does it hold this file? For a caller that wants to REPORT the absence
 * itself rather than throw — a readiness table, or a gate that must distinguish "not applicable"
 * from "failed". Everything that needs the file should use `knowledgePath` and let it throw.
 * @param {string} rel
 * @returns {boolean}
 */
export function knowledgeExists(rel) {
  try {
    return existsSync(knowledgePath(rel));
  } catch {
    return false;
  }
}

/** The knowledge tree's root, for a caller that enumerates a directory rather than naming a file. */
export function knowledgeRoot() {
  const base = resolveBase();
  if (!base) throw new KnowledgeBaseMissing(knowledgeMissingMessage());
  return join(base, KNOWLEDGE_DIR);
}
