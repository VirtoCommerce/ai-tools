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

// A module already pinned as a prerelease carries an "Id" inside its AzureBlob {Id,Version,BlobName}
// entry (the shape a reserialize writes). The GithubReleases scan must not match THAT one — doing so
// failed the 4-line shape check and forced a needless reserialize on every re-pin of a pinned module.
const ALREADY_PINNED_TEXT = [
  '{',
  '  "Sources": [',
  '    {',
  '      "Name": "AzureBlob",',
  '      "Modules": [',
  '        {',
  '          "Id": "VirtoCommerce.Notifications",',
  '          "Version": "3.1013.0-pr-202-0b9c",',
  '          "BlobName": "VirtoCommerce.Notifications_3.1013.0-pr-202-0b9c.zip"',
  '        }',
  '      ]',
  '    },',
  '    {',
  '      "Name": "GithubReleases",',
  '      "Modules": [',
  '        {',
  '          "Id": "VirtoCommerce.Cart",',
  '          "Version": "3.100.0"',
  '        }',
  '      ]',
  '    }',
  '  ]',
  '}',
  '',
].join('\n');

test("removeGhReleaseEntry: ignores an Id inside an AzureBlob {Id,Version,BlobName} entry", () => {
  const out = mod.removeGhReleaseEntry(ALREADY_PINNED_TEXT, "VirtoCommerce.Notifications");
  assert.equal(out, ALREADY_PINNED_TEXT, "not in GithubReleases → text must be returned unchanged, not null");
});

