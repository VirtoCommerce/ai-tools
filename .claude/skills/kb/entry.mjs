/**
 * skills/kb/entry.mjs — the entry contract (D2).
 *
 * One knowledge entry = one markdown file: a frontmatter block carrying the TYPED,
 * machine-checked half, then a free-text body carrying the human half. Everything
 * downstream (index, resolver, exam, capture, consolidation, drift) reads entries
 * only through this module, so the contract has exactly one definition.
 *
 * Why a hand-rolled frontmatter parser instead of a YAML dependency: this toolchain
 * runs inside client installs and inside a brain repo's CI with ZERO external deps
 * (D5 — deterministic Node, no npm install step, no LLM, no environment access). The
 * accepted subset is deliberately small and fully documented below; anything outside
 * it is an ERROR, never a silent partial parse. That is the lesson of VCST-5807,
 * where an unquoted ": " inside a plain scalar made a YAML parser abandon a whole
 * frontmatter block and report empty metadata rather than fail.
 *
 * Accepted frontmatter subset (top-level keys, one level of nesting):
 *   key: scalar            plain, 'single-quoted' or "double-quoted"
 *   key: [a, b, c]         inline list
 *   key: |                 literal block scalar (newlines preserved, dedented)
 *   key:                   followed by indented "- item" list
 *   key:                   followed by indented "sub: value" map (ONE level)
 *   # comment              whole-line comments only
 *
 * Two validation profiles, because a draft is not yet an entry:
 *   "entry" — a curated entry in confirmed/: id, title, scope, kind, appliesTo,
 *             audited, relation, status.
 *   "draft" — an observation in drafts/: kind, scope, subject, claim, evidence,
 *             fingerprint, status:draft, count. It has NO id — ids are a citation
 *             contract and are minted only when consolidation confirms an entry.
 *
 * Rule IDs are stable so tests and reports can name a failure:
 *   KBE-001 missing required field          KBE-007 malformed appliesTo range
 *   KBE-002 value outside closed vocabulary KBE-008 malformed audited stamp
 *   KBE-003 malformed relation              KBE-009 missing/unterminated frontmatter
 *   KBE-004 override without quotes         KBE-010 empty body
 *   KBE-005 suppress without reason         KBE-011 unknown field (closed schema)
 *   KBE-006 malformed id                    KBE-012 malformed evidence block
 */

/* ---------------------------------------------------------------- vocabularies */

/** Each kind has its own lifetime and its own verification method (D2). */
export const KINDS = Object.freeze(["invariant", "flow", "locator", "quirk", "module"]);
export const SCOPES = Object.freeze(["platform", "client"]);
/** "draft" is legal only in the draft profile; superseded/retired are never deleted. */
export const STATUSES = Object.freeze(["active", "superseded", "retired", "draft"]);
export const RELATION_VERBS = Object.freeze(["new", "override", "extend", "suppress"]);
/** How a fact was verified. audited.source and evidence.method share this vocabulary. */
export const EVIDENCE_METHODS = Object.freeze(["docs", "live", "source"]);

const ID_RE = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+(?:\.\d+)?[A-Z]?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** "*" or space-separated semver comparators, e.g. ">=3.800.0 <4.0.0". */
const RANGE_RE =
  /^(\*|(?:(?:>=|<=|>|<|=|\^|~)?\d+\.\d+(?:\.\d+)?)(?:\s+(?:(?:>=|<=|>|<|=|\^|~)?\d+\.\d+(?:\.\d+)?))*)$/;

const ENTRY_FIELDS = Object.freeze([
  "id", "title", "scope", "kind", "appliesTo", "audited", "relation", "status",
  "tags", "quotes", "reason", "supersedes", "supersededBy", "retiredReason",
  "fingerprint", "runId", "sourceDraft",
]);
const DRAFT_FIELDS = Object.freeze([
  "kind", "scope", "subject", "claim", "evidence", "triangulation", "fingerprint",
  "status", "count", "firstSeen", "lastSeen", "observations", "proposedId", "tags",
  "appliesTo", "title",
]);

/** Emitted in this order so a written entry is byte-stable across runs. */
const FIELD_ORDER = Object.freeze([
  "id", "proposedId", "title", "scope", "kind", "subject", "claim", "appliesTo",
  "relation", "status", "tags", "audited", "evidence", "triangulation", "quotes",
  "reason", "supersedes", "supersededBy", "retiredReason", "fingerprint", "count",
  "firstSeen", "lastSeen", "observations", "runId", "sourceDraft",
]);

const err = (code, field, message) => ({ code, field, message });

/* -------------------------------------------------------------------- parsing */

function stripQuotes(raw) {
  const s = raw.trim();
  if (s.length >= 2 && ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'")))) {
    return s.slice(1, -1);
  }
  return s;
}

