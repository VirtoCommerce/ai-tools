// plugins/vc-test/lib/check-change-map.mjs — layer 0's gate: the change map matches its schema and covers every AC
// and every hotspot the /ticket-context bundle holds (spec U37).
// CLI: node plugins/vc-test/lib/check-change-map.mjs --map <change-map.json> --bundle <bundle.json>   (exit 2 on errors)
//      node plugins/vc-test/lib/check-change-map.mjs --agent <id> --out <change-map.json> --bundle <bundle.json>
// The `change-map` agent has no Write tool (spec U37): its reply is the map. --agent reads the transcript of exactly that
// agent id, takes its JSON object as the analysts' output is taken (agent-output.mjs), writes it to --out, then runs the
// same checks. Exit 0 ok · 2 checks failed, or the reply is not one JSON object (no file is written for the latter) ·
// 1 usage, or no transcript for that id.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validate } from "../skills/ticket-context/lib/schema.mjs";
import { extractAgentOutput, findAgentTranscript, readTranscript } from "../skills/ticket-context/lib/agent-output.mjs";
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
  const [agentId, outPath, bundlePath] = [argOf(process.argv, "agent"), argOf(process.argv, "out"), argOf(process.argv, "bundle")];
  let mapPath = argOf(process.argv, "map");
  const usage = (m) => { console.error(m); process.exit(1); };
  const read = (p) => JSON.parse(readFileSync(p, "utf8"));
  if (agentId !== undefined) {
    if (!outPath || !bundlePath) usage("usage: check-change-map.mjs --agent <id> --out <file> --bundle <file>");
    let transcript;
    try { transcript = findAgentTranscript(agentId); } catch (e) { usage(e.message); }
    if (!transcript) usage(`no transcript for agent "${agentId}"`);
    const text = extractAgentOutput(readTranscript(transcript));
    if (text === null) {
      console.log(JSON.stringify({ ok: false, errors: ["the agent's last message is not one JSON object (no prose, no second object) — reply with the change map only"] }));
      process.exit(2);
    }
    writeFileSync(outPath, `${text}\n`);
    mapPath = outPath;
  } else if (!mapPath || !bundlePath) usage("usage: check-change-map.mjs --map <file> --bundle <file> | --agent <id> --out <file> --bundle <file>");
  const errors = checkChangeMap(read(mapPath), read(bundlePath));
  console.log(JSON.stringify({ ok: errors.length === 0, errors }));
  process.exit(errors.length ? 2 : 0);
}
