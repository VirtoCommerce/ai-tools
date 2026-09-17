// Detects Jira WIKI markup in a body that must be MARKDOWN.
//
// Rule source: .claude/knowledge/execution/tracker-ops.md §5a — "Body format —
// Markdown, NOT Jira wiki markup (VCST-5212)".
//
// WHY A SHARED MODULE. This detection is used by the helper script AND by the
// PreToolUse hook. Two copies of a regex is two things to drift; the incident
// this guards against (2026-09-17, VCST-5378 comment 109823 — a whole report
// posted as `h2.`/`||`/`{code}` and rendered as literal text) happened because a
// rule was stated in one place and applied in none.
//
// NARROW BY DESIGN. Jira wiki image syntax `!file.png|width=700!` is REQUIRED for
// attachments (§5c), and `{{VAR}}` is this repo's own test-data token syntax
// (.claude/rules/test-data.md). Neither may be flagged. Only constructs that are
// unambiguously wiki AND never legitimate in a Markdown body are reported:
// headings (`h1.`–`h6.`), block macros ({code}/{noformat}/{panel}/{quote}), and
// `||` table header rows.
//
// A false positive here blocks legitimate work, so the bar is "cannot be anything
// else", not "looks suspicious".

/** @typedef {{ token: string, line: number, text: string, hint: string }} WikiHit */

const PATTERNS = [
  { token: "h1.–h6. heading", re: /^\s{0,3}h[1-6]\.\s+\S/, hint: "use `#`, `##`, `###` …" },
  { token: "{code} / {noformat} block", re: /^\s*\{(code|noformat)(:[^}]*)?\}/, hint: "use a ``` fenced block" },
  { token: "{panel} / {quote} block", re: /^\s*\{(panel|quote)(:[^}]*)?\}/, hint: "use `>` blockquote" },
  { token: "|| table header row", re: /^\s*\|\|.*\|\|/, hint: "use `| a | b |` with a `| --- | --- |` separator" },
];

/**
 * @param {string} body
 * @returns {WikiHit[]} every distinct wiki construct found, with its line number
 */
export function findWikiMarkup(body) {
  if (typeof body !== "string" || !body) return [];
  const lines = body.split(/\r?\n/);
  /** @type {WikiHit[]} */
  const hits = [];
  const seen = new Set();
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // never inspect inside a markdown fence — a doc may legitimately QUOTE wiki markup
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    for (const p of PATTERNS) {
      if (p.re.test(line) && !seen.has(p.token)) {
        seen.add(p.token);
        hits.push({ token: p.token, line: i + 1, text: line.trim().slice(0, 80), hint: p.hint });
      }
    }
  }
  return hits;
}

/**
 * @param {string} body
 * @returns {string|null} a ready-to-print refusal, or null when the body is fine
 */
export function wikiMarkupRefusal(body) {
  const hits = findWikiMarkup(body);
  if (!hits.length) return null;
  const rows = hits.map(h => `    line ${String(h.line).padStart(4)}  ${h.token}\n              ${h.text}\n              → ${h.hint}`).join("\n");
  return (
    `This body is Jira WIKI markup, but this Jira renders MARKDOWN — it would post 200 OK and ` +
    `display as literal text.\n\n${rows}\n\n` +
    `    Rule: .claude/knowledge/execution/tracker-ops.md §5a (VCST-5212).\n` +
    `    Note: image syntax !file.png|width=700! is CORRECT and is not flagged (§5c).`
  );
}
