// Unit tests for the evidence-destination half of
// plugins/vc-init/skills/project-init/gen-mcp.mjs (VCST-5582 C).
//
// The defect: screenshots taken during a /qa-bug run appeared at the PROJECT ROOT. The template's
// `--output-dir` was RELATIVE (`test-results/<browser>`), which playwright-mcp resolves against the
// MCP server's own cwd — a value the plugin does not control — while the destination policy in
// skills/qa-evidence/output-paths.md said `reports/bugs/screenshots/`. Nothing connected the two,
// so the path was guessed. gen-mcp now pins --output-dir to an ABSOLUTE project path, so the
// default target cannot be the root whatever the cwd turns out to be.
// Run: `npm test` (tsx --test scripts/unit/**/*.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve, isAbsolute, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { withTempDir } from "./_test-helpers.mjs";
// The production auditor + the SHARED secret-prefix matcher. Imported rather than copied: the
// test used to carry its own `SECRET_SHAPE` regex, so a change to what production considers a
// credential would silently stop being what the test checks for.
import { findLiteralSecrets } from "../../plugins/vc-init/skills/project-init/verify-access.mjs";
import { SECRET_PREFIX_RE } from "../../plugins/vc-init/scripts/lib/redact.mjs";
import { ensureGitignoreEntries, absolutizeOutputDir, ensureNodeOptions, extractNpxSpecs, classifyWarmResults, pruneSettingsEnv, githubEntryFor, TOKEN_ENV_KEYS } from "../../plugins/vc-init/skills/project-init/gen-mcp.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = join(ROOT, "plugins/vc-init/skills/project-init/gen-mcp.mjs");
const TEMPLATE = join(ROOT, "plugins/vc-init/templates/.mcp.json.example");
const PLAYWRIGHT = ["playwright-chrome", "playwright-firefox", "playwright-edge"];
const PI_DIR = join(ROOT, "plugins/vc-init/skills/project-init");

function outputDirOf(server) {
  const i = server.args.indexOf("--output-dir");
  return i >= 0 ? server.args[i + 1] : null;
}
const readMcp = (dir) => JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8"));
const readSettings = (dir) => JSON.parse(readFileSync(join(dir, ".claude", "settings.local.json"), "utf8"));

// Every credential the generator can resolve, blanked. The child inherits process.env, so
// WITHOUT this a developer's real POSTMAN_API_KEY / CONTEXT7_API_KEY leaks into ~15 temp
// settings.local.json files and a test can pass locally for the wrong reason (or fail in CI).
// Only the four GitHub aliases used to be blanked, so "hermetic" was half true.
const BLANK_TOKENS = Object.fromEntries(
  ["GITHUB_PERSONAL_ACCESS_TOKEN", "GITHUB_FIX_BUGS_TOKEN", "GIT_TOKEN", "GITHUB_TOKEN",
    "POSTMAN_API_KEY", "CONTEXT7_API_KEY"].map((k) => [k, ""]),
);
// Long enough to match SECRET_PREFIX_RE. The old default `ghp_test` sat BELOW its 16-char floor,
// so any future `assert.doesNotMatch(raw, SECRET_PREFIX_RE)` relying on the default would have
// been vacuously green — a leak canary that cannot detect a leak.
const DEFAULT_PAT = "ghp_test00000000000000000000";

function runGenMcp(dir, args = [], extraEnv = {}) {
  // spawnSync, not execFileSync: the prune notice is a console.warn (it DELETES a credential), so
  // a stdout-only capture could not see it. stdout is returned first so log-ordering assertions
  // are unaffected.
  const res = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: dir,
    encoding: "utf8",
    // VC_FIX_HOME is outputRoot() — without it the generator would write into the real checkout.
    // The default PAT keeps github's Bearer resolvable so no test shells out to the host `gh`.
    env: { ...process.env, ...BLANK_TOKENS, VC_FIX_HOME: dir, GITHUB_PERSONAL_ACCESS_TOKEN: DEFAULT_PAT, ...extraEnv },
  });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(`gen-mcp exited ${res.status}\n${res.stdout}\n${res.stderr}`);
  return `${res.stdout}${res.stderr}`;
}
function readObsRecords(dir) {
  const d = join(dir, ".vc-fix", "diagnostics");
  if (!existsSync(d)) return [];
  const out = [];
  for (const f of readdirSync(d)) {
    if (!f.endsWith(".jsonl")) continue;
    for (const line of readFileSync(join(d, f), "utf8").trim().split("\n")) {
      if (!line) continue;
      try { const r = JSON.parse(line); if (r.type === "obs") out.push(r); } catch { /* skip */ }
    }
  }
  return out;
}