test("removeGhReleaseEntry: still removes the GithubReleases pin when a blob entry also carries an Id", () => {
  // Same module in BOTH sources: the GithubReleases one is the one that must go.
  const both = ALREADY_PINNED_TEXT.replace(
    '        {\n          "Id": "VirtoCommerce.Cart",\n          "Version": "3.100.0"\n        }',
    '        {\n          "Id": "VirtoCommerce.Notifications",\n          "Version": "3.1012.0"\n        }',
  );
  const out = mod.removeGhReleaseEntry(both, "VirtoCommerce.Notifications");
  assert.ok(out, "expected the GithubReleases entry to be removed, not a null fallback");
  const parsed = JSON.parse(out!);
  const gh = parsed.Sources.find((s: any) => s.Name === "GithubReleases");
  const blob = parsed.Sources.find((s: any) => s.Name === "AzureBlob");
  assert.deepEqual(gh.Modules, [], "the 3.1012.0 GithubReleases pin should be gone");
  assert.equal(blob.Modules[0].BlobName, "VirtoCommerce.Notifications_3.1013.0-pr-202-0b9c.zip");
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

test("upsertBlobEntry: re-pin refreshes a sibling Version so pinnedModule can't report a stale one", () => {
  const out = mod.upsertBlobEntry(ALREADY_PINNED_TEXT, "VirtoCommerce.Notifications", "VirtoCommerce.Notifications_3.1014.0-pr-203-abcd.zip");
  assert.ok(out);
  assert.equal(out!.includes("3.1013.0-pr-202-0b9c"), false, "no trace of the old version may survive");
  // pinnedModule prefers an explicit Version field over the BlobName-derived one.
  assert.deepEqual(mod.pinnedModule(JSON.parse(out!), "VirtoCommerce.Notifications"), {
    version: "3.1014.0-pr-203-abcd",
    source: "AzureBlob",
    blobName: "VirtoCommerce.Notifications_3.1014.0-pr-203-abcd.zip",
  });
});

test("upsertBlobEntry: re-pin leaves a BlobName-only entry alone (no Version invented)", () => {
  const out = mod.upsertBlobEntry(BLOB_TEXT, "VirtoCommerce.Cart", "VirtoCommerce.Cart_3.101.0-pr-2.zip");
  assert.ok(out);
  assert.equal(out!.includes('"Version"'), false);
  assert.deepEqual(JSON.parse(out!).Sources[0].Modules, [{ BlobName: "VirtoCommerce.Cart_3.101.0-pr-2.zip" }]);
});

test("upsertBlobEntry: re-pin does not touch a neighbouring entry's Version", () => {
  const twoEntries = ALREADY_PINNED_TEXT.replace(
    '        {\n          "Id": "VirtoCommerce.Notifications",\n          "Version": "3.1013.0-pr-202-0b9c",\n          "BlobName": "VirtoCommerce.Notifications_3.1013.0-pr-202-0b9c.zip"\n        }',
    '        {\n          "Id": "VirtoCommerce.Other",\n          "Version": "9.9.9-pr-1-zzzz",\n          "BlobName": "VirtoCommerce.Other_9.9.9-pr-1-zzzz.zip"\n        },\n        {\n          "Id": "VirtoCommerce.Notifications",\n          "Version": "3.1013.0-pr-202-0b9c",\n          "BlobName": "VirtoCommerce.Notifications_3.1013.0-pr-202-0b9c.zip"\n        }',
  );
  const out = mod.upsertBlobEntry(twoEntries, "VirtoCommerce.Notifications", "VirtoCommerce.Notifications_3.1014.0-pr-203-abcd.zip");
  assert.ok(out);
  const blob = JSON.parse(out!).Sources.find((s: any) => s.Name === "AzureBlob");
  assert.equal(blob.Modules.find((m: any) => m.Id === "VirtoCommerce.Other").Version, "9.9.9-pr-1-zzzz");
  assert.equal(blob.Modules.find((m: any) => m.Id === "VirtoCommerce.Notifications").Version, "3.1014.0-pr-203-abcd");
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

// An AzureBlob source that EXISTS but is empty is the state of any branch that has never carried a
// prerelease pin (vcst-qa as of 2026-07-29). There is no sibling "BlobName" line to mirror, but the
// insertion point is unambiguous — so this must stay minimal instead of falling back to a whole-file
// reserialize (which produced a 24-line diff on vc-deploy-dev#6249, 14 lines of it pure whitespace).
const EMPTY_BLOB_TEXT = [
  '{',
  '  "Sources": [',
  '    {',
  '      "Name": "AzureBlob",',
  '      "Container": "packages",',
  '      "ServiceUri": "https://vc3prerelease.blob.core.windows.net",',
  '      "Modules": []',
  '    },',
  '    {',
  '      "Name": "GithubReleases",',
  '      "Modules": [',
  '        {',
  '          "Id": "VirtoCommerce.Cart",',
  '          "Version": "3.100.0"',
  '        }',
  '      ]',
  '    }',
  '  ]',
  '}',
  '',
].join('\n');

test("upsertBlobEntry: seeds the first entry into an empty AzureBlob \"Modules\": []", () => {
  const out = mod.upsertBlobEntry(EMPTY_BLOB_TEXT, "VirtoCommerce.Cart", "VirtoCommerce.Cart_3.101.0-pr-2.zip");
  assert.ok(out, "expected minimal surgery, not a null fallback");
  const parsed = JSON.parse(out!);
  const blob = parsed.Sources.find((s: any) => s.Name === "AzureBlob");
  assert.deepEqual(blob.Modules, [{ BlobName: "VirtoCommerce.Cart_3.101.0-pr-2.zip" }]);
  // Minimal: only the "Modules": [] line is replaced (1 removed, 5 added) — nothing else reindented.
  assert.equal(mod.countChangedLines(EMPTY_BLOB_TEXT, out!), 6);
  // The untouched GithubReleases block keeps its exact original text.
  assert.ok(out!.includes('        {\n          "Id": "VirtoCommerce.Cart",\n          "Version": "3.100.0"\n        }'));
});

test("upsertBlobEntry: empty AzureBlob — indentation follows the file's dominant unit", () => {
  const out = mod.upsertBlobEntry(EMPTY_BLOB_TEXT, "VirtoCommerce.Cart", "VirtoCommerce.Cart_3.101.0-pr-2.zip");
  assert.ok(out);
  assert.ok(out!.includes([
    '      "Modules": [',
    '        {',
    '          "BlobName": "VirtoCommerce.Cart_3.101.0-pr-2.zip"',
    '        }',
    '      ]',
  ].join('\n')));
});

test("upsertBlobEntry: empty AzureBlob written multi-line is also seeded minimally", () => {
  const multi = EMPTY_BLOB_TEXT.replace('      "Modules": []', '      "Modules": [\n      ]');
  const out = mod.upsertBlobEntry(multi, "VirtoCommerce.Cart", "VirtoCommerce.Cart_3.101.0-pr-2.zip");
  assert.ok(out);
  const blob = JSON.parse(out!).Sources.find((s: any) => s.Name === "AzureBlob");
  assert.deepEqual(blob.Modules, [{ BlobName: "VirtoCommerce.Cart_3.101.0-pr-2.zip" }]);
});

test("upsertBlobEntry: empty AzureBlob identified by ServiceUri alone (no \"Name\" key)", () => {
  const noName = EMPTY_BLOB_TEXT.replace('      "Name": "AzureBlob",\n', '');
  const out = mod.upsertBlobEntry(noName, "VirtoCommerce.Cart", "VirtoCommerce.Cart_3.101.0-pr-2.zip");
  assert.ok(out);
  const src = JSON.parse(out!).Sources.find((s: any) => (s.ServiceUri || '').includes('vc3prerelease'));
  assert.deepEqual(src.Modules, [{ BlobName: "VirtoCommerce.Cart_3.101.0-pr-2.zip" }]);
});

test("upsertBlobEntry: never seeds into the GithubReleases Modules array", () => {
  // AzureBlob listed AFTER GithubReleases — the empty-array scan must still target AzureBlob's own key.
  const ghFirst = [
    '{',
    '  "Sources": [',
    '    {',
    '      "Name": "GithubReleases",',
    '      "ModuleSources": [',
    '        "https://example.test/modules_v3.json"',
    '      ],',
    '      "Modules": [',
    '        {',
    '          "Id": "VirtoCommerce.Cart",',
    '          "Version": "3.100.0"',
    '        }',
    '      ]',
    '    },',
    '    {',
    '      "Name": "AzureBlob",',
    '      "Modules": []',
    '    }',
    '  ]',
    '}',
    '',
  ].join('\n');
  const out = mod.upsertBlobEntry(ghFirst, "VirtoCommerce.Cart", "VirtoCommerce.Cart_3.101.0-pr-2.zip");
  assert.ok(out);
  const parsed = JSON.parse(out!);
  const gh = parsed.Sources.find((s: any) => s.Name === "GithubReleases");
  const blob = parsed.Sources.find((s: any) => s.Name === "AzureBlob");
  assert.deepEqual(blob.Modules, [{ BlobName: "VirtoCommerce.Cart_3.101.0-pr-2.zip" }]);
  assert.deepEqual(gh.Modules, [{ Id: "VirtoCommerce.Cart", Version: "3.100.0" }]);
  assert.equal(gh.ModuleSources.length, 1);
});

test("upsertBlobEntry: AzureBlob Modules non-empty but unparseable shape → null (fall back)", () => {
  // No "BlobName" line anywhere AND the array is not empty → genuinely unexpected; must not guess.
  const odd = EMPTY_BLOB_TEXT.replace('      "Modules": []', '      "Modules": [\n        { "Weird": 1 }\n      ]');
  assert.equal(mod.upsertBlobEntry(odd, "VirtoCommerce.Cart", "x.zip"), null);
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

test("editPackagesText: stays minimal for a first-ever pin on a branch with an empty AzureBlob", () => {
  // The real vc-deploy-dev@vcst-qa shape as of 2026-07-29: AzureBlob present but "Modules": [],
  // Notifications still pinned in GithubReleases. Regression guard for vc-deploy-dev#6249.
  const origJson = JSON.parse(EMPTY_BLOB_TEXT);
  const modules = [{ kind: "module" as const, id: "VirtoCommerce.Cart", version: "3.101.0-pr-2", blobName: "VirtoCommerce.Cart_3.101.0-pr-2.zip", source: "--module" }];
  const { text, minimal } = mod.editPackagesText(EMPTY_BLOB_TEXT, origJson, modules);
  assert.equal(minimal, true);
  const parsed = JSON.parse(text);
  const gh = parsed.Sources.find((s: any) => s.Name === "GithubReleases");
  const blob = parsed.Sources.find((s: any) => s.Name === "AzureBlob");
  assert.equal(gh.Modules.some((m: any) => m.Id === "VirtoCommerce.Cart"), false);
  assert.deepEqual(blob.Modules, [{ BlobName: "VirtoCommerce.Cart_3.101.0-pr-2.zip" }]);
});

test("editPackagesText: two modules onto an empty AzureBlob — second reuses the seeded entry's indent", () => {
  const origJson = JSON.parse(EMPTY_BLOB_TEXT);
  const modules = [
    { kind: "module" as const, id: "VirtoCommerce.Cart", version: "3.101.0-pr-2", blobName: "VirtoCommerce.Cart_3.101.0-pr-2.zip", source: "--module" },
    { kind: "module" as const, id: "VirtoCommerce.Order", version: "3.50.0-pr-3", blobName: "VirtoCommerce.Order_3.50.0-pr-3.zip", source: "--module" },
  ];
  const { text, minimal } = mod.editPackagesText(EMPTY_BLOB_TEXT, origJson, modules);
  assert.equal(minimal, true);
  const blob = JSON.parse(text).Sources.find((s: any) => s.Name === "AzureBlob");
  assert.deepEqual(blob.Modules, [
    { BlobName: "VirtoCommerce.Cart_3.101.0-pr-2.zip" },
    { BlobName: "VirtoCommerce.Order_3.50.0-pr-3.zip" },
  ]);
});

test("editPackagesText: re-running against an already-pinned manifest is a minimal no-op", () => {
  // Idempotence: /qa-deploy-pr re-run after the deploy PR merged must report 0 changed lines and
  // stay minimal — not a whole-file reserialize offering a no-op diff.
  const origJson = JSON.parse(ALREADY_PINNED_TEXT);
  const modules = [{ kind: "module" as const, id: "VirtoCommerce.Notifications", version: "3.1013.0-pr-202-0b9c", blobName: "VirtoCommerce.Notifications_3.1013.0-pr-202-0b9c.zip", source: "--pr" }];
  const { text, minimal } = mod.editPackagesText(ALREADY_PINNED_TEXT, origJson, modules);
  assert.equal(minimal, true);
  assert.equal(text, ALREADY_PINNED_TEXT);
  assert.equal(mod.countChangedLines(ALREADY_PINNED_TEXT, text), 0);
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
