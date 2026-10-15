#!/usr/bin/env node
// Builds one self-contained HTML report from the shots of the three builds, or prints the diff table.
//
//   node report.mjs --shots <dir> --scenarios <file> --diff                 # before→after pixel diff per shot
//   node report.mjs --shots <dir> --scenarios <file> --meta <file> --out <report.html>
//
// Resizing and diffing run in Chromium's canvas, so the only dependency is Playwright.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, parseArgs } from "./lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VARIANTS = [
  ["upstream", "Upstream"],
  ["before", "Fork before"],
  ["after", "Fork after"],
];
const args = parseArgs(process.argv.slice(2));
if (typeof args.shots !== "string" || typeof args.scenarios !== "string" || (!args.diff && (typeof args.meta !== "string" || typeof args.out !== "string"))) {
  console.error("usage: node report.mjs --shots <dir> --scenarios <file> (--diff | --meta <file> --out <file>)");
  process.exit(2);
}
const scenarios = JSON.parse(fs.readFileSync(args.scenarios, "utf8")).scenarios;
const meta = args.meta ? JSON.parse(fs.readFileSync(args.meta, "utf8")) : { scenarios: {} };
const results = Object.fromEntries(
  VARIANTS.map(([v]) => {
    const file = path.join(args.shots, v, "results.json");
    return [v, Object.fromEntries((fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : []).map((r) => [r.file, r]))];
  }),
);
const dataUri = (file) => `data:image/jpeg;base64,${fs.readFileSync(file).toString("base64")}`;

const browser = await launch();
const page = await browser.newPage();
await page.setContent("<canvas></canvas>");

const load = (src) =>
  page.evaluate(
    (s) =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve([img.naturalWidth, img.naturalHeight]);
        img.onerror = reject;
        img.src = s;
        window.__img = window.__img || [];
        window.__img.push(img);
      }),
    src,
  );

async function diff(a, b) {
  await page.evaluate(() => (window.__img = []));
  const [[wa, ha], [wb, hb]] = [await load(dataUri(a)), await load(dataUri(b))];
  if (wa !== wb || ha !== hb) return { pct: null, note: `height ${ha}→${hb}px` };
  const pct = await page.evaluate(() => {
    const [ia, ib] = window.__img;
    const read = (img) => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, c.width, c.height).data;
    };
    const da = read(ia), db = read(ib);
    let changed = 0;
    for (let i = 0; i < da.length; i += 4) {
      const la = da[i] * 0.3 + da[i + 1] * 0.59 + da[i + 2] * 0.11;
      const lb = db[i] * 0.3 + db[i + 1] * 0.59 + db[i + 2] * 0.11;
      if (Math.abs(la - lb) > 16) changed++;
    }
    return (100 * changed) / (da.length / 4);
  });
  return { pct: Math.round(pct * 100) / 100, note: null };
}

async function shrink(file, mobile) {
  await page.evaluate(() => (window.__img = []));
  await load(dataUri(file));
  return page.evaluate((m) => {
    const img = window.__img[0];
    const width = m ? 390 : 1120;
    const height = Math.min(32000, Math.round((img.naturalHeight * width) / img.naturalWidth));
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, width, (img.naturalHeight * width) / img.naturalWidth);
    return { src: c.toDataURL("image/jpeg", m ? 0.7 : 0.66), w: width, h: height };
  }, mobile);
}

const sections = [];
for (const sc of scenarios) {
  const shots = [];
  for (const vp of sc.viewports ?? ["desktop", "mobile"]) {
    for (const scheme of sc.schemes ?? ["light"]) {
      const name = `${sc.id}--${vp}--${scheme}.jpg`;
      const files = Object.fromEntries(VARIANTS.map(([v]) => [v, path.join(args.shots, v, name)]));
      if (!Object.values(files).every((f) => fs.existsSync(f))) continue;
      const d = await diff(files.before, files.after);
      if (args.diff) {
        console.log(`${name.replace(".jpg", "").padEnd(44)} ${d.pct == null ? d.note : `${d.pct}%`}`);
        continue;
      }
      const imgs = {};
      for (const [v] of VARIANTS) {
        const r = results[v][name] ?? {};
        imgs[v] = { ...(await shrink(files[v], vp === "mobile")), console: r.consoleErrors ?? [], gql: r.gqlErrors ?? [] };
      }
      shots.push({ key: `${vp}-${scheme}`, label: `${vp[0].toUpperCase()}${vp.slice(1)} · ${scheme}`, imgs, diff: d.pct, diffNote: d.note });
    }
  }
  const m = meta.scenarios[sc.id] ?? {};
  sections.push({
    id: sc.id,
    title: sc.title,
    why: sc.why,
    url: sc.steps.find((s) => s.goto)?.goto ?? "",
    verdict: m.verdict ?? "unreviewed",
    note: m.note ?? "",
    shots,
  });
}
await browser.close();

if (!args.diff) {
  const data = JSON.stringify({ meta, sections, variants: VARIANTS }).replace(/</g, "\\u003c");
  const html = fs
    .readFileSync(path.join(HERE, "report-template.html"), "utf8")
    .replace("__TITLE__", meta.title.replace(/[<&]/g, ""))
    .replace("/*__DATA__*/null", () => data);
  fs.writeFileSync(args.out, html);
  console.log(`${args.out} ${(fs.statSync(args.out).size / 1e6).toFixed(1)} MB`);
}
