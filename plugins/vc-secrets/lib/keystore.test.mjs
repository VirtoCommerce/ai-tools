import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as m from "../vc-secrets.mjs";
import * as cache from "../vc-secrets-cache.mjs";
import * as oauth from "../vc-secrets-oauth.mjs";
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

    const kcWrite = m.buildLocalWrite("keychain", "vc-secrets:user:ado-pat", { USER: "u" });
    assert.equal(kcWrite.interactive, true);
    assert.equal(kcWrite.timeoutMs, null, "interactive specs must not carry a kill timer");

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

function markerHome() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-marker-"));
    tmpDirs.push(dir);

    return { XDG_CONFIG_HOME: dir };
}

test("the oversize marker lives beside the keystore, not inside it, and keeps the key's scope", () => {
    // A sibling of `secrets/` rather than a child: something that walks the keystore directory must
    // not meet a diagnostic file there and try to read it as an entry. And per-scope like the keys
    // themselves -- two projects on one machine declare the same entry NAME routinely, and a flat
    // layout would have each overwrite the other's marker and report the wrong project's overflow.
    const env = markerHome();
    const user = m.oversizeMarkerPath("vc-secrets:user:oauth-ado-dev-access", env);
    const project = m.oversizeMarkerPath("vc-secrets:p1:oauth-ado-dev-access", env);
    assert.equal(path.dirname(path.dirname(user)), path.join(env.XDG_CONFIG_HOME, "vc-secrets", "state"));
    assert.equal(path.dirname(m.secretsDir(env)), path.dirname(path.dirname(path.dirname(user))),
        "the state directory must sit beside the secrets directory, not under it");
    assert.notEqual(user, project, "two scopes may not share one marker");
});

test("the oversize marker records the measurement and no byte of the value", () => {
    // The value is the access TOKEN. Nothing about it may reach a file that exists to be read by a
    // diagnostic and pasted into a report -- so the marker is handed a byte count and never the
    // bytes, and the assertion below is on the whole object rather than on the fields of interest:
    // a field added later carrying part of the value would pass a field-by-field check.
    const env = markerHome();
    const key = "vc-secrets:user:oauth-ado-dev-access";
    m.recordOversizeMarker(key, { backend: "wcm", bytes: 2588, limit: 2560, env, at: 1_700_000_000 });
    assert.deepEqual(JSON.parse(fs.readFileSync(m.oversizeMarkerPath(key, env), "utf8")),
        { key, backend: "wcm", bytes: 2588, limit: 2560, at: 1_700_000_000 });
});

test("the oversize marker reads back, clears, and reports nothing once cleared", () => {
    // Clearing is the half that makes this a CURRENT STATE rather than a log of something once
    // true. Without it doctor keeps naming an overflow that a later, smaller entry already fixed --
    // wrong in the reassuring direction, which is the expensive direction for a diagnostic.
    const env = markerHome();
    const key = "vc-secrets:user:oauth-ado-dev-access";
    m.recordOversizeMarker(key, { backend: "wcm", bytes: 2588, limit: 2560, env });
    assert.equal(m.readOversizeMarker(key, env).bytes, 2588);
    m.clearOversizeMarker(key, env);
    assert.equal(m.readOversizeMarker(key, env), null);
});

test("clearing a marker that was never written is silent, since that is every ordinary success", () => {
    // Clear runs on the SUCCESS path of every login and every renewal, and almost none of them ever
    // overflowed. Throwing here would fail a working sign-in over a file that correctly does not
    // exist.
    const env = markerHome();
    m.clearOversizeMarker("vc-secrets:user:oauth-ado-dev-access", env);
});

test("a corrupt marker reads as no marker, because a hint that cannot be read is not a finding", () => {
    // Deliberately the opposite call from the keystore reads, where collapsing absent with
    // unreadable is a defect -- see PS_CRED_READ's ERROR_NOT_FOUND check and newKeyPresent, which
    // both insist the two stay apart. What hangs on this one is whether doctor
    // prints one advisory line -- not whether a token exists -- so inventing a finding out of an
    // unparseable diagnostic would send a developer to diagnose the diagnostic.
    const env = markerHome();
    const key = "vc-secrets:user:oauth-ado-dev-access";
    const file = m.oversizeMarkerPath(key, env);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "{ not json");
    assert.equal(m.readOversizeMarker(key, env), null);
});

test("recordOversizeMarker: a state path that cannot be created warns instead of failing the sign-in", () => {
    // Both call sites stand inside a catch that has already decided this failure will not fail the
    // operation -- cmdLogin says so in as many words, because a login rejected there costs an
    // interactive sign-in while the refresh token it just stored is rotated away by the next one.
    // clearOversizeMarker was guarded from the start; this is the sibling that was not, and the
    // asymmetry is reachable: a read-only profile, a full disk, or the case staged here.
    const env = markerHome();
    const key = "vc-secrets:user:oauth-ado-dev-access";
    fs.mkdirSync(path.join(env.XDG_CONFIG_HOME, "vc-secrets"), { recursive: true });
    fs.writeFileSync(path.join(env.XDG_CONFIG_HOME, "vc-secrets", "state"), "");
    assert.doesNotThrow(() => m.recordOversizeMarker(key,
        { backend: "wcm", bytes: 2588, limit: 2560, env }));
    assert.equal(m.readOversizeMarker(key, env), null,
        "a marker that could not be written must not read back as one that was");
});

test("a message improved for a human keeps the exit code the code reads", () => {
    // mapResolveError returns a NEW error in every branch, so it silently dropped toolExitCode --
    // and the caller still received an error, just one that no longer answered WHICH failure this
    // was. The oversize marker is the consumer that made it visible: it must record only exit 4,
    // and by the time the write failure reached it the 4 was gone.
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
    const spec = m.buildLocalWrite("gpg", "vc-secrets:user:ado-pat", { HOME: "/h" }, { tmp: true });
    const target = spec.args[spec.args.indexOf("-o") + 1];
    assert.ok(target.endsWith(path.join("ado-pat.gpg.tmp")), `expected .gpg.tmp target, got "${target}"`);

    const finalSpec = m.buildLocalWrite("gpg", "vc-secrets:user:ado-pat", { HOME: "/h" });
    const finalTarget = finalSpec.args[finalSpec.args.indexOf("-o") + 1];
    assert.ok(finalTarget.endsWith("ado-pat.gpg") && !finalTarget.endsWith(".tmp"), "default (no tmp option) targets the final path");
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

test("keychain write: migrate gets a non-interactive shape, set keeps the prompt", () => {
    // With no value the prompt is right: `set` has a human at the TTY and the plaintext never passes
    // through this process. With a value it must NOT prompt — migrate holds a value the user cannot
    // retype, and the interactive shape asked for one anyway and stored whatever was typed as a
    // successful migration.
    const key = `${m.KEY_PREFIX}:demo:tok`;
    const prompting = m.buildLocalWrite("keychain", key, { USER: "u" });
    assert.equal(prompting.interactive, true);
    assert.ok(!prompting.args.includes("secret-value"));

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