function parseInlineList(raw) {
  const inner = raw.trim().slice(1, -1).trim();
  if (!inner) return [];
  return inner.split(",").map((s) => stripQuotes(s)).filter((s) => s.length > 0);
}

/**
 * A frontmatter value. An UNQUOTED number or boolean is coerced to its type — a draft's
 * `count` has to come back as a number, or a consumer doing `count + 1` silently gets
 * "21". Quoting is how an author says "keep this a string" (`appliesTo: ">=3.800.0"`),
 * so a quoted value is never coerced.
 */
function scalar(raw) {
  const s = raw.trim();
  if (s.startsWith("[") && s.endsWith("]")) return parseInlineList(s);
  const quoted = s.length >= 2 && ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'")));
  if (quoted) return stripQuotes(s);
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s === "true") return true;
  if (s === "false") return false;
  return s;
}

const indentOf = (line) => line.length - line.trimStart().length;

/**
 * Parse the leading "---" frontmatter block.
 * @returns {{data: object|null, body: string, bodyStartLine: number, fenceEndLine: number, errors: object[]}}
 *          Line numbers are 1-based; bodyStartLine is the first body line.
 */
export function parseFrontmatter(text) {
  const lines = String(text).replace(/\r\n/g, "\n").split("\n");
  const errors = [];
  if (lines[0]?.trim() !== "---") {
    return {
      data: null, body: text, bodyStartLine: 1, fenceEndLine: 0,
      errors: [err("KBE-009", "", "file does not start with a `---` frontmatter fence")],
    };
  }
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") { end = i; break; }
  }
  if (end === -1) {
    return {
      data: null, body: "", bodyStartLine: 1, fenceEndLine: 0,
      errors: [err("KBE-009", "", "frontmatter fence opened but never closed")],
    };
  }

  const data = {};
  let i = 1;
  while (i < end) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) { i++; continue; }
    if (indentOf(line) > 0) {
      errors.push(err("KBE-009", "", "line " + (i + 1) + ": unexpected indented line outside a nested block"));
      i++;
      continue;
    }
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (!m) {
      errors.push(err("KBE-009", "", "line " + (i + 1) + ": not a `key: value` pair — " + JSON.stringify(line.slice(0, 60))));
      i++;
      continue;
    }
    const key = m[1];
    const rest = m[2];
    if (rest.trim() === "|") {
      // Literal block: following lines indented deeper than 0, dedented by the minimum.
      const block = [];
      i++;
      while (i < end && (lines[i].trim() === "" || indentOf(lines[i]) > 0)) { block.push(lines[i]); i++; }
      while (block.length && block[block.length - 1].trim() === "") block.pop();
      const indents = block.filter((l) => l.trim()).map(indentOf);
      const pad = indents.length ? Math.min.apply(null, indents) : 0;
      data[key] = block.map((l) => (l.trim() ? l.slice(pad) : "")).join("\n");
      continue;
    }
    if (rest.trim() !== "") { data[key] = scalar(rest); i++; continue; }

    // Nested block: an indented list, an indented one-level map, or nothing.
    const nested = [];
    i++;
    while (i < end && (lines[i].trim() === "" || indentOf(lines[i]) > 0)) {
      if (lines[i].trim()) nested.push(lines[i].trim());
      i++;
    }
    if (nested.length === 0) { data[key] = ""; continue; }
    if (nested.every((l) => l.startsWith("- "))) {
      data[key] = nested.map((l) => stripQuotes(l.slice(2)));
      continue;
    }
    const obj = {};
    for (const l of nested) {
      const mm = l.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
      if (!mm) {
        errors.push(err("KBE-009", key, "nested line is not a `key: value` pair — " + JSON.stringify(l.slice(0, 60))));
        continue;
      }
      obj[mm[1]] = scalar(mm[2]);
    }
    data[key] = obj;
  }

  const body = lines.slice(end + 1).join("\n");
  return { data, body, bodyStartLine: end + 2, fenceEndLine: end + 1, errors };
}

/* ----------------------------------------------------------------- validation */

/**
 * Split a relation value into {verb, target}. "new" has no target;
 * override|extend|suppress REQUIRE one.
 * @returns {{verb: string, target: string|null}|null} null when unparsable.
 */
export function parseRelation(raw) {
  if (typeof raw !== "string") return null;
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0 || !RELATION_VERBS.includes(parts[0])) return null;
  const verb = parts[0];
  if (verb === "new") return parts.length === 1 ? { verb, target: null } : null;
  if (parts.length !== 2) return null;
  return { verb, target: parts[1] };
}

