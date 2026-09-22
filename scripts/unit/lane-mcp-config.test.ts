// Unit tests for ci/lib/lane-mcp.ts — per-lane Playwright MCP output isolation.
//
// The regression being locked out: `ci/run-regression.ts` handed every concurrent suite ONE
// `mcpServers` object pointing at `ci/config/mcp-playwright-chrome.ci.json`, which hardcodes
// `outputDir: "./test-results/chrome"` and `recordHar.path: "./test-results/chrome/trace.har"`.
// At MAX_PARALLEL=3 that is three writers on one HAR file and one screenshot directory, so
// failure evidence could belong to the wrong suite — worse than having none, because it is not
// obviously wrong.
//
// Also locked out: pointing `recordHar.path` at a DIRECTORY. Playwright treats it as a file
// path, so a directory value writes a real archive to a file literally named `har`, invisible
// to every `*.har` glob. That defect shipped for weeks in the interactive configs.
//
// Run: `npx tsx --test scripts/unit/lane-mcp-config.test.ts` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { laneConfigFor, laneOutputDir, TEMPLATE_PATH } from "../../ci/lib/lane-mcp.ts";

const template = JSON.parse(readFileSync(TEMPLATE_PATH, "utf-8")) as Record<string, unknown>;

function harPathOf(config: Record<string, unknown>): string {
  const browser = config.browser as Record<string, unknown>;
  const contextOptions = browser.contextOptions as Record<string, unknown>;
  const recordHar = contextOptions.recordHar as Record<string, unknown>;
  return String(recordHar.path);
}

// ---- the committed template is still the shape we expect ---------------------------

test("the committed template still has the fields this module rewrites", () => {
  assert.ok(template.browser, "template lost its `browser` block");
  assert.ok(typeof template.outputDir === "string", "template lost `outputDir`");
  const browser = template.browser as Record<string, unknown>;
  assert.ok(browser.contextOptions, "template lost `browser.contextOptions`");
});

test("the CI template captures HAR bodies, and every derived lane inherits that", () => {
  // The interactive lanes shipped `omitContent: true`, making every HAR body-less while the file
  // still existed and looked healthy (REG-2026-09-18-1818: a GraphQL document that demonstrably
  // went over the wire was simply absent from the archive). This template carried the same defect,
  // and because every CI lane is derived from it, one bad field silently disabled body capture for
  // the whole headless pool. `omitContent` is deprecated; `content` is the supported option.
  const contextOptions = (template.browser as Record<string, unknown>)
    .contextOptions as Record<string, unknown>;
  const recordHar = contextOptions.recordHar as Record<string, unknown>;
  assert.equal(recordHar.omitContent, undefined,
    "CI template: recordHar.omitContent is deprecated AND body-less — use content: \"embed\"");
  assert.equal(recordHar.content, "embed",
    `CI template: recordHar.content is "${recordHar.content}" — must be "embed" so bodies land in the .har`);

  for (const laneId of ["1", "2", "3"]) {
    const lane = laneConfigFor(template, laneId);
    const laneHar = ((lane.browser as Record<string, unknown>)
      .contextOptions as Record<string, unknown>).recordHar as Record<string, unknown>;
    assert.equal(laneHar.content, "embed",
      `lane ${laneId}: recordHar.content did not survive derivation — bodies would be dropped in CI`);
  }
});

// ---- isolation ---------------------------------------------------------------------

test("two lanes get different outputDir and different HAR paths", () => {
  const one = laneConfigFor(template, "1");
  const two = laneConfigFor(template, "2");

  assert.notEqual(one.outputDir, two.outputDir, "lanes must not share an output directory");
  assert.notEqual(harPathOf(one), harPathOf(two), "lanes must not share a HAR file");
});

test("every lane's paths live under that lane's own directory", () => {
  for (const laneId of ["1", "2", "3", "fastpath-1"]) {
    const config = laneConfigFor(template, laneId);
    const dir = laneOutputDir(laneId);
    assert.equal(config.outputDir, dir);
    assert.ok(
      harPathOf(config).startsWith(`${dir}/`),
      `lane ${laneId}: HAR path ${harPathOf(config)} escapes ${dir}`,
    );
  }
});

test("no two lanes in a realistic pool collide on any path", () => {
  const laneIds = ["1", "2", "3", "4", "5", "6", "fastpath-1", "fastpath-2", "deterministic-1"];
  const dirs = new Set<string>();
  const hars = new Set<string>();
  for (const id of laneIds) {
    const config = laneConfigFor(template, id);
    dirs.add(String(config.outputDir));
    hars.add(harPathOf(config));
  }
  assert.equal(dirs.size, laneIds.length, "an outputDir collision would mix screenshots");
  assert.equal(hars.size, laneIds.length, "a HAR collision would corrupt the archive");
});

// ---- the recordHar.path-is-a-file rule --------------------------------------------

test("recordHar.path names a .har FILE, not a directory", () => {
  const config = laneConfigFor(template, "1");
  const path = harPathOf(config);
  assert.ok(path.endsWith(".har"), `recordHar.path must end in .har, got ${path}`);
  assert.ok(!path.endsWith("/har"), "pointing recordHar.path at a directory writes a file named `har`");
});

// ---- purity ------------------------------------------------------------------------

test("laneConfigFor does not mutate the template", () => {
  const before = JSON.stringify(template);
  laneConfigFor(template, "1");
  laneConfigFor(template, "2");
  assert.equal(JSON.stringify(template), before, "the shared template must stay pristine");
});

test("template fields the module does not own are carried through untouched", () => {
  const config = laneConfigFor(template, "1");
  assert.equal(config.isolated, template.isolated);
  assert.equal(config.screenshot, template.screenshot);
  const browser = config.browser as Record<string, unknown>;
  const templateBrowser = template.browser as Record<string, unknown>;
  assert.deepEqual(browser.launchOptions, templateBrowser.launchOptions, "launch args must survive");
  const ctx = browser.contextOptions as Record<string, unknown>;
  const templateCtx = templateBrowser.contextOptions as Record<string, unknown>;
  assert.deepEqual(ctx.viewport, templateCtx.viewport, "viewport must survive");
  assert.equal(ctx.locale, templateCtx.locale);
});

test("a template with no recordHar block still gets a lane-scoped outputDir", () => {
  const stripped = {
    browser: { browserName: "chromium", contextOptions: { locale: "en-US" } },
    outputDir: "./test-results/chrome",
  };
  const config = laneConfigFor(stripped, "9");
  assert.equal(config.outputDir, laneOutputDir("9"));
  assert.ok(harPathOf(config).endsWith(".har"), "recordHar is added rather than skipped");
});
