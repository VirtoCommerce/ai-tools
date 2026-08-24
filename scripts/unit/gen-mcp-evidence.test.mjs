// Unit tests for the evidence-destination half of
// plugins/vc-fix/skills/project-init/gen-mcp.mjs (VCST-5582 C).
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
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve, isAbsolute, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { withTempDir } from "./_test-helpers.mjs";
// The production auditor + the SHARED secret-prefix matcher. Imported rather than copied: the
// test used to carry its own `SECRET_SHAPE` regex, so a change to what production considers a
// credential would silently stop being what the test checks for.
import { findLiteralSecrets } from "../../plugins/vc-fix/skills/project-init/verify-access.mjs";
import { SECRET_PREFIX_RE } from "../../plugins/vc-fix/hooks/redact.mjs";
import { ensureGitignoreEntries, absolutizeOutputDir, ensureNodeOptions, extractNpxSpecs, classifyWarmResults, enableOAuthIfNoPat, resolveTokens, injectTokenRefs } from "../../plugins/vc-fix/skills/project-init/gen-mcp.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = join(ROOT, "plugins/vc-fix/skills/project-init/gen-mcp.mjs");
const TEMPLATE = join(ROOT, "plugins/vc-fix/templates/.mcp.json.example");
const PLAYWRIGHT = ["playwright-chrome", "playwright-firefox", "playwright-edge"];
const PI_DIR = join(ROOT, "plugins/vc-fix/skills/project-init");

function outputDirOf(server) {
  const i = server.args.indexOf("--output-dir");
  return i >= 0 ? server.args[i + 1] : null;
}
const readMcp = (dir) => JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8"));
const readSettings = (dir) => JSON.parse(readFileSync(join(dir, ".claude", "settings.local.json"), "utf8"));

