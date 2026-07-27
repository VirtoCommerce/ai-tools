// Unit tests for scripts/deploy/deploy-pr-artifact.ts — the deterministic core behind /qa-deploy-pr.
// Focus: the pure manifest text-mutation functions (the "minimal-diff repin" logic the skill
// promises) plus the PR-ref parser. Network/gh-CLI-dependent functions (ghJson, commitViaGh,
// createPr, etc.) are intentionally NOT covered here — they need live GitHub state.
// Run: `npx tsx --test scripts/unit/deploy-pr-artifact.test.ts`
import { test } from "node:test";
import assert from "node:assert/strict";

const mod = await import("../deploy/deploy-pr-artifact.ts");

// ---- parsePrRef ---------------------------------------------------------------

test("parsePrRef: full GitHub PR URL", () => {
  const ref = mod.parsePrRef("https://github.com/VirtoCommerce/vc-module-cart/pull/123");
  assert.deepEqual(ref, { owner: "VirtoCommerce", repo: "vc-module-cart", number: 123, source: "--pr" });
});

test("parsePrRef: owner/repo#N shorthand", () => {
  const ref = mod.parsePrRef("VirtoCommerce/vc-frontend#456");
  assert.deepEqual(ref, { owner: "VirtoCommerce", repo: "vc-frontend", number: 456, source: "--pr" });
});

test("parsePrRef: bare repo#N defaults owner to VirtoCommerce", () => {
  const ref = mod.parsePrRef("vc-module-cart#789");
  assert.deepEqual(ref, { owner: "VirtoCommerce", repo: "vc-module-cart", number: 789, source: "--pr" });
});

test("parsePrRef: unparseable input returns null", () => {
  assert.equal(mod.parsePrRef("not-a-pr-ref"), null);
  assert.equal(mod.parsePrRef(""), null);
});

// ---- pinnedModule ---------------------------------------------------------------

test("pinnedModule: finds an {Id,Version} entry (GithubReleases shape)", () => {
  const json = { Sources: [{ Name: "GithubReleases", Modules: [{ Id: "VirtoCommerce.Cart", Version: "3.100.0" }] }] };
  assert.deepEqual(mod.pinnedModule(json, "VirtoCommerce.Cart"), { version: "3.100.0", source: "GithubReleases", blobName: undefined });
});

test("pinnedModule: finds a BlobName-only AzureBlob entry (prerelease shape)", () => {
  const json = { Sources: [{ Name: "AzureBlob", Modules: [{ BlobName: "VirtoCommerce.Cart_3.101.0-pr-42.zip" }] }] };
  assert.deepEqual(mod.pinnedModule(json, "VirtoCommerce.Cart"), { version: "3.101.0-pr-42", source: "AzureBlob", blobName: "VirtoCommerce.Cart_3.101.0-pr-42.zip" });
});

test("pinnedModule: absent module returns null", () => {
  const json = { Sources: [{ Name: "GithubReleases", Modules: [{ Id: "VirtoCommerce.Other", Version: "1.0.0" }] }] };
  assert.equal(mod.pinnedModule(json, "VirtoCommerce.Cart"), null);
});

test("pinnedModule: tolerates a missing Sources array", () => {
  assert.equal(mod.pinnedModule({}, "VirtoCommerce.Cart"), null);
});

// ---- applyModule / applyPlatform (object mutation) -----------------------------

test("applyModule: moves a module from GithubReleases to AzureBlob, no duplicate Id", () => {
  const json = { Sources: [{ Name: "GithubReleases", Modules: [{ Id: "VirtoCommerce.Cart", Version: "3.100.0" }] }] };
  mod.applyModule(json, "VirtoCommerce.Cart", "3.101.0-pr-42", "VirtoCommerce.Cart_3.101.0-pr-42.zip");
  const gh = json.Sources.find((s: any) => s.Name === "GithubReleases");
  const blob = json.Sources.find((s: any) => s.Name === "AzureBlob");
  assert.equal(gh.Modules.some((m: any) => m.Id === "VirtoCommerce.Cart"), false);
  assert.deepEqual(blob.Modules.find((m: any) => m.Id === "VirtoCommerce.Cart"), { Id: "VirtoCommerce.Cart", Version: "3.101.0-pr-42", BlobName: "VirtoCommerce.Cart_3.101.0-pr-42.zip" });
});

