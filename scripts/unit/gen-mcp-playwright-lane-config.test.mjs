// Regression guard: regenerating .mcp.json must NOT drop a deployment's own Playwright
// --config / --secrets. Losing --config strips recordHar, recordVideo, locale, launchOptions
// and the Firefox window_occlusion_tracking workaround (the only thing making that lane
// click-capable). Losing --secrets is worse than a crash: playwright-mcp then types the BARE
// KEY NAME as a literal, so a login "succeeds" with the wrong string and nothing errors.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { preferProjectPlaywrightConfig } from "../../plugins/vc-fix/skills/project-init/gen-mcp.mjs";

const ROOT = join("/proj");
const cfgFor = (l) => join(ROOT, "config", "mcp-playwright-" + l + ".config.json");
const SECRETS = join(ROOT, ".env.playwright.local");

const lane = (browser, name) => ({
  type: "stdio",
  command: "cmd",
  args: ["/c", "npx", "@playwright/mcp@0.0.77", "--browser", browser, "--isolated",
         "--viewport-size", "1920x1080", "--output-dir", "reports/x/" + name],
});
// Substring match on the basename only, so no path separators appear in this file.
const has = (...names) => (p) => names.some((n) => String(p).includes(n));
const none = () => false;

test("a lane with a project config gets --config and drops the flags it supersedes", () => {
  const out = preferProjectPlaywrightConfig(lane("firefox", "firefox"), "playwright-firefox", ROOT,
    has("mcp-playwright-firefox.config.json"));
  assert.ok(out.args.includes("--config"));
  assert.ok(out.args.includes(cfgFor("firefox")));
  for (const dropped of ["--browser", "--isolated", "--viewport-size", "--output-dir"]) {
    assert.ok(!out.args.includes(dropped), dropped + " should be superseded by --config");
  }
});

test("a secrets file is always passed, even for a lane with no project config", () => {
  const out = preferProjectPlaywrightConfig(lane("webkit", "webkit"), "playwright-webkit", ROOT,
    has(".env.playwright.local"));
  assert.ok(out.args.includes("--secrets"));
  assert.ok(out.args.includes(SECRETS));
  assert.ok(out.args.includes("--browser"), "inline flags survive when there is no --config");
});

test("both files present => --config and --secrets together", () => {
  const out = preferProjectPlaywrightConfig(lane("chrome", "chrome"), "playwright-chrome", ROOT,
    has("mcp-playwright-chrome.config.json", ".env.playwright.local"));
  assert.ok(out.args.includes(cfgFor("chrome")));
  assert.ok(out.args.includes(SECRETS));
});

test("a pristine deployment (neither file) is left exactly as the template shipped it", () => {
  const src = lane("chrome", "chrome");
  const out = preferProjectPlaywrightConfig(src, "playwright-chrome", ROOT, none);
  assert.deepEqual(out.args, src.args);
});

test("non-playwright servers are never touched", () => {
  const gh = { type: "stdio", command: "cmd", args: ["/c", "npx", "-y", "@modelcontextprotocol/server-github"] };
  const out = preferProjectPlaywrightConfig(gh, "github", ROOT, has(".env.playwright.local"));
  assert.deepEqual(out.args, gh.args);
});

test("re-running is idempotent - no duplicate --config / --secrets", () => {
  const ex = has("mcp-playwright-edge.config.json", ".env.playwright.local");
  const once = preferProjectPlaywrightConfig(lane("msedge", "edge"), "playwright-edge", ROOT, ex);
  const twice = preferProjectPlaywrightConfig(once, "playwright-edge", ROOT, ex);
  assert.deepEqual(twice.args, once.args);
  assert.equal(twice.args.filter((x) => x === "--secrets").length, 1);
  assert.equal(twice.args.filter((x) => x === "--config").length, 1);
});
