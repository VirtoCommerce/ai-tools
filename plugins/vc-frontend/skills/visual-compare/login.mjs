#!/usr/bin/env node
// Opens a visible browser on the build's sign-in page for the USER to sign in, then saves the session.
//
//   node login.mjs --base <url> --save <storage.json>
//
// The agent never types credentials: the preview proxies sign-in to a remote backend. The saved state is
// per origin, so serve every build on the same port and one sign-in covers all of them. Tokens expire —
// sign in again when signed-in shots come out as the sign-in page.
import { launch, parseArgs } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
if (typeof args.base !== "string" || typeof args.save !== "string") {
  console.error("usage: node login.mjs --base <url> --save <storage.json>");
  process.exit(2);
}

const browser = await launch({ headless: false });
const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 860 } });
const page = await context.newPage();
await page.goto(`${args.base}/sign-in`);
console.log("Sign in in the opened window; this waits up to 10 minutes.");
await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 600000 });
await page.waitForLoadState("networkidle").catch(() => {});
await page.waitForTimeout(2000);
await context.storageState({ path: args.save });
console.log(`saved ${args.save}`);
await browser.close();