test("applyModule: re-pinning an already-AzureBlob module updates in place (no duplicate)", () => {
  const json = { Sources: [{ Name: "AzureBlob", Modules: [{ Id: "VirtoCommerce.Cart", Version: "3.101.0-pr-1", BlobName: "old.zip" }] }] };
  mod.applyModule(json, "VirtoCommerce.Cart", "3.101.0-pr-2", "new.zip");
  const blob = json.Sources.find((s: any) => s.Name === "AzureBlob");
  assert.equal(blob.Modules.length, 1);
  assert.deepEqual(blob.Modules[0], { Id: "VirtoCommerce.Cart", Version: "3.101.0-pr-2", BlobName: "new.zip" });
});

test("applyModule: creates the AzureBlob source when absent", () => {
  const json = { Sources: [] };
  mod.applyModule(json, "VirtoCommerce.Cart", "3.101.0-pr-1", "VirtoCommerce.Cart_3.101.0-pr-1.zip");
  const blob = json.Sources.find((s: any) => s.Name === "AzureBlob");
  assert.ok(blob);
  assert.equal(blob.Modules[0].Id, "VirtoCommerce.Cart");
});

test("applyPlatform: bumps PlatformVersion and PlatformImageTag when present", () => {
  const json: any = { PlatformVersion: "3.900.0", PlatformImageTag: "3.900.0" };
  mod.applyPlatform(json, "3.901.0-pr-9");
  assert.equal(json.PlatformVersion, "3.901.0-pr-9");
  assert.equal(json.PlatformImageTag, "3.901.0-pr-9");
});

test("applyPlatform: leaves PlatformImageTag untouched when the field doesn't exist", () => {
  const json: any = { PlatformVersion: "3.900.0" };
  mod.applyPlatform(json, "3.901.0-pr-9");
  assert.equal(json.PlatformVersion, "3.901.0-pr-9");
  assert.equal("PlatformImageTag" in json, false);
});

// ---- countChangedLines ---------------------------------------------------------

test("countChangedLines: zero for identical text", () => {
  const t = "a\nb\nc\n";
  assert.equal(mod.countChangedLines(t, t), 0);
});

test("countChangedLines: counts a single line replacement as 2 (one removed, one added)", () => {
  assert.equal(mod.countChangedLines("a\nb\nc\n", "a\nB\nc\n"), 2);
});

test("countChangedLines: a full reserialize (many reordered/reindented lines) reports large", () => {
  const before = '{\n  "a": 1,\n  "b": 2\n}\n';
  const after = '{\n"a":1,\n"b":2\n}\n';
  assert.ok(mod.countChangedLines(before, after) > 2);
});

// ---- removeGhReleaseEntry -------------------------------------------------------

const GH_RELEASES_TEXT = [
  '{',
  '  "Sources": [',
  '    {',
  '      "Name": "GithubReleases",',
  '      "Modules": [',
  '        {',
  '          "Id": "VirtoCommerce.Cart",',
  '          "Version": "3.100.0"',
  '        },',
  '        {',
  '          "Id": "VirtoCommerce.Order",',
  '          "Version": "3.50.0"',
  '        }',
  '      ]',
  '    }',
  '  ]',
  '}',
  '',
].join('\n');

test("removeGhReleaseEntry: removes a non-last entry, keeping its successor's comma-free tail", () => {
  const out = mod.removeGhReleaseEntry(GH_RELEASES_TEXT, "VirtoCommerce.Cart");
  assert.ok(out);
  assert.equal(out!.includes('"VirtoCommerce.Cart"'), false);
  assert.equal(out!.includes('"VirtoCommerce.Order"'), true);
  assert.doesNotThrow(() => JSON.parse(out!));
});

test("removeGhReleaseEntry: removes the last entry and drops the preceding comma", () => {
  const out = mod.removeGhReleaseEntry(GH_RELEASES_TEXT, "VirtoCommerce.Order");
  assert.ok(out);
  assert.equal(out!.includes('"VirtoCommerce.Order"'), false);
  const parsed = JSON.parse(out!);
  assert.equal(parsed.Sources[0].Modules.length, 1);
  assert.equal(parsed.Sources[0].Modules[0].Id, "VirtoCommerce.Cart");
});

test("removeGhReleaseEntry: id not present in GithubReleases → text unchanged", () => {
  const out = mod.removeGhReleaseEntry(GH_RELEASES_TEXT, "VirtoCommerce.NotThere");
  assert.equal(out, GH_RELEASES_TEXT);
});

