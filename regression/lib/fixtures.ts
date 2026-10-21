// Auth fixtures for the executable .spec suites: `signedInAs(role)` -> a signed-in storefront Page,
// `apiAs(role)` -> an authenticated Platform-API request context.
//
// Credentials never pass through a spec. They are resolved in THIS module, in process, by the same
// door the GraphQL runner uses (resolveRole -> acquireToken); `env()` refuses secret-shaped names on
// purpose, so there is no other way for a spec to reach them.
import { test as base, expect, request, type APIRequestContext, type Page, type BrowserContext } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./data.js";
import { acquireToken, resolveRole } from "../../scripts/lib/graphql-auth.js";
import { EMAIL_SELECTORS, PWD_SELECTORS } from "../../scripts/auth/save-storage-state.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const STATE_DIR = join(ROOT, "test-results", "auth");
const SAVE_STATE_SCRIPT = join(ROOT, "scripts", "auth", "save-storage-state.ts");

/**
 * tsx's CLI entry, invoked through `process.execPath` — NOT a bare `npx`, which is `npx.cmd` on
 * Windows and ENOENTs (same trap and fix as scripts/regression/machine-lane.ts).
 */
const TSX_CLI = join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");

/**
 * A storefront page that REQUIRES sign-in: an anonymous browser is redirected from it to
 * `/sign-in?returnUrl=…`. (The storefront HOME is public, so it cannot tell a live session from an
 * empty one.) Confirmed live on TEST_ENV=vcst: `/account` -> `/sign-in?returnUrl=/account/dashboard`.
 */
const SIGNED_IN_ONLY_PATH = "/account/dashboard";

function stateFileFor(role: string): string {
  return join(STATE_DIR, `${role}.json`);
}

/**
 * Create `test-results/auth/<role>.json` by running the repo's own sign-in script (secrets stay in that
 * process). `fresh` discards an existing file first — used once when a saved session has expired.
 */
function ensureStateFile(role: string, fresh = false): string {
  const file = stateFileFor(role);
  if (fresh) rmSync(file, { force: true });
  if (existsSync(file)) return file;
  const out = spawnSync(process.execPath, [TSX_CLI, SAVE_STATE_SCRIPT, role], { cwd: ROOT, encoding: "utf-8" });
  if (!existsSync(file)) {
    // The script logs only alias / status / cookie count — never a credential — so its output is safe to show.
    const log = `${out.stdout ?? ""}${out.stderr ?? ""}`.trim().split("\n").slice(-4).join(" | ");
    throw new Error(`signedInAs(${role}): could not create ${role}.json (exit ${out.status}) — ${log}`);
  }
  return file;
}

async function onSignInPage(page: Page): Promise<boolean> {
  if (new URL(page.url()).pathname.includes("/sign-in")) return true;
  return (await page.locator(`${EMAIL_SELECTORS.join(", ")}, ${PWD_SELECTORS.join(", ")}`).count()) > 0;
}

export const test = base.extend<{
  signedInAs: (role: string) => Promise<Page>;
  apiAs: (role: string) => Promise<APIRequestContext>;
}>({
  // Spec §5: HAR is captured for EVERY spec. The built-in `context` is built from `contextOptions`,
  // so adding recordHar here covers an anonymous spec that uses the plain `page` fixture too.
  // viewport / locale stay the project's (playwright.config.ts) — they are not re-stated here.
  contextOptions: async ({ contextOptions }, use, testInfo) => {
    await use({ ...contextOptions, recordHar: { path: testInfo.outputPath("session.har"), content: "embed" } });
  },

  /**
   * A new context holding the saved session for `role`, HAR-recorded. Returns the page left on
   * `FRONT_URL` (home) after the session check. A saved session that no longer signs in (expired, or
   * minted on another stand) is discarded and re-created ONCE; if the fresh one fails too, it throws —
   * a fixture error, not an expect failure, so D8 classes it BLOCKED, never a product FAIL. Do not combine with the plain `page` fixture in
   * one test: both write `session.har` (later calls here write `session-<n>.har`).
   */
  signedInAs: async ({ browser }, use, testInfo) => {
    const opened: Array<{ context: BrowserContext }> = [];
    await use(async (role: string) => {
      const front = env("FRONT_URL");
      for (const fresh of [false, true]) {
        const storageState = ensureStateFile(role, fresh);
        const har = opened.length === 0 ? "session.har" : `session-${opened.length}.har`;
        // The project's viewport / locale (and trace + screenshot-on-failure) apply to any context made via
        // browser.newContext() inside a test (Playwright's own before/after-create hooks), so none is repeated here.
        const context = await browser.newContext({
          storageState,
          recordHar: { path: testInfo.outputPath(har), content: "embed" },
        });
        const page = await context.newPage();
        opened.push({ context });
        await page.goto(`${front}${SIGNED_IN_ONLY_PATH}`, { waitUntil: "networkidle" });
        if (await onSignInPage(page)) continue; // a stale session: retry once with a freshly minted one
        await page.goto(front, { waitUntil: "load" });
        return page;
      }
      throw new Error(`signedInAs(${role}): session not signed in, even after re-creating ${role}.json`);
    });
    for (const { context } of opened) await context.close(); // flushes the HAR
  },

  apiAs: async ({}, use) => {
    const opened: APIRequestContext[] = [];
    await use(async (role: string) => {
      const creds = resolveRole(role, join(ROOT, "test-data"));
      const token = await acquireToken(creds, { backUrl: env("BACK_URL"), storeId: env("STORE_ID") });
      const api = await request.newContext({
        baseURL: env("BACK_URL"),
        extraHTTPHeaders: { Authorization: `Bearer ${token.accessToken}` },
      });
      opened.push(api);
      return api;
    });
    for (const api of opened) await api.dispose();
  },
});

export { expect };
