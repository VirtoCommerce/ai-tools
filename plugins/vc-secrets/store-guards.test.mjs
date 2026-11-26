// The guards test-support.mjs puts up at load, so that no test reaches the machine's real credential stores
// by leaving a seam un-injected. A guard is a few lines at the top of a support module, and anyone can
// delete one with the suite green: each test below is red when its guard is removed, and drives the real
// runner or the real path functions, not the constants the guard set.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as m from "./vc-secrets.mjs";
import { launcherEnv } from "./test-fixtures.mjs";
import { STORE_GUARD_DIR, STORE_GUARD_MARK, UNREACHABLE_POWERSHELL } from "./test-support.mjs";

const KEY = "vc-secrets:user:oauth-guard-refresh";

const inside = (dir, file) => {
    const relative = path.relative(dir, file);

    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
};

test("the PowerShell the real runner starts is the guard's own path, which nothing exists at", async () => {
    // Un-injected: the default runner, the default env. Without the guard this starts the real powershell.exe
    // on Windows, and on a machine without one fails naming `powershell.exe`, so the path is what proves it.
    const failure = await m.unprotectManyIo({ blobs: new Map([[KEY, Buffer.from("x")]]) }).then(() => null, (e) => e);
    assert.ok(failure?.message.includes(UNREACHABLE_POWERSHELL), `the start was ${failure?.message}, not the guard's path`);
});

test("the DPAPI, gpg and trust files resolve under the guard's directory, with XDG_CONFIG_HOME or without it", () => {
    assert.ok(inside(STORE_GUARD_DIR, m.keyToPath(KEY)), "gpg files follow XDG_CONFIG_HOME");
    assert.ok(inside(STORE_GUARD_DIR, m.dpapiKeyToPath(KEY)), "dpapi files follow XDG_CONFIG_HOME");
    // The dpapi root falls back to LOCALAPPDATA when XDG_CONFIG_HOME is absent, which is how Windows runs it.
    assert.ok(inside(STORE_GUARD_DIR, m.dpapiKeyToPath(KEY, { ...process.env, XDG_CONFIG_HOME: undefined })),
        "dpapi files follow LOCALAPPDATA");
});

for (const [tool, store] of [["security", "the macOS Keychain"], ["az", "Azure Key Vault"]]) {
    test(`${tool} on PATH is the guard's stub, which fails with 1 and says so, never 44 or an absence`, async () => {
        // 44 is the Keychain's "not stored": a stub that exited with it would read as an entry that is not there.
        const failure = await m.runTool({ cmd: tool, args: ["any"], timeoutMs: 10_000, captureStdout: true })
            .then(() => null, (e) => e);
        assert.equal(failure?.toolExitCode, 1, `${tool} ended as: ${failure?.message}`);
        assert.ok(failure.message.includes(STORE_GUARD_MARK) && failure.message.includes(store), failure.message);
    });
}

test("launcherEnv, which strips every VC_SECRETS_* variable, puts the PowerShell guard back", () => {
    assert.equal(process.env.VC_SECRETS_POWERSHELL, UNREACHABLE_POWERSHELL, "the guard is what the process runs under");
    assert.equal(launcherEnv().VC_SECRETS_POWERSHELL, UNREACHABLE_POWERSHELL);
    assert.equal(launcherEnv({ VC_SECRETS_POWERSHELL: "vc-ps-own-stub" }).VC_SECRETS_POWERSHELL, "vc-ps-own-stub",
        "a test that stubs PowerShell itself still wins");
});

test("every test file loads the guards, directly or through the fixtures", () => {
    // `node --test` runs each file in a process of its own, so a file that imports neither module runs
    // with no guard at all, and nothing about that is visible in a green run.
    const root = path.dirname(fileURLToPath(import.meta.url));
    const files = fs.globSync("**/*.test.mjs", { cwd: root }).filter((f) => !f.split(/[\\/]/).includes(".claude"));
    assert.ok(files.length >= 10, files.join(","));
    const unguarded = files.filter((f) => !/from\s*"(\.\.?\/)+test-(support|fixtures)\.mjs"|^import\s*"(\.\.?\/)+test-(support|fixtures)\.mjs"/m
        .test(fs.readFileSync(path.join(root, f), "utf8")));
    assert.deepEqual(unguarded, []);
});
