#!/usr/bin/env node
// Screenshots every scenario of a scenarios file against one running build.
//
//   node capture.mjs --variant <name> --base <url> --out <shots dir> --scenarios <file> [--auth <storage.json>] [--only id,id]
//
// Writes <out>/<variant>/<id>--<viewport>--<scheme>.jpg and <out>/<variant>/results.json (console and
// GraphQL errors per shot). A scenario's `seed` runs once, on the first variant, and is replayed from
// <out>/seeds/<id>.json into every later variant, so all builds render the same state.
import fs from "node:fs";
import path from "node:path";
import { launch, parseArgs } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
for (const key of ["variant", "base", "out", "scenarios"]) {
  if (typeof args[key] !== "string") {
    console.error("usage: node capture.mjs --variant <name> --base <url> --out <dir> --scenarios <file> [--auth <file>] [--only ids]");
    process.exit(2);
  }
}
const { variant, base, out } = args;
const scenarios = JSON.parse(fs.readFileSync(args.scenarios, "utf8")).scenarios;
const only = typeof args.only === "string" ? new Set(args.only.split(",")) : null;
// Playwright reads the size from `viewport`; a bare width/height is silently ignored (1280x720).
const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};

fs.mkdirSync(path.join(out, variant), { recursive: true });
const browser = await launch();
const results = [];

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

async function runStep(page, step) {
  if (step.goto) await page.goto(base + step.goto, { waitUntil: "domcontentloaded" });
  if (step.click) {
    const loc = page.locator(step.click);
    const n = Math.min(await loc.count(), step.count ?? 1);
    for (let i = 0; i < n; i++) {
      await loc.nth(i).scrollIntoViewIfNeeded().catch(() => {});
      await loc
        .nth(i)
        .click({ timeout: 5000 })
        .catch((e) => console.warn(`  click ${step.click} [${i}]: ${e.message.split("\n")[0]}`));
      await page.waitForTimeout(600);
    }
  }
  if (step.fill) await page.locator(step.fill).first().fill(String(step.value)).catch(() => {});
  if (step.press) await page.keyboard.press(step.press);
  if (step.scroll != null) await page.evaluate((y) => window.scrollTo(0, y), step.scroll);
  if (step.wait) await page.waitForTimeout(step.wait);
  await settle(page);
}

async function seedStorage(sc) {
  const seedFile = path.join(out, "seeds", `${sc.id}.json`);
  if (fs.existsSync(seedFile)) return JSON.parse(fs.readFileSync(seedFile, "utf8"));
  const ctx = await browser.newContext({ ...VIEWPORTS.desktop, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  for (const step of sc.seed.steps) await runStep(page, step);
  const values = await page.evaluate((keys) => Object.fromEntries(keys.map((k) => [k, localStorage.getItem(k)])), sc.seed.keys);
  await ctx.close();
  fs.mkdirSync(path.dirname(seedFile), { recursive: true });
  fs.writeFileSync(seedFile, JSON.stringify(values));
  return values;
}

for (const sc of scenarios) {
  if (only && !only.has(sc.id)) continue;
  if (sc.auth && typeof args.auth !== "string") {
    console.warn(`skip ${sc.id}: needs --auth`);
    continue;
  }
  const seeded = sc.seed ? await seedStorage(sc) : null;
  for (const vpName of sc.viewports ?? ["desktop", "mobile"]) {
    for (const scheme of sc.schemes ?? ["light"]) {
      const context = await browser.newContext({
        ...VIEWPORTS[vpName],
        colorScheme: scheme,
        ignoreHTTPSErrors: true,
        storageState: sc.auth ? args.auth : undefined,
      });
      if (seeded) {
        await context.addInitScript((v) => {
          for (const [k, x] of Object.entries(v)) if (x != null) localStorage.setItem(k, x);
        }, seeded);
      }
      // The theme follows the OS scheme in "system" mode, which colorScheme emulates.
      if (scheme === "dark") await context.addInitScript(() => localStorage.setItem("vc-color-mode", "system"));
      const page = await context.newPage();
      const consoleErrors = [];
      const gqlErrors = [];
      page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 300)));
      page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 300)}`));
      page.on("response", async (r) => {
        if (!r.url().includes("/graphql") || r.request().method() !== "POST") return;
        try {
          const body = await r.json();
          for (const b of [].concat(body)) {
            if (b?.errors?.length) gqlErrors.push(`${r.request().postDataJSON()?.operationName}: ${b.errors[0].message}`.slice(0, 300));
          }
        } catch {}
      });
      const file = `${sc.id}--${vpName}--${scheme}.jpg`;
      try {
        for (const step of sc.steps) await runStep(page, step);
        await page.screenshot({ path: path.join(out, variant, file), fullPage: sc.fullPage !== false, type: "jpeg", quality: 72 });
        console.log(`ok ${variant} ${file}`);
      } catch (e) {
        console.warn(`FAIL ${variant} ${file}: ${e.message.split("\n")[0]}`);
      }
      results.push({ id: sc.id, viewport: vpName, scheme, file, url: page.url().replace(base, ""), consoleErrors, gqlErrors });
      await context.close();
    }
  }
}

const resultsFile = path.join(out, variant, "results.json");
const previous = fs.existsSync(resultsFile) ? JSON.parse(fs.readFileSync(resultsFile, "utf8")) : [];
const merged = [...previous.filter((r) => !results.some((n) => n.file === r.file)), ...results];
fs.writeFileSync(resultsFile, JSON.stringify(merged, null, 2));
await browser.close();
