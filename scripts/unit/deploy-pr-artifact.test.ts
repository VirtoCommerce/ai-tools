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

// ---- upsertBlobEntry / editPackagesText: shapes that must NOT be guessed at ------
// Every case below was a confirmed silent-wrong-manifest path found in review of PR #171. The rule
// for all of them: either edit correctly, or return null / minimal:false so the reserialize (which
// matches by `Id`) fixes it up. Never commit a manifest whose pin disagrees with the intent.

/** Fixture builder — AzureBlob source first, then GithubReleases. */
const sources = (blobEntries: string[], ghEntries: string[] = []) => [
  '{', '  "Sources": [', '    {', '      "Name": "AzureBlob",', '      "Modules": [',
  ...blobEntries, '      ]', '    },', '    {', '      "Name": "GithubReleases",', '      "Modules": [',
  ...ghEntries, '      ]', '    }', '  ]', '}', '',
].join('\n');
/** An AzureBlob {Id,Version,BlobName} entry — the shape the reserialize path writes. */
const FULL_ENTRY = (id: string, ver: string) => [
  '        {', `          "Id": "${id}",`, `          "Version": "${ver}",`,
  `          "BlobName": "${id}_${ver}.zip"`, '        }',
];
/** A GithubReleases {Id,Version} entry — no BlobName, or upsertBlobEntry would anchor on it. */
const GH_ENTRY = (id: string, ver: string) => [
  '        {', `          "Id": "${id}",`, `          "Version": "${ver}"`, '        }',
];
const target = (id: string, version: string) =>
  ({ kind: "module" as const, id, version, blobName: `${id}_${version}.zip`, source: "--pr" });

test("editPackagesText: blob Id matches but BlobName case differs → one pin, not a duplicate", () => {
  // REGRESSION GUARD: the gh-scoping fix made surgery match by BlobName prefix while the reserialize
  // matches by Id. When they disagreed this appended a SECOND entry and pinnedModule returned the
  // stale one — at minimal:true. `main` got this right via the reserialize.
  const text = sources(['        {', '          "Id": "VirtoCommerce.Cart",', '          "Version": "3.99.0",',
    '          "BlobName": "virtocommerce.cart_3.99.0.zip"', '        }']);
  const { text: out } = mod.editPackagesText(text, JSON.parse(text), [target("VirtoCommerce.Cart", "3.101.0-pr-9")]);
  const blob = JSON.parse(out).Sources.find((s: any) => s.Name === "AzureBlob");
  assert.equal(blob.Modules.length, 1, "must not append a duplicate pin for the same module");
  assert.equal(mod.pinnedModule(JSON.parse(out), "VirtoCommerce.Cart")?.version, "3.101.0-pr-9");
});

test("upsertBlobEntry: a `$` in the blobName is inserted literally, not expanded", () => {
  // String.replace expands $&, $`, $', $n in a replacement STRING. blobName/ver come from a PR-body
  // URL via decodeURIComponent, so `…_1.0$`.zip` spliced surrounding manifest text into the Version.
  const text = sources(FULL_ENTRY("VirtoCommerce.Cart", "3.100.0"));
  for (const blobName of ["VirtoCommerce.Cart_1.0$&.zip", "VirtoCommerce.Cart_1.0$`.zip", "VirtoCommerce.Cart_1.0$1.zip"]) {
    const out = mod.upsertBlobEntry(text, "VirtoCommerce.Cart", blobName);
    if (out === null) continue;                       // bailing to reserialize is also acceptable
    const entry = JSON.parse(out).Sources[0].Modules[0];
    assert.equal(entry.BlobName, blobName, `BlobName mangled for ${blobName}`);
    assert.equal(entry.Version, blobName.match(/_(.+)\.zip$/)![1], `Version mangled for ${blobName}`);
  }
});

test("editPackagesText: single-line entry gets its Version refreshed too", () => {
  const text = sources(['        { "Id": "VirtoCommerce.Cart", "Version": "3.100.0-pr-1", "BlobName": "VirtoCommerce.Cart_3.100.0-pr-1.zip" }']);
  const { text: out } = mod.editPackagesText(text, JSON.parse(text), [target("VirtoCommerce.Cart", "3.200.0-pr-9")]);
  assert.deepEqual(mod.pinnedModule(JSON.parse(out), "VirtoCommerce.Cart"), {
    version: "3.200.0-pr-9", source: "AzureBlob", blobName: "VirtoCommerce.Cart_3.200.0-pr-9.zip",
  });
});

test("upsertBlobEntry: two entries on one line → null, never clobber the neighbour's pin", () => {
  const text = sources(['        { "BlobName": "VirtoCommerce.Order_1.0.0.zip" }, { "BlobName": "VirtoCommerce.Cart_3.100.0.zip" }']);
  const out = mod.upsertBlobEntry(text, "VirtoCommerce.Cart", "VirtoCommerce.Cart_9.9.9.zip");
  if (out !== null) {                                 // if it edits, Order MUST survive untouched
    const blobs = JSON.parse(out).Sources[0].Modules.map((m: any) => m.BlobName);
    assert.ok(blobs.includes("VirtoCommerce.Order_1.0.0.zip"), "Order's pin was silently dropped");
  }
});