test("removeGhReleaseEntry: id present but not in the canonical 4-line {Id,Version} shape → null (fall back to reserialize)", () => {
  const oddShape = '{\n  "Id": "VirtoCommerce.Cart", "Version": "3.100.0"\n}\n';
  assert.equal(mod.removeGhReleaseEntry(oddShape, "VirtoCommerce.Cart"), null);
});

// ---- upsertBlobEntry ------------------------------------------------------------

const BLOB_TEXT = [
  '{',
  '  "Sources": [',
  '    {',
  '      "Name": "AzureBlob",',
  '      "Modules": [',
  '        {',
  '          "BlobName": "VirtoCommerce.Cart_3.100.0-pr-1.zip"',
  '        }',
  '      ]',
  '    }',
  '  ]',
  '}',
  '',
].join('\n');

test("upsertBlobEntry: replaces an existing BlobName for the same module Id", () => {
  const out = mod.upsertBlobEntry(BLOB_TEXT, "VirtoCommerce.Cart", "VirtoCommerce.Cart_3.101.0-pr-2.zip");
  assert.ok(out);
  assert.equal(out!.includes("VirtoCommerce.Cart_3.101.0-pr-2.zip"), true);
  assert.equal(out!.includes("VirtoCommerce.Cart_3.100.0-pr-1.zip"), false);
  assert.doesNotThrow(() => JSON.parse(out!));
});

test("upsertBlobEntry: appends a new entry for a module not yet present", () => {
  const out = mod.upsertBlobEntry(BLOB_TEXT, "VirtoCommerce.Order", "VirtoCommerce.Order_3.50.0-pr-3.zip");
  assert.ok(out);
  const parsed = JSON.parse(out!);
  const blobs = parsed.Sources[0].Modules.map((m: any) => m.BlobName);
  assert.equal(blobs.includes("VirtoCommerce.Cart_3.100.0-pr-1.zip"), true);
  assert.equal(blobs.includes("VirtoCommerce.Order_3.50.0-pr-3.zip"), true);
});

test("upsertBlobEntry: no BlobName sample anywhere → null (fall back to reserialize)", () => {
  const noBlob = '{\n  "Sources": []\n}\n';
  assert.equal(mod.upsertBlobEntry(noBlob, "VirtoCommerce.Cart", "x.zip"), null);
});

// ---- bumpPlatformText -----------------------------------------------------------

test("bumpPlatformText: bumps both PlatformVersion and PlatformImageTag", () => {
  const text = '{\n  "PlatformVersion": "3.900.0",\n  "PlatformImageTag": "3.900.0"\n}\n';
  const out = mod.bumpPlatformText(text, "3.901.0-pr-9");
  assert.ok(out);
  assert.equal((out!.match(/3\.901\.0-pr-9/g) || []).length, 2);
});

test("bumpPlatformText: no PlatformVersion/PlatformImageTag field → null", () => {
  assert.equal(mod.bumpPlatformText('{\n  "Other": "x"\n}\n', "3.901.0"), null);
});

// ---- editPackagesText (integration of the surgery helpers + fallback) ---------

// Realistic manifest shape: a prior /qa-deploy-pr run already left an AzureBlob source with one
// pin, so upsertBlobEntry has an indentation sample to insert a new entry next to (the case where
// AzureBlob doesn't exist yet at all is covered by the fallback test below).
const MIXED_SOURCES_TEXT = [
  '{',
  '  "Sources": [',
  '    {',
  '      "Name": "GithubReleases",',
  '      "Modules": [',
  '        {',
  '          "Id": "VirtoCommerce.Cart",',
  '          "Version": "3.100.0"',
  '        }',
  '      ]',
  '    },',
  '    {',
  '      "Name": "AzureBlob",',
  '      "Modules": [',
  '        {',
  '          "BlobName": "VirtoCommerce.Order_3.50.0-pr-1.zip"',
  '        }',
  '      ]',
  '    }',
  '  ]',
  '}',
  '',
].join('\n');

