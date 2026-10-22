// plugins/vc-test/lib/ledger.mjs — the only writer of a run's ledger.jsonl (briefs/ledger.md): one line per entity a
// run created or setting it changed, in the shape teardown.mjs reads, stamped with the time, the env and the stand's
// host, so teardown acts on exactly these and refuses a line from another stand. It appends, never rewrites: the
// agents of one wave share the file.
// CLI: node plugins/vc-test/lib/ledger.mjs append --key <KEY> --by <step> [--item <C-n>] --entity <type> --id <id>
//        [--before <json> --after <json>] [--note <how to undo it>]      (exit 1: the line was refused)
//      node plugins/vc-test/lib/ledger.mjs types
import { appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { argOf, currentEnv, workDir } from "./paths.mjs";
import { ENTITIES } from "./teardown.mjs";

const valueOf = (s) => { try { return JSON.parse(s); } catch { return s; } };

export function ledgerLine(args, { env, host, at }) {
  const { by, item, entity, id, note } = args;
  const errors = [];
  for (const [name, v] of Object.entries({ by, entity, id })) if (!v) errors.push(`--${name} is required`);
  if (entity && entity !== "other" && !ENTITIES.includes(entity)) errors.push(`--entity ${entity}: teardown knows ${ENTITIES.join(", ")} — anything else is --entity other with --note "<how to undo it>"`);
  if (entity === "other" && !note) errors.push(`--entity other needs --note "<how to undo it>"`);
  if (entity === "setting" && (args.before === undefined || args.after === undefined)) errors.push("a setting needs --before and --after: its value before your change and after it");
  if (!host) errors.push("BACK_URL is not set — the line could not name its stand");
  if (errors.length) return { errors };
  return { line: { entity, id, by, ...(item ? { item } : {}),
    ...(entity === "setting" ? { before: valueOf(args.before), after: valueOf(args.after) } : {}),
    ...(note ? { note } : {}), env, host, at } };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [cmd, key] = [process.argv[2], argOf(process.argv, "key")];
  if (cmd === "types") { console.log([...ENTITIES, "other"].join("\n")); process.exit(0); }
  if (cmd !== "append" || !key) { console.error("usage: ledger.mjs append --key <KEY> --by <step> [--item <C-n>] --entity <type> --id <id> [--before <json> --after <json>] [--note <text>] | ledger.mjs types"); process.exit(1); }
  const config = join(process.cwd(), "config.js");
  if (!existsSync(config)) { console.error("no config.js here — run from the project root"); process.exit(3); }
  await import(pathToFileURL(config).href); // runs the layered env loader into process.env
  const env = currentEnv();
  const host = process.env.BACK_URL ? new URL(process.env.BACK_URL).host : null;
  const args = Object.fromEntries(["by", "item", "entity", "id", "before", "after", "note"].map((n) => [n, argOf(process.argv, n)]));
  const { line, errors } = ledgerLine(args, { env, host, at: new Date().toISOString() });
  if (errors) { console.error(errors.join("\n")); process.exit(1); }
  const file = join(workDir(key, { env }), "ledger.jsonl");
  appendFileSync(file, `${JSON.stringify(line)}\n`);
  console.log(`ledger: ${line.entity} ${line.id} (${env}, ${host})`);
}