// ─── the shipped template (the hand-copy fallback) ────────────────────────────────
test("template: every Playwright server points --output-dir at the evidence landing zone", () => {
  const tpl = JSON.parse(readFileSync(TEMPLATE, "utf8"));
  for (const name of PLAYWRIGHT) {
    const dir = outputDirOf(tpl.mcpServers[name]);
    assert.ok(dir, `${name} declares --output-dir`);
    assert.match(dir, /^reports\/bugs\/screenshots\/_incoming\//, `${name}: ${dir}`);
    assert.doesNotMatch(dir, /^test-results\//, `${name} must not fall back to the old lane`);
  }
});

// ─── #220 — IPv4-first NODE_OPTIONS + pinned versions (npx-fetch never hangs on IPv6) ──
// ONLY --dns-result-order=ipv4first (NODE_OPTIONS-allowed since Node 16.4). NOT
// --no-network-family-autoselection, which is fatal in NODE_OPTIONS on the Node-18 floor.
const IPV4_FLAGS = "--dns-result-order=ipv4first";

test("template (#220): no stdio server pins a package to @latest (a cached exact version needs no registry round-trip)", () => {
  // Inspect the server ARGS (a package spec like `chrome-devtools-mcp@latest`), not the whole
  // file — the `//network` doc comment mentions the word "@latest" on purpose.
  const tpl = JSON.parse(readFileSync(TEMPLATE, "utf8"));
  const offenders = [];
  for (const [name, def] of Object.entries(tpl.mcpServers)) {
    for (const a of def.args || []) if (typeof a === "string" && a.includes("@latest")) offenders.push(`${name}: ${a}`);
  }
  assert.deepEqual(offenders, [], `every npx package must be pinned to an exact version — offenders: ${offenders.join(", ")}`);
});

test("ensureNodeOptions (#220): a stdio npx server gets the IPv4-first NODE_OPTIONS + prefer-offline", () => {
  const win = ensureNodeOptions({ type: "stdio", command: "cmd", args: ["/c", "npx", "chrome-devtools-mcp@1.6.0"], env: {} });
  assert.equal(win.env.NODE_OPTIONS, IPV4_FLAGS);
  assert.equal(win.env.npm_config_prefer_offline, "true");
  const nix = ensureNodeOptions({ type: "stdio", command: "npx", args: ["chrome-devtools-mcp@1.6.0"] });
  assert.equal(nix.env.NODE_OPTIONS, IPV4_FLAGS);
  assert.equal(nix.env.npm_config_prefer_offline, "true");
});

test("ensureNodeOptions (#220): the flag set is actually launchable (proves NODE_OPTIONS won't refuse to start)", () => {
  // The unit tests only assert the STRING; this proves the string Node will actually be handed
  // starts a process cleanly (a Node-18-fatal flag would exit non-zero here). Guards the exact
  // catastrophic mode #220 exists to prevent.
  execFileSync(process.execPath, ["-e", "0"], { env: { ...process.env, NODE_OPTIONS: IPV4_FLAGS }, stdio: "ignore" });
});

test("ensureNodeOptions (#220): an http/sse server (no local process) is untouched", () => {
  const http = { type: "http", url: "https://mcp.postman.com/minimal", headers: { Authorization: "Bearer x" } };
  assert.deepEqual(ensureNodeOptions(http), http);
});

test("ensureNodeOptions (#220): idempotent, preserves other env, overrides a conflicting DNS order (last wins)", () => {
  const once = ensureNodeOptions({ type: "stdio", command: "npx", args: ["x"], env: { NODE_OPTIONS: "--max-old-space-size=256" } });
  assert.equal(once.env.NODE_OPTIONS, `--max-old-space-size=256 ${IPV4_FLAGS}`);
  assert.deepEqual(ensureNodeOptions(once).env.NODE_OPTIONS, once.env.NODE_OPTIONS, "a second pass adds nothing");
  const other = ensureNodeOptions({ type: "stdio", command: "npx", args: ["x"], env: { FOO: "bar" } });
  assert.equal(other.env.FOO, "bar", "unrelated env is kept");
  // a host that pre-set a conflicting DNS order: ours is appended LAST so it wins, not silently defeated
  const conflict = ensureNodeOptions({ type: "stdio", command: "npx", args: ["x"], env: { NODE_OPTIONS: "--dns-result-order=verbatim" } });
  assert.equal(conflict.env.NODE_OPTIONS, `--dns-result-order=verbatim ${IPV4_FLAGS}`);
});

// ─── #220 items 3/4 — auth contracts (http servers ignore env; archived github package) ──
test("template (VCST-6402 D2): postman and context7 are gone — each needed an API key in a file", () => {
  const servers = JSON.parse(readFileSync(TEMPLATE, "utf8")).mcpServers;
  assert.equal(servers.postman, undefined);
  assert.equal(servers.context7, undefined);
  // …and no server left in the template carries a key placeholder at all.
  assert.doesNotMatch(JSON.stringify(servers), /<[A-Z0-9_]+>/);
});

test("template (#220 item 3): figma is OAuth-only — no inert FIGMA_API_KEY (env or header)", () => {
  // Check the STRUCTURE, not the raw text — the `//` doc comment names FIGMA_API_KEY on purpose.
  const fig = JSON.parse(readFileSync(TEMPLATE, "utf8")).mcpServers["figma-remote-mcp"];
  assert.equal(fig.type, "http");
  assert.ok(!fig.env, "figma must carry no inert env block");
  assert.ok(!fig.headers, "figma takes no key header (OAuth only)");
});

test("template (#220 item 4 / VCST-6402): github is the hosted server, header-less — no token placeholder", () => {
  const cfg = JSON.parse(readFileSync(TEMPLATE, "utf8"));
  // No SERVER runs the archived package (a `//` doc comment naming it is fine).
  for (const [name, def] of Object.entries(cfg.mcpServers)) {
    for (const a of def.args || []) assert.doesNotMatch(String(a), /@modelcontextprotocol\/server-github/, `${name} still runs the archived package`);
  }
  const gh = cfg.mcpServers.github;
  assert.equal(gh.type, "http");
  assert.match(gh.url, /api\.githubcopilot\.com\/mcp/);
  assert.equal(gh.headers, undefined, "the token reaches the server through vc-secrets, never a header in a file");
});

test("gen-mcp (VCST-6402): a PAT github axis points .mcp.json at `vc-secrets run github` and declares the server", () => withTempDir((dir) => {
  runGenMcp(dir, ["--github-auth", "pat", "--vc-run", join(dir, "vc-run.mjs")], { GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_itemfour000000000000" });
  const gh = readMcp(dir).mcpServers.github;
  assert.deepEqual(gh, { type: "stdio", command: "node", args: ["${VC_SECRETS}", "run", "github"] });
  const decl = JSON.parse(readFileSync(join(dir, ".claude", "vc-secrets.local.json"), "utf8"));
  assert.equal(decl.servers.github.env.GITHUB_PERSONAL_ACCESS_TOKEN, "secret:github-pat");
  assert.ok(decl.servers.github.args.some((a) => /^mcp-remote@\d/.test(a)), "mcp-remote is pinned to an exact version");
  // The token in the generator's environment reaches NEITHER file.
  const settings = readSettings(dir);
  assert.equal(settings.env.VC_RUN, join(dir, "vc-run.mjs"));
  assert.ok(!JSON.stringify(settings).includes("ghp_itemfour"), "no token in settings.local.json");
  assert.ok(!readFileSync(join(dir, ".claude", "vc-secrets.local.json"), "utf8").includes("ghp_itemfour"));
}));

test("githubEntryFor (VCST-6402): pat ⇒ a vc-secrets call, a session axis ⇒ the hosted server with OAuth", () => {
  assert.deepEqual(githubEntryFor("pat").args, ["${VC_SECRETS}", "run", "github"]);
  const oauth = githubEntryFor("gh-cli");
  assert.equal(oauth.type, "http");
  assert.equal(oauth.headers, undefined);
});

// ─── #220 item 5 — pure telemetry mapping for warm results (the load-bearing bit; no network) ──
test("classifyWarmResults (#220 item 5): a failed or skipped warm emits a degraded_artifact obs; success emits none", () => {
  const obs = classifyWarmResults([
    { spec: "chrome-devtools-mcp@1.6.0", ok: true, ms: 1200 },
    { spec: "@azure/mcp@3.0.0-beta.32", ok: false, ms: 30000 },
    { spec: "evil; rm -rf", ok: false, ms: 0, skipped: true },
  ]);
  assert.equal(obs.length, 2, "only the two non-ok results produce observations");
  assert.ok(obs.every((o) => o.class === "degraded_artifact" && o.subject === "mcp_config"));
  assert.match(obs[0].evidence.snippet, /warm failed: @azure\/mcp/);
  assert.match(obs[1].evidence.snippet, /skipped \(unsafe\): evil/);
  assert.deepEqual(classifyWarmResults([{ spec: "x", ok: true, ms: 10 }]), [], "an all-ok run is clean");
});

// ─── #220 item 5 — npx-spec extraction for cache warming (pure; warming itself is opt-in + network) ──
test("extractNpxSpecs (#220 item 5): picks the pinned package spec after npx, skips flags + http servers", () => {
  const servers = {
    "playwright-chrome": { type: "stdio", command: "cmd", args: ["/c", "npx", "@playwright/mcp@0.0.77", "--browser", "chrome"] },
    "azure-mcp": { type: "stdio", command: "cmd", args: ["/c", "npx", "-y", "@azure/mcp@3.0.0-beta.32", "server", "start"] },
    devtools: { type: "stdio", command: "npx", args: ["chrome-devtools-mcp@1.6.0"] }, // *nix-normalized shape
    github: { type: "http", url: "https://api.githubcopilot.com/mcp/" }, // http ⇒ no npx spec
  };
  assert.deepEqual(
    extractNpxSpecs(servers).sort(),
    ["@azure/mcp@3.0.0-beta.32", "@playwright/mcp@0.0.77", "chrome-devtools-mcp@1.6.0"],
  );
});

// ─── the generated .mcp.json (what actually runs) ─────────────────────────────────
test("gen-mcp (#220): every stdio server in the generated config carries IPv4-first NODE_OPTIONS + prefer-offline", () => withTempDir((dir) => {
  runGenMcp(dir, ["--with", "postman,context7,devtools,azure"]);
  const cfg = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8"));
  let stdioSeen = 0;
  for (const [name, def] of Object.entries(cfg.mcpServers)) {
    if (def.type && def.type !== "stdio") {
      assert.ok(!def.env?.NODE_OPTIONS, `${name} is not stdio and must not get NODE_OPTIONS`);
      continue;
    }
    stdioSeen++;
    assert.equal(def.env?.NODE_OPTIONS, IPV4_FLAGS, `${name} must carry the IPv4-first NODE_OPTIONS`);
    assert.equal(def.env?.npm_config_prefer_offline, "true", `${name} must carry prefer-offline`);
  }
  assert.ok(stdioSeen >= 3, `expected several stdio servers, saw ${stdioSeen}`);
}));

test("gen-mcp (#220): the `//` doc-comment keys do NOT leak into the generated runtime config", () => withTempDir((dir) => {
  runGenMcp(dir, ["--with", "context7"]);
  const cfg = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8"));
  for (const [name, def] of Object.entries(cfg.mcpServers)) {
    for (const k of Object.keys(def)) assert.ok(!k.startsWith("//"), `${name} leaked a doc-comment key "${k}"`);
  }
}));


test("gen-mcp: --output-dir is rewritten to an ABSOLUTE project path (cwd can never make it the root)", () => withTempDir((dir) => {
  runGenMcp(dir);
  const cfg = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8"));
  for (const name of PLAYWRIGHT) {
    const out = outputDirOf(cfg.mcpServers[name]);
    assert.ok(isAbsolute(out), `${name}: --output-dir must be absolute, got "${out}"`);
    assert.equal(resolve(out), resolve(join(dir, "reports/bugs/screenshots/_incoming", name.replace("playwright-", ""))), name);
    // The whole point: the project root itself is never the target.
    assert.notEqual(resolve(out), resolve(dir), `${name} must not resolve to the project root`);
  }
}));

test("absolutizeOutputDir: a STALE relative value (test-results/<browser>) is migrated, lane preserved", () => {
  // A project onboarded before this fix, or a hand-edited template, must be corrected too —
  // only the browser lane is carried over, the parent dir is re-rooted in the evidence tree.
  const server = { command: "npx", args: ["@playwright/mcp@latest", "--browser", "firefox", "--output-dir", "test-results/firefox"] };
  const out = absolutizeOutputDir(server, "/proj");
  assert.equal(outputDirOf(out).replace(/\\/g, "/"), "/proj/reports/bugs/screenshots/_incoming/firefox");
  assert.deepEqual(server.args[server.args.length - 1], "test-results/firefox", "the input is not mutated");
});

test("absolutizeOutputDir: an ALREADY-absolute value is left alone (a deliberate operator override)", () => {
  const abs = process.platform === "win32" ? "D:\\evidence\\shots" : "/evidence/shots";
  const server = { args: ["--output-dir", abs] };
  assert.equal(outputDirOf(absolutizeOutputDir(server, "/proj")), abs);
});

test("absolutizeOutputDir: a server with no --output-dir (github, postman, …) is untouched", () => {
  const server = { command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] };
  assert.deepEqual(absolutizeOutputDir(server, "/proj"), server);
});

// ─── .gitignore entries ───────────────────────────────────────────────────────────
// ─── VCST-5774 — no literal credential in .mcp.json, and .mcp.json is always ignored ──────
// D1: gen-mcp used to substitute the literal PAT value into .mcp.json. D2: that file was never
// added to .gitignore (the header comment claimed otherwise), so on a client repo one `git add -A`
// published a live token. D3: with no PAT env it copied `gh auth token` — the operator's CLI OAuth
// session — into the file; two projects were found on disk carrying a `gho_…` that way.

test("VCST-6402: NO credential from the environment reaches .mcp.json or settings.local.json", () => withTempDir((dir) => {
  runGenMcp(dir, ["--github-auth", "pat", "--with", "postman,context7"], {
    GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_leakcanary1234567890",
    GITHUB_FIX_BUGS_TOKEN: "ghp_leakcanaryalias12345",
    POSTMAN_API_KEY: "PMAK-leakcanary-0987654321",
    CONTEXT7_API_KEY: "ctx7_leakcanary",
  });
  for (const f of [".mcp.json", join(".claude", "settings.local.json"), join(".claude", "vc-secrets.local.json")]) {
    const raw = readFileSync(join(dir, f), "utf8");
    assert.doesNotMatch(raw, SECRET_PREFIX_RE, `a secret-shaped literal reached ${f}`);
    for (const v of ["ghp_leakcanary1234567890", "ghp_leakcanaryalias12345", "PMAK-leakcanary-0987654321", "ctx7_leakcanary"]) {
      assert.ok(!raw.includes(v), `${v} reached ${f}`);
    }
  }
}));

test("VCST-5774 D2: .mcp.json and the other generated local files are ALWAYS gitignored", () => withTempDir((dir) => {
  runGenMcp(dir);
  const gi = readFileSync(join(dir, ".gitignore"), "utf8");
  for (const entry of [".mcp.json", ".env.local", ".env.*.local", "project-profile.json", ".vc-fix/", ".claude/settings.local.json"]) {
    assert.match(gi, new RegExp(`^${entry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"), `${entry} is not ignored`);
  }
}));

test("VCST-5774 D2: the ignore entry is written BEFORE .mcp.json, and a project with no .gitignore gets one", () => withTempDir((dir) => {
  assert.ok(!existsSync(join(dir, ".gitignore")), "precondition: the fresh project has no .gitignore");
  const out = runGenMcp(dir);
  assert.ok(existsSync(join(dir, ".gitignore")), "a project with no .gitignore gets one");
  // Ordering is asserted on stdout, not on mtime: the generator writes .gitignore in one pass and
  // both files can land inside the same filesystem clock tick, so mtime cannot witness the order.
  const iGitignore = out.indexOf("[gen-mcp] .gitignore +=");
  const iWrote = out.indexOf("[gen-mcp] wrote ");
  assert.ok(iGitignore >= 0 && iWrote >= 0, `both log lines present:\n${out}`);
  assert.ok(iGitignore < iWrote, ".gitignore must be updated BEFORE .mcp.json is written — the file must never exist un-ignored");
}));

test("VCST-5774 D2: an operator's existing .gitignore is appended to, never rewritten", () => withTempDir((dir) => {
  const original = "node_modules/\ndist/\n";
  writeFileSync(join(dir, ".gitignore"), original);
  runGenMcp(dir);
  const gi = readFileSync(join(dir, ".gitignore"), "utf8");
  assert.ok(gi.startsWith(original), "the operator's entries are untouched, in order");
  assert.match(gi, /^\.mcp\.json$/m);
}));

test("VCST-5774 D3: with no PAT env the generator does NOT shell out to `gh auth token`", () => withTempDir((dir) => {
  // A fake `gh` earlier on PATH would be used by the removed fallback; it must never run. If it
  // did, the file would carry `gho_…` — the operator's CLI OAuth session, persisted unasked.
  const binDir = join(dir, "fakebin");
  mkdirSync(binDir, { recursive: true });
  const marker = join(dir, "gh-was-called");
  const body = `#!/bin/sh\ntouch ${JSON.stringify(marker)}\necho gho_shouldNeverBeUsed\n`;
  writeFileSync(join(binDir, "gh"), body, { mode: 0o755 });
  writeFileSync(join(binDir, "gh.cmd"), `@echo off\r\ntype nul > "${marker}"\r\necho gho_shouldNeverBeUsed\r\n`);
  runGenMcp(dir, [], {
    GITHUB_PERSONAL_ACCESS_TOKEN: "", GITHUB_FIX_BUGS_TOKEN: "", GIT_TOKEN: "", GITHUB_TOKEN: "",
    PATH: `${binDir}${process.platform === "win32" ? ";" : ":"}${process.env.PATH}`,
  });
  assert.ok(!existsSync(marker), "`gh auth token` was invoked — the D3 fallback is back");
  const raw = readFileSync(join(dir, ".mcp.json"), "utf8");
  assert.ok(!raw.includes("gho_"), "a gh CLI OAuth token reached .mcp.json");
  // No PAT ⇒ the placeholder stays unresolved ⇒ enableOAuthIfNoPat drops the header ⇒ OAuth.
  const gh = JSON.parse(raw).mcpServers.github;
  assert.ok(!("Authorization" in (gh.headers ?? {})), "the header must be dropped so the server can OAuth");
  const settings = JSON.parse(readFileSync(join(dir, ".claude", "settings.local.json"), "utf8"));
  assert.ok(!settings.env?.GITHUB_PERSONAL_ACCESS_TOKEN, "nothing to bridge when nothing resolved");
}));

test("VCST-6402: --inline-secrets is refused — and nothing is written", () => withTempDir((dir) => {
  const res = spawnSync(process.execPath, [SCRIPT, "--inline-secrets"], { cwd: dir, encoding: "utf8", env: { ...process.env, ...BLANK_TOKENS, VC_FIX_HOME: dir } });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /--inline-secrets was removed/);
  assert.ok(!existsSync(join(dir, ".mcp.json")), "a refused run writes nothing");
  // `--inline-secrets false` is still accepted as a no-op (the flag parser's false/0/no/off rule).
  runGenMcp(dir, ["--inline-secrets", "false"]);
  assert.ok(existsSync(join(dir, ".mcp.json")));
}));

test("VCST-6402: a token the VCST-5774 design left in settings env is KEPT and reported; a removed server's key goes", () => withTempDir((dir) => {
  // Between VCST-5774 and VCST-6402 the PAT VALUE lived in settings.local.json `env`, exported to every
  // session and subprocess. gen-mcp reports it and says where it belongs, but does not delete it: only
  // migrate-secrets --strip does, after the vc-secrets copy passed a probe (it may be the only working one).
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "settings.local.json"), JSON.stringify({ env: { GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_firstrun1234567890", POSTMAN_API_KEY: "PMAK-x" } }));
  const out = runGenMcp(dir);
  const settings = readSettings(dir);
  assert.equal(settings.env?.GITHUB_PERSONAL_ACCESS_TOKEN, "ghp_firstrun1234567890", "a live token is never deleted here");
  assert.equal(settings.env?.POSTMAN_API_KEY, undefined, "a removed server's key goes");
  assert.match(out, /\[gen-mcp\][^\n]*still holds[^\n]*GITHUB_PERSONAL_ACCESS_TOKEN/, "the plaintext token is reported, not silent");
  assert.match(out, /vc-secrets/, "…and the notice names where the token belongs now");
}));

test("VCST-6402: an operator's OWN settings keys survive the prune; VC_RUN is added", () => withTempDir((dir) => {
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "settings.local.json"), JSON.stringify({ env: { MY_OWN_SETTING: "keep-me", ADO_PAT: "x" }, permissions: { deny: ["Bash(gh pr merge:*)"] } }));
  runGenMcp(dir, ["--vc-run", "/stable/vc-run.mjs"]);
  const after = readSettings(dir);
  assert.equal(after.env.MY_OWN_SETTING, "keep-me", "an operator's own key is never touched");
  assert.equal(after.env.ADO_PAT, "x", "a token is kept for migrate-secrets to strip after its probe");
  assert.equal(after.env.VC_RUN, "/stable/vc-run.mjs");
  assert.deepEqual(after.permissions.deny, ["Bash(gh pr merge:*)"]);
}));

test("VCST-6402: --with postman/context7 is skipped with a note — the servers never ship", () => withTempDir((dir) => {
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "settings.local.json"), JSON.stringify({ enabledMcpjsonServers: ["postman", "context7"] }));
  const out = runGenMcp(dir, ["--with", "postman,context7,figma"]);
  assert.match(out, /--with postman: that server was removed/);
  const mcp = readMcp(dir).mcpServers;
  assert.equal(mcp.postman, undefined);
  assert.equal(mcp.context7, undefined);
  const enabled = readSettings(dir).enabledMcpjsonServers;
  assert.ok(!enabled.includes("postman") && !enabled.includes("context7"));
  assert.ok(enabled.includes("figma-remote-mcp"), "the other extras still work");
}));

test("VCST-5774: the generator's own output passes the auditor that guards it", () => withTempDir((dir) => {
  // Producer and auditor are separate defences and drifted once already (the auditor read only
  // headers/env while the producer had learned to substitute into args[]). Pin them together.
  runGenMcp(dir, ["--with", "postman,context7"], {
    GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_leakcanary1234567890",
    POSTMAN_API_KEY: "PMAK-leakcanary-0987654321",
    CONTEXT7_API_KEY: "ctx7_leakcanary",
  });
  const doc = readMcp(dir);
  const clean = findLiteralSecrets(JSON.stringify(doc));
  assert.deepEqual({ hits: clean.hits, weak: clean.weak }, { hits: [], weak: [] },
    "the shipped .mcp.json must be clean by the readiness check's own judgement");

  // …and the other direction, which an emptiness assertion can never witness: plant a leak in each
  // position the generator is ABLE to substitute into and require the auditor to report every one.
  // A detector blinded back to headers/env-only passes the assertion above unchanged.
  doc.mcpServers.probeArgs = { command: "npx", args: ["m", "--api-key", "zzq-unknown-shape-value"] };
  doc.mcpServers.probeUrl = { type: "http", url: "https://m/mcp?access_token=zzq-opaque-value" };
  doc.mcpServers.probeNest = { type: "stdio", env: { CREDS: { TOKEN: "zzq-nested-value" } } };
  doc.mcpServers.probeCertain = { type: "stdio", env: { HARMLESS: "ghp_plantedcanary1234567890" } };
  const planted = findLiteralSecrets(JSON.stringify(doc));
  assert.deepEqual(planted.hits, ["probeCertain.env.HARMLESS"]);
  assert.deepEqual(planted.weak.sort(), ["probeArgs.args[2]", "probeNest.env.CREDS.TOKEN", "probeUrl.url"]);
}));

test("pruneSettingsEnv: pure — removed servers' keys go, live tokens are kept and listed, VC_RUN is set", () => {
  const env = Object.fromEntries(TOKEN_ENV_KEYS.map((k) => [k, "v"]));
  const { settings, pruned, kept } = pruneSettingsEnv({ env: { ...env, KEEP: "1" }, enabledMcpjsonServers: ["github", "postman"], other: 1 }, { vcRun: "/p/vc-run.mjs" });
  assert.deepEqual(pruned.sort(), ["CONTEXT7_API_KEY", "POSTMAN_API_KEY"]);
  assert.deepEqual(kept.sort(), TOKEN_ENV_KEYS.filter((k) => !["CONTEXT7_API_KEY", "POSTMAN_API_KEY"].includes(k)).sort());
  for (const k of kept) assert.equal(settings.env[k], "v", k);
  assert.equal(settings.env.KEEP, "1");
  assert.equal(settings.env.VC_RUN, "/p/vc-run.mjs");
  assert.deepEqual(settings.enabledMcpjsonServers, ["github"]);
  assert.equal(settings.other, 1);
  assert.deepEqual(pruneSettingsEnv({ env: { POSTMAN_API_KEY: "x" } }).settings, {}, "an env left empty is removed");
});

test("gen-mcp: adds the landing-zone ignore entries to the project's .gitignore", () => withTempDir((dir) => {
  runGenMcp(dir);
  const gi = readFileSync(join(dir, ".gitignore"), "utf8");
  assert.match(gi, /^test-results\/$/m);
  assert.match(gi, /^reports\/bugs\/screenshots\/_incoming\/$/m);
}));

test("ensureGitignoreEntries: idempotent — a second run adds nothing", () => withTempDir((dir) => {
  const entries = ["test-results/", "reports/bugs/screenshots/_incoming/"];
  const first = ensureGitignoreEntries(dir, entries);
  assert.deepEqual(first, entries);
  const after = readFileSync(join(dir, ".gitignore"), "utf8");
  const second = ensureGitignoreEntries(dir, entries);
  assert.deepEqual(second, [], "nothing missing the second time");
  assert.equal(readFileSync(join(dir, ".gitignore"), "utf8"), after, "the file is byte-identical");
}));

test("ensureGitignoreEntries: APPENDS — an existing .gitignore is never rewritten or reordered", () => withTempDir((dir) => {
  const original = "node_modules/\n.env.local\n";
  writeFileSync(join(dir, ".gitignore"), original);
  ensureGitignoreEntries(dir, ["test-results/", "reports/bugs/screenshots/_incoming/"]);
  const after = readFileSync(join(dir, ".gitignore"), "utf8");
  assert.ok(after.startsWith(original), "the operator's existing entries are untouched, in order");
  assert.match(after, /^test-results\/$/m);
}));

test("ensureGitignoreEntries: an entry the project already ignores is not duplicated", () => withTempDir((dir) => {
  writeFileSync(join(dir, ".gitignore"), "test-results/\n");
  const added = ensureGitignoreEntries(dir, ["test-results/", "reports/bugs/screenshots/_incoming/"]);
  assert.deepEqual(added, ["reports/bugs/screenshots/_incoming/"]);
  const occurrences = readFileSync(join(dir, ".gitignore"), "utf8").split("\n").filter((l) => l.trim() === "test-results/").length;
  assert.equal(occurrences, 1);
}));

// ─── item 8a/8b — unresolved-placeholder observation + embedded-placeholder substitution ──
// A pre-opted-in session with a state.json so the collector's `obs` subcommand can attach.
function seedSession(dir, sid = "gen-mcp-sess-1") {
  const dd = join(dir, ".vc-fix", "diagnostics");
  execFileSync(process.execPath, ["-e", `require("fs").mkdirSync(${JSON.stringify(dd)},{recursive:true})`]);
  writeFileSync(join(dir, "project-profile.json"), JSON.stringify({ selfDiagnostics: true, feedback: { mode: "ask" } }));
  writeFileSync(join(dd, `${sid}.state.json`), JSON.stringify({ sid }));
  return sid;
}

test("item 8a: a generated config emits NO mcp_config observation (the template carries no placeholder)", () => withTempDir((dir) => {
  seedSession(dir);
  runGenMcp(dir, ["--github-auth", "pat", "--vc-run", join(dir, "vc-run.mjs"), "--with", "figma"]);
  assert.equal(readObsRecords(dir).filter((o) => o.subject === "mcp_config").length, 0, "nothing unresolved ⇒ no observation");
}));

// ─── item 8c — the warning-emitter audit: a visible warn must not be telemetry-blind ──
// VCST-5582 H's lesson: a script that prints a ⚠ but emits no observation is invisible to
// self-diagnostics. Guard the whole project-init surface — any *.mjs that prints a warning MUST
// also import the observation emitter — so the next warn-adding edit cannot regress silently.
test("item 8c: every project-init *.mjs that prints a warning also emits an observation", () => {
  const offenders = [];
  for (const f of readdirSync(PI_DIR)) {
    if (!f.endsWith(".mjs")) continue;
    const src = readFileSync(join(PI_DIR, f), "utf8");
    // A "warning" = a console.warn call, or a printed ⚠ marker. (console.error for a hard STOP that
    // exits non-zero is caught by the transcript-side stderr capture, so it is not in scope here.)
    const warns = /console\.warn\s*\(/.test(src) || /⚠/.test(src);
    if (!warns) continue;
    const emits = /emitObservations\s*\(/.test(src) || /diag-obs/.test(src);
    if (!emits) offenders.push(f);
  }
  assert.deepEqual(offenders, [], `these project-init scripts print a warning but emit no observation (VCST-5582 H class): ${offenders.join(", ")}`);
});

// ─── the destination is documented where the agent will look ──────────────────────
test("docs: output-paths.md carries the no-root rule and the full _incoming → <slug> chain", () => {
  const md = readFileSync(join(ROOT, "plugins/vc-fix/skills/qa-evidence/output-paths.md"), "utf8");
  assert.match(md, /nothing is ever written to the project root/i);
  assert.match(md, /_incoming/);
  assert.match(md, /reports\/bugs\/screenshots\/<bug-slug>\//);
});

test("docs: qa-bug.md mandates relative screenshot filenames and ONE move", () => {
  const md = readFileSync(join(ROOT, "plugins/vc-fix/commands/qa-bug.md"), "utf8");
  assert.match(md, /RELATIVE filenames only/i);
  assert.match(md, /ONE deterministic move/i);
  assert.match(md, /Final sweep/i, "the run must sweep AND name anything left at the root");
});
