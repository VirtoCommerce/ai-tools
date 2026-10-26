// plugins/vc-test/lib/knowledge-store.mjs — the one reader and writer of project and platform knowledge (spec §6).
// Two stores, one interface. The PROJECT store (`test.knowledgeStore`, default `qa-knowledge/`) holds how this
// project's product behaves; the PLATFORM store holds how Virto Commerce behaves and is written only by the
// platform project — a client run never writes there, whatever the caller asks, because what it learned can be a
// client's code, data or names. Reads go project first, then platform: a client customisation is not a platform
// error. Every write is scrubbed of the project's secret values first and lands inside its store only.
// Tests: knowledge-store.test.mjs (committed, U10).
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { loadSecretValues, redactText } from "./scrub.mjs";

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
    platformWritable: profile?.projectType !== "client",
  };
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
  const clean = redactText(String(text ?? ""), loadSecretValues(cfg.root));
  const part = `${file}.part-${process.pid}-${randomBytes(4).toString("hex")}`;
  writeFileSync(part, clean, { flag: "wx" });
  renameSync(part, file);
  return { path: file };
}