function checkEvidenceBlock(field, value, errors) {
  const code = field === "audited" ? "KBE-008" : "KBE-012";
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(err(code, field, field + " must be a nested block with a date stamp, a method and a ref"));
    return;
  }
  const dateKey = field === "audited" ? "date" : "at";
  const methodKey = field === "audited" ? "source" : "method";
  if (!DATE_RE.test(String(value[dateKey] || ""))) {
    errors.push(err(code, field, field + "." + dateKey + " must be a YYYY-MM-DD stamp"));
  }
  if (!EVIDENCE_METHODS.includes(String(value[methodKey] || ""))) {
    errors.push(err(code, field, field + "." + methodKey + " must be one of " + EVIDENCE_METHODS.join(" | ")));
  }
  if (!String(value.ref || "").trim()) {
    errors.push(err(code, field, field + ".ref must name WHERE the fact was verified (URL, file:line, run id)"));
  }
}

/**
 * Validate parsed frontmatter against one of the two profiles.
 * @param {object} data
 * @param {{profile?: "entry"|"draft"}} [opts]
 * @returns {object[]} findings; empty means valid.
 */
export function validateEntry(data, opts) {
  const profile = (opts && opts.profile) || "entry";
  const errors = [];
  if (!data || typeof data !== "object") return [err("KBE-009", "", "no frontmatter block")];

  const allowed = profile === "draft" ? DRAFT_FIELDS : ENTRY_FIELDS;
  for (const key of Object.keys(data)) {
    if (!allowed.includes(key)) {
      errors.push(err("KBE-011", key, "unknown field for the " + profile + " profile — the schema is closed (allowed: " + allowed.join(", ") + ")"));
    }
  }

  const required = profile === "draft"
    ? ["kind", "scope", "subject", "claim", "evidence", "fingerprint", "status"]
    : ["id", "title", "scope", "kind", "appliesTo", "audited", "relation", "status"];
  for (const field of required) {
    const v = data[field];
    const empty = v === undefined || v === null
      || (typeof v === "string" && !v.trim())
      || (Array.isArray(v) && v.length === 0);
    if (empty) errors.push(err("KBE-001", field, "required field `" + field + "` is missing or empty"));
  }

  if (data.scope !== undefined && !SCOPES.includes(data.scope)) {
    errors.push(err("KBE-002", "scope", "scope must be one of " + SCOPES.join(" | ") + " — got " + JSON.stringify(data.scope)));
  }
  if (data.kind !== undefined && !KINDS.includes(data.kind)) {
    errors.push(err("KBE-002", "kind", "kind must be one of " + KINDS.join(" | ") + " — got " + JSON.stringify(data.kind)));
  }
  if (data.status !== undefined && !STATUSES.includes(data.status)) {
    errors.push(err("KBE-002", "status", "status must be one of " + STATUSES.join(" | ") + " — got " + JSON.stringify(data.status)));
  }
  if (profile === "entry" && data.status === "draft") {
    errors.push(err("KBE-002", "status", "status:draft is legal only inside drafts/ — a confirmed entry is active, superseded or retired"));
  }
  if (profile === "draft" && data.status !== undefined && data.status !== "draft") {
    errors.push(err("KBE-002", "status", "a file in drafts/ must carry status:draft"));
  }

  if (profile === "entry") {
    if (data.id !== undefined && !ID_RE.test(String(data.id))) {
      errors.push(err("KBE-006", "id", "id must match " + ID_RE + " (a citation contract: never renumbered, never reused) — got " + JSON.stringify(data.id)));
    }
    if (data.appliesTo !== undefined && !RANGE_RE.test(String(data.appliesTo))) {
      errors.push(err("KBE-007", "appliesTo", 'appliesTo must be "*" or a space-separated comparator range (e.g. ">=3.800.0 <4.0.0") — got ' + JSON.stringify(data.appliesTo)));
    }
    if (data.audited !== undefined) checkEvidenceBlock("audited", data.audited, errors);

    const rel = parseRelation(data.relation);
    if (data.relation !== undefined && !rel) {
      errors.push(err("KBE-003", "relation", "relation must be `new` or `" + RELATION_VERBS.slice(1).join("|") + " <id>` — got " + JSON.stringify(data.relation)));
    } else if (rel) {
      if (rel.target && !ID_RE.test(rel.target)) {
        errors.push(err("KBE-003", "relation", "relation target " + JSON.stringify(rel.target) + " is not a valid entry id"));
      }
      if (rel.verb !== "new" && data.scope === "platform") {
        errors.push(err("KBE-003", "relation", "a platform entry cannot " + rel.verb + " another entry — override/extend/suppress express the CLIENT delta over the platform base"));
      }
      if (rel.verb === "override" && !String(data.quotes || "").trim()) {
        errors.push(err("KBE-004", "quotes", "an `override` MUST quote the verbatim platform wording it replaces — the quote is the drift sensor that flags this override when the platform entry changes"));
      }
      if (rel.verb === "suppress" && !String(data.reason || "").trim()) {
        errors.push(err("KBE-005", "reason", "a `suppress` MUST state why the platform rule is inapplicable here — a hidden rule with no reason is indistinguishable from a lost one"));
      }
    }
  } else {
    if (data.evidence !== undefined) checkEvidenceBlock("evidence", data.evidence, errors);
    if (data.proposedId !== undefined && String(data.proposedId).trim() && !ID_RE.test(String(data.proposedId))) {
      errors.push(err("KBE-006", "proposedId", "proposedId must match " + ID_RE + " — got " + JSON.stringify(data.proposedId)));
    }
    if (data.triangulation !== undefined) {
      const axes = Array.isArray(data.triangulation) ? data.triangulation : [data.triangulation];
      const bad = axes.filter((a) => !EVIDENCE_METHODS.includes(String(a)));
      if (bad.length) {
        errors.push(err("KBE-002", "triangulation", "triangulation axes must be drawn from " + EVIDENCE_METHODS.join(" | ") + " — got " + JSON.stringify(bad)));
      }
    }
  }
  return errors;
}

