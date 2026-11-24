import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as m from "../vc-secrets.mjs";
import * as cache from "../vc-secrets-cache.mjs";
import * as oauth from "../vc-secrets-oauth.mjs";
import { pathPresent } from "./util.mjs";
import { removeFileWithRetry } from "./keystore.mjs";
import { tmpDirs } from "../test-support.mjs";
import { denyFs, CAN_RUN_POSIX_STUB, scopedPaths, credHex, stubBinary, withStubOnPath } from "../test-fixtures.mjs";

test("loadConfig: a project secret shadowing a user-scope name keys the PROJECT namespace", () => {
    // The point of the two fields: the winner's `home` is project, so its key is the project's — the
    // personal value under vc-secrets:user:<name> is not what the project's server will read.
    const paths = scopedPaths({
        user: { secrets: { shared: { backend: "local" } } },
        project: { projectId: "proj-x", secrets: { shared: { backend: "local" } } },
    });
    const cfg = m.loadConfig(paths);
    assert.equal(m.keyFor("shared", cfg.secrets.shared, cfg), `${m.KEY_PREFIX}:proj-x:shared`);
});

test("detectLocalBackend: platform rule (WSL is linux → gpg)", () => {
    assert.equal(m.detectLocalBackend("win32", {}), "wcm");
    assert.equal(m.detectLocalBackend("darwin", {}), "keychain");
    assert.equal(m.detectLocalBackend("linux", {}), "gpg");
});

test("detectLocalBackend: VC_SECRETS_LOCAL_BACKEND override, invalid rejected", () => {
    assert.equal(m.detectLocalBackend("linux", { VC_SECRETS_LOCAL_BACKEND: "keychain" }), "keychain");
    assert.throws(() => m.detectLocalBackend("linux", { VC_SECRETS_LOCAL_BACKEND: "vault9000" }), m.VcSecretsError);
});

test("oauthBackend: Credential Manager platforms store the OAuth pair with dpapi", () => {
    assert.equal(m.oauthBackend("win32", {}), "dpapi");
    assert.equal(m.oauthBackend("linux", { VC_SECRETS_LOCAL_BACKEND: "wcm" }), "dpapi");
});

test("oauthBackend: keychain and gpg are unchanged", () => {
    assert.equal(m.oauthBackend("darwin", {}), "keychain");
    assert.equal(m.oauthBackend("linux", {}), "gpg");
});

test("oauthBackend: dpapi is not a value VC_SECRETS_LOCAL_BACKEND accepts", () => {
    assert.throws(() => m.oauthBackend("linux", { VC_SECRETS_LOCAL_BACKEND: "dpapi" }), /VC_SECRETS_LOCAL_BACKEND/);
});

test("OAUTH_BACKENDS: the backends oauthBackend can answer with, derived from the local ones", () => {
    assert.deepEqual([...m.OAUTH_BACKENDS].sort(), ["dpapi", "gpg", "keychain"]);
    for (const local of ["wcm", "keychain", "gpg"]) {
        assert.ok(m.OAUTH_BACKENDS.includes(m.oauthBackend("linux", { VC_SECRETS_LOCAL_BACKEND: local })),
            `oauthBackend over "${local}" must be one of the backends that can hold the pair`);
    }
});

test("dpapiKeyToPath: LOCALAPPDATA is the root, XDG_CONFIG_HOME overrides it", () => {
    const key = "vc-secrets:user:oauth-ado-refresh";
    assert.equal(m.dpapiKeyToPath(key, { LOCALAPPDATA: "/L" }), path.join("/L", "vc-secrets", "secrets", "user", "oauth-ado-refresh.dpapi"));
    assert.equal(m.dpapiKeyToPath(key, { LOCALAPPDATA: "/L", XDG_CONFIG_HOME: "/X" }), path.join("/X", "vc-secrets", "secrets", "user", "oauth-ado-refresh.dpapi"));
});

test("dpapiKeyToPath: with neither LOCALAPPDATA nor XDG_CONFIG_HOME the root is Windows' own default for LOCALAPPDATA", () => {
    // Not the profile itself: a client that strips LOCALAPPDATA must read the directory login wrote, which is
    // where Windows points LOCALAPPDATA by default, `<profile>\AppData\Local`.
    assert.equal(m.dpapiKeyToPath("vc-secrets:user:oauth-ado-refresh", {}),
        path.join(os.homedir(), "AppData", "Local", "vc-secrets", "secrets", "user", "oauth-ado-refresh.dpapi"));
});

test("dpapiKeyToPath: a malformed key is refused", () => {
    assert.throws(() => m.dpapiKeyToPath("../x", { LOCALAPPDATA: "/L" }), m.VcSecretsError);
});

test("keyFor: project scope uses the project's namespace, user scope uses \"user\"", () => {
    assert.equal(m.keyFor("ado-pat", { scope: "project" }, { projectId: "myproj" }), "vc-secrets:myproj:ado-pat");
    assert.equal(m.keyFor("ado-pat", { scope: "user" }, {}), "vc-secrets:user:ado-pat");
});

test("keyToPath: puts the file under a per-scope directory", () => {
    const projectPath = m.keyToPath("vc-secrets:myproj:ado-pat", { HOME: "/h" });
    assert.ok(projectPath.endsWith(path.join("myproj", "ado-pat.gpg")));
    const userPath = m.keyToPath("vc-secrets:user:ado-pat", { HOME: "/h" });
    assert.ok(userPath.endsWith(path.join("user", "ado-pat.gpg")));
});

test("builders: no secret and no raw script in argv, timeouts per spec", () => {
    const gpgRead = m.buildLocalRead("gpg", "vc-secrets:user:ado-pat", { HOME: "/h" });
    assert.equal(gpgRead.cmd, "gpg");
    assert.equal(gpgRead.timeoutMs, 10_000);
    assert.ok(gpgRead.args.some((a) => a.endsWith("ado-pat.gpg")));
    const pinentryIdx = gpgRead.args.indexOf("--pinentry-mode");
    assert.ok(pinentryIdx !== -1, "non-interactive gpg read must set --pinentry-mode (no pinentry under the kill timer)");
    assert.equal(gpgRead.args[pinentryIdx + 1], "cancel");

    const wcmRead = m.buildLocalRead("wcm", "vc-secrets:user:ado-pat", {});
    assert.equal(wcmRead.cmd, "powershell.exe");
    assert.ok(wcmRead.args.includes("-EncodedCommand"), "must use EncodedCommand, not -Command");
    assert.ok(!wcmRead.args.some((a) => a.includes("CredRead")), "raw script must not be in argv");
    const encoded = wcmRead.args[wcmRead.args.indexOf("-EncodedCommand") + 1];
    assert.ok(Buffer.from(encoded, "base64").toString("utf16le").includes("CredRead"));
    assert.deepEqual(wcmRead.extraEnv, { VC_SECRETS_NAME: "vc-secrets:user:ado-pat" });

    const wcmViaPwsh = m.buildLocalRead("wcm", "vc-secrets:user:ado-pat", { VC_SECRETS_POWERSHELL: "pwsh" });
    assert.equal(wcmViaPwsh.cmd, "pwsh");

    const wcmWrite = m.buildLocalWrite("wcm", "vc-secrets:user:ado-pat", {});
    assert.equal(wcmWrite.stdinData, m.VALUE_ON_STDIN);
    const writeEncoded = wcmWrite.args[wcmWrite.args.indexOf("-EncodedCommand") + 1];
    assert.ok(Buffer.from(writeEncoded, "base64").toString("utf16le").includes("InputEncoding"),
        "write script must set Console.InputEncoding to UTF-8 (non-ASCII secrets)");

    const kcWrite = m.buildLocalWrite("keychain", "vc-secrets:user:ado-pat", { USER: "u" }, { value: "v" });
    assert.ok(!kcWrite.interactive, "no keychain write inherits the terminal");
    assert.equal(kcWrite.timeoutMs, m.TIMEOUT_LOCAL_MS, "a write that waits on no one carries a kill timer");

    const gpgWrite = m.buildLocalWrite("gpg", "vc-secrets:user:ado-pat", { HOME: "/h", VC_SECRETS_GPG_RECIPIENT: "dev@x" });
    assert.ok(gpgWrite.args.includes("--trust-model"), "explicit recipient needs trust-model always");

    const kv = m.buildKeyvaultRead({ vault: "demo-vault", secret: "monitor-sp-nonprod" });
    assert.equal(kv.cmd, "az");
    assert.deepEqual(kv.args, ["keyvault", "secret", "show", "--vault-name", "demo-vault", "--name", "monitor-sp-nonprod", "--query", "value", "-o", "tsv"]);
    assert.equal(kv.timeoutMs, 20_000);
});

test("the write script sizes the blob in BYTES, which is what doubles the usable length", () => {
    // 1280 chars at UTF-16 against 2560 at UTF-8, against a 2560-byte ceiling. The measured
    // refresh entry is 2010 bytes; as UTF-16 that is 4020 and does not fit at all.
    assert.match(m.PS_CRED_WRITE, /UTF8\.GetBytes/);
    assert.doesNotMatch(m.PS_CRED_WRITE, /StringToCoTaskMemUni/);

    // The size field is the half that must agree with the buffer. Keeping UTF8.GetBytes while
    // restoring `$value.Length*2` satisfies both lines above and is WORSE than the original
    // defect: CredWrite is then handed a length twice the allocation and marshals past it.
    assert.match(m.PS_CRED_WRITE, /CredentialBlobSize=\$bytes\.Length/);
});