test("editPackagesText: minimal surgery succeeds for the canonical shape and is semantically correct", () => {
  const origJson = JSON.parse(MIXED_SOURCES_TEXT);
  const modules = [{ kind: "module" as const, id: "VirtoCommerce.Cart", version: "3.101.0-pr-2", blobName: "VirtoCommerce.Cart_3.101.0-pr-2.zip", source: "--module" }];
  const { text, minimal } = mod.editPackagesText(MIXED_SOURCES_TEXT, origJson, modules);
  assert.equal(minimal, true);
  const parsed = JSON.parse(text);
  const gh = parsed.Sources.find((s: any) => s.Name === "GithubReleases");
  const blob = parsed.Sources.find((s: any) => s.Name === "AzureBlob");
  assert.equal(gh.Modules.some((m: any) => m.Id === "VirtoCommerce.Cart"), false);
  assert.equal(blob.Modules.some((m: any) => m.BlobName === "VirtoCommerce.Cart_3.101.0-pr-2.zip"), true);
  assert.equal(blob.Modules.some((m: any) => m.BlobName === "VirtoCommerce.Order_3.50.0-pr-1.zip"), true);
});

test("editPackagesText: falls back to reserialize when no AzureBlob source exists yet to mirror indentation from", () => {
  const origJson = JSON.parse(GH_RELEASES_TEXT);
  const modules = [{ kind: "module" as const, id: "VirtoCommerce.Cart", version: "3.101.0-pr-2", blobName: "VirtoCommerce.Cart_3.101.0-pr-2.zip", source: "--module" }];
  const { text, minimal } = mod.editPackagesText(GH_RELEASES_TEXT, origJson, modules);
  assert.equal(minimal, false);
  const parsed = JSON.parse(text);
  const blob = parsed.Sources.find((s: any) => s.Name === "AzureBlob");
  assert.equal(blob.Modules.some((m: any) => m.BlobName === "VirtoCommerce.Cart_3.101.0-pr-2.zip"), true);
});

test("editPackagesText: falls back to a full reserialize when the manifest shape is unrecognised, staying semantically correct", () => {
  const oddText = '{"Sources":[{"Name":"GithubReleases","Modules":[{"Id":"VirtoCommerce.Cart","Version":"3.100.0"}]}]}';
  const origJson = JSON.parse(oddText);
  const modules = [{ kind: "module" as const, id: "VirtoCommerce.Cart", version: "3.101.0-pr-2", blobName: "VirtoCommerce.Cart_3.101.0-pr-2.zip", source: "--module" }];
  const { text, minimal } = mod.editPackagesText(oddText, origJson, modules);
  assert.equal(minimal, false);
  const parsed = JSON.parse(text);
  const blob = parsed.Sources.find((s: any) => s.Name === "AzureBlob");
  assert.equal(blob.Modules.some((m: any) => m.BlobName === "VirtoCommerce.Cart_3.101.0-pr-2.zip"), true);
});

test("editPackagesText: applies a platform bump alongside module moves", () => {
  const text = '{\n  "PlatformVersion": "3.900.0",\n  "Sources": [\n    {\n      "Name": "GithubReleases",\n      "Modules": [\n        {\n          "Id": "VirtoCommerce.Cart",\n          "Version": "3.100.0"\n        }\n      ]\n    }\n  ]\n}\n';
  const origJson = JSON.parse(text);
  const modules = [{ kind: "module" as const, id: "VirtoCommerce.Cart", version: "3.101.0-pr-2", blobName: "VirtoCommerce.Cart_3.101.0-pr-2.zip", source: "--module" }];
  const platformT = { kind: "platform" as const, version: "3.901.0-pr-9", source: "--platform" };
  const { text: out } = mod.editPackagesText(text, origJson, modules, platformT);
  const parsed = JSON.parse(out);
  assert.equal(parsed.PlatformVersion, "3.901.0-pr-9");
});

// ---- editThemeText --------------------------------------------------------------

test("editThemeText: replaces the existing vc-theme URL", () => {
  const text = 'https://vc3prerelease.blob.core.windows.net/packages/vc-theme-b2b-vue-2.40.0.zip';
  const { text: out, from } = mod.editThemeText(text, "https://vc3prerelease.blob.core.windows.net/packages/vc-theme-b2b-vue-2.41.0-pr-5.zip");
  assert.equal(from, text);
  assert.equal(out, "https://vc3prerelease.blob.core.windows.net/packages/vc-theme-b2b-vue-2.41.0-pr-5.zip");
});

test("editThemeText: no recognisable vc-theme URL → text unchanged, from is null", () => {
  const text = '{"other": "value"}';
  const { text: out, from } = mod.editThemeText(text, "https://vc3prerelease.blob.core.windows.net/packages/vc-theme-b2b-vue-2.41.0.zip");
  assert.equal(from, null);
  assert.equal(out, text);
});
