#!/usr/bin/env tsx
/**
 * Delete leaked test organizations created during GraphQL-runner MVP runs.
 *
 * Usage:
 *   # If .env has working platform admin creds (PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD):
 *   npx tsx scripts/cleanup-leaked-orgs.ts
 *
 *   # Inline override:
 *   PLATFORM_ADMIN_EMAIL=admin@... PLATFORM_ADMIN_PASSWORD=... npx tsx scripts/cleanup-leaked-orgs.ts
 *
 *   # Explicit role from aliases.json:
 *   npx tsx scripts/cleanup-leaked-orgs.ts --role PLATFORM_ADMIN
 *
 *   # Dry-run (list what would be deleted, don't send):
 *   npx tsx scripts/cleanup-leaked-orgs.ts --dry-run
 *
 *   # Custom id list:
 *   npx tsx scripts/cleanup-leaked-orgs.ts --ids <id1>,<id2>,<id3>
 *
 * Endpoint: DELETE {BACK_URL}/api/members?ids=<id>&ids=<id>...
 * Permission: platform admin (ORG_USER / customer tokens return 403).
 */

import { config as loadDotenv } from "dotenv";
import { TokenCache } from "./lib/graphql-auth.js";

loadDotenv();

const DEFAULT_LEAKED = [
  "7725c8a7-46e2-4556-851b-fa3243da15e4",
  "4d0fa4b1-3430-412a-8de7-dce31b334c29",
  "b89220ef-614f-4447-992e-be5e6801afb8",
  "f1dd74b9-1c44-4ee9-8e7b-671bcc40fae7",
];

interface Args {
  role: string;
  ids: string[];
  dryRun: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const out: Args = { role: "PLATFORM_ADMIN", ids: DEFAULT_LEAKED, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--role") out.role = argv[++i];
    else if (a === "--ids") out.ids = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "-h" || a === "--help") {
      console.log("Usage: npx tsx scripts/cleanup-leaked-orgs.ts [--role X] [--ids a,b,c] [--dry-run]");
      process.exit(0);
    }
  }
  return out;
}

async function main() {
  const args = parseArgs();
  const backUrl = process.env.BACK_URL;
  if (!backUrl) {
    console.error("BACK_URL not set in .env");
    process.exit(2);
  }

  console.log(`Target: ${backUrl}`);
  console.log(`Role:   ${args.role}`);
  console.log(`IDs:    ${args.ids.length} to delete`);
  for (const id of args.ids) console.log(`  - ${id}`);
  console.log();

  if (args.dryRun) {
    console.log("--dry-run — not sending DELETE");
    console.log(`\nWould POST:  DELETE ${backUrl}/api/members?${args.ids.map((id) => `ids=${id}`).join("&")}`);
    process.exit(0);
  }

  // Acquire admin token
  const cache = new TokenCache("test-data", { backUrl });
  let token: string;
  try {
    token = await cache.getToken(args.role);
    console.log(`Admin token acquired (role=${args.role})`);
  } catch (e) {
    console.error(`\nFailed to acquire admin token: ${(e as Error).message}`);
    console.error(
      `\nFix: ensure ${args.role.toUpperCase()}_EMAIL and ${args.role.toUpperCase()}_PASSWORD are set in .env with a platform admin account, or pass --role <alias> for an inline alias in test-data/aliases.json.`
    );
    process.exit(2);
  }

  // DELETE via REST
  const url = `${backUrl.replace(/\/$/, "")}/api/members?${args.ids.map((id) => `ids=${encodeURIComponent(id)}`).join("&")}`;
  console.log(`\nDELETE ${url}`);
  const t0 = Date.now();
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const elapsed = Date.now() - t0;
  console.log(`HTTP ${res.status} — ${elapsed}ms`);

  if (res.status === 200 || res.status === 204) {
    console.log(`\nAll ${args.ids.length} leaked orgs deleted.`);
    process.exit(0);
  }

  const body = await res.text().catch(() => "");
  console.log(`\nDelete failed:`);
  if (body) console.log(body.slice(0, 500));
  if (res.status === 403) {
    console.log(`\n403 means the ${args.role} account lacks platform-admin permission.`);
    console.log(`Manual alternative — Admin SPA:`);
    console.log(`  ${backUrl.replace("/graphql", "")}/#/members → filter name="AT&T Corp. #1" → bulk delete`);
  }
  process.exit(1);
}

main().catch((e) => {
  console.error(`FATAL: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(3);
});