test("the read script prints hex, because the encoding has to be decided from the bytes", () => {
    // Reverting this to PtrToStringUni would read a UTF-8 blob as UTF-16 and yield mojibake with
    // no error anywhere.
    assert.match(m.PS_CRED_READ, /ToString\("x2"\)/);
    assert.doesNotMatch(m.PS_CRED_READ, /PtrToStringUni/);
});

test("a message improved for a human keeps the exit code the code reads", () => {
    // mapResolveError returns a NEW error in every branch, so it silently dropped toolExitCode --
    // and the caller still received an error, just one that no longer answered WHICH failure this
    // was. doctor's write probe is the consumer that made it visible: it reports the Credential Manager
    // ceiling only for exit 4, and by the time the write failure reached it the 4 was gone.
    const raw = Object.assign(new Error("value too large for Credential Manager (2588 bytes; limit 2560)"),
        { toolExitCode: 4 });
    const mapped = m.mapResolveError("wcm", "oauth-ado-dev-access", raw);
    assert.equal(mapped.toolExitCode, 4, "the classification must survive the rewording");
    assert.match(mapped.message, /too large for Credential Manager/);
});

test("newKeyPresent on gpg: an entry that cannot be examined is not reported absent", async (t) => {
    // existsSync said false for both "no such file" and "I could not look", and every caller read
    // that as "nothing is stored". For migrate that is the difference between skipping and writing
    // the pre-rotation value over the current one -- which is exactly what this function's own
    // comment refuses to allow, on a backend where it did not hold.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-stat-"));
    tmpDirs.push(dir);
    const env = { XDG_CONFIG_HOME: dir };
    const key = "vc-secrets:user:ado-pat";
    denyFs(t, "statSync", m.keyToPath(key, env));
    await assert.rejects(() => m.newKeyPresent("gpg", key, env), /could not be examined/);
});

test("newKeyPresent on gpg: a genuinely missing entry is still simply absent", async () => {
    // The half that keeps the distinction useful rather than merely loud: ENOENT is the one answer
    // that means "no entry", and it must stay a quiet false.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-stat-absent-"));
    tmpDirs.push(dir);
    assert.equal(await m.newKeyPresent("gpg", "vc-secrets:user:ado-pat", { XDG_CONFIG_HOME: dir }), false);
});

test("readLegacyLocalValue on gpg: a legacy entry that cannot be examined is not 'no legacy entry'", async (t) => {
    // Answered null, migrate told the developer to run `set` and retype a secret that never left the
    // disk. A throw lands in migrate's own "migration failed" line, which names the path.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-legacy-stat-"));
    tmpDirs.push(dir);
    const env = { XDG_CONFIG_HOME: dir };
    denyFs(t, "statSync", m.legacyKeyToPath("ado-pat", env));
    await assert.rejects(() => m.readLegacyLocalValue("gpg", "ado-pat", env), /could not be examined/);
});

test("the write script stores the caller's bytes, trailing newline included", () => {
    // The read path strips one line ending because `security -w` and the PowerShell reader APPEND
    // one -- it removes the tool's artifact. Nothing appends on the way in: runTool does
    // `child.stdin.write(stdinValue)` and ReadToEnd returns exactly those bytes, so a TrimEnd here
    // deleted the caller's, and every trailing CR/LF rather than a single line ending.
    //
    // cmdMigrate is what makes it reachable: the other two writers hand over a token's JSON or a
    // secret typed at a prompt, where Enter is the terminator. Migrate moves a value the user
    // cannot retype, and its gpg read opts out of the same strip with keepTrailingNewline for
    // precisely this reason -- Windows was doing what that opt-out exists to prevent.
    assert.doesNotMatch(m.PS_CRED_WRITE, /TrimEnd/);
    assert.match(m.PS_CRED_WRITE, /^\$value=\[Console\]::In\.ReadToEnd\(\)$/m);
});

test("the read script exits absent only for ERROR_NOT_FOUND, never for an unreadable store", () => {
    // The same rule PS_CRED_DELETE carries, and the read path is where breaking it costs most.
    // Its readers take exit 3 as authoritative absence -- newKeyPresent's own comment insists
    // absent and unreadable must not collapse, and on wcm they did. A Credential Manager that
    // cannot be read (a logon session left locked after an RDP reconnect, a policy-restricted
    // context) then reads as "not signed in", and the developer is sent through an interactive
    // sign-in nothing had invalidated: it spends a single-use authorization code and rotates a live
    // refresh token away. Losing the token is the failure; the wasted minute is not.
    assert.match(m.PS_CRED_READ, /\$e -eq 1168/);
    assert.match(m.PS_CRED_READ, /GetLastWin32Error/);

    // Presence is not exclusivity, for the reason the delete script's twin of this assertion gives:
    // adding `if($e -eq 5){ exit 3 }` -- ACCESS_DENIED -- satisfies both matches above while
    // restoring exactly the collapse this test exists to prevent.
    assert.equal(m.PS_CRED_READ.match(/exit 3/g).length, 1, "exactly one condition may exit 3");
});

