// Structural guard over config/mcp-playwright-*.config.json — the four browser-lane configs.
//
// Backlog B-10 asked for this by name, after the SAME defect regressed twice: `recordHar.path` is a
// FILE path to Playwright, so a value like `./test-results/mobile/har` (no extension) writes a real
// multi-megabyte archive to a file literally named `har`, invisible to every `*.har` glob. Nothing
// errors — the lane looks configured, the archive exists, and tooling plus reviewers conclude HAR
// capture is off. Fixed for chrome/edge/firefox on 2026-07-30 and reintroduced by the mobile config
// under R-10, which is precisely the shape of bug a one-line assert prevents and review does not.
//
// The same reasoning covers the other per-lane invariants asserted here: each is silent when wrong.
// Two lanes sharing a `recordHar.path` or an `outputDir` means one lane quietly overwrites the
// other's evidence; a dropped Firefox occlusion pref makes every click on that lane time out.
//
// These configs are read by the MCP servers at startup, NOT by this repo's code, so nothing else
// would ever catch a malformed one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const CONFIG_DIR = "config";

const LANES = readdirSync(CONFIG_DIR)
  .filter((f) => /^mcp-playwright-.*\.config\.json$/.test(f))
  .map((file) => ({
    file,
    lane: file.replace(/^mcp-playwright-/, "").replace(/\.config\.json$/, ""),
    cfg: JSON.parse(readFileSync(join(CONFIG_DIR, file), "utf8")),
  }));

test("every browser lane config is discovered", () => {
  const lanes = LANES.map((l) => l.lane).sort();
  assert.deepEqual(lanes, ["chrome", "edge", "firefox", "mobile"],
    "a lane was added or removed — update this guard deliberately, do not relax it");
});

test("recordHar.path is a FILE path ending in .har (B-10, regressed twice)", () => {
  for (const { file, lane, cfg } of LANES) {
    const har = cfg.browser?.contextOptions?.recordHar?.path;
    assert.ok(har, `${file}: no recordHar.path — HAR capture is required on every lane`);
    assert.ok(har.endsWith(".har"),
      `${file}: recordHar.path is "${har}" — Playwright treats this as a FILE, so without the .har ` +
      `extension the archive lands in a file named "${har.split("/").pop()}" and no *.har glob finds it`);
    assert.ok(har.includes(`/${lane}/`), `${file}: recordHar.path "${har}" does not live under its own lane`);
  }
});

test("HAR captures request/response bodies, not just headers (VCST triage 2026-09-19)", () => {
  // `omitContent: true` shipped on all four lanes and made every HAR body-less: a captured GraphQL
  // document or payload was simply absent, while the .har file existed and looked healthy. Measured
  // on REG-2026-09-18-1818 — `grep -c salesRepCustomerCounts session.har` returned 0 for a request
  // that demonstrably occurred. That silently defeats reports.md §8, which directs a report to
  // reference the HAR for exactly this evidence, so a verifier had to re-capture documents by hand.
  // `omitContent` is also deprecated; `content` is the supported option (embed | attach | omit).
  for (const { file, cfg } of LANES) {
    const har = cfg.browser?.contextOptions?.recordHar;
    assert.equal(har.omitContent, undefined,
      `${file}: recordHar.omitContent is deprecated AND body-less — use content: "embed"`);
    assert.equal(har.content, "embed",
      `${file}: recordHar.content is "${har.content}" — must be "embed" so bodies land in the .har. ` +
      `"omit" reproduces the original defect; "attach" writes bodies beside a .zip, which the repo's ` +
      `*.har globs (regression-triage.ts, bundle-evidence.ts) do not read`);
  }
});

test("lane artifact paths never collide", () => {
  for (const key of ["outputDir", "har"]) {
    const seen = new Map();
    for (const { file, cfg } of LANES) {
      const value = key === "outputDir" ? cfg.outputDir : cfg.browser?.contextOptions?.recordHar?.path;
      assert.ok(!seen.has(value),
        `${file} shares ${key} "${value}" with ${seen.get(value)} — one lane would overwrite the other's evidence`);
      seen.set(value, file);
    }
  }
});

test("every lane is isolated and pinned to en-US", () => {
  for (const { file, cfg } of LANES) {
    // A shared browser profile across parallel agents cross-contaminates cookies and navigation.
    assert.equal(cfg.browser?.isolated, true, `${file}: lane is not isolated`);
    // Locale drift silently changes date, number and currency formatting in every assertion.
    assert.equal(cfg.browser?.contextOptions?.locale, "en-US", `${file}: locale is not pinned to en-US`);
    assert.ok(cfg.browser?.contextOptions?.viewport?.width > 0, `${file}: no viewport`);
  }
});

test("the firefox lane keeps the occlusion-tracking workaround that makes it click-capable", () => {
  const firefox = LANES.find((l) => l.lane === "firefox").cfg;
  const prefs = firefox.browser?.launchOptions?.firefoxUserPrefs ?? {};
  assert.equal(prefs["widget.windows.window_occlusion_tracking.enabled"], false,
    "without this pref requestAnimationFrame never fires under Windows occlusion tracking, so every " +
    "click/hover/type actionability check times out and the lane fails as BLOCKED rather than loudly");
});

test("templates/.mcp.json.example binds every lane config that exists", () => {
  // How the mobile lane went missing: the config was committed under R-10 but no server entry ever
  // reached the template, so every fresh clone copied a .mcp.json with three lanes and the fourth
  // config sat unread — a lane that "exists" in `config/` but is loaded by nothing. `.mcp.json`
  // itself is gitignored and per-machine, so the template is the only tracked place this can be
  // caught. The failure is silent: the lane simply never appears.
  const tpl = JSON.parse(readFileSync(join("templates", ".mcp.json.example"), "utf8"));
  const servers = tpl.mcpServers ?? {};

  for (const { file, lane } of LANES) {
    const entry = servers[`playwright-${lane}`];
    assert.ok(entry, `templates/.mcp.json.example has no "playwright-${lane}" server, so ${file} is never loaded`);
    const args = entry.args ?? [];
    assert.ok(args.includes(`config/mcp-playwright-${lane}.config.json`),
      `playwright-${lane} in the template does not point at ${file}`);
    // A missing --secrets is worse than a crash: playwright-mcp then types the BARE KEY NAME as a
    // literal, so a login "succeeds" with the wrong string and nothing errors.
    assert.ok(args.includes("--secrets"), `playwright-${lane} in the template has no --secrets`);
  }

  // One pinned @playwright/mcp version across every lane — an unpinned or drifting entry swaps the
  // server binary that reads these configs.
  const versions = new Set(
    Object.entries(servers)
      .filter(([name]) => name.startsWith("playwright-"))
      .map(([, v]) => (v.args ?? []).find((a) => a.startsWith("@playwright/mcp@"))),
  );
  assert.equal(versions.size, 1, `lanes are pinned to different @playwright/mcp versions: ${[...versions].join(", ")}`);
  assert.ok([...versions][0]?.match(/@playwright\/mcp@\d+\.\d+\.\d+$/), "the @playwright/mcp pin is not an exact version");
});

test("WebKit is never configured — unsupported on Windows", () => {
  for (const { file, cfg } of LANES) {
    assert.notEqual(cfg.browser?.browserName, "webkit", `${file}: WebKit is not supported on Windows`);
    assert.ok(["chromium", "firefox"].includes(cfg.browser?.browserName),
      `${file}: browserName "${cfg.browser?.browserName}" must be a Playwright engine name, not a channel`);
  }
});
