// Auth fixtures for the executable .spec suites: `signedInAs(role)` -> a signed-in storefront Page,
// `apiAs(role)` -> an authenticated Platform-API request context, `signInHere(page, role)` -> signs in
// the page that is ALREADY open (a guest session), so what the storefront does at sign-in (the cart
// merge) happens in that session.
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
import { acquireToken, resolveRole, type RoleCredentials } from "../../scripts/lib/graphql-auth.js";
import {
  createEphemeralAccount,
  deleteEphemeralAccount,
  newHandle,
  password as ephemeralPassword,
} from "../../scripts/lib/loyalty-ephemeral-account.mjs";
import {
  EMAIL_SELECTORS,
  PWD_SELECTORS,
  SUBMIT_SELECTORS,
  SWITCH_TO_PASSWORD_SELECTORS,
} from "../../scripts/lib/sign-in-selectors.js";

/**
 * Every request except the storefront's token endpoint: a password sign-in POSTs the password to
 * `/connect/token`, so that one request is never written into a HAR (signInHere signs in IN the page).
 */
const HAR_URL_FILTER = /^(?!.*\/connect\/token(?:[?#]|$)).*$/;

/** Every disposable customer and organization a spec mints starts with this; a crashed run's leftovers are swept by it. */
export const DISPOSABLE_PREFIX = "AGENT-TEST-SPEC-";

/**
 * A storefront customer created for ONE test and deleted after it: `personal` (no organization) or
 * `orgMember` (the only member of an organization created for it). Nothing else signs in as it, so no
 * other run can lock it, fill its cart or change its state. Its password is the ephemeral-account one
 * (DEFAULT_TEST_PASSWORD), resolved in this module and never handed to a spec.
 */
export interface DisposableCustomer {
  kind: "personal" | "orgMember";
  email: string;
  userId: string;
  memberId: string;
  organizationId?: string;
}

/** Who an auth fixture acts as: a role alias from test-data/aliases.json, or a disposable customer. */
export type Who = string | DisposableCustomer;

function credsFor(who: Who): RoleCredentials {
  if (typeof who === "string") return resolveRole(who, join(ROOT, "test-data"));
  return {
    role: who.email,
    email: who.email,
    password: ephemeralPassword(),
    storeId: env("STORE_ID"),
    organizationId: who.organizationId,
  };
}

type AdminApi = (method: string, path: string, body?: unknown, opts?: { expectStatus?: number[] }) => Promise<any>;

/** The platform admin API in the shape the seeders' account helpers take: (method, path, body, { expectStatus }). */
async function adminApi(): Promise<AdminApi> {
  const token = await acquireToken(resolveRole("ADMIN", join(ROOT, "test-data")), { backUrl: env("BACK_URL") });
  return async (method, path, body = null, { expectStatus = [200] } = {}) => {
    const res = await fetch(`${env("BACK_URL")}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token.accessToken}`, "Content-Type": "application/json" },
      body: body == null ? undefined : JSON.stringify(body),
    });
    if (!expectStatus.includes(res.status)) throw new Error(`admin ${method} ${path} -> HTTP ${res.status}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };
}

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
  apiAs: (who: Who) => Promise<APIRequestContext>;
  signInHere: (page: Page, who: Who) => Promise<void>;
  disposableCustomer: (kind: DisposableCustomer["kind"]) => Promise<DisposableCustomer>;
}>({
  // Spec §5: HAR is captured for EVERY spec. The built-in `context` is built from `contextOptions`,
  // so adding recordHar here covers an anonymous spec that uses the plain `page` fixture too.
  // viewport / locale stay the project's (playwright.config.ts) — they are not re-stated here.
  contextOptions: async ({ contextOptions }, use, testInfo) => {
    await use({
      ...contextOptions,
      recordHar: { path: testInfo.outputPath("session.har"), content: "embed", urlFilter: HAR_URL_FILTER },
    });
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
          recordHar: { path: testInfo.outputPath(har), content: "embed", urlFilter: HAR_URL_FILTER },
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

  /**
   * Signs in `page` — the guest page a test already drove — through the storefront's own password
   * form, so the storefront's sign-in side effects (the guest-to-account cart merge) run in THAT
   * session; `signedInAs` cannot do this, it opens a new context from a saved session. Leaves the page
   * wherever the storefront lands after sign-in, network settled. Never sends a password through a
   * spec: it is resolved here (resolveRole) and typed straight into the field. It stays out of the
   * evidence: the HAR filter drops `/connect/token`, and the trace is paused for the sign-in itself
   * (stopChunk without a path discards that chunk, so a trace retained on failure starts after it).
   * A failure throws a plain Error: a fixture error, so D8 classes it BLOCKED, never a product FAIL.
   */
  signInHere: async ({}, use) => {
    await use(async (page: Page, who: Who) => {
      const creds = credsFor(who);
      const role = creds.role;
      const tracing = page.context().tracing;
      const paused = await tracing.stopChunk().then(() => true, () => false); // false: no trace running
      try {
        await page.goto(`${env("FRONT_URL")}/sign-in`, { waitUntil: "networkidle" });
        // The page opens on the one-time-code form on current builds; the password form sits behind a link.
        await page.locator([...SWITCH_TO_PASSWORD_SELECTORS, ...EMAIL_SELECTORS].join(", ")).first()
          .waitFor({ state: "visible", timeout: 20_000 });
        const toPassword = page.locator(SWITCH_TO_PASSWORD_SELECTORS.join(", ")).first();
        if (await toPassword.isVisible()) await toPassword.click();
        const email = page.locator(EMAIL_SELECTORS.join(", ")).first();
        await email.waitFor({ state: "visible", timeout: 20_000 });
        await email.fill(creds.email);
        await page.locator(PWD_SELECTORS.join(", ")).first().fill(creds.password);
        await Promise.all([
          page.waitForURL((u) => !u.pathname.includes("/sign-in"), { timeout: 45_000 }),
          page.locator(SUBMIT_SELECTORS.join(", ")).first().click(),
        ]).catch(() => {
          throw new Error(`signInHere(${role}): still on /sign-in after submitting the password form`);
        });
        await page.waitForLoadState("networkidle");
      } finally {
        if (paused) await tracing.startChunk();
      }
    });
  },

  /**
   * Creates a customer for this test only — see DisposableCustomer — through the create path the
   * seeders use (scripts/lib/loyalty-ephemeral-account.mjs: contact, account, approve, password). An
   * `orgMember` also gets its own organization. Teardown deletes the account, the contact and the
   * organization after every afterEach hook has run, so a spec's own cart cleanup can still sign in. A
   * crashed run leaves `AGENT-TEST-SPEC-*` behind; sweepEphemeralAccounts with DISPOSABLE_PREFIX reclaims it.
   */
  disposableCustomer: async ({}, use) => {
    const api = await adminApi();
    const made: DisposableCustomer[] = [];
    try {
      await use(async (kind) => {
        let organizationId: string | undefined;
        if (kind === "orgMember") {
          const name = newHandle(`${DISPOSABLE_PREFIX}ORG-`);
          const org = await api("POST", "/api/members", { memberType: "Organization", name, status: "Approved" }, { expectStatus: [200, 201] });
          organizationId = org.id as string;
        }
        try {
          const account = await createEphemeralAccount(api, {
            prefix: DISPOSABLE_PREFIX,
            storeId: env("STORE_ID"),
            withOrg: false,
            organizationId,
            firstName: "Agent",
            lastName: kind === "orgMember" ? "OrgMember" : "Personal",
          });
          const customer: DisposableCustomer = { kind, email: account.email, userId: account.userId, memberId: account.memberId, organizationId };
          made.push(customer);
          return customer;
        } catch (e) {
          if (organizationId) await api("DELETE", `/api/members?ids=${organizationId}`, null, { expectStatus: [200, 204, 404] });
          throw e;
        }
      });
    } finally {
      for (const c of made) {
        await deleteEphemeralAccount(api, { email: c.email, memberId: c.memberId, prefix: DISPOSABLE_PREFIX });
        if (c.organizationId) await api("DELETE", `/api/members?ids=${c.organizationId}`, null, { expectStatus: [200, 204, 404] });
      }
    }
  },

  apiAs: async ({}, use) => {
    const opened: APIRequestContext[] = [];
    await use(async (who: Who) => {
      const creds = credsFor(who);
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
