// Unit tests for the pure profile-shape asserter:
// plugins/vc-fix/skills/project-init/assert-profile.mjs `profileViolations`.
// Pure — no env, no network, no fs. Run: `node --test` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { profileViolations } from "../../plugins/vc-fix/skills/project-init/assert-profile.mjs";

const subjects = (p) => profileViolations(p).map((v) => v.subject);

// #216 — a client MODULE whose name discover-repos could not verify against the live listing
// (nameUnverified) must surface as a degraded_artifact observation for /vc-self-check.
test("profileViolations (#216): an unverified client repo name is recorded", () => {
  const p = {
    projectType: "client",
    tracker: { kind: "github" },
    repos: { client: [{ name: "acme/vc-module-ghost", kind: "module", nameUnverified: true }] },
  };
  assert.ok(subjects(p).includes("client_repo_unverified"), "an unverified client module name must be reported");
});

test("profileViolations (#216): a verified client repo name produces no unverified violation", () => {
  const p = {
    projectType: "client",
    tracker: { kind: "github" },
    repos: { client: [{ name: "acme/vc-module-real", kind: "module" }] }, // no nameUnverified
  };
  assert.ok(!subjects(p).includes("client_repo_unverified"), "a verified name must not be flagged");
});

// A fully-populated GitHub client profile with a real repo has NO shape violations.
test("profileViolations: a healthy client profile is clean", () => {
  const p = {
    projectType: "client",
    tracker: { kind: "github" },
    vcs: {},
    upstream: {},
    repos: { client: [{ name: "acme/vc-module-real", kind: "module" }] },
  };
  assert.deepEqual(profileViolations(p), []);
});
