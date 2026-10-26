// plugins/vc-test/lib/knowledge-store.mjs — the one reader and writer of project and platform knowledge (spec §6).
// Two stores, one interface. The PROJECT store (`test.knowledgeStore`, default `qa-knowledge/`) holds how this
// project's product behaves; the PLATFORM store holds how Virto Commerce behaves and is written only by the
// platform project — a client run never writes there, whatever the caller asks, because what it learned can be a
// client's code, data or names. Reads go project first, then platform: a client customisation is not a platform
// error. Every write is scrubbed of the project's secret values first and lands inside its store only.
// Tests: knowledge-store.test.mjs (committed, U10).
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { currentEnv } from "./paths.mjs";
import { MIN_SECRET_LENGTH, SECRET_NAME, TOKEN_SHAPES, loadSecretValues, looksLikePath, secretValuesFrom } from "../skills/ticket-context/lib/scrub.mjs";
import { envFolders, readEnvFile } from "../scripts/lib/env-layers.mjs";

/** What the stores hold, in the formats §6 names. `<slug>` is the caller's; everything else is fixed here. */
export const KINDS = Object.freeze({
  rules: "rules/<slug>.yaml",
  "domain-map": "domain/<slug>.md",
  "mind-map": "domain/<slug>.mind-map.json",
  "test-doc": "tests/<slug>.md",
  aliases: "test-data/aliases.json",
  observed: "observed/<slug>.json",
});

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const DEFAULT_STORE = "qa-knowledge/";

/**
 * Where the stores are for this project. `platform` is a local folder only where the profile names one
 * (`test.platformStore`); otherwise the platform store is the public kb, reached through its own tools.
 * @returns {{ project: string, platform: string|null, platformWritable: boolean, root: string }}
 */
export function storeConfig(profile, { root }) {
  const t = profile?.test && typeof profile.test === "object" ? profile.test : {};
  const pick = (v) => (typeof v === "string" && v.trim() ? v : null);
  const platform = pick(t.platformStore);
  return {
    root,
    project: resolve(root, pick(t.knowledgeStore) ?? DEFAULT_STORE),
    platform: platform ? resolve(root, platform) : null,
    // Only a project that declares itself the platform writes there: a missing or unknown projectType is refused.
    platformWritable: profile?.projectType === "platform",
  };
}

/**
 * Every secret VALUE this project holds: `.env.local` and every `.env.playwright.*` file (per env, master, all) in
 * the root and in the env's QA_ENV_PATH folders, plus this process's secret-named variables (a password the
 * bridge handed over from vc-secrets lives only there) — except a variable whose value a non-secret layer
 * (`.env.defaults`, `.env.<env>`) declares: `ORDER_KEYWORD_TOKEN=Beacon` or `PASSWORDS=master` is a fact, and
 * masking it would blank that word wherever the knowledge mentions it.
 */
export function knowledgeSecretValues(root, env = process.env) {
  const values = loadSecretValues(root, env);
  const testEnv = currentEnv();
  const dirs = [root, ...envFolders({ env: testEnv, root, ambient: env })];
  const declared = new Set();
  for (const file of [join(root, ".env.defaults"), ...dirs.map((dir) => join(dir, `.env.${testEnv}`))]) {
    for (const v of Object.values(readEnvFile(file) ?? {})) declared.add(v);
  }
  for (const dir of dirs) {
    let names = [];
    try { names = readdirSync(dir); } catch { continue; }
    for (const n of names) {
      if (n !== ".env.local" && !/^\.env\.playwright\..+$/.test(n)) continue;
      try { for (const v of secretValuesFrom(readFileSync(join(dir, n), "utf8"))) values.add(v); } catch { /* unreadable: skip */ }
    }
  }
  for (const [name, v] of Object.entries(env)) {
    if (SECRET_NAME.test(name) && typeof v === "string" && v.length >= MIN_SECRET_LENGTH && !looksLikePath(v) && !declared.has(v)) values.add(v);
  }
  return values;
}