test("PS_CRED_READ_MANY reads each name exactly as PS_CRED_READ does", () => {
    // Derived from the single read rather than restated: the batched read replaces it on the launch path,
    // so the CredRead declaration, the CREDENTIAL layout, the output encoding and the hex the decoder expects
    // have to be the single read's own, and a later change to one that misses the other must show here.
    const single = m.PS_CRED_READ;
    const credRead = /\[DllImport\("advapi32"[^\n]*\n\s*public static extern bool CredRead\([^\n]*/.exec(single)[0];
    const struct = /public struct CREDENTIAL \{[\s\S]*?\}/.exec(single)[0];
    const hex = /\(\(\$b \| ForEach-Object \{ \$_\.ToString\("x2"\) \}\) -join ''\)/.exec(single)[0];
    const encoding = /\[Console\]::OutputEncoding=[^\n]*/.exec(single)[0];
    for (const [what, text] of Object.entries({ credRead, struct, hex, encoding })) {
        assert.ok(m.PS_CRED_READ_MANY.includes(text), `the batched read carries the single read's ${what}: ${text}`);
    }
});

test("PS_CRED_READ_MANY's job kills its tree on close and grants no breakaway", () => {
    // A job that let its members' children break away is libuv's own, and it is the job the server's
    // grandchildren already escape. KILL_ON_JOB_CLOSE alone is the whole point; any breakaway flag -- by
    // name or by value -- undoes it for the processes that hold the secrets.
    const script = m.PS_CRED_READ_MANY;
    assert.doesNotMatch(script, /BREAKAWAY/i);
    assert.match(script, /const int JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;/);
    const assignments = script.match(/LimitFlags\s*=[^;]*;/g);
    assert.deepEqual(assignments, ["LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;"],
        "the one flag, and nothing OR-ed into it");
});

test("PS_CRED_READ_MANY duplicates the job into the launcher before assigning the launcher to it", () => {
    // Assigned first, a failed duplicate leaves PowerShell the job's only holder, and its exit closes the
    // job and kills the launcher under KILL_ON_JOB_CLOSE. The duplicate must also not be inheritable: a
    // child holding the job open would outlive the launcher with it.
    //
    // The order check reads the first occurrence of each call, so each must occur exactly once: a second
    // copy, a comment included, would let it compare the wrong one. Counting rather than stripping comments,
    // because the script is C# inside PowerShell inside a JS string and no comment stripper covers all three.
    const script = m.PS_CRED_READ_MANY;
    const duplicateCall = "DuplicateHandle(GetCurrentProcess(), job, launcher, out held, 0, false, DUPLICATE_SAME_ACCESS)";
    const assignCall = "AssignProcessToJobObject(job, launcher)";
    for (const call of [duplicateCall, assignCall]) {
        assert.equal(script.split(call).length - 1, 1,
            `${call} occurs exactly once, so a second copy -- a comment included -- cannot make the order check read the wrong one`);
    }

    const duplicate = script.indexOf(duplicateCall);
    const assign = script.indexOf(assignCall);
    assert.ok(duplicate >= 0, "the job handle is duplicated into the launcher, non-inheritable");
    assert.ok(assign >= 0, "the launcher is assigned to the job");
    assert.ok(duplicate < assign, "duplicate first, then assign");
});

test("a blob written by the pre-UTF-8 launcher still reads, since it cannot be re-entered", () => {
    // `set` needs the plaintext and the keystore does not give it back, so asking a teammate to
    // retype would mean minting a new credential.
    assert.deepEqual(m.decodeCredBlobHex("650079006400"), { encoding: "utf16le", value: "eyd" });
    assert.equal(m.decodeCredBlobHex("65794a64").encoding, "utf8");
});

test("the UTF-16 test requires non-zero even bytes and an even length", () => {
    // A zero in an EVEN position is not UTF-16 ASCII; treating it as such would decode a
    // legitimate UTF-8 blob containing a NUL into garbage.
    assert.equal(m.decodeCredBlobHex("0000").encoding, "utf8");
    // Three bytes, not one: `65` is turned away by the length >= 2 floor, so it never reaches the
    // even-length test it is named for. `650079` passes the floor and the every() predicate, so
    // dropping `% 2 === 0` decodes it as UTF-16 and silently loses the third byte.
    assert.equal(m.decodeCredBlobHex("650079").encoding, "utf8", "an odd length is never UTF-16");
});

test("the UTF-16 detector reaches ASCII and no further, which is what the ASCII premise buys", () => {
    // "€" as UTF-16LE is `ac 20`: the odd byte is not zero, so the detector calls it UTF-8 and the
    // value comes back mojibake with nothing raised. No detector can do better — UTF-16 text and
    // UTF-8 bytes are not separable in general — so the guarantee has to come from the data, and it
    // does: the stored credentials were checked to be ASCII. This test is that check's teeth.
    assert.equal(m.decodeCredBlobHex("ac20").encoding, "utf8");
    assert.notEqual(m.decodeCredBlobHex("ac20").value, "\u20ac");
});

test("buildLocalRead/buildLocalWrite: reject keys outside vc-secrets:<scope>:<name> (path traversal guard)", () => {
    assert.throws(() => m.buildLocalRead("gpg", "../evil", { HOME: "/h" }), m.VcSecretsError);
    assert.throws(() => m.buildLocalWrite("gpg", "../evil", { HOME: "/h" }), m.VcSecretsError);
    assert.throws(() => m.buildLocalRead("gpg", "vc-secrets:user:../evil", { HOME: "/h" }), m.VcSecretsError);
    assert.throws(() => m.buildLocalWrite("gpg", "vc-secrets:user:../evil", { HOME: "/h" }), m.VcSecretsError);
});

test("buildLocalWrite: gpg tmp target for atomic write", () => {
    const key = "vc-secrets:user:ado-pat";
    const env = { HOME: "/h" };
    const spec = m.buildLocalWrite("gpg", key, env, { tmp: true });
    const target = spec.args[spec.args.indexOf("-o") + 1];
    // Named for this process: login stores even when the token lock is busy, so two writers must not share a tmp path.
    assert.equal(target, `${m.keyToPath(key, env)}.${process.pid}.tmp`);

    const finalSpec = m.buildLocalWrite("gpg", "vc-secrets:user:ado-pat", { HOME: "/h" });
    const finalTarget = finalSpec.args[finalSpec.args.indexOf("-o") + 1];
    assert.ok(finalTarget.endsWith("ado-pat.gpg") && !finalTarget.endsWith(".tmp"), "default (no tmp option) targets the final path");
});

test("writeSecretValue: gpg renames the same pid-suffixed tmp file the builder targets", async () => {
    const { env } = tmpConfigEnv("vc-secrets-gpg-tmp-");
    const key = "vc-secrets:user:ado-pat";
    const finalPath = m.keyToPath(key, env);
    // Stands in for gpg: writes exactly where the spec's `-o` points.
    let target = null;
    const run = async (spec) => {
        target = spec.args[spec.args.indexOf("-o") + 1];
        fs.writeFileSync(target, "CIPHER");
    };
    await m.writeSecretValue(key, "the-token", { backend: "gpg", env, run });

    assert.equal(fs.readFileSync(finalPath, "utf8"), "CIPHER");
    assert.equal(pathPresent(target, "the tmp file"), false, "the tmp file was renamed, not left behind");
    assert.equal(target, `${finalPath}.${process.pid}.tmp`);
});

test("buildLocalDelete refuses a key that is not three segments", () => {
    assert.throws(() => m.buildLocalDelete("wcm", "oauth-x-refresh"), /invalid secret key/);
});

test("buildLocalDelete names the same key the read builder would read", () => {
    const key = "vc-secrets:user:oauth-ado-refresh";
    const env = { SystemRoot: "C:\\Windows" };
    const del = m.buildLocalDelete("wcm", key, env);
    assert.equal(del.extraEnv.VC_SECRETS_NAME, m.buildLocalRead("wcm", key, env).extraEnv.VC_SECRETS_NAME);
    assert.equal(del.extraEnv.VC_SECRETS_NAME, key);
    assert.equal(del.captureStdout, false);

    // The env var is only half the address: the script decides what it hands CredDelete.
    // Reinstating the source's `mcpw:` prefix there targets a credential that does not exist,
    // and on a missing name CredDelete sets 1168 — the code this script exits 3 for, which
    // deleteEntryIo passes on as "already absent". Logout would report a removal it never made.
    assert.match(m.PS_CRED_DELETE, /CredDelete\("\$env:VC_SECRETS_NAME",1,0\)/);
    assert.doesNotMatch(m.PS_CRED_DELETE, /mcpw:/);
});

test("buildLocalDelete on keychain passes the key as the service, not as the account", () => {
    const del = m.buildLocalDelete("keychain", "vc-secrets:user:oauth-ado-refresh", { USER: "u" });
    assert.deepEqual(del.args.slice(0, 2), ["delete-generic-password", "-a"]);
    assert.equal(del.args[del.args.indexOf("-s") + 1], "vc-secrets:user:oauth-ado-refresh");
});

test("only ERROR_NOT_FOUND may read as already-absent", () => {
    // Exiting "already gone" for EVERY win32 error would let logout report success while the
    // refresh token is still in the store — the single outcome logout exists to prevent.
    assert.match(m.PS_CRED_DELETE, /\$e -eq 1168/);
    assert.match(m.PS_CRED_DELETE, /GetLastWin32Error/);

    // Presence is not exclusivity. Adding `if($e -eq 5){ exit 3 }` — ACCESS_DENIED — beside the
    // 1168 branch satisfies both matches above, and a locked store then reads as an empty one.
    assert.equal(m.PS_CRED_DELETE.match(/exit 3/g).length, 1, "exactly one condition may exit 3");
});

test("an already-absent keychain entry is normalised to one exit code, not swallowed", async () => {
    // Each backend signals absence differently; deleteEntryIo gives logout ONE meaning to check.
    // It rethrows — a resolved call would hide the difference from the only caller that needs it.
    const del = m.deleteEntryIo("keychain", {}, {
        run: async () => { throw Object.assign(new m.VcSecretsError("not found"), { toolExitCode: 44 }); },
    });
    await assert.rejects(() => del("vc-secrets:user:oauth-ado-refresh"),
        (e) => e.toolExitCode === 3);
});

test("an already-absent gpg entry is normalised to the same exit code", async () => {
    const del = m.deleteEntryIo("gpg", { HOME: "/nonexistent-for-this-test" });
    await assert.rejects(() => del("vc-secrets:user:oauth-ado-refresh"),
        (e) => e.toolExitCode === 3);
});

test("a gpg entry under a path that runs through a file is absent to logout", async () => {
    // Nothing can live under a regular file. The presence check answers "absent" there, so a logout
    // that threw instead would call one keystore state empty and broken at once.
    const del = m.deleteEntryIo("gpg", {}, { rm: () => { throw Object.assign(new Error("x"), { code: "ENOTDIR" }); } });
    await assert.rejects(() => del("vc-secrets:user:oauth-ado-refresh"),
        (e) => e.toolExitCode === 3);
});

test("a gpg removal that fails for any other reason is not reported as absent", async () => {
    // EACCES is a broken machine, not an empty one. Collapsing the two is how logout reports
    // success over a credential it could not remove.
    const del = m.deleteEntryIo("gpg", {}, { rm: () => { throw Object.assign(new Error("x"), { code: "EACCES" }); } });
    await assert.rejects(() => del("vc-secrets:user:oauth-ado-refresh"),
        (e) => e.toolExitCode !== 3);
});

test("deleteEntryIo: a malformed gpg key is refused, not read as already-absent", async () => {
    // Without this guard a malformed key still splits into a scope and a name (":" is present),
    // so keyToPath builds a real -- just wrong -- path, fs.rmSync misses on it, and the failure
    // comes back as ENOENT -> toolExitCode 3, the exact shape cmdLogout reads as "already absent".
    // A logout would then report a credential removed that was never even looked for. Path
    // traversal is not the live hazard here: oauth entry names and projectId are both validated
    // against SECRET_NAME_RE at config load, so a key built from a
    // loaded config cannot carry a traversal segment. The hazard is this exit-code collision, so
    // the assertion is on the MESSAGE and on the absence of the already-absent shape, not on path
    // traversal -- mirroring the source's analog (mcpw.test.js), which asserts
    // /invalid secret name/ and specifically NOT /no stored entry/ for the same reason.
    const del = m.deleteEntryIo("gpg", { HOME: "/nonexistent-for-this-test" });
    await assert.rejects(() => del("vc-secrets:user:Not_Valid"), (e) => {
        assert.match(e.message, /invalid secret key/);
        assert.doesNotMatch(e.message, /no stored entry/);
        assert.notEqual(e.toolExitCode, 3, "a malformed key must not be read as an already-absent entry");

        return true;
    });
});

test("mapResolveError: wcm exit 3 → Credential Manager advice", () => {
    const e = Object.assign(new Error("CredRead failed"), { toolExitCode: 3 });
    const mapped = m.mapResolveError("wcm", "ado-pat", e);
    assert.ok(mapped instanceof m.VcSecretsError);
    assert.match(mapped.message, /not found in Credential Manager -- run "vc-secrets set ado-pat"/);
});

test("an oversize value is named as a size problem, with the entry that overflowed", () => {
    // The write path is the ONLY producer of exit 4, so without a consumer the mapping for it is
    // unreachable and a raw win32err=1783 reaches the developer instead.
    const bare = m.mapResolveError("wcm", "ado", Object.assign(new Error("x"), { toolExitCode: 4 }));
    assert.match(bare.message, /too large for Credential Manager/);
    assert.match(bare.message, /"ado"/);

    // The measured size is the number a developer can act on, and it survives only if the regex
    // still matches what the PowerShell branch writes. Asserting the bare case alone leaves the
    // extraction unexercised, so a reworded script drops the figure with the suite green.
    const measured = m.mapResolveError("wcm", "ado",
        Object.assign(new Error("value too large for Credential Manager (4020 bytes; limit 2560)"), { toolExitCode: 4 }));
    assert.match(measured.message, /\(4020 bytes\)/);
});

test("mapResolveError: keychain exit 44 → Keychain advice", () => {
    const e = Object.assign(new Error("security: item not found"), { toolExitCode: 44 });
    const mapped = m.mapResolveError("keychain", "ado-pat", e);
    assert.ok(mapped instanceof m.VcSecretsError);
    assert.match(mapped.message, /not found in Keychain -- run "vc-secrets set ado-pat"/);
});

test("mapResolveError: gpg failure → unlock hint", () => {
    const e = new Error("gpg exited 2: decryption failed: No secret key");
    const mapped = m.mapResolveError("gpg", "ado-pat", e);
    assert.ok(mapped instanceof m.VcSecretsError);
    assert.match(mapped.message, /decryption failed: No secret key -- if the gpg agent is locked, run "vc-secrets unlock" in a terminal/);
});

test("mapResolveError: other backend/exit-code combinations pass through unchanged", () => {
    const e = new Error("az: not logged in");
    assert.equal(m.mapResolveError("keyvault", "x", e), e);
    const wcmOther = Object.assign(new Error("boom"), { toolExitCode: 1 });
    assert.equal(m.mapResolveError("wcm", "x", wcmOther), wcmOther);
});

test("makeSecretResolver: gpg backend, file absent → not-set advice (pre-check before spawning)", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-gpg-"));
    tmpDirs.push(tmp);
    const env = { VC_SECRETS_LOCAL_BACKEND: "gpg", XDG_CONFIG_HOME: tmp };
    const resolver = m.makeSecretResolver({}, env);
    await assert.rejects(
        resolver("ado-pat", { backend: "local", scope: "user" }),
        (e) => e instanceof m.VcSecretsError && /not set -- run "vc-secrets set ado-pat"/.test(e.message));
});

test("readWcmBatch: a value, ERROR_NOT_FOUND and any other code seed exactly what a single read returns or throws", { skip: !CAN_RUN_POSIX_STUB && "needs a POSIX shell, which the stub binary on PATH is written behind" }, async () => {
    // The expected outcomes are not written out: they are what the single-read resolver produces against a
    // PowerShell stub exiting the way PS_CRED_READ does -- the value as hex, exit 3 for 1168, exit 1 naming
    // any other code. So "absent" stays 1168 alone, the way the single read has it: an unreadable store
    // read as absent sends a developer through a sign-in that rotates a live refresh token away.
    const cfg = m.loadConfig(scopedPaths({ user: {
        secrets: { pat: { backend: "local" }, gone: { backend: "local" }, locked: { backend: "local" },
            vaulted: { backend: "keyvault", vault: "kv-one", secret: "s1" } },
        servers: {} } }));
    const env = { VC_SECRETS_LOCAL_BACKEND: "wcm", VC_SECRETS_POWERSHELL: "vc-ps-batch-stub" };
    const stub = `#!/bin/sh
case "$VC_SECRETS_NAME" in
  *:pat) printf '%s\\n' '${credHex("the-pat-value")}'; exit 0 ;;
  *:gone) exit 3 ;;
  *) printf 'CredRead failed win32err=5' >&2; exit 1 ;;
esac
`;
    const names = ["pat", "gone", "locked"];
    const single = {};
    await withStubOnPath("vc-ps-batch-stub", stub, async () => {
        const resolver = m.makeSecretResolver(cfg, env);
        for (const name of names) {
            try {
                single[name] = { value: await resolver(name, cfg.secrets[name]) };
            } catch (e) {
                single[name] = { message: e.message, toolExitCode: e.toolExitCode };
            }
        }
    });
    assert.equal(single.pat.value, "the-pat-value", "the control: the stub answers the single read");
    assert.notEqual(single.gone.message, single.locked.message, "the control: absent and unreadable differ");

    const key = (name) => m.keyFor(name, cfg.secrets[name], cfg);
    const resolver = m.makeSecretResolver(cfg, env);
    let asked = null;
    const { seeded, job } = await resolver.readWcmBatch(
        [...names, "vaulted"].map((name) => ({ name, decl: cfg.secrets[name] })),
        { pid: 4242, run: async ({ keys, pid }) => {
            asked = { keys, pid };

            return { creds: { [key("pat")]: { ok: credHex("the-pat-value") }, [key("gone")]: { err: 1168 },
                [key("locked")]: { err: 5 } }, job: "ok" };
        } });
    assert.deepEqual(asked, { keys: names.map(key), pid: 4242 }, "one call, the wcm keys only, and the pid to bind");
    assert.equal(job, "ok");
    for (const name of names) {
        const outcome = seeded.get(name);
        if (single[name].value !== undefined) {
            assert.equal(outcome, single[name].value, name);
        } else {
            assert.ok(outcome instanceof m.VcSecretsError, name);
            assert.deepEqual({ message: outcome.message, toolExitCode: outcome.toolExitCode }, single[name], name);
        }
    }
    assert.equal(seeded.has("vaulted"), false, "a Key Vault secret is not Credential Manager's to read");
    assert.deepEqual(resolver.resolvedValues, ["the-pat-value"], "a seeded value is already in the redaction list");
});

test("newKeyPresent: gpg — absence is the file not existing, not a failed read", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-gpg-"));
    tmpDirs.push(dir);
    const env = { XDG_CONFIG_HOME: dir };
    const key = `${m.KEY_PREFIX}:demo:tok`;
    assert.equal(await m.newKeyPresent("gpg", key, env), false);
    fs.mkdirSync(path.dirname(m.keyToPath(key, env)), { recursive: true });
    fs.writeFileSync(m.keyToPath(key, env), "ciphertext");
    assert.equal(await m.newKeyPresent("gpg", key, env), true);
});

test("newKeyPresent: a read that fails for any reason OTHER than absence throws instead of reporting absent", { skip: !CAN_RUN_POSIX_STUB && "needs a POSIX shell, which the stub binary on PATH is written behind" }, async () => {
    // The bug this pins destroyed credentials: migrate answered "already present?" through a bare catch,
    // so a cold agent or a timeout looked like absence and the stale legacy value was written over a
    // freshly rotated one — reported as "1 migrated, 0 failed".
    await withStubOnPath("security", "#!/bin/sh\nexit 1\n", () =>   // 44 means absent; 1 does not
        assert.rejects(() => m.newKeyPresent("keychain", `${m.KEY_PREFIX}:demo:tok`), /exited 1/));
});

test("newKeyPresent: keychain exit 44 IS absence", { skip: !CAN_RUN_POSIX_STUB && "needs a POSIX shell, which the stub binary on PATH is written behind" }, async () => {
    await withStubOnPath("security", "#!/bin/sh\nexit 44\n", async () => {
        assert.equal(await m.newKeyPresent("keychain", `${m.KEY_PREFIX}:demo:tok`), false);
    });
});

// ── regressions: keystore writes, declaration validation and install-shim ─────────────────────────

test("keychain write: the shape is always non-interactive, and a build with no value is refused", () => {
    // `set`, migrate, login and renewal all hold the value before they write. The shape that left the
    // value to security's own prompt is gone: that prompt cuts what is typed at 128 characters, and it
    // reported success for the truncated entry. A build with no value must not fall into the command shape
    // instead -- runTool composes the command only when handed a value, so security -i would read an empty
    // stdin, exit 0, and the write would be reported as stored.
    const key = `${m.KEY_PREFIX}:demo:tok`;
    assert.throws(() => m.buildLocalWrite("keychain", key, { USER: "u" }),
        /keychain write for "vc-secrets:demo:tok" needs the value/);

    const copying = m.buildLocalWrite("keychain", key, { USER: "u" }, { value: "secret-value" });
    assert.ok(!copying.interactive, "a copy must not wait for a human");
    // And the value must not be in argv, where this machine's process list can read it while the write
    // runs. It rides the command that `security -i` reads from stdin instead.
    assert.deepEqual(copying.args, ["-i"]);
    assert.ok(!JSON.stringify(copying.args).includes("secret-value"));
    assert.equal(copying.stdinData, m.COMMAND_ON_STDIN);
    assert.match(copying.stdinCommand("secret-value"), /^add-generic-password -U -a "u" -s "vc-secrets:demo:tok" -w "secret-value"\n$/);
    assert.ok(!copying.argvExposesValue);
});

test("a value with a line ending falls back to argv, and says so instead of hiding it", () => {
    // `security -i` reads one command per line, so a newline in the value ends the command whatever the
    // quoting does. Refusing would strand a secret migrate exists to move, so the exposure is reported.
    const key = `${m.KEY_PREFIX}:demo:tok`;
    const spec = m.buildLocalWrite("keychain", key, { USER: "u" }, { value: "line1\nline2" });
    assert.equal(spec.argvExposesValue, true);
    assert.equal(spec.args.at(-1), "line1\nline2");
    assert.equal(spec.stdinData, undefined);
});

test("quoting for security -i escapes what would end or reshape the command", () => {
    const q = m.quoteForSecurityInteractive;
    assert.equal(q("plain"), '"plain"');
    assert.equal(q('a"b'), '"a\\"b"');
    assert.equal(q("a\\b"), '"a\\\\b"');
    // A quote followed by a second command is the shape that would matter if it were not escaped.
    assert.equal(q('x" \ndelete-generic-password -s y'), '"x\\" \ndelete-generic-password -s y"');
});

test("a gpg read preserves a trailing newline the stored value really contains", { skip: !CAN_RUN_POSIX_STUB && "needs a POSIX shell, which the stub binary on PATH is written behind" }, async () => {
    // gpg --decrypt emits the stored bytes. Stripping there rewrote the value during migrate, which
    // reads and then writes: "token\n" would be migrated as "token".
    const binDir = stubBinary("gpg", '#!/bin/sh\nprintf "token\\n"\n');
    const saved = process.env.PATH;
    process.env.PATH = `${binDir}${path.delimiter}${saved}`;
    try {
        const spec = m.buildLocalRead("gpg", `${m.KEY_PREFIX}:demo:tok`, { XDG_CONFIG_HOME: "/tmp" });
        assert.equal(spec.keepTrailingNewline, true);
        assert.equal(await m.runTool(spec), "token\n");
    } finally {
        process.env.PATH = saved;
    }
});

test("lockPathFor: a filesystem path on darwin, outside the secrets directory", () => {
    // The source additionally asserted the path excluded the substring "mcpw/secrets", justified
    // by that repository's own permissions.deny patterns matching that substring — a rule that
    // lives in a repository this package does not ship to, so that half of the check is not
    // carried over verbatim. The INVARIANT behind it is not void, though: this package has its
    // own secretsDir() (lib/keystore.mjs), where the gpg-encrypted blobs actually live, and a lock
    // file must not fall inside it.
    const p = cache.lockPathFor("azure-mcp", "proj", { platform: "darwin", userInfo: () => ({ uid: 1000 }) });
    assert.equal(p[0], "/");
    // Above the length bound deliberately: a relocation into a deep secrets directory trips the
    // byte count first, and that assertion carries no diagnosis. Order decides which of the two
    // gets to explain the failure.
    assert.ok(!p.startsWith(m.secretsDir()), `the lock must not fall inside the secrets directory: ${p}`);
    assert.ok(Buffer.byteLength(p) <= 100, `sun_path is ~104 bytes on darwin; this is ${Buffer.byteLength(p)}: ${p}`);
    assert.ok(p.includes("proj"), "the project axis must reach the name, or two projects share one mutex");
    const other = cache.lockPathFor("azure-mcp", "other-proj",
        { platform: "darwin", userInfo: () => ({ uid: 1000 }) });
    assert.notEqual(p, other, "two different scopes must not collide on darwin");
});

test("LOCK_WAIT_MS outlasts the holder's whole critical section, not just its exchange", () => {
    // The holder cannot release before both keystore entries are written — releasing earlier
    // hands the waiter a refresh token Entra has already rotated away. So the waiter has to
    // cover the exchange AND both writes; covering only the exchange abandons a neighbour who
    // was two slow keystore calls from publishing. The three constants live in three modules
    // and nothing but this line relates them.
    assert.ok(cache.LOCK_WAIT_MS > oauth.TIMEOUT_OAUTH_MS + 2 * m.TIMEOUT_LOCAL_MS,
        `LOCK_WAIT_MS=${cache.LOCK_WAIT_MS} must exceed ${oauth.TIMEOUT_OAUTH_MS} + 2 * ${m.TIMEOUT_LOCAL_MS}`);
});

// ---------------------------------------------------------------------------------------------
// The restored keychain line-length refusal (buildLocalWrite's `security -i` stdinCommand
// branch) and its EAGER check in writeSecretValue, before any process is spawned. security(1)
// reads that command line into a fixed buffer and, past the limit, SPLITS rather than refusing:
// the first half stores a TRUNCATED value and the tail runs as a second command.
// ---------------------------------------------------------------------------------------------

test("buildLocalWrite(keychain).stdinCommand: composes up to the line limit, refuses one byte past it", () => {
    // The limit mirrors SECURITY_LINE_LIMIT in lib/keystore.mjs -- declared at the top of that module
    // beside WCM_BLOB_LIMIT, not next to the buildLocalWrite branch that enforces it (restated here
    // rather than read through its re-export -- same discipline as the locally-declared backoff constants
    // of "ensureFreshToken: the contended wait's backoff and ceiling bound the deadline it enforces"
    // (lib/oauth-token.test.mjs): pin the value the guard actually enforces, not a re-export of it).
    //
    // The boundary is DERIVED, not hardcoded: the composed overhead (the account, the key, and
    // the fixed "add-generic-password ..." text) is measured here from the real builder with a
    // short known-length filler, so a change to the key shape (e.g. a longer project id) moves
    // the boundary this test pins right along with it, instead of silently under- or over-testing.
    const SECURITY_LINE_LIMIT = 4095;
    const env = { USER: "u" };
    const key = "vc-secrets:demo-project:oauth-azure-mcp-refresh";
    const spec = m.buildLocalWrite("keychain", key, env, { value: "x" });

    // A filler value whose every byte is plain ASCII (no quote/backslash to escape) contributes
    // exactly its own length to the composed line; everything else is the fixed overhead.
    const probeLen = 16;
    const overhead = Buffer.byteLength(spec.stdinCommand("x".repeat(probeLen))) - probeLen;
    const maxValueLen = SECURITY_LINE_LIMIT - overhead;

    const atLimit = spec.stdinCommand("x".repeat(maxValueLen));
    assert.equal(Buffer.byteLength(atLimit), SECURITY_LINE_LIMIT,
        `the largest composing value must land exactly on the limit, got ${Buffer.byteLength(atLimit)} bytes`);

    assert.throws(() => spec.stdinCommand("x".repeat(maxValueLen + 1)), (e) => {
        assert.ok(e instanceof m.VcSecretsError, `expected a VcSecretsError, got ${e}`);
        assert.ok(e.message.includes(key), `must name the entry: ${e.message}`);
        assert.ok(e.message.includes(String(SECURITY_LINE_LIMIT + 1)), `must carry the composed byte count: ${e.message}`);
        assert.ok(e.message.includes(String(SECURITY_LINE_LIMIT)), `must carry the limit: ${e.message}`);

        return true;
    });
});

test("writeSecretValue: an oversize keychain value is refused before the runner is ever reached", async () => {
    // The refusal itself is pinned by "buildLocalWrite(keychain).stdinCommand: composes up to the
    // line limit, refuses one byte past it"; what this pins is that it happens EARLY. The
    // runner composes spec.stdinCommand only AFTER it has spawned, so without writeSecretValue's own
    // validating call an oversize value leaves an orphaned `security -i` waiting on a stdin that
    // never arrives, until the runner's timeout kills it.
    //
    // Asserted through the INJECTED runner rather than by watching for a real process: a spawn can
    // only be observed after it has already happened, so "no marker file yet" is a race that reports
    // success most of the time while the child ran every time. The fake runner mimics the real one --
    // record the call, and only then compose -- so deleting the early call fails THIS assertion
    // rather than the rejection, which the downstream guard would satisfy either way.
    const runnerCalls = [];
    const run = async (spec, { stdinValue } = {}) => {
        runnerCalls.push(spec);
        if (spec.stdinCommand) {
            spec.stdinCommand(stdinValue);
        }
    };
    const key = "vc-secrets:demo-project:oauth-azure-mcp-refresh";
    const oversized = "x".repeat(5000);   // past the limit regardless of the composed overhead
    await assert.rejects(
        () => m.writeSecretValue(key, oversized, { backend: "keychain", env: { USER: "u" }, run }),
        (e) => e instanceof m.VcSecretsError && /too large for the keychain/.test(e.message));
    assert.equal(runnerCalls.length, 0, "the runner must never be reached once the guard has refused");
});

function decodedScript(spec) {
    return Buffer.from(spec.args[spec.args.indexOf("-EncodedCommand") + 1], "base64").toString("utf16le");
}

test("PS_DPAPI_PROTECT: CurrentUser scope, the key as entropy, the value on stdin and never in env", () => {
    const key = "vc-secrets:user:oauth-a-refresh";
    const script = m.PS_DPAPI_PROTECT;
    assert.match(script, /CryptProtectData/);
    assert.ok(script.includes("$env:VC_SECRETS_NAME"), "the key is the entropy");
    assert.ok(script.includes("[Console]::In.ReadToEnd()"), "the value arrives on stdin, untrimmed");

    // The flags argument is the scope switch: CRYPTPROTECT_LOCAL_MACHINE would let any account on the
    // machine decrypt the file. The only flag passed is UI_FORBIDDEN (0x1), so no prompt can block a launch.
    assert.match(script, /const int CRYPTPROTECT_UI_FORBIDDEN = 0x1;/);
    assert.match(script, /CryptProtectData\(ref [^;]*System\.IntPtr\.Zero, CRYPTPROTECT_UI_FORBIDDEN, out output\)/);
    assert.doesNotMatch(script, /CRYPTPROTECT_LOCAL_MACHINE/);

    // A DPAPI failure is exit 1 naming the code. A script that swallowed it would hand node an empty
    // blob to write over a previously valid entry.
    assert.ok(script.includes("CryptProtectData failed win32err="), "the failure names the win32 code");
    assert.match(script, /CryptProtectData failed win32err="\+\$ex\.NativeErrorCode\); exit 1 \}/);

    const spec = m.buildDpapiProtect(key, {});
    assert.deepEqual(spec.extraEnv, { VC_SECRETS_NAME: key });
    assert.equal(spec.cmd, "powershell.exe");
    assert.equal(spec.stdinData, m.VALUE_ON_STDIN);
    assert.equal(spec.timeoutMs, m.TIMEOUT_LOCAL_MS);
    assert.equal(spec.captureStdout, true);
    assert.equal(decodedScript(spec), script);
    assert.ok(!spec.args.some((a) => a.includes("CryptProtectData")), "raw script must not be in argv");
});

test("buildDpapiProtect: a malformed key is refused before anything is built", () => {
    assert.throws(() => m.buildDpapiProtect("../x", {}), m.VcSecretsError);
});

test("PS_DPAPI_UNPROTECT_MANY: reads blobs from stdin, reports a per-key win32 code instead of failing the call", () => {
    const script = m.PS_DPAPI_UNPROTECT_MANY;
    assert.match(script, /CryptUnprotectData/);
    assert.ok(script.includes("[Console]::In.ReadToEnd()"));
    assert.ok(script.includes('"err"'));
    assert.ok(script.includes('"ok"'));
    assert.ok(script.includes("UTF8.GetBytes($p.Name)"), "each key is its own blob's entropy");
});

test("the DPAPI C# class is its own, so it cannot collide with a CredMan class in one PowerShell session", () => {
    assert.match(m.CS_DPAPI, /public static class Dpapi \{/);
    assert.doesNotMatch(m.CS_DPAPI, /CredMan/);
    assert.ok(m.PS_DPAPI_PROTECT.includes(m.CS_DPAPI));
    assert.ok(m.PS_DPAPI_UNPROTECT_MANY.includes(m.CS_DPAPI));
});

test("unprotectManyIo: no blobs, no PowerShell", async () => {
    const run = async () => { throw new Error("must not spawn"); };
    const result = await m.unprotectManyIo({ blobs: new Map(), env: {}, run });
    assert.ok(result instanceof Map);
    assert.equal(result.size, 0);
});

test("unprotectManyIo: maps each key's outcome", async () => {
    const refresh = "vc-secrets:user:oauth-a-refresh";
    const access = "vc-secrets:user:oauth-a-access";
    const blobs = new Map([[refresh, Buffer.from([1, 2, 3])], [access, Buffer.from([4, 5])]]);
    const calls = [];
    const run = async (spec, opts) => {
        calls.push({ spec, opts });

        return '{"vc-secrets:user:oauth-a-refresh":{"ok":"6869"},"vc-secrets:user:oauth-a-access":{"err":13}}';
    };
    const result = await m.unprotectManyIo({ blobs, env: {}, run });
    assert.deepEqual([...result], [[refresh, { ok: "6869" }], [access, { err: 13 }]]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].spec.stdinData, m.VALUE_ON_STDIN);
    assert.equal(calls[0].spec.captureStdout, true);
    assert.equal(decodedScript(calls[0].spec), m.PS_DPAPI_UNPROTECT_MANY);
    assert.equal(calls[0].opts.stdinValue,
        JSON.stringify({ [refresh]: Buffer.from([1, 2, 3]).toString("base64"), [access]: Buffer.from([4, 5]).toString("base64") }));
});

test("unprotectManyIo: output that is not the object is an error that does not echo it", async () => {
    const blobs = new Map([["vc-secrets:user:oauth-a-refresh", Buffer.from([1])]]);
    for (const out of ["secret-bytes", '"secret-bytes"', "[]", "null", '{"other":{"ok":"secret-bytes"}}',
        '{"vc-secrets:user:oauth-a-refresh":"secret-bytes"}']) {
        await assert.rejects(
            () => m.unprotectManyIo({ blobs, env: {}, run: async () => out }),
            (e) => e instanceof m.VcSecretsError && !e.message.includes("secret-bytes"),
            `output ${out}`);
    }
});

test("unprotectManyIo: a malformed key is refused before PowerShell is spawned", async () => {
    const run = async () => { throw new Error("must not spawn"); };
    await assert.rejects(
        () => m.unprotectManyIo({ blobs: new Map([["../x", Buffer.from([1])]]), env: {}, run }), m.VcSecretsError);
});

test("PS_CRED_READ_MANY: dpapi blobs are decrypted after the job bind", () => {
    // The reads and the duplicate/assign sequence keep their places: the decrypt rides behind both, so a
    // failure in it can never keep the launcher out of the job, and the script reads stdin only when node
    // says it sent blobs.
    const script = m.PS_CRED_READ_MANY;
    assert.ok(script.includes(m.CS_DPAPI), "the batched read compiles the shared DPAPI class");
    assert.ok(script.includes("VC_SECRETS_DPAPI_ON_STDIN"));
    const bind = script.indexOf("[CredManLaunch]::Bind(");
    const decrypt = script.indexOf("[Dpapi]::Unprotect(");
    assert.equal(script.split("[Dpapi]::Unprotect(").length - 1, 1, "one decrypt call site");
    assert.ok(bind >= 0 && decrypt > bind, "the decrypt call comes after the bind call");
    assert.ok(script.indexOf("[Console]::In.ReadToEnd()") > bind, "stdin is read after the bind");
    assert.ok(script.indexOf("[CredManLaunch]::CredRead(") < bind, "the reads still come first");
    assert.ok(script.includes("UTF8.GetBytes($p.Name)"), "each key is its own blob's entropy");
});

test("buildCredReadMany: blobs put the decrypt on stdin and switch the script to read it", () => {
    const key = "vc-secrets:user:oauth-a-refresh";
    const plain = m.buildCredReadMany([key], 7, {});
    assert.equal(plain.stdinData, undefined, "no blobs: nothing on stdin, as before");
    assert.equal(plain.extraEnv.VC_SECRETS_DPAPI_ON_STDIN, undefined);

    const withBlobs = m.buildCredReadMany([key], 7, {}, new Map([[key, Buffer.from([1, 2])]]));
    assert.equal(withBlobs.stdinData, m.VALUE_ON_STDIN);
    assert.equal(withBlobs.extraEnv.VC_SECRETS_DPAPI_ON_STDIN, "1");
    assert.equal(withBlobs.extraEnv.VC_SECRETS_NAMES, JSON.stringify([key]));
    assert.throws(() => m.buildCredReadMany([], 7, {}, new Map([["../x", Buffer.from([1])]])), m.VcSecretsError);
});

// Skipped on Windows only: the property is platform-independent and keeps running on Linux and macOS.
const WIN32_COMMAND_LINE_LIMIT = process.platform === "win32" && "on Windows the stub is a .cmd file started through cmd.exe, whose command line is limited to 8191 characters, and the DPAPI script's -EncodedCommand is longer; production starts powershell.exe directly (limit 32767), and the real-OS smoke workflow spawns the real powershell.exe with these scripts";

test("credReadManyIo: the blobs travel on stdin as base64 and never in the environment", { skip: WIN32_COMMAND_LINE_LIMIT || (!CAN_RUN_POSIX_STUB && "needs a POSIX shell, which the stub binary on PATH is written behind") }, async () => {
    const key = "vc-secrets:user:oauth-a-refresh";
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-batch-stdin-"));
    tmpDirs.push(dir);
    const out = path.join(dir, "stdin.txt");
    const stub = `#!/bin/sh
cat > "${out}"
printf '%s' '{"creds":{},"job":"ok","dpapi":{}}'
`;
    await withStubOnPath("vc-ps-batch-stdin", stub, async () => {
        const env = { VC_SECRETS_POWERSHELL: "vc-ps-batch-stdin" };
        const result = await m.credReadManyIo({ keys: [], pid: 1, env, blobs: new Map([[key, Buffer.from([1, 2, 3])]]) });
        assert.equal(result.job, "ok");
    });
    assert.equal(fs.readFileSync(out, "utf8"), JSON.stringify({ [key]: Buffer.from([1, 2, 3]).toString("base64") }));
});

test("readWcmBatch: dpapi files are read by node, sent as blobs, and come back as outcomes and presence", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-batch-dpapi-"));
    tmpDirs.push(dir);
    const env = { XDG_CONFIG_HOME: dir, VC_SECRETS_LOCAL_BACKEND: "wcm" };
    const present = "vc-secrets:user:oauth-a-refresh";
    const absent = "vc-secrets:user:oauth-a-access";
    const unreadable = "vc-secrets:user:oauth-b-refresh";
    fs.mkdirSync(path.dirname(m.dpapiKeyToPath(present, env)), { recursive: true });
    fs.writeFileSync(m.dpapiKeyToPath(present, env), Buffer.from("CIPHER"));
    // A directory where the file should be: not absent, and not readable.
    fs.mkdirSync(m.dpapiKeyToPath(unreadable, env), { recursive: true });

    const resolver = m.makeSecretResolver({}, env);
    let asked = null;
    const batch = await resolver.readWcmBatch([], { pid: 9, dpapiKeys: [present, absent, unreadable],
        run: async (request) => {
            asked = request;

            return { creds: {}, job: "ok", dpapi: { [present]: { ok: credHex("plain") } } };
        } });
    assert.deepEqual([...asked.blobs.keys()], [present], "only a file that exists is sent");
    assert.equal(asked.blobs.get(present).toString(), "CIPHER");
    assert.deepEqual([...batch.dpapiOutcomes], [[present, { ok: credHex("plain") }]]);
    assert.deepEqual([...batch.files], [[present, true], [absent, false]],
        "a file that could not be read is left out, so its single read reports it");
    assert.equal(batch.job, "ok");
});

test("readWcmBatch: a dpapi outcome of -1, the script's mark for a failure that is not DPAPI's, is not seeded", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-batch-dpapi-"));
    tmpDirs.push(dir);
    const env = { XDG_CONFIG_HOME: dir };
    const odd = "vc-secrets:user:oauth-a-refresh";
    const refused = "vc-secrets:user:oauth-a-access";
    for (const key of [odd, refused]) {
        fs.mkdirSync(path.dirname(m.dpapiKeyToPath(key, env)), { recursive: true });
        fs.writeFileSync(m.dpapiKeyToPath(key, env), Buffer.from("CIPHER"));
    }
    const batch = await m.makeSecretResolver({}, env).readWcmBatch([], { pid: 9, dpapiKeys: [odd, refused],
        run: async () => ({ creds: {}, job: "ok", dpapi: { [odd]: { err: -1 }, [refused]: { err: 13 } } }) });
    assert.deepEqual([...batch.dpapiOutcomes], [[refused, { err: 13 }]], "DPAPI's own code is seeded, -1 is not");
    assert.equal(batch.files.get(odd), true, "the file is still known to be there, so it is decrypted singly");
});

