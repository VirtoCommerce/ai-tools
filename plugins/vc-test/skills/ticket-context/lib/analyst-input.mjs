// plugins/vc-test/skills/ticket-context/lib/analyst-input.mjs — what each ticket-context-analyst mode reads.
// The raw tracker JSON carries the description twice (ADF and rendered HTML) and every comment as ADF, and the whole
// prepare.json and bundle.schema.json went to every mode (VCST-6423: ~80–155K chars per TICKET/MATERIALS run). So
// prepare writes the ticket as plain text, and one input file per mode holding only that mode's keys and schema.
// ticket.json stays raw on disk for the scripts that read it (rounds.mjs).
import { adfText } from "./inventory.mjs";
import { redactText } from "./scrub.mjs";

/** An issue (the ticket, or a linked one) as plain, redacted text. A linked issue's `comments` (attachLinkedComments)
 *  is already in this shape and is kept as it is; the ticket's own come from `fields.comment`, all of them. */
export function slimIssue(issue, { acFields = [], secrets = new Set() } = {}) {
  const f = issue.fields ?? {};
  const text = (v) => redactText(adfText(v), secrets).replace(/\n{3,}/g, "\n\n").trim();
  const names = (list) => (list ?? []).map((x) => x?.name ?? x).filter((s) => typeof s === "string").map((s) => redactText(s, secrets));
  const raw = f.comment?.comments ?? [];
  const comments = issue.comments ?? { total: f.comment?.total ?? raw.length, read: raw.length,
    comments: raw.map((c) => ({ id: String(c.id), created: c.created ?? null, updated: c.updated ?? null, text: text(c.body) })) };
  const acceptance = acFields.map(({ id, name }) => ({ id, name: name ?? null, text: text(f[id]) })).filter((a) => a.text);
  return { key: issue.key ?? null, summary: redactText(f.summary ?? "", secrets), type: f.issuetype?.name ?? null,
    status: f.status?.name ?? null, resolution: f.resolution?.name ?? null, priority: f.priority?.name ?? null,
    components: names(f.components), labels: names(f.labels), created: f.created ?? null, updated: f.updated ?? null,
    description: text(f.description), acceptance, comments };
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
    TICKET: { ...base("TICKET", "ticketOut"), ticket_slim: ticketSlim, ac_fields: prepared.ac_fields, epic: prepared.epic, siblings: prepared.siblings },
    MATERIALS: { ...base("MATERIALS", "materialsOut"), inventory: prepared.inventory },
    CHANGE: { ...base("CHANGE", "changeOut"), ticket_slim: ticketSlim, prs: prepared.prs, rung: prepared.rung, gaps: prepared.gaps },
  };
}
