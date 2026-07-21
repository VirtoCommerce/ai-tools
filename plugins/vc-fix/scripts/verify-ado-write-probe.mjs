#!/usr/bin/env node
// Dev/verify tool — confirms the correctness PREMISE the /project-init ADO write-scope probes
// (skills/project-init/probe-lib.mjs) rest on: an authenticated PAT that LACKS the write scope
// must be rejected at AUTHORIZATION (HTTP 401/403 → "absent"/"restricted") BEFORE Azure DevOps
// validates the deliberately-invalid probe body. If a READ-ONLY PAT instead gets 400/409/422
// ("present"), the probe false-PASSes a read-only token — the "LEO gap" it exists to close would
// silently stay open. This cannot be settled statically, so run it against a real org with two PATs.
//
// USAGE — run ONCE PER PAT and compare (nothing is hardcoded to a specific org/client):
//   ADO_ORG=<org> ADO_PROJECT=<project> ADO_WORKITEM_ID=<id> ADO_REPO=<repo> \
//     ADO_PAT=<read-only-PAT>   node plugins/vc-fix/scripts/verify-ado-write-probe.mjs
//   …then again with ADO_PAT=<read+write-PAT>.
// Read-only PAT scopes: Work Items (Read), Code (Read) — NO write. Write PAT: Work Items (Read &
// Write), Code (Read & Write) + Pull Request (contribute).
//
// SAFE: both probes send an INVALID body ("{}"), the exact requests the real probes send, so
// nothing is created/changed/pushed. Prints HTTP status + verdict only; the PAT is never echoed.
import { probeAdoWorkItemsWrite, probeAdoCodeWrite } from "../skills/project-init/probe-lib.mjs";

const ORG = process.env.ADO_ORG || "";
const PROJECT = process.env.ADO_PROJECT || "";
const PAT = process.env.ADO_PAT || "";
const WID = process.env.ADO_WORKITEM_ID || ""; // a real work-item id in the project (any Bug/Task)
const REPO = process.env.ADO_REPO || "";       // a real repo name in the project

if (!ORG || !PROJECT || !PAT) {
  console.error("Required: ADO_ORG, ADO_PROJECT, ADO_PAT (run once with a read-only PAT, once with a read+write PAT).");
  console.error("Optional but recommended: ADO_WORKITEM_ID (a real work-item id), ADO_REPO (a real repo name).");
  process.exit(2);
}

const apiBase = `https://dev.azure.com/${ORG}/${encodeURIComponent(PROJECT)}`;
const authHeader = "Basic " + Buffer.from(":" + PAT).toString("base64");

const rows = [];
if (WID) {
  const r = await probeAdoWorkItemsWrite({ apiBase, authHeader, workItemId: WID });
  rows.push(["WorkItems PATCH (wit/workitems/{id})", r.status, r.scope]);
} else {
  rows.push(["WorkItems PATCH", "SKIP", "set ADO_WORKITEM_ID to run"]);
}
if (REPO) {
  const r = await probeAdoCodeWrite({ apiBase, authHeader, repo: REPO });
  rows.push(["Code POST (git/repositories/{repo}/pushes)", r.status, r.scope]);
} else {
  rows.push(["Code POST", "SKIP", "set ADO_REPO to run"]);
}

console.log(`\nADO write-probe ordering check — ${ORG}/${PROJECT}\n`);
for (const [probe, status, scope] of rows) {
  console.log(`  ${probe.padEnd(46)} status=${String(status).padEnd(6)} -> ${scope}`);
}
console.log(`
Interpret (the premise = authorization BEFORE body validation):
  READ-ONLY  PAT -> 401/403, scope "absent"/"restricted"  => premise HOLDS
  READ-ONLY  PAT -> 400/409/422, scope "present"          => premise BROKEN (false PASS!) -> redesign probe
  READ+WRITE PAT -> 400/409/422, scope "present"          => correct (invalid body rejected at validation)
`);
