// Unit tests for .claude/skills/project-init/discover-repos.mjs pure helpers:
// module→repo mapping, client/platform classification, the broadened frontend
// heuristic (H6), ref stripping (H2), and package.json provenance (H3).
// Pure — no env, no network. Run: `node --test` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  moduleToRepo,
  classify,
  flagUnverifiedModules,
  resolveModuleRepo,
  pickFrontendRepos,
  deriveClientOrg,
  stripRef,
  frontendProvenanceFromPackage,
  vcFrontendRef,
} from "../../.claude/skills/project-init/discover-repos.mjs";
// The client-shipped copy of the same pure helpers — asserted to agree with the .claude mirror
// (per CLAUDE.md the two are deliberately duplicated, so a same-PR edit must land in both).
import {
  moduleToRepo as moduleToRepoPlugin,
  flagUnverifiedModules as flagUnverifiedModulesPlugin,
} from "../../plugins/vc-fix/skills/project-init/discover-repos.mjs";

test("moduleToRepo: parses a GitHub ProjectUrl", () => {
  const r = moduleToRepo({ Id: "VirtoCommerce.Cart", ProjectUrl: "https://github.com/VirtoCommerce/vc-module-cart" });
  assert.equal(r.owner, "VirtoCommerce");
  assert.equal(r.name, "vc-module-cart");
  assert.equal(r.host, "github");
});

test("moduleToRepo: parses an Azure Repos ProjectUrl", () => {
  const r = moduleToRepo({ Id: "Leo.Main", ProjectUrl: "https://dev.azure.com/Lakeshirt-LEO/LEO/_git/leo-main-module" });
  assert.equal(r.owner, "Lakeshirt-LEO");
  assert.equal(r.name, "leo-main-module");
  assert.equal(r.host, "azure-repos");
});

test("classify: VirtoCommerce-owned → platform, everything else → client", () => {
  const { client, platform } = classify(
    [
      { Id: "VirtoCommerce.Cart", ProjectUrl: "https://github.com/VirtoCommerce/vc-module-cart" },
      { Id: "Leo.Main", ProjectUrl: "https://dev.azure.com/Lakeshirt-LEO/LEO/_git/leo-main-module" },
    ],
    "",
  );
  assert.deepEqual(platform.map((p) => p.name), ["VirtoCommerce/vc-module-cart"]);
  assert.deepEqual(client.map((c) => c.name), ["Lakeshirt-LEO/leo-main-module"]);
  assert.equal(client[0].host, "azure-repos");
});

test("pickFrontendRepos (H6): matches un-prefixed storefront names", () => {
  const names = ["leo-main-module", "frontend", "backend-svc", "acme-storefront", "my-theme", "webstore", "api"];
  const fe = pickFrontendRepos(names);
  assert.ok(fe.includes("frontend"));
  assert.ok(fe.includes("acme-storefront"));
  assert.ok(fe.includes("my-theme"));
  assert.ok(fe.includes("webstore"));
  assert.ok(!fe.includes("backend-svc"));
  assert.ok(!fe.includes("api"));
});

test("pickFrontendRepos: still matches the classic vc-frontend / vc-theme names", () => {
  assert.deepEqual(pickFrontendRepos(["vc-frontend", "vc-theme"]).sort(), ["vc-frontend", "vc-theme"]);
});

test("stripRef (H2): refs/heads/main → main; passthrough for a bare name", () => {
  assert.equal(stripRef("refs/heads/main"), "main");
  assert.equal(stripRef("refs/heads/release/2.x"), "release/2.x");
  assert.equal(stripRef("dev"), "dev");
  assert.equal(stripRef(undefined), "");
});

test("vcFrontendRef: reduces a version to its MAJOR.MINOR line", () => {
  assert.equal(vcFrontendRef("2.49.7"), "2.49");
  assert.equal(vcFrontendRef("v1.4.2"), "1.4");
  assert.equal(vcFrontendRef("10.0.0-rc.1"), "10.0");
  assert.equal(vcFrontendRef(""), "");
  assert.equal(vcFrontendRef(undefined), "");
  assert.equal(vcFrontendRef("garbage"), "");
});

test("frontendProvenanceFromPackage (H3): the repo IS vc-frontend ⇒ FULL version (genuine upstream tag)", () => {
  const prov = frontendProvenanceFromPackage({ name: "vc-frontend", version: "2.31.0" });
  assert.deepEqual(prov, { upstream: "VirtoCommerce/vc-frontend", upstreamRef: "2.31.0" });
});

test("frontendProvenanceFromPackage: a CLIENT fork (@vc-shell dep) ⇒ MAJOR.MINOR line, not its own patch version", () => {
  const prov = frontendProvenanceFromPackage({
    name: "leo-storefront",
    version: "1.4.2",
    dependencies: { "@vc-shell/framework": "^1.0.0", vue: "^3.4.0" },
  });
  assert.deepEqual(prov, { upstream: "VirtoCommerce/vc-frontend", upstreamRef: "1.4" });
});

