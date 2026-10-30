// plugins/vc-test/skills/ticket-context/lib/analyst-input.mjs — what each ticket-context-analyst mode reads.
// The raw tracker JSON carries the description twice (ADF and rendered HTML) and every comment as ADF, and the whole
// prepare.json and bundle.schema.json went to every mode (VCST-6423: ~80–155K chars per TICKET/MATERIALS run). So
// prepare writes the ticket as plain text, and one input file per mode holding only that mode's keys and schema.
// ticket.json stays raw on disk for the scripts that read it (rounds.mjs).
import { CAPS } from "./fetch.mjs";
import { gap } from "./gap.mjs";
import { adfText, ticketFields } from "./inventory.mjs";
import { redactText } from "./scrub.mjs";

/** An issue (the ticket, or a linked one) as plain, redacted text, every text cut at CAPS.fieldText as the bundle's
 *  `fields` are: the scalar fields and the description are ticketFields'. A cut is an over-cap gap in `gaps`; the
 *  ticket's description and AC text already have theirs from prepare's own ticketFields, so only a linked issue
 *  (`ref`) adds one for its description. A linked issue's `comments` (attachLinkedComments) is already in this shape
 *  and is kept as it is; one whose comments were not read has no `comments` (the read's gap says why), never an
 *  empty list. The ticket's own come from `fields.comment`, all of them. */
export function slimIssue(issue, { acFields = [], secrets = new Set(), ref = null, gaps = [] } = {}) {
  const f = issue.fields ?? {};
  const tf = ticketFields(issue, [], secrets);
  if (ref) gaps.push(...tf.gaps.map((g) => ({ ...g, where: `${ref}:description` })));
  const text = (v) => redactText(adfText(v), secrets).replace(/\n{3,}/g, "\n\n").trim();
  const cut = [];
  const capped = (t, id) => { if (t.length > CAPS.fieldText) cut.push(`${id} (${t.length} chars)`); return t.slice(0, CAPS.fieldText); };
  const raw = f.comment?.comments;
  const comments = issue.comments ?? (Array.isArray(raw) ? { total: f.comment.total ?? raw.length, read: raw.length,
    comments: raw.map((c) => ({ id: String(c.id), created: c.created ?? null, updated: c.updated ?? null, text: capped(text(c.body), c.id) })) } : null);
  if (cut.length) gaps.push(gap(`${ref ?? "ticket"}:comments`, "over-cap", `comment ${cut.join(", ")} cut to its first ${CAPS.fieldText} chars`));
  const acceptance = acFields.map(({ id, name }) => ({ id, name: name ?? null, text: text(f[id]).slice(0, CAPS.fieldText) })).filter((a) => a.text);
  const { summary, type, status, priority, components, labels, description } = tf.fields;
  return { key: issue.key ?? null, summary, type, status, resolution: f.resolution?.name ?? null, priority, components, labels,
    created: f.created ?? null, updated: f.updated ?? null, description, acceptance, ...(comments ? { comments } : {}) };
}

/** One $def of the schema with every $def it reaches, as a standalone schema. */
export function schemaSlice(schema, def) {
  const need = new Set([def]);
  for (const queue = [def]; queue.length;) {
    for (const [, n] of JSON.stringify(schema.$defs[queue.pop()]).matchAll(/"#\/\$defs\/([^"]+)"/g)) if (!need.has(n)) { need.add(n); queue.push(n); }
  }
  return { ...(schema.$schema ? { $schema: schema.$schema } : {}), $ref: `#/$defs/${def}`, $defs: Object.fromEntries([...need].map((n) => [n, schema.$defs[n]])) };
}

export const ANALYST_FILES = Object.freeze({ TICKET: "analyst-ticket.json", MATERIALS: "analyst-materials.json", CHANGE: "analyst-change.json" });

/** Each mode's input: the prepare keys its section of the agent reads, the plain-text ticket, its output schema. */
export function analystInputs(prepared, { ticketSlim, schema }) {
  const base = (mode, def) => ({ mode, ticket: prepared.ticket, output_schema: schemaSlice(schema, def) });
  return {
    TICKET: { ...base("TICKET", "ticketOut"), ticket_slim: ticketSlim, epic: prepared.epic, siblings: prepared.siblings },
    MATERIALS: { ...base("MATERIALS", "materialsOut"), inventory: prepared.inventory },
    CHANGE: { ...base("CHANGE", "changeOut"), ticket_slim: ticketSlim, prs: prepared.prs, rung: prepared.rung, gaps: prepared.gaps },
  };
}