test("readWcmBatch: with dpapi blobs attached, a call that fails as a whole seeds nothing", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-batch-dpapi-"));
    tmpDirs.push(dir);
    const env = { XDG_CONFIG_HOME: dir };
    const key = "vc-secrets:user:oauth-a-refresh";
    fs.mkdirSync(path.dirname(m.dpapiKeyToPath(key, env)), { recursive: true });
    fs.writeFileSync(m.dpapiKeyToPath(key, env), Buffer.from("CIPHER"));
    const batch = await m.makeSecretResolver({}, env).readWcmBatch([], { pid: 9, extraKeys: [key], dpapiKeys: [key],
        run: async () => { throw new m.VcSecretsError("powershell.exe exited 1: nope"); } });
    assert.equal(batch.job, "powershell.exe exited 1: nope");
    assert.equal(batch.outcomes.size + batch.dpapiOutcomes.size + batch.files.size + batch.seeded.size, 0,
        "each entry is then read singly, exactly as a whole-call failure leaves it today");
});

// The dpapi file store: PowerShell turns a value into a blob, node owns every file operation.
const DPAPI_KEY = "vc-secrets:user:oauth-a-refresh";

function tmpConfigEnv(prefix) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tmpDirs.push(dir);

    return { dir, env: { XDG_CONFIG_HOME: dir } };
}

