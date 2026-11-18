// plugins/vc-test/skills/ticket-context/lib/env.mjs — loads the env for ticket-context, against `root`. The layers are
// the plugin's own scripts/lib/env-layers.mjs — the ai-tools repo's file, copied byte for byte (`npm run env:sync`) —
// so this skill and the repo load an env the same way. What is ticket-context's own is only the choice of TEST_ENV:
//   process env > this session's binding (.vc-fix/session-env/<CLAUDE_CODE_SESSION_ID>, `npm run env:use`)
//   > .env.test-env > the one environment the profile's `test` block declares (/vc-test:init) > "vcst"
// read against `root` rather than the cwd.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "dotenv";
import { applyLayered } from "../../../scripts/lib/env-layers.mjs";

/** …then, with none of those, the one environment the profile's `test` block declares (/vc-test:init), then "vcst". */
export function resolveTestEnv(root, env = process.env, profile = null) {
  const fromEnv = env.TEST_ENV?.trim();
  if (fromEnv) return fromEnv;
  const read = (f) => (existsSync(f) ? parse(readFileSync(f)).TEST_ENV?.trim() : "");
  const sid = env.CLAUDE_CODE_SESSION_ID;
  const fromSession = sid && /^[A-Za-z0-9-]+$/.test(sid) ? read(join(root, ".vc-fix", "session-env", sid)) : "";
  const declared = Object.keys(profile?.test?.environments ?? {});
  return fromSession || read(join(root, ".env.test-env")) || (declared.length === 1 ? declared[0] : "") || "vcst";
}

/** `ticket`: the ticket being analysed. It fills QA_ENV_PATH's `<ticket>`, so this process and the `deploy:pr` /
 *  `preflight --ticket` children it starts (which keep what they inherit) see that ticket's stands. */
export function loadLayeredEnv(root, ticket, profile = null) {
  const testEnv = resolveTestEnv(root, process.env, profile);
  process.env.TEST_ENV = testEnv;
  applyLayered(testEnv, { root, ticket, legacy: true, migrateHint: "`/project-init --check` moves them" });
  return testEnv;
}