test("upsertBlobEntry: same module pinned twice → null (don't guess which one to edit)", () => {
  const text = sources([...FULL_ENTRY("VirtoCommerce.Cart", "1.0.0").slice(0, -1), '        },',
    ...FULL_ENTRY("VirtoCommerce.Cart", "2.0.0")]);
  assert.equal(mod.upsertBlobEntry(text, "VirtoCommerce.Cart", "VirtoCommerce.Cart_3.0.0.zip"), null);
});

test("editPackagesText: blobName with no derivable version → reserialize, never a stale Version", () => {
  const text = sources(FULL_ENTRY("VirtoCommerce.Cart", "3.100.0-pr-1"));
  const t = { kind: "module" as const, id: "VirtoCommerce.Cart", version: "snapshot", blobName: "VirtoCommerce.Cart_snapshot.zip", source: "--module" };
  const { text: out } = mod.editPackagesText(text, JSON.parse(text), [t]);
  assert.equal(mod.pinnedModule(JSON.parse(out), "VirtoCommerce.Cart")?.version, "snapshot");
  assert.equal(out.includes("3.100.0-pr-1"), false, "the stale Version must not survive");
});

test("upsertBlobEntry: a source-level \"Version\" outside the entry is never rewritten", () => {
  const text = ['{', '  "Sources": [', '    {', '      "Name": "AzureBlob", "Version": "DO-NOT-TOUCH",',
    '      "Modules": [', '        { "Id": "VirtoCommerce.N", "BlobName": "VirtoCommerce.N_1.0.0.zip" }',
    '      ]', '    }', '  ]', '}', ''].join('\n');
  const out = mod.upsertBlobEntry(text, "VirtoCommerce.N", "VirtoCommerce.N_2.0.0-pr-1.zip");
  if (out !== null) assert.ok(out.includes("DO-NOT-TOUCH"), "clobbered an unrelated Version field");
});

test("editPackagesText: a CRLF manifest stays all-CRLF (no mixed line endings)", () => {
  const text = sources([], GH_ENTRY("VirtoCommerce.Cart", "3.100.0")).replace(/\n/g, '\r\n');
  const { text: out, minimal } = mod.editPackagesText(text, JSON.parse(text), [target("VirtoCommerce.Cart", "3.101.0-pr-2")]);
  assert.equal(minimal, true);
  assert.deepEqual(out.split('\n').filter((l) => l.length && !l.endsWith('\r')), [], "found LF-only lines");
  assert.equal(JSON.parse(out).Sources[0].Modules[0].BlobName, "VirtoCommerce.Cart_3.101.0-pr-2.zip");
});

test("editPackagesText: a tab-indented manifest gets a tab-indented entry", () => {
  const text = ['{', '\t"Sources": [', '\t\t{', '\t\t\t"Name": "AzureBlob",', '\t\t\t"Modules": []', '\t\t},',
    '\t\t{', '\t\t\t"Name": "GithubReleases",', '\t\t\t"Modules": [', '\t\t\t\t{',
    '\t\t\t\t\t"Id": "VirtoCommerce.Cart",', '\t\t\t\t\t"Version": "3.100.0"', '\t\t\t\t}', '\t\t\t]', '\t\t}',
    '\t]', '}', ''].join('\n');
  const { text: out, minimal } = mod.editPackagesText(text, JSON.parse(text), [target("VirtoCommerce.Cart", "3.101.0-pr-2")]);
  assert.equal(minimal, true);
  const seeded = out.split('\n').find((l) => l.includes('"BlobName"'))!;
  assert.match(seeded, /^\t+"BlobName"/, `seeded entry is not tab-indented: ${JSON.stringify(seeded)}`);
  assert.equal(out.includes('  "BlobName"'), false, "space indentation leaked into a tab file");
});

test("editPackagesText: GithubReleases source identified without a \"GithubReleases\" name literal", () => {
  // applyModule() accepts /github/i on Name OR a ModuleSources key — the surgery scan must agree,
  // else it reverts to a whole-file Id scan and hits the AzureBlob entry's Id again.
  for (const header of ['      "Name": "github-releases",', '      "ModuleSources": ["https://example.test/m.json"],']) {
    const text = ['{', '  "Sources": [', '    {', '      "Name": "AzureBlob",', '      "Modules": []', '    },',
      '    {', header, '      "Modules": [', ...GH_ENTRY("VirtoCommerce.Cart", "3.100.0"),
      '      ]', '    }', '  ]', '}', ''].join('\n');
    const { text: out, minimal } = mod.editPackagesText(text, JSON.parse(text), [target("VirtoCommerce.Cart", "3.101.0-pr-2")]);
    assert.equal(minimal, true, `not minimal for header ${header}`);
    const j = JSON.parse(out);
    const gh = j.Sources[1];
    assert.equal(gh.Modules.some((m: any) => m.Id === "VirtoCommerce.Cart"), false, `Id not removed for ${header}`);
    assert.equal(mod.pinnedModule(j, "VirtoCommerce.Cart")?.version, "3.101.0-pr-2");
  }
});