// A PowerShell that prints the base64 of `cipher` for the protect script; any other script is a mistake.
function fakeProtect(cipher, calls = []) {
    return async (spec, opts) => {
        calls.push({ spec, opts });
        assert.equal(Buffer.from(spec.args[spec.args.indexOf("-EncodedCommand") + 1], "base64").toString("utf16le"),
            m.PS_DPAPI_PROTECT, "only the protect script may run on a write");

        return Buffer.from(cipher).toString("base64");
    };
}

const refused = (code) => Object.assign(new Error(`${code}: refused`), { code });

test("writeSecretValue: dpapi writes the ciphertext PowerShell returns, through a pid-suffixed tmp file", async () => {
    const { env } = tmpConfigEnv("vc-secrets-dpapi-write-");
    const calls = [];
    const renames = [];
    const target = m.dpapiKeyToPath(DPAPI_KEY, env);
    await m.writeSecretValue(DPAPI_KEY, "the-token", { backend: "dpapi", env, run: fakeProtect("CIPHER", calls),
        rename: (from, to) => { renames.push({ from, to }); fs.renameSync(from, to); } });

    assert.equal(fs.readFileSync(target, "utf8"), "CIPHER");
    assert.deepEqual(fs.readdirSync(path.dirname(target)), ["oauth-a-refresh.dpapi"], "no tmp file remains");
    assert.equal(renames.length, 1);
    assert.ok(renames[0].from.endsWith(`.${process.pid}.tmp`), `the rename source is "${renames[0].from}"`);
    assert.equal(renames[0].to, target);
    assert.equal(calls[0].opts.stdinValue, "the-token", "the value goes on stdin");
    assert.deepEqual(calls[0].opts.redactValues, ["the-token"]);
    assert.deepEqual(calls[0].spec.extraEnv, { VC_SECRETS_NAME: DPAPI_KEY });
});

