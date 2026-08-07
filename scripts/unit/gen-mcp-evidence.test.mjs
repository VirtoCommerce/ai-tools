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
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve, isAbsolute, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { withTempDir } from "./_test-helpers.mjs";
import { ensureGitignoreEntries, absolutizeOutputDir, ensureNodeOptions, extractNpxSpecs } from "../../plugins/vc-fix/skills/project-init/gen-mcp.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = join(ROOT, "plugins/vc-fix/skills/project-init/gen-mcp.mjs");
const TEMPLATE = join(ROOT, "plugins/vc-fix/templates/.mcp.json.example");
const PLAYWRIGHT = ["playwright-chrome", "playwright-firefox", "playwright-edge"];
const PI_DIR = join(ROOT, "plugins/vc-fix/skills/project-init");

function outputDirOf(server) {
  const i = server.args.indexOf("--output-dir");
  return i >= 0 ? server.args[i + 1] : null;
}
function runGenMcp(dir, args = [], extraEnv = {}) {
  return execFileSync(process.execPath, [SCRIPT, ...args], {
    cwd: dir,
    encoding: "utf8",
    // VC_FIX_HOME is outputRoot() — without it the generator would write into the real checkout.
    env: { ...process.env, VC_FIX_HOME: dir, ...extraEnv },
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
const IPV4_FLAGS = "--no-network-family-autoselection --dns-result-order=ipv4first";

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

test("ensureNodeOptions (#220): a stdio npx server gets the IPv4-first NODE_OPTIONS", () => {
  const win = ensureNodeOptions({ type: "stdio", command: "cmd", args: ["/c", "npx", "chrome-devtools-mcp@1.6.0"], env: {} });
  assert.equal(win.env.NODE_OPTIONS, IPV4_FLAGS);
  const nix = ensureNodeOptions({ type: "stdio", command: "npx", args: ["chrome-devtools-mcp@1.6.0"] });
  assert.equal(nix.env.NODE_OPTIONS, IPV4_FLAGS);
});

test("ensureNodeOptions (#220): an http/sse server (no local process) is untouched", () => {
  const http = { type: "http", url: "https://mcp.postman.com/minimal", headers: { Authorization: "Bearer x" } };
  assert.deepEqual(ensureNodeOptions(http), http);
});

test("ensureNodeOptions (#220): idempotent + preserves an existing NODE_OPTIONS", () => {
  const once = ensureNodeOptions({ type: "stdio", command: "npx", args: ["x"], env: { NODE_OPTIONS: "--max-old-space-size=256" } });
  assert.equal(once.env.NODE_OPTIONS, `--max-old-space-size=256 ${IPV4_FLAGS}`);
  assert.deepEqual(ensureNodeOptions(once), once, "a second pass adds nothing");
  const other = ensureNodeOptions({ type: "stdio", command: "npx", args: ["x"], env: { FOO: "bar" } });
  assert.equal(other.env.FOO, "bar", "unrelated env is kept");
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

test("gen-mcp (#220 item 4): the generated github server injects the PAT into the Bearer header", () => withTempDir((dir) => {
  runGenMcp(dir, [], { GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_itemfour" });
  const gh = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8")).mcpServers.github;
  assert.equal(gh.headers.Authorization, "Bearer ghp_itemfour");
}));

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
test("gen-mcp (#220): every stdio server in the generated config carries the IPv4-first NODE_OPTIONS", () => withTempDir((dir) => {
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
  }
  assert.ok(stdioSeen >= 3, `expected several stdio servers, saw ${stdioSeen}`);
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
  runGenMcp(dir, ["--with", "postman"], { POSTMAN_API_KEY: "PMAK-testkey-1234567890" });
  const cfg = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8"));
  const auth = cfg.mcpServers.postman.headers.Authorization;
  assert.equal(auth, "Bearer PMAK-testkey-1234567890", "the embedded placeholder is substituted in place");
  assert.doesNotMatch(auth, /<POSTMAN_API_KEY>/);
}));

test("item 8a: an UNRESOLVED placeholder emits a degraded_artifact / mcp_config observation", () => withTempDir((dir) => {
  const sid = seedSession(dir);
  // GITHUB token present (so github resolves), POSTMAN key ABSENT → the postman header stays a
  // placeholder → a required output (.mcp.json) ships degraded → observation.
  runGenMcp(dir, ["--with", "postman"], { GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_present", POSTMAN_API_KEY: "" });
  const obs = readObsRecords(dir).filter((o) => o.subject === "mcp_config");
  assert.ok(obs.length >= 1, "an unresolved placeholder must produce an mcp_config observation");
  assert.equal(obs[0].class, "degraded_artifact", "a required output shipping degraded is degraded_artifact, not a bare warn");
  assert.equal(obs[0].skill, "project-init");
  // the evidence carries the placeholder NAME (plugin-authored), never a key value
  const ev = JSON.stringify(obs);
  assert.match(ev, /POSTMAN_API_KEY/);
  assert.doesNotMatch(ev, /PMAK-/, "no key value is ever in the evidence");
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