test("frontendProvenanceFromPackage: conservative — no vc signal ⇒ null (fallback/operator fills)", () => {
  assert.equal(frontendProvenanceFromPackage({ name: "some-vue-app", version: "1.0.0", dependencies: { vue: "^3" } }), null);
  assert.equal(frontendProvenanceFromPackage(null), null);
  assert.equal(frontendProvenanceFromPackage({}), null);
});

test("deriveClientOrg: prefers ADO_ORG for an azure host", () => {
  assert.equal(deriveClientOrg([], { host: "azure-repos", adoOrg: "Lakeshirt-LEO" }), "Lakeshirt-LEO");
});

// #216 / VCST-5702 — a CLIENT module id with no ProjectUrl is NEVER given an invented `vc-module-*`
// name (that name 404s at fix time). It arrives name:null + nameFromId, to be resolved against the
// live listing in main(). Only a genuine VirtoCommerce.* id keeps the safe upstream-convention guess.
test("moduleToRepo (VCST-5702): a client id with no ProjectUrl gets name:null, NOT an invented vc-module-* name", () => {
  const r = moduleToRepo({ Id: "Acme.CustomOrders" });
  assert.equal(r.name, null, "no name is invented for a client module id");
  assert.equal(r.owner, null);
  assert.equal(r.host, null);
  assert.equal(r.nameFromId, true, "still flagged id-derived so main() resolves it");
});
test("moduleToRepo (VCST-5702): a VirtoCommerce.* id with no ProjectUrl keeps the safe vc-module-* guess", () => {
  const r = moduleToRepo({ Id: "VirtoCommerce.CatalogPersonalization" });
  assert.equal(r.name, "vc-module-catalog-personalization", "the upstream convention is authoritative for a platform module");
  assert.equal(r.nameFromId, true);
});

test("moduleToRepo (#216): a URL-derived name is authoritative → nameFromId:false", () => {
  const gh = moduleToRepo({ Id: "VirtoCommerce.Cart", ProjectUrl: "https://github.com/VirtoCommerce/vc-module-cart" });
  assert.equal(gh.nameFromId, false);
  const az = moduleToRepo({ Id: "Leo.Main", ProjectUrl: "https://dev.azure.com/Lakeshirt-LEO/LEO/_git/leo-main-module" });
  assert.equal(az.nameFromId, false);
});

test("classify (VCST-5702): a client module with no URL carries name:null + moduleId; a URL-derived one is named", () => {
  const { client } = classify(
    [
      { Id: "Acme.CustomOrders" }, // no URL → client (non-VirtoCommerce id): name:null, resolve later
      { Id: "Leo.Main", ProjectUrl: "https://dev.azure.com/Lakeshirt-LEO/LEO/_git/leo-main-module" },
    ],
    "",
  );
  const guessed = client.find((c) => c.moduleId === "Acme.CustomOrders");
  const urlDerived = client.find((c) => c.name === "Lakeshirt-LEO/leo-main-module");
  assert.ok(guessed, "the no-URL client module is emitted (not skipped) so it can be resolved");
  assert.equal(guessed.name, null, "no name invented");
  assert.equal(guessed.nameFromId, true);
  assert.equal(urlDerived.nameFromId, undefined); // omitted, not carried
  assert.equal(urlDerived.moduleId, undefined); // a named entry needs no resolution input
});

// ─── VCST-5702 — resolveModuleRepo: resolve against the live listing, never invent ─────────
test("resolveModuleRepo: exact-token match (Opus.Main → opus-module-main)", () => {
  assert.equal(resolveModuleRepo("Opus.Main", ["opus-module-main", "opus-module-supplierapi"], "omnia-opus"), "opus-module-main");
});
test("resolveModuleRepo: an org slug that is part of the id is kept, not stripped as noise", () => {
  // clientOrg 'opus' overlaps the id token 'opus' — it must survive so the match still lands.
  assert.equal(resolveModuleRepo("Opus.Main", ["opus-module-main", "opus-module-supplierapi"], "opus"), "opus-module-main");
});
test("resolveModuleRepo: an ambiguous tie resolves to null (never pick arbitrarily)", () => {
  assert.equal(resolveModuleRepo("Opus.Main", ["opus-module-main", "opus-main"], "omnia-opus"), null);
});
test("resolveModuleRepo: no candidate → null", () => {
  assert.equal(resolveModuleRepo("Opus.Main", ["opus-module-supplierapi", "some-other-repo"], "omnia-opus"), null);
  assert.equal(resolveModuleRepo("Opus.Main", [], "omnia-opus"), null);
});
test("resolveModuleRepo: subset match prefers the fewest extra tokens", () => {
  // id {opus, main}; candidate {opus, main, admin} is a superset (1 extra) — a unique subset match.
  assert.equal(resolveModuleRepo("Opus.Main", ["opus-module-main-admin"], "omnia-opus"), "opus-module-main-admin");
});

