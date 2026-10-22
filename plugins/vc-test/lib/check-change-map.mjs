// plugins/vc-test/lib/check-change-map.mjs — layer 0's gate: the change map matches its schema and covers every AC
// and every hotspot the /ticket-context bundle holds (spec U37).
// CLI: node plugins/vc-test/lib/check-change-map.mjs --map <change-map.json> --bundle <bundle.json>   (exit 2 on errors)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validate } from "../../../.claude/skills/ticket-context/lib/schema.mjs"; // prototype: the skill stays in place
import { argOf } from "./paths.mjs";

const SCHEMA = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "change-map.schema.json"), "utf8"));

export function checkChangeMap(map, bundle) {
  const errors = validate(map, SCHEMA);
  if (errors.length) return errors;
  const mapped = new Set(map.acs.map((a) => a.ac));
  for (const ac of bundle.acs ?? []) if (!mapped.has(ac.id)) errors.push(`${ac.id}: not in the change map`);
  const bundleAcs = new Set((bundle.acs ?? []).map((a) => a.id));
  for (const a of map.acs) if (!bundleAcs.has(a.ac)) errors.push(`${a.ac}: not an AC of the bundle`);
  for (const [list, what] of [[map.hotspots, "hotspots"], [map.suspicions, "suspicions"]]) {
    const seen = new Set();
    for (const x of list) { if (seen.has(x.id)) errors.push(`${x.id}: two ${what} share this id`); seen.add(x.id); }
  }
  const sources = new Set(map.hotspots.map((h) => h.source));
  for (const pr of bundle.change?.prs ?? []) {
    for (const h of pr.hotspots ?? []) if (!sources.has(h.source)) errors.push(`${h.source}: bundle hotspot not in the change map`);
  }
  const ids = new Set(map.hotspots.map((h) => h.id));
  for (const s of map.suspicions) if (!ids.has(s.check)) errors.push(`${s.id}: checks ${s.check}, which does not exist`);
  return errors;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [mapPath, bundlePath] = [argOf(process.argv, "map"), argOf(process.argv, "bundle")];
  if (!mapPath || !bundlePath) { console.error("usage: check-change-map.mjs --map <file> --bundle <file>"); process.exit(1); }
  const read = (p) => JSON.parse(readFileSync(p, "utf8"));
  const errors = checkChangeMap(read(mapPath), read(bundlePath));
  console.log(JSON.stringify({ ok: errors.length === 0, errors }));
  process.exit(errors.length ? 2 : 0);
}
