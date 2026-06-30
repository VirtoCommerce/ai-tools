/**
 * save-storage-state.ts — generate authenticated Playwright storageState files
 * for storefront regression, WITHOUT ever materializing a password/token to any
 * agent transcript.
 *
 * - Resolves each account's credentials IN-PROCESS via resolveRole() (env / @td()),
 *   exactly like the GraphQL runner does. The secret is read from process.env and
 *   passed straight into page.fill(); it is never console.log'd.
 * - Logs ONLY: alias, success/failure, cookie count, and the output path. No secret
 *   values, no token strings.
 * - Output: test-results/auth/<alias>.json (gitignored dir). These files contain
 *   live session tokens — they are disposable and must stay out of git.
 *
 * Run:  npx tsx scripts/auth/save-storage-state.ts [ALIAS ...]
 *       (no args => generate the default account set below)
 *
 * storageState is browser-agnostic for a given origin, so the chromium-generated
 * files load into the firefox/edge MCP contexts too.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import "../../config.js"; // loads .env layers into process.env
import { resolveRole } from "../lib/graphql-auth.js";

const FRONT_URL = process.env.FRONT_URL;
if (!FRONT_URL) {
  console.error("FRONT_URL not set — aborting.");
  process.exit(1);
}

const TEST_DATA_DIR = join(process.cwd(), "test-data");
const OUT_DIR = join(process.cwd(), "test-results", "auth");
mkdirSync(OUT_DIR, { recursive: true });

// Default account set covering suites 006 / 008 / 033 primaries + secondaries.
const DEFAULT_ALIASES = [
  "USER",
  "MULTI_ORG_USER",
  "ORG_USER",
  "PERSONAL_USER_VIRTO",
  "TECHFLOW_ADMIN",
  "BUILDRIGHT_ADMIN",
  "MULTI_ORG_TF_BR",
];

const aliases = process.argv.slice(2).length
  ? process.argv.slice(2)
  : DEFAULT_ALIASES;

// Sign-in selectors (test-execution-preflight.md). Two known data-test-id forms.
const EMAIL_SELECTORS = [
  '[data-test-id="sign-in-page.email-input"]',
  '[data-test-id="email-input"]',
];
const PWD_SELECTORS = [
  '[data-test-id="sign-in-page.password-input"]',
  '[data-test-id="password-input"]',
];
const SUBMIT_SELECTORS = [
  '[data-test-id="sign-in-page.login-button"]',
  '[data-test-id="login-button"]',
];

async function firstVisible(page: any, selectors: string[], waitMs = 0) {
  // Optionally wait for any of the selectors to hydrate (SPA).
  if (waitMs) {
    try {
      await page.waitForSelector(selectors.join(", "), { state: "visible", timeout: waitMs });
    } catch {
      /* fall through to per-selector count check */
    }
  }
  for (const s of selectors) {
    const loc = page.locator(s).first();
    if (await loc.count()) return loc;
  }
  return null;
}

async function loginAndSave(alias: string): Promise<boolean> {
  // Accounts whose env-var naming doesn't fit resolveRole's {ROLE}_EMAIL pattern.
  const OVERRIDE: Record<string, { emailEnv: string; passwordEnv: string }> = {
    PERSONAL_USER_VIRTO: { emailEnv: "PERSONAL_USER_VIRTO", passwordEnv: "PERSONAL_USER_VIRTO_PASSWORD" },
  };

  let creds: { email: string; password: string };
  const ov = OVERRIDE[alias];
  if (ov) {
    const email = process.env[ov.emailEnv];
    const password = process.env[ov.passwordEnv];
    if (!email || !password) {
      console.log(`  ${alias}: SKIP — ${ov.emailEnv}/${ov.passwordEnv} not set`);
      return false;
    }
    creds = { email, password };
  } else {
    try {
      creds = resolveRole(alias, TEST_DATA_DIR); // { email, password, storeId? }
    } catch (e: any) {
      console.log(`  ${alias}: SKIP — cannot resolve creds (${e.message.split("\n")[0]})`);
      return false;
    }
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: "en-US" });
  const page = await context.newPage();
  try {
    await page.goto(`${FRONT_URL}/sign-in`, { waitUntil: "networkidle", timeout: 60000 });

    const emailEl = await firstVisible(page, EMAIL_SELECTORS, 20000);
    const pwdEl = await firstVisible(page, PWD_SELECTORS);
    const submitEl = await firstVisible(page, SUBMIT_SELECTORS);
    if (!emailEl || !pwdEl || !submitEl) {
      console.log(`  ${alias}: FAIL — sign-in form fields not found`);
      return false;
    }

    await emailEl.fill(creds.email);
    await pwdEl.fill(creds.password); // secret stays in-process; never logged
    await Promise.all([
      page.waitForURL((u: URL) => !u.pathname.includes("/sign-in"), { timeout: 45000 }).catch(() => {}),
      submitEl.click(),
    ]);
    // settle
    await page.waitForTimeout(2500);

    const stillOnSignIn = page.url().includes("/sign-in");
    const state = await context.storageState();
    const cookieCount = state.cookies.length;
    const hasAuth = cookieCount > 0 || (state.origins?.[0]?.localStorage?.length ?? 0) > 0;

    if (stillOnSignIn && !hasAuth) {
      console.log(`  ${alias}: FAIL — still on /sign-in, no session established (check creds/seed)`);
      return false;
    }

    const out = join(OUT_DIR, `${alias}.json`);
    writeFileSync(out, JSON.stringify(state, null, 2));
    console.log(`  ${alias}: OK — saved ${cookieCount} cookies → test-results/auth/${alias}.json`);
    return true;
  } catch (e: any) {
    console.log(`  ${alias}: ERROR — ${e.message.split("\n")[0]}`);
    return false;
  } finally {
    await context.close();
    await browser.close();
  }
}

(async () => {
  console.log(`Generating storageState for: ${aliases.join(", ")}`);
  const results: Record<string, boolean> = {};
  for (const a of aliases) results[a] = await loginAndSave(a);
  const ok = Object.values(results).filter(Boolean).length;
  console.log(`\nDone: ${ok}/${aliases.length} accounts authenticated.`);
  const failed = Object.entries(results).filter(([, v]) => !v).map(([k]) => k);
  if (failed.length) console.log(`Not generated: ${failed.join(", ")}`);
  process.exit(0);
})();