function runGenMcp(dir, args = [], extraEnv = {}) {
  return execFileSync(process.execPath, [SCRIPT, ...args], {
    cwd: dir,
    encoding: "utf8",
    // VC_FIX_HOME is outputRoot() — without it the generator would write into the real checkout.
    // Default a dummy PAT so github's Bearer resolves and no test shells out to the host `gh`
    // (hermetic); individual tests override GITHUB_PERSONAL_ACCESS_TOKEN when they need to.
    env: { ...process.env, VC_FIX_HOME: dir, GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_test", ...extraEnv },
  });
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
test("template (#220 item 3): context7 passes its key as a HEADER, not env (an http MCP ignores env)", () => {
  const c7 = JSON.parse(readFileSync(TEMPLATE, "utf8")).mcpServers.context7;
  assert.equal(c7.type, "http");
  assert.equal(c7.headers?.CONTEXT7_API_KEY, "<CONTEXT7_API_KEY>");
  assert.ok(!c7.env, "context7 must not carry an inert env block");
});

test("template (#220 item 3): figma is OAuth-only — no inert FIGMA_API_KEY (env or header)", () => {
  // Check the STRUCTURE, not the raw text — the `//` doc comment names FIGMA_API_KEY on purpose.
  const fig = JSON.parse(readFileSync(TEMPLATE, "utf8")).mcpServers["figma-remote-mcp"];
  assert.equal(fig.type, "http");
  assert.ok(!fig.env, "figma must carry no inert env block");
  assert.ok(!fig.headers, "figma takes no key header (OAuth only)");
});

test("template (#220 item 4): github is the official REMOTE server, not the archived npx package", () => {
  const cfg = JSON.parse(readFileSync(TEMPLATE, "utf8"));
  // No SERVER runs the archived package (a `//` doc comment naming it is fine).
  for (const [name, def] of Object.entries(cfg.mcpServers)) {
    for (const a of def.args || []) assert.doesNotMatch(String(a), /@modelcontextprotocol\/server-github/, `${name} still runs the archived package`);
  }
  const gh = cfg.mcpServers.github;
  assert.equal(gh.type, "http");
  assert.match(gh.url, /api\.githubcopilot\.com\/mcp/);
  assert.match(gh.headers?.Authorization || "", /^Bearer <GITHUB_PERSONAL_ACCESS_TOKEN>$/);
});

test("gen-mcp (#220 item 4 / VCST-5774): the github Bearer header carries a ${VAR} REF, never the PAT", () => withTempDir((dir) => {
  runGenMcp(dir, [], { GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_itemfour" });
  const gh = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8")).mcpServers.github;
  assert.equal(gh.headers.Authorization, "Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}");
  // …and the VALUE lands in settings.local.json `env`, which is what feeds the expansion.
  const settings = JSON.parse(readFileSync(join(dir, ".claude", "settings.local.json"), "utf8"));
  assert.equal(settings.env.GITHUB_PERSONAL_ACCESS_TOKEN, "ghp_itemfour");
}));

test("enableOAuthIfNoPat (#220 item 4): an unresolved Bearer placeholder is DROPPED so the server can OAuth", () => {
  // No PAT → injectTokens leaves the literal placeholder → drop the header (OAuth fallback).
  const noPat = enableOAuthIfNoPat({ type: "http", url: "https://api.githubcopilot.com/mcp/", headers: { Authorization: "Bearer <GITHUB_PERSONAL_ACCESS_TOKEN>" } });
  assert.ok(!("Authorization" in noPat.headers), "the broken placeholder header must be removed");
  // A resolved token → header kept verbatim.
  const withPat = enableOAuthIfNoPat({ type: "http", headers: { Authorization: "Bearer ghp_real" } });
  assert.equal(withPat.headers.Authorization, "Bearer ghp_real");
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

test("VCST-5774 D1: NO resolved credential value appears anywhere in the generated .mcp.json", () => withTempDir((dir) => {
  runGenMcp(dir, ["--with", "postman,context7"], {
    GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_leakcanary1234567890",
    POSTMAN_API_KEY: "PMAK-leakcanary-0987654321",
    CONTEXT7_API_KEY: "ctx7_leakcanary",
  });
  const raw = readFileSync(join(dir, ".mcp.json"), "utf8");
  assert.doesNotMatch(raw, SECRET_PREFIX_RE, "a secret-shaped literal reached .mcp.json");
  for (const v of ["ghp_leakcanary1234567890", "PMAK-leakcanary-0987654321"]) {
    assert.ok(!raw.includes(v), `${v} reached .mcp.json`);
  }
  assert.ok(!raw.includes("ctx7_leakcanary"), "the context7 key value reached .mcp.json");
  // Each one is present as an indirection instead, and the values live in settings `env`.
  for (const v of ["GITHUB_PERSONAL_ACCESS_TOKEN", "POSTMAN_API_KEY", "CONTEXT7_API_KEY"]) {
    assert.ok(raw.includes("${" + v + "}"), `${v} is not referenced as \${${v}}`);
  }
  const env = JSON.parse(readFileSync(join(dir, ".claude", "settings.local.json"), "utf8")).env;
  assert.equal(env.GITHUB_PERSONAL_ACCESS_TOKEN, "ghp_leakcanary1234567890");
  assert.equal(env.POSTMAN_API_KEY, "PMAK-leakcanary-0987654321");
  assert.equal(env.CONTEXT7_API_KEY, "ctx7_leakcanary");
}));

test("VCST-5774 D1: an ALIAS env var (GITHUB_FIX_BUGS_TOKEN) resolves under the canonical name", () => withTempDir((dir) => {
  // .env.local documents GITHUB_FIX_BUGS_TOKEN; the reference must still read ${GITHUB_PERSONAL_ACCESS_TOKEN}
  // so the indirection and the settings key agree whichever alias supplied the value.
  runGenMcp(dir, [], { GITHUB_PERSONAL_ACCESS_TOKEN: "", GITHUB_FIX_BUGS_TOKEN: "ghp_fromalias12345678" });
  const gh = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8")).mcpServers.github;
  assert.equal(gh.headers.Authorization, "Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}");
  const env = JSON.parse(readFileSync(join(dir, ".claude", "settings.local.json"), "utf8")).env;
  assert.equal(env.GITHUB_PERSONAL_ACCESS_TOKEN, "ghp_fromalias12345678");
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

test("VCST-5774: --inline-secrets restores the literal, and then writes NO second copy to settings", () => withTempDir((dir) => {
  runGenMcp(dir, ["--inline-secrets"], { GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_deliberateinline12" });
  const gh = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8")).mcpServers.github;
  assert.equal(gh.headers.Authorization, "Bearer ghp_deliberateinline12");
  const settings = JSON.parse(readFileSync(join(dir, ".claude", "settings.local.json"), "utf8"));
  assert.ok(!settings.env?.GITHUB_PERSONAL_ACCESS_TOKEN, "the value must not be duplicated into settings");
}));

test("VCST-5774: a REVOKED credential is pruned from settings.local.json on the next run", () => withTempDir((dir) => {
  // The value now lives in settings `env`, which Claude Code exports to every session AND
  // subprocess — a strictly wider blast radius than the .mcp.json header it replaced. So a merge
  // that never prunes leaves a revoked token ambient forever, while .mcp.json reads perfectly
  // clean and the readiness row says PASS. That combination is undetectable by inspection.
  runGenMcp(dir, [], { GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_firstrun1234567890" });
  assert.equal(readSettings(dir).env.GITHUB_PERSONAL_ACCESS_TOKEN, "ghp_firstrun1234567890");

  const out = runGenMcp(dir, [], {
    GITHUB_PERSONAL_ACCESS_TOKEN: "", GITHUB_FIX_BUGS_TOKEN: "", GIT_TOKEN: "", GITHUB_TOKEN: "",
  });
  const settings = readSettings(dir);
  assert.equal(settings.env?.GITHUB_PERSONAL_ACCESS_TOKEN, undefined, "the revoked value must be gone");
  assert.match(out, /removed GITHUB_PERSONAL_ACCESS_TOKEN/, "the removal is reported, not silent");
  // …and the config correctly falls back to OAuth, as it already did.
  assert.ok(!("Authorization" in (readMcp(dir).mcpServers.github.headers ?? {})));
}));

test("VCST-5774: an operator's OWN settings env keys survive the prune", () => withTempDir((dir) => {
  runGenMcp(dir, [], { GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_firstrun1234567890" });
  const p = join(dir, ".claude", "settings.local.json");
  const s = JSON.parse(readFileSync(p, "utf8"));
  s.env.MY_OWN_SETTING = "keep-me";
  writeFileSync(p, JSON.stringify(s, null, 2));

  runGenMcp(dir, [], { GITHUB_PERSONAL_ACCESS_TOKEN: "", GITHUB_FIX_BUGS_TOKEN: "", GIT_TOKEN: "", GITHUB_TOKEN: "" });
  const after = readSettings(dir);
  assert.equal(after.env.MY_OWN_SETTING, "keep-me", "only vars the generator OWNS may be pruned");
  assert.equal(after.env.GITHUB_PERSONAL_ACCESS_TOKEN, undefined);
}));

test("VCST-5774: switching to --inline-secrets leaves exactly ONE copy of the credential", () => withTempDir((dir) => {
  // The skip-writing-to-settings branch only ever prevented a NEW write. After a normal run the
  // value was already there, so `--inline-secrets` produced a literal in .mcp.json AND kept the
  // settings copy — two copies, which is what its own comment says it avoids.
  runGenMcp(dir, [], { GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_bbbbbbbbbb1234567890" });
  assert.equal(readSettings(dir).env.GITHUB_PERSONAL_ACCESS_TOKEN, "ghp_bbbbbbbbbb1234567890");

  runGenMcp(dir, ["--inline-secrets"], { GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_bbbbbbbbbb1234567890" });
  assert.equal(readMcp(dir).mcpServers.github.headers.Authorization, "Bearer ghp_bbbbbbbbbb1234567890");
  assert.equal(readSettings(dir).env?.GITHUB_PERSONAL_ACCESS_TOKEN, undefined,
    "the settings copy must be removed when the value moves into .mcp.json");
}));

test("VCST-5774: the generator's own output passes the auditor that guards it", () => withTempDir((dir) => {
  // Producer and auditor are separate defences and drifted once already (the auditor read only
  // headers/env while the producer had learned to substitute into args[]). Pin them together.
  runGenMcp(dir, ["--with", "postman,context7"], {
    GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_leakcanary1234567890",
    POSTMAN_API_KEY: "PMAK-leakcanary-0987654321",
    CONTEXT7_API_KEY: "ctx7_leakcanary",
  });
  const raw = readFileSync(join(dir, ".mcp.json"), "utf8");
  assert.deepEqual(findLiteralSecrets(raw), { hits: [], unparsable: false },
    "the shipped .mcp.json must be clean by the readiness check's own judgement");
}));

test("resolveTokens / injectTokenRefs: pure — precedence, ${VAR} refs, unresolved left alone", () => {
  assert.deepEqual(resolveTokens({ GITHUB_FIX_BUGS_TOKEN: "b", GIT_TOKEN: "c" }),
    { "<GITHUB_PERSONAL_ACCESS_TOKEN>": { varName: "GITHUB_PERSONAL_ACCESS_TOKEN", value: "b" } });
  assert.deepEqual(resolveTokens({ GITHUB_PERSONAL_ACCESS_TOKEN: "a", GITHUB_FIX_BUGS_TOKEN: "b" }),
    { "<GITHUB_PERSONAL_ACCESS_TOKEN>": { varName: "GITHUB_PERSONAL_ACCESS_TOKEN", value: "a" } });
  assert.deepEqual(resolveTokens({}), {}, "an absent key resolves to nothing, so the placeholder survives");

  const resolved = resolveTokens({ GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_x" });
  const server = { headers: { Authorization: "Bearer <GITHUB_PERSONAL_ACCESS_TOKEN>", Other: "<CONTEXT7_API_KEY>" }, args: ["--k", "<GITHUB_PERSONAL_ACCESS_TOKEN>"] };
  const out = injectTokenRefs(server, resolved);
  assert.equal(out.headers.Authorization, "Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}", "embedded position is substituted");
  assert.equal(out.args[1], "${GITHUB_PERSONAL_ACCESS_TOKEN}", "nested arrays are walked");
  assert.equal(out.headers.Other, "<CONTEXT7_API_KEY>", "an UNRESOLVED placeholder is left intact for unresolvedPlaceholders()");
  assert.equal(injectTokenRefs(server, resolved, { inline: true }).headers.Authorization, "Bearer ghp_x");
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

test("item 8b: an EMBEDDED placeholder (\"Bearer <POSTMAN_API_KEY>\") resolves when the key IS set", () => withTempDir((dir) => {
  // The old injectTokens replaced a value ONLY when the entire string equalled a placeholder, so
  // `"Authorization": "Bearer <POSTMAN_API_KEY>"` shipped unresolved even with the key set (→ 401).
  // It now resolves to the ${VAR} indirection, in place — the embedded-position fix is unchanged.
  runGenMcp(dir, ["--with", "postman"], { POSTMAN_API_KEY: "PMAK-testkey-1234567890" });
  const cfg = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8"));
  const auth = cfg.mcpServers.postman.headers.Authorization;
  assert.equal(auth, "Bearer ${POSTMAN_API_KEY}", "the embedded placeholder is substituted in place");
  assert.doesNotMatch(auth, /<POSTMAN_API_KEY>/);
  const settings = JSON.parse(readFileSync(join(dir, ".claude", "settings.local.json"), "utf8"));
  assert.equal(settings.env.POSTMAN_API_KEY, "PMAK-testkey-1234567890");
}));

// This test used to assert the OPPOSITE: `--with postman` + a blank POSTMAN_API_KEY had to emit a
// degraded_artifact. That encoded the bug — scaffold-secrets.mjs emits POSTMAN_API_KEY /
// CONTEXT7_API_KEY as OPTIONAL and documents "blank ⇒ that MCP server stays disabled", so a blank
// optional key is the operator's choice, not a degraded artifact. gen-mcp now leaves such an extra
// DEFINED but dormant, which removes the cause of the observation rather than reporting it. The
// warn+observation path below is unchanged and still guards any server we DO enable (see the 8c
// audit); with the current template only optional extras carry a key placeholder, github falling
// back to OAuth, so it stands as the safety net for the next template addition.
test("item 8a: an unresolved OPTIONAL extra is left dormant and emits NO mcp_config observation", () => withTempDir((dir) => {
  const sid = seedSession(dir);
  // GITHUB token present (so github resolves), POSTMAN key ABSENT → postman must not be enabled.
  runGenMcp(dir, ["--with", "postman"], { GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_present", POSTMAN_API_KEY: "" });
  const enabled = JSON.parse(readFileSync(join(dir, ".claude", "settings.local.json"), "utf8")).enabledMcpjsonServers;
  assert.ok(!enabled.includes("postman"), `postman must stay dormant (enabled: ${enabled.join(", ")})`);
  // dormant, not deleted — the def stays so filling the key and re-running enables it
  assert.ok(JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8")).mcpServers.postman, "postman stays DEFINED");
  const obs = readObsRecords(dir).filter((o) => o.subject === "mcp_config");
  assert.deepEqual(obs, [], "a deliberately-blank optional key is not a degraded artifact");
  assert.equal(sid, "gen-mcp-sess-1");
}));

test("item 8a: a fully-resolved config emits NO mcp_config observation", () => withTempDir((dir) => {
  seedSession(dir);
  runGenMcp(dir, ["--with", "postman"], { GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_present", POSTMAN_API_KEY: "PMAK-set" });
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