/**
 * Knowledge is prose and data, not a log: only secret VALUES (and token shapes) are masked — never a key named
 * like a secret, a "Token:" line or a URL query, which are facts about the product. Every spelling of a value.
 */
export function scrubValues(text, values) {
  let s = String(text);
  const variants = new Set();
  for (const v of values) {
    if (!v) continue;
    variants.add(v);
    variants.add(JSON.stringify(v).slice(1, -1));
    try { variants.add(encodeURIComponent(v)); } catch { /* not encodable */ }
  }
  for (const v of [...variants].sort((a, b) => b.length - a.length)) s = s.split(v).join("[REDACTED]");
  for (const [, re] of TOKEN_SHAPES) s = s.replace(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`), "[REDACTED]");
  return s;
}

/** A JSON kind is scrubbed inside its string values and must still be JSON; anything else is scrubbed as text. */
function scrubFor(kind, text, values) {
  if (!KINDS[kind].endsWith(".json")) return scrubValues(text, values);
  let doc;
  try {
    doc = JSON.parse(String(text));
  } catch (e) {
    throw new Error(`${kind} must be valid JSON: not valid JSON (${e.message})`);
  }
  const walk = (v) => (typeof v === "string" ? scrubValues(v, values) : Array.isArray(v) ? v.map(walk) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) : v);
  return `${JSON.stringify(walk(doc), null, 2)}\n`;
}

const outside = () => new Error("outside the store — a slug is lowercase letters, digits and dashes, and the file stays inside its store");

function relPath(kind, slug) {
  if (!Object.prototype.hasOwnProperty.call(KINDS, kind)) throw new Error(`unknown kind ${JSON.stringify(kind)} (known: ${Object.keys(KINDS).join(", ")})`);
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) throw outside();
  return KINDS[kind].replace("<slug>", slug);
}

const within = (base, path) => {
  const rel = relative(base, path);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
};

/** The file for kind/slug in `store`, inside it lexically and after resolving the nearest existing folder. */
function fileIn(store, kind, slug) {
  const file = resolve(store, relPath(kind, slug));
  if (!within(store, file)) throw outside();
  mkdirSync(store, { recursive: true });
  const realStore = realpathSync.native(store);
  let dir = dirname(file);
  while (!existsSync(dir)) dir = dirname(dir);
  const realDir = realpathSync.native(dir);
  if (realDir !== realStore && !within(realStore, realDir)) throw outside();
  return file;
}

/** The project store's entry, else the platform folder's; null when neither holds it. */
export function readKnowledge(cfg, kind, slug) {
  const rel = relPath(kind, slug);
  for (const [source, store] of [["project", cfg.project], ["platform", cfg.platform]]) {
    if (!store) continue;
    const file = resolve(store, rel);
    if (within(store, file) && existsSync(file)) return { text: readFileSync(file, "utf8"), source };
  }
  return null;
}

/**
 * Write one entry. `target: "platform"` is refused on a client project and where no platform folder is
 * configured. The text is scrubbed of the secret values in the project's env files; the file is written to
 * a fresh sibling and renamed into place, so a link already at the path is never written through.
 * @returns {{ path: string }}
 */
export function writeKnowledge(cfg, { kind, slug, text, target = "project" }) {
  if (target === "platform" && !cfg.platformWritable) throw new Error("platform write refused: this is a client project — its knowledge stays in its own store");
  if (target !== "project" && target !== "platform") throw new Error(`unknown target ${JSON.stringify(target)}`);
  const store = target === "platform" ? cfg.platform : cfg.project;
  if (!store) throw new Error("no platform store is configured here — the platform's knowledge is written through the kb, not a file");
  const file = fileIn(store, kind, slug);
  mkdirSync(dirname(file), { recursive: true });
  const clean = scrubFor(kind, String(text ?? ""), knowledgeSecretValues(cfg.root));
  const part = `${file}.part-${process.pid}-${randomBytes(4).toString("hex")}`;
  writeFileSync(part, clean, { flag: "wx" });
  renameSync(part, file);
  return { path: file };
}