test("writeSecretValue: dpapi retries a rename refused with EPERM and succeeds", async () => {
    const { env } = tmpConfigEnv("vc-secrets-dpapi-retry-");
    const target = m.dpapiKeyToPath(DPAPI_KEY, env);
    let refusals = 2;
    const sleeps = [];
    await m.writeSecretValue(DPAPI_KEY, "the-token", { backend: "dpapi", env, run: fakeProtect("CIPHER"),
        rename: (from, to) => {
            if (refusals > 0) {
                refusals -= 1;
                throw refused("EPERM");
            }
            fs.renameSync(from, to);
        },
        sleep: async (ms) => { sleeps.push(ms); } });

    assert.deepEqual(sleeps, [50, 100]);
    assert.equal(fs.readFileSync(target, "utf8"), "CIPHER");
});

test("writeSecretValue: dpapi gives up after five refused renames, leaves the previous entry and no tmp file", async () => {
    const { env } = tmpConfigEnv("vc-secrets-dpapi-giveup-");
    const target = m.dpapiKeyToPath(DPAPI_KEY, env);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "PREVIOUS");
    let attempts = 0;
    const sleeps = [];
    await assert.rejects(
        () => m.writeSecretValue(DPAPI_KEY, "the-token", { backend: "dpapi", env, run: fakeProtect("CIPHER"),
            rename: () => { attempts += 1; throw refused("EBUSY"); },
            sleep: async (ms) => { sleeps.push(ms); } }),
        (e) => e.code === "EBUSY");

    assert.equal(attempts, m.RENAME_ATTEMPTS);
    assert.equal(attempts, 5);
    assert.deepEqual(sleeps, [50, 100, 150, 200], "no wait after the last refusal");
    assert.equal(fs.readFileSync(target, "utf8"), "PREVIOUS");
    assert.deepEqual(fs.readdirSync(path.dirname(target)), ["oauth-a-refresh.dpapi"], "the tmp file is gone");
});