// ─── VCST-5702 — the invariants the fix guarantees ─────────────────────────────────────────
test("VCST-5702: NO output name is ever a vc-module-* for a NON-VirtoCommerce.* module id", () => {
  const ids = ["Opus.Main", "Acme.CustomOrders", "Leo.Main", "Contoso.Widgets"];
  for (const Id of ids) {
    const r = moduleToRepo({ Id });
    assert.ok(!/^vc-module-/.test(r.name || ""), `${Id} must not synthesize ${r.name}`);
    const { client, platform } = classify([{ Id }], "");
    for (const e of [...client, ...platform]) {
      assert.ok(!/^vc-module-/.test(e.name || ""), `${Id} → ${e.name} must not be vc-module-*`);
    }
  }
  // A VirtoCommerce.* id is unaffected — it still classifies as platform with the upstream name.
  const { platform } = classify([{ Id: "VirtoCommerce.Cart" }], "");
  assert.deepEqual(platform, [{ name: "vc-module-cart", kind: "module" }]);
});
test("VCST-5702: an unresolved client module carries NO contribution / clone URL", () => {
  // classify emits name:null; the only place a contribution/cloneUrl is built keys off a truthy
  // name (main() `if (!c.name) continue`), so a name:null entry is self-enforcingly URL-less.
  const { client } = classify([{ Id: "Opus.Main" }], "");
  const entry = client.find((c) => c.moduleId === "Opus.Main");
  assert.equal(entry.name, null);
  assert.equal(entry.contribution, undefined, "no contribution block");
  assert.ok(!("cloneUrl" in entry), "no clone URL can be built from a null name");
});

// #216 — the actual DECISION the fix makes (extracted from main() so it is testable without
// a network repo listing): confirm a guess that matches the live listing, flag one that doesn't.
test("flagUnverifiedModules (#216): a guessed name matching the live listing is confirmed", () => {
  const repos = [{ name: "vc-module-acme-orders", kind: "module", nameFromId: true }];
  const unverified = flagUnverifiedModules(repos, ["vc-module-acme-orders", "some-other-repo"]);
  assert.deepEqual(unverified, []);
  assert.equal(repos[0].nameUnverified, undefined); // not flagged
  assert.equal(repos[0].nameFromId, undefined); // internal flag cleared once the decision is made
});

test("flagUnverifiedModules (#216): a guessed name matching NOTHING is flagged nameUnverified", () => {
  const repos = [{ name: "vc-module-ghost", kind: "module", nameFromId: true }];
  const unverified = flagUnverifiedModules(repos, ["vc-module-real"]);
  assert.deepEqual(unverified, ["vc-module-ghost"]);
  assert.equal(repos[0].nameUnverified, true);
  assert.equal(repos[0].nameFromId, undefined);
});

test("flagUnverifiedModules (#216): a URL-derived name (no nameFromId) is never flagged, even if absent", () => {
  const repos = [{ name: "Lakeshirt-LEO/leo-main-module", kind: "module", host: "azure-repos" }];
  const unverified = flagUnverifiedModules(repos, []); // not in the (empty) listing
  assert.deepEqual(unverified, []);
  assert.equal(repos[0].nameUnverified, undefined);
});

test("flagUnverifiedModules (#216): match is case-insensitive (guess is lowercased, listing original-case)", () => {
  const repos = [{ name: "vc-module-custom-checkout", kind: "module", nameFromId: true }];
  const unverified = flagUnverifiedModules(repos, ["VC-Module-Custom-Checkout"]);
  assert.deepEqual(unverified, []); // confirmed despite case difference — no false UNVERIFIED
  assert.equal(repos[0].nameUnverified, undefined);
});

// #216 — the client-shipped (plugins/vc-fix) copy of the helpers must behave identically.
test("both surfaces (#216): .claude and plugins/vc-fix exports agree", () => {
  const mod = { Id: "Acme.CustomOrders" };
  assert.equal(moduleToRepoPlugin(mod).nameFromId, true);
  assert.equal(moduleToRepo(mod).nameFromId, moduleToRepoPlugin(mod).nameFromId);
  const a = [{ name: "vc-module-ghost", kind: "module", nameFromId: true }];
  const b = [{ name: "vc-module-ghost", kind: "module", nameFromId: true }];
  assert.deepEqual(flagUnverifiedModules(a, ["x"]), flagUnverifiedModulesPlugin(b, ["x"]));
  assert.equal(a[0].nameUnverified, true);
  assert.equal(b[0].nameUnverified, true);
});
