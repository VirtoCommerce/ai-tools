// Unit tests for .claude/skills/project-init/discover-repos.mjs pure helpers:
// module→repo mapping, client/platform classification, the broadened frontend
// heuristic (H6), ref stripping (H2), and package.json provenance (H3).
// Pure — no env, no network. Run: `node --test` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  moduleToRepo,
  classify,
  pickFrontendRepos,
  deriveClientOrg,
  stripRef,
  frontendProvenanceFromPackage,
} from "../../.claude/skills/project-init/discover-repos.mjs";

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

test("frontendProvenanceFromPackage (H3): asserts vc-frontend lineage from name", () => {
  const prov = frontendProvenanceFromPackage({ name: "vc-frontend", version: "2.31.0" });
  assert.deepEqual(prov, { upstream: "VirtoCommerce/vc-frontend", upstreamRef: "2.31.0" });
});

test("frontendProvenanceFromPackage: asserts from a @vc-shell dependency", () => {
  const prov = frontendProvenanceFromPackage({
    name: "leo-storefront",
    version: "1.4.2",
    dependencies: { "@vc-shell/framework": "^1.0.0", vue: "^3.4.0" },
  });
  assert.deepEqual(prov, { upstream: "VirtoCommerce/vc-frontend", upstreamRef: "1.4.2" });
});

test("frontendProvenanceFromPackage: conservative — no vc signal ⇒ null (operator fills)", () => {
  assert.equal(frontendProvenanceFromPackage({ name: "some-vue-app", version: "1.0.0", dependencies: { vue: "^3" } }), null);
  assert.equal(frontendProvenanceFromPackage(null), null);
  assert.equal(frontendProvenanceFromPackage({}), null);
});

test("deriveClientOrg: prefers ADO_ORG for an azure host", () => {
  assert.equal(deriveClientOrg([], { host: "azure-repos", adoOrg: "Lakeshirt-LEO" }), "Lakeshirt-LEO");
});