// These two pin the GATE itself (editPackagesText's semantic re-check) rather than the surgery: each
// is a shape the surgery still gets wrong, where only the end-state assertion forces the reserialize.

test("editPackagesText: an oddly-indented Version inside the entry reserializes, never a stale pin", () => {
  // The Version line isn't at the sibling indent, so the entry-bounded refresh skips it. Surgery would
  // leave a stale Version next to the new BlobName; the gate must catch that and reserialize.
  const text = sources(['        {', '          "Id": "VirtoCommerce.Cart",',
    '            "Version": "3.100.0-pr-1",', '          "BlobName": "VirtoCommerce.Cart_3.100.0-pr-1.zip"', '        }']);
  const { text: out } = mod.editPackagesText(text, JSON.parse(text), [target("VirtoCommerce.Cart", "3.200.0-pr-9")]);
  assert.equal(mod.pinnedModule(JSON.parse(out), "VirtoCommerce.Cart")?.version, "3.200.0-pr-9");
  assert.equal(out.includes("3.100.0-pr-1"), false, "stale Version survived into the committed manifest");
});

test("editPackagesText: an Id-named + prefix-named pair for one module refuses the minimal path", () => {
  // The surgery only finds the prefix-named entry, so the Id-named one would survive alongside it and
  // pinnedModule (Id first) would report `undefined`. The gate must reject that and reserialize.
  // NOTE: the reserialize does not fully dedupe either — applyModule() matches by `Id` and leaves an
  // Id-less duplicate behind. That is a PRE-EXISTING applyModule limitation, unchanged by this branch;
  // what is guaranteed here is that the effective pin is right and the run is not reported as minimal.
  const text = sources(['        { "Id": "VirtoCommerce.Cart", "BlobName": "renamed-cart.zip" },',
    '        { "BlobName": "VirtoCommerce.Cart_3.100.0.zip" }']);
  const { text: out, minimal } = mod.editPackagesText(text, JSON.parse(text), [target("VirtoCommerce.Cart", "9.9.9-pr-1")]);
  assert.equal(minimal, false, "an ambiguous double-pin must not be committed as a minimal edit");
  assert.equal(mod.pinnedModule(JSON.parse(out), "VirtoCommerce.Cart")?.version, "9.9.9-pr-1");
});

// ---- mutation-battery guards (these three mutants survived the original test set) ----

test("editPackagesText: GithubReleases FIRST + module already pinned in AzureBlob stays minimal", () => {
  // Kills the mutant that lets sourceBlockRange run to EOF: with gh listed first, an unbounded range
  // swallows the AzureBlob entry's Id and forces the needless reserialize this PR removed.
  const text = ['{', '  "Sources": [', '    {', '      "Name": "GithubReleases",', '      "Modules": [',
    '        {', '          "Id": "VirtoCommerce.Other",', '          "Version": "1.0.0"', '        }', '      ]',
    '    },', '    {', '      "Name": "AzureBlob",', '      "Modules": [',
    ...FULL_ENTRY("VirtoCommerce.Cart", "3.100.0-pr-1"), '      ]', '    }', '  ]', '}', ''].join('\n');
  const { text: out, minimal } = mod.editPackagesText(text, JSON.parse(text), [target("VirtoCommerce.Cart", "3.200.0-pr-9")]);
  assert.equal(minimal, true, "gh-first + already-pinned must not fall back to reserialize");
  assert.equal(mod.pinnedModule(JSON.parse(out), "VirtoCommerce.Cart")?.version, "3.200.0-pr-9");
});

test("upsertBlobEntry: seeded entry indent follows a 4-space file, not a hardcoded 2", () => {
  // Kills the mutant replacing detectIndentUnit with `return 2` — every other fixture is 2-space,
  // which is indistinguishable from the fallback.
  const text = ['{', '    "Sources": [', '        {', '            "Name": "AzureBlob",',
    '            "Modules": []', '        }', '    ]', '}', ''].join('\n');
  const out = mod.upsertBlobEntry(text, "VirtoCommerce.Cart", "VirtoCommerce.Cart_3.101.0-pr-2.zip");
  assert.ok(out);
  assert.ok(out!.includes('                    "BlobName": "VirtoCommerce.Cart_3.101.0-pr-2.zip"'),
    `expected 20-space indent, got ${JSON.stringify(out!.split('\n').find((l) => l.includes('BlobName')))}`);
});

test("upsertBlobEntry: Version listed AFTER BlobName in the entry is still refreshed", () => {
  const text = sources(['        {', '          "Id": "VirtoCommerce.Cart",',
    '          "BlobName": "VirtoCommerce.Cart_3.100.0-pr-1.zip",', '          "Version": "3.100.0-pr-1"', '        }']);
  const out = mod.upsertBlobEntry(text, "VirtoCommerce.Cart", "VirtoCommerce.Cart_3.200.0-pr-9.zip");
  if (out !== null) assert.equal(mod.pinnedModule(JSON.parse(out), "VirtoCommerce.Cart")?.version, "3.200.0-pr-9");
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
