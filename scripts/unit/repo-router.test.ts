// Unit tests for ci/lib/repo-router.ts — client/platform OWNERSHIP routing.
// Focus: the H1 bare-name collision guard (a client fork that keeps the upstream
// name must NOT capture the platform repo), client toolchain overrides, and the
// upstream-provenance accessor. Pure `computeOwnership` is tested directly; the
// profile-reading functions are exercised against a temp fixture profile.
// Run: `npx tsx --test scripts/unit/repo-router.test.ts`
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// A CLIENT deployment: Azure Repos client on org Lakeshirt-LEO, with a storefront
// fork that KEEPS the upstream name `vc-frontend` (the exact H1 collision scenario),
// plus a custom module and a differently-named theme repo.
const FIXTURE = {
  projectType: "client",
  vcs: {
    clientHost: "azure-repos",
    clientOrg: "Lakeshirt-LEO",
    azure: { organization: "Lakeshirt-LEO", project: "LEO" },
    auth: "az-login",
  },
  repos: {
    client: [
      {
        name: "Lakeshirt-LEO/vc-frontend",
        kind: "frontend",
        host: "azure-repos",
        defaultBranch: "main",
        upstream: "VirtoCommerce/vc-frontend",
        upstreamRef: "v2.31.0",
        testCmd: "yarn test:unit:client",
      },
      { name: "Lakeshirt-LEO/leo-main-module", kind: "module", host: "azure-repos", defaultBranch: "release" },
    ],
    platform: [],
  },
};

const dir = mkdtempSync(join(tmpdir(), "rr-"));
const profilePath = join(dir, "project-profile.json");
writeFileSync(profilePath, JSON.stringify(FIXTURE));
process.env.PROJECT_PROFILE_PATH = profilePath;

const rr = await import("../../ci/lib/repo-router.ts");

// ---- computeOwnership (pure) -------------------------------------------------

test("computeOwnership: H1 — a platform-org owner is ALWAYS platform, even when a client fork keeps the name", () => {
  const facts = {
    platformOrg: "VirtoCommerce",
    clientOrg: "Acme",
    clientFull: new Set(["Acme/vc-frontend"]),
    clientBare: new Set(["vc-frontend"]),
  };
  // The bug this guards: bare "vc-frontend" is a client repo name, but the fully-qualified
  // VirtoCommerce/vc-frontend must never be misread as client.
  assert.equal(rr.computeOwnership("VirtoCommerce/vc-frontend", facts), "platform");
  assert.equal(rr.computeOwnership("Acme/vc-frontend", facts), "client");
});

test("computeOwnership: bare (owner-less) query trusts the client-bare set", () => {
  const facts = {
    platformOrg: "VirtoCommerce",
    clientOrg: "Acme",
    clientFull: new Set(["Acme/leo-main"]),
    clientBare: new Set(["leo-main"]),
  };
  assert.equal(rr.computeOwnership("leo-main", facts), "client");
  assert.equal(rr.computeOwnership("vc-module-pricing", facts), "platform");
});

test("computeOwnership: explicit owner/name in repos.client wins", () => {
  const facts = {
    platformOrg: "VirtoCommerce",
    clientOrg: "",
    clientFull: new Set(["Acme/custom-thing"]),
    clientBare: new Set(["custom-thing"]),
  };
  assert.equal(rr.computeOwnership("Acme/custom-thing", facts), "client");
});

test("computeOwnership: no client configured ⇒ everything is platform (native default)", () => {
  const facts = { platformOrg: "VirtoCommerce", clientOrg: "", clientFull: new Set<string>(), clientBare: new Set<string>() };
  assert.equal(rr.computeOwnership("VirtoCommerce/vc-frontend", facts), "platform");
  assert.equal(rr.computeOwnership("Lakeshirt-LEO/frontend", facts), "platform");
});

// ---- repoOwnership (reads the fixture profile) -------------------------------

test("repoOwnership: fixture — platform-org fork name resolves platform, client org resolves client", () => {
  assert.equal(rr.repoOwnership("VirtoCommerce/vc-frontend"), "platform");
  assert.equal(rr.repoOwnership("Lakeshirt-LEO/vc-frontend"), "client");
  assert.equal(rr.repoOwnership("Lakeshirt-LEO/leo-main-module"), "client");
  assert.equal(rr.repoOwnership("VirtoCommerce/vc-module-pricing"), "platform");
});

test("assertUpstreamAllowed: throws for a client repo, passes for platform", () => {
  assert.throws(() => rr.assertUpstreamAllowed("Lakeshirt-LEO/vc-frontend"), /SECURITY/);
  assert.doesNotThrow(() => rr.assertUpstreamAllowed("VirtoCommerce/vc-frontend"));
});

// ---- repoProfile client overrides + clientUpstream ---------------------------

test("repoProfile: a client repo's testCmd override layers over the kind default", () => {
  const p = rr.repoProfile("Lakeshirt-LEO/vc-frontend");
  assert.equal(p.kind, "frontend");
  assert.equal(p.testCmd, "yarn test:unit:client"); // overridden
  assert.ok(p.buildCmd.length > 0); // inherited from the frontend kind default
});

test("repoProfile: a platform repo always uses the kind default (no override leakage)", () => {
  const p = rr.repoProfile("VirtoCommerce/vc-module-pricing");
  assert.equal(p.kind, "module");
  assert.match(p.testCmd, /dotnet test/);
});

test("clientUpstream: returns provenance for a forked client repo, null for platform", () => {
  assert.deepEqual(rr.clientUpstream("Lakeshirt-LEO/vc-frontend"), {
    upstream: "VirtoCommerce/vc-frontend",
    upstreamRef: "v2.31.0",
  });
  assert.equal(rr.clientUpstream("Lakeshirt-LEO/leo-main-module"), null); // no upstream declared
  assert.equal(rr.clientUpstream("VirtoCommerce/vc-frontend"), null); // platform
});
