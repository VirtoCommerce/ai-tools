// The knowledge-store write router (spec §6, U10 — a committed test by the owner's decision): what a client run
// learns stays in the client's project store and never reaches the public platform store; text is scrubbed
// before it is written; nothing lands outside the store, whatever slug or link the caller hands it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KINDS, readKnowledge, storeConfig, writeKnowledge } from "./knowledge-store.mjs";

function project({ projectType = "platform", platformStore } = {}) {
  const root = mkdtempSync(join(tmpdir(), "vct-ks-"));
  const profile = { schemaVersion: 3, projectType, test: { knowledgeStore: "qa-knowledge/", ...(platformStore ? { platformStore } : {}) } };
  return { root, profile, cfg: storeConfig(profile, { root }) };
}

test("storeConfig: project store from the test block, platform only where configured, writable unless client", () => {
  const { root, cfg } = project({ platformStore: ".claude/knowledge/" });
  assert.equal(cfg.project, join(root, "qa-knowledge"));
  assert.equal(cfg.platform, join(root, ".claude", "knowledge"));
  assert.equal(cfg.platformWritable, true);
  const client = project({ projectType: "client" });
  assert.equal(client.cfg.platform, null);
  assert.equal(client.cfg.platformWritable, false);
  const dflt = storeConfig({ schemaVersion: 3 }, { root });
  assert.equal(dflt.project, join(root, "qa-knowledge"));
});

test("a client project never writes to the platform store", () => {
  const { root, cfg } = project({ projectType: "client" });
  const forced = { ...cfg, platform: join(root, "platform") }; // even with a platform folder present
  assert.throws(() => writeKnowledge(forced, { kind: "test-doc", slug: "x", text: "t", target: "platform" }), /platform write refused: this is a client project/);
  assert.equal(existsSync(join(root, "platform")), false);
});

test("a non-client project writes to a configured platform store", () => {
  const { root, cfg } = project({ platformStore: "platform/" });
  const { path } = writeKnowledge(cfg, { kind: "rules", slug: "cart", text: "rules: []", target: "platform" });
  assert.equal(path, join(root, "platform", "rules", "cart.yaml"));
  assert.equal(readFileSync(path, "utf8"), "rules: []");
});

test("text is scrubbed of the project's secret values before it is written", () => {
  const { root, cfg } = project();
  writeFileSync(join(root, ".env.local"), "ADMIN_PASSWORD=Sup3rSecretPw\n");
  const { path } = writeKnowledge(cfg, { kind: "test-doc", slug: "run-1", text: "logged in with Sup3rSecretPw then checked" });
  const written = readFileSync(path, "utf8");
  assert.doesNotMatch(written, /Sup3rSecretPw/);
  assert.match(written, /logged in with .+ then checked/);
});

test("nothing is written outside the store: bad slugs and a junction that leads out", () => {
  const { root, cfg } = project();
  for (const slug of ["../x", "a/b", "C:\\x", "", "Upper", ".hidden"]) {
    assert.throws(() => writeKnowledge(cfg, { kind: "test-doc", slug, text: "t" }), /outside the store/, JSON.stringify(slug));
  }
  mkdirSync(join(root, "qa-knowledge"), { recursive: true });
  mkdirSync(join(root, "elsewhere"));
  symlinkSync(join(root, "elsewhere"), join(root, "qa-knowledge", "tests"), "junction");
  assert.throws(() => writeKnowledge(cfg, { kind: "test-doc", slug: "x", text: "t" }), /outside the store/);
  assert.deepEqual(readdirSync(join(root, "elsewhere")), []);
});

test("an unknown kind is refused", () => {
  const { cfg } = project();
  assert.throws(() => writeKnowledge(cfg, { kind: "secrets", slug: "x", text: "t" }), /unknown kind/);
  assert.ok(Object.keys(KINDS).includes("observed"));
});

test("read order: the project store first, then the platform folder; nothing ⇒ null", () => {
  const { root, cfg } = project({ platformStore: "platform/" });
  mkdirSync(join(root, "platform", "domain"), { recursive: true });
  writeFileSync(join(root, "platform", "domain", "cart.md"), "platform map");
  assert.deepEqual(readKnowledge(cfg, "domain-map", "cart"), { text: "platform map", source: "platform" });
  writeKnowledge(cfg, { kind: "domain-map", slug: "cart", text: "project map" });
  assert.deepEqual(readKnowledge(cfg, "domain-map", "cart"), { text: "project map", source: "project" });
  assert.equal(readKnowledge(cfg, "domain-map", "orders"), null);
});

// ── Fix pass after the P1c review ────────────────────────────────────────────────────────────────

test("a JSON kind survives the scrub: keys named like secrets and URL queries are knowledge, not secrets", () => {
  const { root, cfg } = project();
  const doc = { session: { ttl: 20 }, passwordPolicy: { min: 8 }, url: "/search?q=shoes&page=2" };
  const { path } = writeKnowledge(cfg, { kind: "mind-map", slug: "auth", text: JSON.stringify(doc, null, 2) });
  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), doc);
  const md = writeKnowledge(cfg, { kind: "test-doc", slug: "t", text: "- Session: kept 30 min\n- Token: the CSRF token rotates\nGET /search?q=shoes" });
  assert.equal(readFileSync(md.path, "utf8"), "- Session: kept 30 min\n- Token: the CSRF token rotates\nGET /search?q=shoes");
});

test("a JSON kind is redacted inside its string values and stays valid; text that is not JSON is refused", () => {
  const { root, cfg } = project();
  writeFileSync(join(root, ".env.local"), "ADMIN_PASSWORD=Sup3rSecretPw\n");
  const { path } = writeKnowledge(cfg, { kind: "observed", slug: "login", text: JSON.stringify({ claim: "logged in with Sup3rSecretPw" }) });
  const back = JSON.parse(readFileSync(path, "utf8"));
  assert.doesNotMatch(back.claim, /Sup3rSecretPw/);
  assert.throws(() => writeKnowledge(cfg, { kind: "observed", slug: "bad", text: "{not json" }), /not valid JSON/);
});

test("every password file and the process's password variables are scrubbed by value", () => {
  const { root, cfg } = project();
  writeFileSync(join(root, ".env.playwright.vcst"), "ADMIN_PASSWORD=PerEnvSecret99\n");
  writeFileSync(join(root, ".env.playwright.master"), "MASTER_PASSWORD=MasterSecret42\n");
  const prev = process.env.ZED_PASSWORD;
  process.env.ZED_PASSWORD = "EnvOnlySecret77";
  try {
    const { path } = writeKnowledge(cfg, { kind: "test-doc", slug: "p", text: "PerEnvSecret99 MasterSecret42 EnvOnlySecret77 plain" });
    const text = readFileSync(path, "utf8");
    assert.doesNotMatch(text, /PerEnvSecret99|MasterSecret42|EnvOnlySecret77/);
    assert.match(text, /plain$/);
  } finally {
    if (prev === undefined) delete process.env.ZED_PASSWORD; else process.env.ZED_PASSWORD = prev;
  }
});

test("only a declared platform project may write to the platform store (no projectType ⇒ refused)", () => {
  const root = mkdtempSync(join(tmpdir(), "vct-ks-"));
  const cfg = storeConfig({ schemaVersion: 3, test: { platformStore: "platform/" } }, { root });
  assert.equal(cfg.platformWritable, false);
  assert.throws(() => writeKnowledge(cfg, { kind: "rules", slug: "x", text: "a: 1", target: "platform" }), /platform write refused/);
  assert.equal(storeConfig({ schemaVersion: 3, projectType: "platform" }, { root }).platformWritable, true);
});
