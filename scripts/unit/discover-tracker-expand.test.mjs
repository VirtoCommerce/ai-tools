// Regression test for VCST-5582 E1 — the Azure Boards field-contract request must use a MEMBER of
// the WorkItemTypeFieldsExpandLevel enum.
//
// The reference defect: discover-tracker.mjs requested `…/fields?$expand=Properties`, but
// `Properties` is NOT a member of Azure DevOps' WorkItemTypeFieldsExpandLevel (None / AllowedValues
// / DependentFields / All). So the request returned HTTP 400 on EVERY Azure deployment, tracker.fields
// was ALWAYS empty, and /qa-bug silently sent the legacy "unverified defaults" field set — which the
// self-check subsystem could only ever see as an observation, never as the root cause. `$expand=all`
// returns 200 and yields the full contract. This test fails CI if the malformed param ever returns.
// Run: `npm test` (tsx --test scripts/unit/**/*.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = readFileSync(resolve(ROOT, "plugins/vc-fix/skills/project-init/discover-tracker.mjs"), "utf8");

// The four legal members of WorkItemTypeFieldsExpandLevel.
const EXPAND_LEVELS = new Set(["none", "allowedvalues", "dependentfields", "all"]);

test("field-contract request uses a valid WorkItemTypeFieldsExpandLevel member", () => {
  const m = /\/fields\?\$expand=([A-Za-z]+)/.exec(SRC);
  assert.ok(m, "expected a `/fields?$expand=<level>` request in discover-tracker.mjs");
  assert.ok(
    EXPAND_LEVELS.has(m[1].toLowerCase()),
    `\`$expand=${m[1]}\` is not a WorkItemTypeFieldsExpandLevel member (None/AllowedValues/DependentFields/All) — Azure DevOps returns HTTP 400 and tracker.fields stays empty`,
  );
});

test("the malformed `fields?$expand=Properties` request never returns", () => {
  // Match the REQUEST shape (`/fields?$expand=Properties`), not a bare mention — the fix comment
  // legitimately names the old param as historical context.
  assert.ok(
    !/fields\?\$expand=Properties\b/.test(SRC),
    "`fields?$expand=Properties` is a malformed request (not an enum member) — it 400s and empties the bug field contract on every Azure deployment",
  );
});
