// scripts/preflight/cli.ts — change-scoped pre-flight (spec §5). Read-only: prints, never writes.
// Exit: 0 OK/WARN · 1 usage error · 2 any BLOCK · 3 could not run.
import "../lib/sync-stdio.mjs";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { enumFlag, flagValue, rejectUnknownFlags } from "../lib/cli-args.ts";
import { getEnvFacts } from "../lib/env-facts.ts";
import { TEST_ENV_PATTERN } from "../lib/resolve-test-env.js";
import { checkMcpStatic, loadMcpRequirements, readMcpJson } from "./mcp-static.ts";
import { buildChecks, CHANGE_FOR, findDuplicate, isBlocking, resolveSprint, type ChangeFor } from "./policy.ts";
import { renderHuman } from "./render.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
rejectUnknownFlags(argv, ["--for", "--ticket", "--components", "--domain", "--expect", "--env", "--storefront", "--json"], ["--for", "--ticket", "--components", "--domain", "--expect", "--env"]);
// --env checks a named env instead of the one this session resolves (TEST_ENV → session binding →
// .env.test-env); set before anything resolves it, so every loader below agrees.
const envFlag = flagValue(argv, "--env");
if (envFlag !== undefined) {
  if (!TEST_ENV_PATTERN.test(envFlag) || !existsSync(join(ROOT, `.env.${envFlag}`))) { console.error(`✗ --env: no .env.${envFlag}`); process.exit(1); }
  process.env.TEST_ENV = envFlag;
}
const forFlag = enumFlag(argv, "--for", CHANGE_FOR) as ChangeFor | undefined;
if (!forFlag) { console.error(`✗ --for is required: ${CHANGE_FOR.join(" | ")}`); process.exit(1); }
const ticket = flagValue(argv, "--ticket");
if ((forFlag === "ticket" || forFlag === "ticket-fast") && !ticket) { console.error("✗ --for ticket needs --ticket <KEY>"); process.exit(1); }
if (ticket && !/^[A-Z][A-Z0-9]*-\d+$/.test(ticket)) { console.error(`✗ --ticket expects a key like VCST-1234, got "${ticket}"`); process.exit(1); }
const domain = flagValue(argv, "--domain");
const components = (flagValue(argv, "--components") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const expectRaw = flagValue(argv, "--expect");
let expect: { module: string; version: string } | undefined;
if (expectRaw) {
  const at = expectRaw.lastIndexOf("@");
  if (at <= 0) { console.error(`✗ --expect expects Module.Id@version, got "${expectRaw}"`); process.exit(1); }
  expect = { module: expectRaw.slice(0, at), version: expectRaw.slice(at + 1) };
}

try {
  const now = new Date();
  const facts = await getEnvFacts({ components, storefront: argv.includes("--storefront"), now });
  const mcpJson = readMcpJson(ROOT);
  const mcp = { ...checkMcpStatic(forFlag, loadMcpRequirements(ROOT), mcpJson.json), jsonError: mcpJson.error };
  const sprint = forFlag === "ticket" || forFlag === "ticket-fast" ? resolveSprint(ROOT) : null;
  const duplicate = findDuplicate(ROOT, forFlag, { ticket, domain, now });
  const checks = buildChecks({ for: forFlag, ticket, domain, expect, facts, mcp, sprint, duplicate });
  const verdict = isBlocking(checks) ? "NOT READY" : "READY";
  if (argv.includes("--json")) console.log(JSON.stringify({ for: forFlag, ticket: ticket ?? null, domain: domain ?? null, sprint, duplicate, facts, mcp, checks, verdict }, null, 2));
  else process.stdout.write(renderHuman({ env: facts.env, for: forFlag, ticket, at: now }, facts, checks));
  process.exit(verdict === "NOT READY" ? 2 : 0);
} catch (e) {
  console.error(`✗ preflight could not run: ${(e as Error).message}`);
  process.exit(3);
}