test("writeSecretValue: dpapi does not retry ENOENT", async () => {
    const { env } = tmpConfigEnv("vc-secrets-dpapi-enoent-");
    let attempts = 0;
    const sleeps = [];
    await assert.rejects(
        () => m.writeSecretValue(DPAPI_KEY, "the-token", { backend: "dpapi", env, run: fakeProtect("CIPHER"),
            rename: () => { attempts += 1; throw refused("ENOENT"); },
            sleep: async (ms) => { sleeps.push(ms); } }),
        (e) => e.code === "ENOENT");

    assert.equal(attempts, 1);
    assert.deepEqual(sleeps, []);
});

test("writeSecretValue: dpapi refuses to store an empty ciphertext over the entry", async () => {
    const { env } = tmpConfigEnv("vc-secrets-dpapi-empty-");
    await assert.rejects(
        () => m.writeSecretValue(DPAPI_KEY, "the-token", { backend: "dpapi", env, run: async () => "" }),
        /no ciphertext/);
    assert.equal(pathPresent(m.dpapiKeyToPath(DPAPI_KEY, env), "the dpapi entry"), false);
});

test("writeSecretValue: dpapi stores only base64 ciphertext, and a stray line in stdout is refused by name", async () => {
    // Node's base64 decoder skips every character outside the alphabet, so a warning PowerShell printed ahead
    // of the ciphertext would be decoded into a corrupt blob and stored after a "successful" write. The error
    // names the entry and never carries the output, which may sit beside a secret.
    const { env } = tmpConfigEnv("vc-secrets-dpapi-stray-");
    const target = m.dpapiKeyToPath(DPAPI_KEY, env);
    for (const stray of ["WARNING: module cache rebuilt\r\nQ0lQSEVS", "Q0lQ\nSEVS", "Q0 lQSEVS", "Q0lQSEVS===", "=Q0lQSEVS", "!!!", "\r\n"]) {
        await assert.rejects(
            () => m.writeSecretValue(DPAPI_KEY, "the-token", { backend: "dpapi", env, run: async () => stray }),
            (e) => e instanceof m.VcSecretsError && e.message.includes("oauth-a-refresh")
                && !/WARNING|Q0lQ|SEVS|!!!/.test(e.message),
            JSON.stringify(stray));
        assert.equal(pathPresent(target, "the dpapi entry"), false, `a refused output left an entry: ${JSON.stringify(stray)}`);
    }

    // The ciphertext PowerShell prints, with or without padding and a trailing line ending, is still stored.
    for (const printed of ["Q0lQSEVS", "Q0lQSEU=\r\n", "  Q0lQSA==\n"]) {
        await m.writeSecretValue(DPAPI_KEY, "the-token", { backend: "dpapi", env, run: async () => printed });
        assert.deepEqual(fs.readFileSync(target), Buffer.from(printed.trim(), "base64"), JSON.stringify(printed));
    }
});