/**
 * Parse one entry file end to end.
 * @param {string} text  file contents
 * @param {{file?: string, profile?: "entry"|"draft"}} [opts]
 * @returns {{entry: object|null, errors: object[]}} entry is present whenever the
 *          frontmatter PARSED, even if validation failed — a superseded or an
 *          invalid entry must still be readable (supersede never deletes).
 */
export function parseEntry(text, opts) {
  const file = (opts && opts.file) || "";
  const profile = (opts && opts.profile) || "entry";
  const fm = parseFrontmatter(text);
  if (!fm.data) return { entry: null, errors: fm.errors };

  const errors = fm.errors.concat(validateEntry(fm.data, { profile }));
  if (!fm.body.trim()) {
    errors.push(err("KBE-010", "", "entry body is empty — the frontmatter is the contract, the body is the knowledge"));
  }

  const lines = String(text).replace(/\r\n/g, "\n").split("\n");
  const entry = Object.assign({}, fm.data, {
    body: fm.body.replace(/^\n+/, "").replace(/\s+$/, ""),
    file,
    startLine: fm.bodyStartLine,
    endLine: lines.length,
    relationParsed: profile === "entry" ? parseRelation(fm.data.relation) : null,
    valid: errors.length === 0,
    errors,
  });
  return { entry, errors };
}

/* --------------------------------------------------------------- serialization */

function emitValue(key, value, out) {
  if (Array.isArray(value)) {
    // An inline list splits on commas, so an item CONTAINING a comma (a captured
    // phrasing, a suppress reason) would round-trip as two items. Fall back to a block
    // list for those; keep the compact form for simple values like tags.
    const items = value.map(String);
    if (items.some((v) => v.includes(",") || v.includes("[") || v.includes("]") || v !== v.trim())) {
      out.push(key + ":");
      for (const v of items) out.push("  - " + v);
    } else {
      out.push(key + ": [" + items.join(", ") + "]");
    }
    return;
  }
  if (value && typeof value === "object") {
    out.push(key + ":");
    for (const k of Object.keys(value)) out.push("  " + k + ": " + String(value[k]));
    return;
  }
  const s = String(value);
  if (s.includes("\n")) {
    out.push(key + ": |");
    for (const line of s.split("\n")) out.push(line ? "  " + line : "");
    return;
  }
  // Quote anything a plain-scalar reader could mis-split (the VCST-5807 ": " defect).
  const risky = s === "" || /[:#]\s/.test(s) || /^\s|\s$/.test(s) || /^[[\]{}>|'"&*!%@`]/.test(s);
  out.push(key + ": " + (risky ? JSON.stringify(s) : s));
}

/**
 * Render an entry back to markdown, deterministically: fixed field order, no
 * timestamps of its own. Two runs over equal input produce byte-identical files,
 * which is what lets the index `--check` gate mean anything.
 */
export function serializeEntry(entry) {
  const out = ["---"];
  for (const key of FIELD_ORDER) {
    if (entry[key] === undefined || entry[key] === null) continue;
    if (Array.isArray(entry[key]) && entry[key].length === 0) continue;
    emitValue(key, entry[key], out);
  }
  out.push("---", "");
  out.push(String(entry.body === undefined || entry.body === null ? "" : entry.body).replace(/\s+$/, ""));
  out.push("");
  return out.join("\n");
}

export const RULES = Object.freeze({ ID_RE, DATE_RE, RANGE_RE, ENTRY_FIELDS, DRAFT_FIELDS, FIELD_ORDER });