test("writeSecretValue: a dpapi value over the Credential Manager ceiling is stored", async () => {
    // The bug's own size plus one: Credential Manager refuses 2907 bytes (exit 4), the file store has no ceiling.
    const { env } = tmpConfigEnv("vc-secrets-dpapi-large-");
    const value = "x".repeat(2907);
    assert.ok(value.length > m.WCM_BLOB_LIMIT);
    const calls = [];
    await m.writeSecretValue(DPAPI_KEY, value, { backend: "dpapi", env, run: fakeProtect("CIPHER", calls) });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].opts.stdinValue.length, 2907, "the whole value reached the protect run");
    assert.equal(calls[0].opts.stdinValue, value);
    assert.equal(fs.readFileSync(m.dpapiKeyToPath(DPAPI_KEY, env), "utf8"), "CIPHER");
});

test("readDpapiFile: absence is the path not existing", () => {
    const { env } = tmpConfigEnv("vc-secrets-dpapi-read-absent-");
    assert.equal(m.readDpapiFile(DPAPI_KEY, env), undefined);

    const target = m.dpapiKeyToPath(DPAPI_KEY, env);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.from([1, 2, 3]));
    assert.deepEqual(m.readDpapiFile(DPAPI_KEY, env), Buffer.from([1, 2, 3]));
});

test("readDpapiFile: an entry that cannot be examined is not absent", (t) => {
    // undefined here would be read as "not signed in": an interactive sign-in that spends an
    // authorization code, over a refresh token that never left the disk.
    const { env } = tmpConfigEnv("vc-secrets-dpapi-read-denied-");
    const target = m.dpapiKeyToPath(DPAPI_KEY, env);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "BLOB");
    denyFs(t, "readFileSync", target);

    assert.throws(() => m.readDpapiFile(DPAPI_KEY, env),
        (e) => e instanceof m.VcSecretsError && e.message === 'could not read the stored entry "oauth-a-refresh": EACCES');
});

function wcmDeleteRun(held, calls = []) {
    return async (spec) => {
        calls.push(spec);
        if (!held) {
            throw Object.assign(new m.VcSecretsError("powershell.exe exited 3: "), { toolExitCode: 3 });
        }
    };
}

test("deleteEntryIo: dpapi removes the file and the Credential Manager entry of the same key", async () => {
    const { env } = tmpConfigEnv("vc-secrets-dpapi-del-both-");
    const target = m.dpapiKeyToPath(DPAPI_KEY, env);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "BLOB");
    const calls = [];
    await m.deleteEntryIo("dpapi", env, { run: wcmDeleteRun(true, calls) })(DPAPI_KEY);

    assert.equal(pathPresent(target, "the dpapi entry"), false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].extraEnv.VC_SECRETS_NAME, DPAPI_KEY);
    assert.equal(Buffer.from(calls[0].args[calls[0].args.indexOf("-EncodedCommand") + 1], "base64").toString("utf16le"),
        m.PS_CRED_DELETE);
});

test("deleteEntryIo: dpapi with only a legacy Credential Manager entry removes it and succeeds", async () => {
    // Logout after an upgrade, before any launch migrated the pair: the file never existed, the legacy
    // entry did, and reporting "nothing stored" would leave the live refresh token behind.
    const { env } = tmpConfigEnv("vc-secrets-dpapi-del-legacy-");
    const calls = [];
    await m.deleteEntryIo("dpapi", env, { run: wcmDeleteRun(true, calls) })(DPAPI_KEY);

    assert.equal(calls.length, 1, "the legacy entry was deleted");
});

test("deleteEntryIo: dpapi with only the file removes it and succeeds", async () => {
    const { env } = tmpConfigEnv("vc-secrets-dpapi-del-file-");
    const target = m.dpapiKeyToPath(DPAPI_KEY, env);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "BLOB");
    await m.deleteEntryIo("dpapi", env, { run: wcmDeleteRun(false) })(DPAPI_KEY);

    assert.equal(pathPresent(target, "the dpapi entry"), false);
});

test("deleteEntryIo: dpapi with neither present is exit 3", async () => {
    const { env } = tmpConfigEnv("vc-secrets-dpapi-del-none-");
    await assert.rejects(() => m.deleteEntryIo("dpapi", env, { run: wcmDeleteRun(false) })(DPAPI_KEY),
        (e) => e.toolExitCode === 3);
});

test("deleteEntryIo: dpapi does not treat an unremovable file or a Credential Manager failure as absence", async () => {
    const { env } = tmpConfigEnv("vc-secrets-dpapi-del-fail-");
    const denied = () => { throw Object.assign(new Error("EACCES"), { code: "EACCES" }); };
    await assert.rejects(
        () => m.deleteEntryIo("dpapi", env, { run: wcmDeleteRun(false), rm: denied, sleep: async () => {} })(DPAPI_KEY),
        (e) => e instanceof m.VcSecretsError && e.toolExitCode === undefined && /could not remove/.test(e.message));

    const failing = async () => { throw Object.assign(new m.VcSecretsError("powershell.exe exited 1: CredDelete failed win32err=5"), { toolExitCode: 1 }); };
    await assert.rejects(() => m.deleteEntryIo("dpapi", env, { run: failing })(DPAPI_KEY),
        (e) => e.toolExitCode === 1);
});

test("deleteEntryIo: dpapi leaves the file in place when the Credential Manager delete fails", async () => {
    // The file decides the store. Removing it first would leave the legacy pair as the store the next launch
    // falls back to, so a failed Credential Manager delete would bring a logged-out token back.
    const { env } = tmpConfigEnv("vc-secrets-dpapi-del-order-");
    const target = m.dpapiKeyToPath(DPAPI_KEY, env);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "BLOB");
    const failing = async () => { throw Object.assign(new m.VcSecretsError("powershell.exe exited 1: CredDelete failed win32err=5"), { toolExitCode: 1 }); };
    await assert.rejects(() => m.deleteEntryIo("dpapi", env, { run: failing })(DPAPI_KEY),
        (e) => e.toolExitCode === 1);

    assert.equal(fs.readFileSync(target, "utf8"), "BLOB");
});

// The removal twin of the rename retry above: the same attempts, the same delays, the same codes, and absence
// told apart from a failure. `rm` and `sleep` are injected, so no test here waits for real.
function failingRm(code, failures, calls) {
    return () => {
        calls.push(code);
        if (calls.length <= failures) {
            throw refused(code);
        }
    };
}

test("removeFileWithRetry: a lock that clears is waited out, 50 then 100 ms, and the file counts as removed", async () => {
    const calls = [];
    const sleeps = [];
    const removed = await removeFileWithRetry("any-file", { rm: failingRm("EBUSY", 2, calls),
        sleep: async (ms) => { sleeps.push(ms); } });

    assert.equal(removed, true);
    assert.equal(calls.length, 3);
    assert.deepEqual(sleeps, [50, 100]);
});

test("removeFileWithRetry: EPERM, EBUSY and EACCES are each retried", async () => {
    for (const code of ["EPERM", "EBUSY", "EACCES"]) {
        const calls = [];
        await removeFileWithRetry("any-file", { rm: failingRm(code, 1, calls), sleep: async () => {} });

        assert.equal(calls.length, 2, `${code} was not retried`);
    }
});

test("removeFileWithRetry: a lock that never clears throws the original error after five attempts and four waits", async () => {
    const calls = [];
    const sleeps = [];
    const original = refused("EPERM");
    await assert.rejects(
        () => removeFileWithRetry("any-file", { rm: () => { calls.push("EPERM"); throw original; },
            sleep: async (ms) => { sleeps.push(ms); } }),
        (e) => e === original);

    assert.equal(calls.length, m.RENAME_ATTEMPTS);
    assert.equal(calls.length, 5);
    assert.deepEqual(sleeps, [50, 100, 150, 200], "no wait after the last refusal");
});

test("removeFileWithRetry: an absent path is false on the first attempt, ENOENT and ENOTDIR alike", async () => {
    for (const code of ["ENOENT", "ENOTDIR"]) {
        const calls = [];
        const sleeps = [];
        const removed = await removeFileWithRetry("any-file", { rm: failingRm(code, 9, calls),
            sleep: async (ms) => { sleeps.push(ms); } });

        assert.equal(removed, false, code);
        assert.equal(calls.length, 1, `${code} was retried`);
        assert.deepEqual(sleeps, [], code);
    }
});

test("removeFileWithRetry: any other code is thrown after one attempt, not waited on", async () => {
    const calls = [];
    const sleeps = [];
    await assert.rejects(
        () => removeFileWithRetry("any-file", { rm: failingRm("EISDIR", 9, calls),
            sleep: async (ms) => { sleeps.push(ms); } }),
        (e) => e.code === "EISDIR");

    assert.equal(calls.length, 1);
    assert.deepEqual(sleeps, []);
});

test("deleteEntryIo: dpapi waits out a transient lock on the file and removes it", async () => {
    // A logout or a pair clear that hit an antivirus scan or an indexer for a moment was a hard failure.
    const { env } = tmpConfigEnv("vc-secrets-dpapi-del-busy-");
    const target = m.dpapiKeyToPath(DPAPI_KEY, env);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "BLOB");
    let busy = 1;
    const sleeps = [];
    await m.deleteEntryIo("dpapi", env, { run: wcmDeleteRun(false),
        rm: (file) => {
            if (busy > 0) {
                busy -= 1;
                throw refused("EBUSY");
            }
            fs.rmSync(file);
        },
        sleep: async (ms) => { sleeps.push(ms); } })(DPAPI_KEY);

    assert.equal(pathPresent(target, "the dpapi entry"), false);
    assert.deepEqual(sleeps, [50]);
});
