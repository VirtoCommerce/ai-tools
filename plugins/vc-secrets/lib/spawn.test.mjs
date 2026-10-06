import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as m from "../vc-secrets.mjs";
import { tmpDirs } from "../test-support.mjs";
import { onlyFiles } from "../test-fixtures.mjs";

test("redactSecrets: all occurrences, longest value first", () => {
    assert.equal(m.redactSecrets("err tok1 and tok1/tok2", ["tok1", "tok2"]), "err *** and ***/***");
    assert.equal(m.redactSecrets("abc", ["ab", "abc"]), "***");
    assert.equal(m.redactSecrets("clean", []), "clean");
});

test("runTool: stdout capture, stdin pass, timeout, redacted stderr, toolExitCode", async () => {
    const echo = { cmd: process.execPath, args: ["-e", "process.stdin.pipe(process.stdout)"],
        stdinData: m.VALUE_ON_STDIN, timeoutMs: 10_000, captureStdout: true };
    assert.equal(await m.runTool(echo, { stdinValue: "tok-123" }), "tok-123");

    const fail = { cmd: process.execPath, args: ["-e", "console.error('boom tok-123'); process.exit(3)"],
        timeoutMs: 10_000, captureStdout: true };
    await assert.rejects(m.runTool(fail, { redactValues: ["tok-123"] }),
        (e) => e instanceof m.VcSecretsError && e.toolExitCode === 3 && e.message.includes("boom ***") && !e.message.includes("tok-123"));

    const hang = { cmd: process.execPath, args: ["-e", "setTimeout(()=>{}, 60000)"], timeoutMs: 200, captureStdout: true };
    await assert.rejects(m.runTool(hang), /timed out after 200/);
});

test("runTool: child exits without reading stdin → VcSecretsError, no crash", async () => {
    const spec = { cmd: process.execPath, args: ["-e", "process.exit(5)"],
        stdinData: m.VALUE_ON_STDIN, timeoutMs: 10_000, captureStdout: true };
    await assert.rejects(
        m.runTool(spec, { stdinValue: "x".repeat(1024 * 1024) }),
        (e) => e instanceof m.VcSecretsError && e.toolExitCode === 5);
});

test("runTool: missing binary → actionable VcSecretsError", async () => {
    await assert.rejects(
        m.runTool({ cmd: "vc-secrets-no-such-tool", args: [], timeoutMs: 1000, captureStdout: true }),
        /not found on PATH/);
});

test("runTool: interactive spec never arms the timer (outlives timeoutMs, no SIGKILL)", async () => {
    const spec = { cmd: process.execPath, args: ["-e", "setTimeout(()=>process.exit(0), 300)"],
        interactive: true, timeoutMs: 50, captureStdout: false };
    await m.runTool(spec);
});

test("runTool: timeoutMs: null disarms the timer (outlives the would-be deadline)", async () => {
    const spec = { cmd: process.execPath, args: ["-e", "setTimeout(()=>process.exit(0), 300)"],
        interactive: false, timeoutMs: null, captureStdout: true };
    await m.runTool(spec);
});

test("runTool: executes a .cmd shim instead of reporting it missing", { skip: process.platform !== "win32" && "win32-only: .cmd shims" }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-shim-"));
    tmpDirs.push(dir);
    fs.writeFileSync(path.join(dir, "vc-secrets-fake-az.cmd"), "@echo off\r\necho shim-ok\r\n");
    const prevPath = process.env.Path;
    process.env.Path = `${dir};${prevPath}`;
    try {
        const spec = { cmd: "vc-secrets-fake-az", args: [], timeoutMs: 10_000, captureStdout: true };
        assert.equal(await m.runTool(spec), "shim-ok");
    } finally {
        process.env.Path = prevPath;
    }
});

test("runTool: a dangerous variable in the launcher's own environment never reaches a backend tool", async () => {
    // The other end of the NODE_OPTIONS carve-out. buildChildEnv reverses this package's env policy
    // for ONE child -- the MCP server that holds the credential -- and the comment there asserts
    // backend tools are unaffected because runTool sanitizes unconditionally. That sentence was the
    // only thing holding the bound: deleting the sanitizeEnv call at runTool's spawn left the whole
    // suite green, so a later edit could drop it and ship. LD_PRELOAD rather than NODE_OPTIONS
    // because a missing preload object is ignored by the loader -- it warns on stderr and the
    // child runs on -- so the test observes the variable itself rather than an effect of it.
    process.env.LD_PRELOAD = "/evil.so";
    try {
        const spec = { cmd: process.execPath, args: ["-e", "process.stdout.write(String(process.env.LD_PRELOAD))"],
            timeoutMs: 10_000, captureStdout: true };
        assert.equal(await m.runTool(spec), "undefined");
    } finally {
        delete process.env.LD_PRELOAD;
    }
});

const WIN_ENV = { Path: "C:\\bin;C:\\Windows\\System32", PATHEXT: ".COM;.EXE;.BAT;.CMD" };

test("resolveSpawnCommand: win32 .cmd shim found case-insensitively", () => {
    const existsSync = onlyFiles("c:/program files/nodejs/npx.cmd", "c:/windows/system32/cmd.exe");
    const r = m.resolveSpawnCommand("npx", {
        platform: "win32",
        env: { Path: "C:\\Program Files\\nodejs;C:\\Windows\\System32", PATHEXT: ".COM;.EXE;.BAT;.CMD" },
        existsSync,
    });
    assert.equal(r.kind, "cmd-shim");
    assert.ok(r.cmd.toLowerCase().endsWith("npx.cmd"));
});

test("resolveSpawnCommand: win32 .exe is direct", () => {
    const existsSync = onlyFiles("c:/bin/github-mcp-server.exe");
    const r = m.resolveSpawnCommand("github-mcp-server", {
        platform: "win32", env: WIN_ENV, existsSync,
    });
    assert.equal(r.kind, "direct");
    assert.ok(r.cmd.toLowerCase().endsWith(".exe"));
});

test("resolveSpawnCommand: non-win32 commands are passed through as named, and on win32 so are pathful ones that are not batch files", () => {
    // A populated env and an existsSync that says yes are load-bearing: were the pass-through guard
    // deleted, the scan below would find a PATH candidate and answer with ITS path instead of the name.
    assert.deepEqual(m.resolveSpawnCommand("npx", { platform: "linux", env: WIN_ENV, existsSync: () => true }),
        { kind: "direct", cmd: "npx" });
    assert.deepEqual(m.resolveSpawnCommand("/x/y.cmd", { platform: "linux", env: WIN_ENV, existsSync: () => true }),
        { kind: "direct", cmd: "/x/y.cmd" }, "a .cmd path off win32 is just a file");
    for (const pathful of ["C:\\x\\y.exe", "C:\\x\\y", ".\\tools\\y.EXE", "C:/x/y.com"]) {
        assert.deepEqual(m.resolveSpawnCommand(pathful, { platform: "win32", env: WIN_ENV, existsSync: () => true }),
            { kind: "direct", cmd: pathful }, pathful);
    }
});

test("resolveSpawnCommand: win32 a pathful .cmd or .bat, in any case, is run through cmd.exe like a bare-name shim", () => {
    // Node refuses to spawn a batch file without a shell (EINVAL), and a path does not change what it is.
    const existsSync = onlyFiles("c:/windows/system32/cmd.exe");
    for (const pathful of ["C:\\x\\y.cmd", "C:\\x\\y.CMD", "C:\\x\\y.Bat", "C:/x/y.bat", ".\\tools\\y.cmd"]) {
        const r = m.resolveSpawnCommand(pathful, { platform: "win32", env: WIN_ENV, existsSync });
        assert.deepEqual(r, { kind: "cmd-shim", cmd: pathful, shell: "C:\\Windows\\System32\\cmd.exe" }, pathful);
        const invocation = m.buildSpawnInvocation(r, ["-y"]);
        assert.equal(invocation.cmd, r.shell);
        assert.equal(invocation.args[0], `/d /v:off /s /c ""${pathful}" "-y""`, "the same verbatim line the bare-name shim gets");
    }
    // cmd.exe is looked up as it is for a bare name, so its absence is the same refusal.
    assert.throws(() => m.resolveSpawnCommand("C:\\x\\y.cmd", { platform: "win32", env: WIN_ENV, existsSync: () => false }),
        (e) => e instanceof m.VcSecretsError && e.message === "cmd.exe: not found on PATH");
});

test("resolveSpawnCommand: win32 a name that carries an extension resolves to the absolute PATH hit", () => {
    // Such a name used to go out untouched, and libuv looks a bare name up in the cwd before PATH.
    const r = m.resolveSpawnCommand("powershell.exe", {
        platform: "win32", env: WIN_ENV, existsSync: onlyFiles("c:/windows/system32/powershell.exe"),
    });
    assert.deepEqual(r, { kind: "direct", cmd: "C:\\Windows\\System32\\powershell.exe" });
});

test("resolveSpawnCommand: win32 never looks in the cwd, or in a PATH entry that is not absolute", () => {
    // Every candidate is recorded rather than only the outcome: an existsSync that says yes to the
    // relative and bare spellings would otherwise be answered by an implementation that never asked.
    const asked = [];
    const existsSync = (p) => {
        asked.push(p);

        return !path.win32.isAbsolute(p);
    };
    for (const name of ["powershell.exe", "npx"]) {
        assert.throws(() => m.resolveSpawnCommand(name, {
            platform: "win32", env: { Path: ".;tools;C:\\bin", PATHEXT: ".COM;.EXE;.BAT;.CMD" }, existsSync,
        }), (e) => e instanceof m.VcSecretsError && e.message === `${name}: not found on PATH`);
    }
    assert.ok(asked.length > 0 && asked.every((p) => path.win32.isAbsolute(p)),
        `only absolute candidates may be probed: ${JSON.stringify(asked)}`);
});

test("resolveSpawnCommand: win32 a quoted PATH entry is still searched", () => {
    const r = m.resolveSpawnCommand("gpg", {
        platform: "win32", env: { Path: '"C:\\Program Files\\GnuPG\\bin"', PATHEXT: ".exe" },
        existsSync: onlyFiles("c:/program files/gnupg/bin/gpg.exe"),
    });
    assert.equal(r.cmd, "C:\\Program Files\\GnuPG\\bin\\gpg.exe");
});

test("resolveSpawnCommand: win32 searches the PATH of the env it is given, not this process's", () => {
    const seen = [];
    const r = m.resolveSpawnCommand("tool", {
        platform: "win32", env: { PATH: "C:\\declared\\bin" }, existsSync: (candidate) => { seen.push(candidate); return true; },
    });
    assert.equal(r.cmd, "C:\\declared\\bin\\tool.COM", "the first hit in the given PATH");
    assert.ok(seen.every((x) => x.startsWith("C:\\declared\\bin\\")), `only the declared PATH was searched: ${seen}`);
});

test("mergeDeclaredEnv: on win32 a declared key replaces every inherited spelling, so the resolver searches the declared PATH", () => {
    const inherited = { Path: "C:\\inherited\\bin", Other: "kept" };
    const merged = m.mergeDeclaredEnv(inherited, { PATH: "C:\\declared\\bin" }, "win32");
    assert.deepEqual(Object.keys(merged).filter((key) => key.toUpperCase() === "PATH"), ["PATH"], "one spelling reaches the child");
    assert.equal(merged.Other, "kept");
    const r = m.resolveSpawnCommand("tool", { platform: "win32", env: merged, existsSync: () => true });
    assert.ok(r.cmd.startsWith("C:\\declared\\bin\\"), `the declaration decides the lookup: ${r.cmd}`);
    // POSIX keys are case-sensitive, so both spellings are distinct variables and both stay.
    assert.deepEqual(Object.keys(m.mergeDeclaredEnv(inherited, { PATH: "/declared" }, "linux")).sort(), ["Other", "PATH", "Path"]);
});

test("mergeDeclaredEnv: on win32 a declared key is matched to inherited ones in any letter case, whatever case it is declared in", () => {
    const merged = m.mergeDeclaredEnv({ Path: "C:\\inherited\\bin" }, { path: "C:\\declared\\bin" }, "win32");
    assert.deepEqual(merged, { path: "C:\\declared\\bin" }, "exactly one spelling reaches the child, and it is the declaration's");
    const r = m.resolveSpawnCommand("tool", { platform: "win32", env: merged, existsSync: () => true });
    assert.ok(r.cmd.startsWith("C:\\declared\\bin\\"), `and the lookup reads it whatever its case: ${r.cmd}`);
});

test("resolveSpawnCommand: win32 a shim carries the absolute cmd.exe it will be run by", () => {
    const r = m.resolveSpawnCommand("npx", {
        platform: "win32", env: WIN_ENV, existsSync: onlyFiles("c:/bin/npx.cmd", "c:/windows/system32/cmd.exe"),
    });
    assert.equal(r.kind, "cmd-shim");
    assert.equal(r.shell, "C:\\Windows\\System32\\cmd.exe");
    assert.equal(m.buildSpawnInvocation(r, ["-y"]).cmd, r.shell, "the invocation spawns it, not a bare cmd.exe");
});

test("resolveSpawnCommand: win32 a .bat is run through cmd.exe like a .cmd", () => {
    const r = m.resolveSpawnCommand("tool", {
        platform: "win32", env: WIN_ENV, existsSync: onlyFiles("c:/bin/tool.bat", "c:/windows/system32/cmd.exe"),
    });
    assert.equal(r.kind, "cmd-shim");
    assert.equal(r.cmd.toLowerCase(), "c:\\bin\\tool.bat");
    assert.equal(r.shell, "C:\\Windows\\System32\\cmd.exe");
});

test("resolveSpawnCommand: win32 a name that carries an extension is not also expanded by PATHEXT", () => {
    // `git.exe.cmd` is what PATHEXT expansion of `git.exe` would find; the name says which file it means.
    assert.throws(() => m.resolveSpawnCommand("git.exe", {
        platform: "win32", env: WIN_ENV, existsSync: onlyFiles("c:/bin/git.exe.cmd", "c:/windows/system32/cmd.exe"),
    }), (e) => e instanceof m.VcSecretsError && e.message === "git.exe: not found on PATH");
});

test("resolveSpawnCommand: win32 a name that carries an extension tries the exact file, then com and exe appended -- as libuv does, and not PATHEXT", () => {
    // `python3.12` is `python3.12.exe`: its ".12" is not an extension in the executable sense, and a
    // resolver that stops at the literal name reports an installed tool missing.
    const env = { Path: "C:\\Py", PATHEXT: ".XYZ" };
    const resolve = (name, ...files) => m.resolveSpawnCommand(name, { platform: "win32", env, existsSync: onlyFiles(...files) }).cmd;
    assert.equal(resolve("python3.12", "c:/py/python3.12.exe"), "C:\\Py\\python3.12.exe");
    assert.equal(resolve("python3.12", "c:/py/python3.12.com"), "C:\\Py\\python3.12.com");
    assert.equal(resolve("python3.12", "c:/py/python3.12.exe", "c:/py/python3.12.com"), "C:\\Py\\python3.12.com",
        "com is tried before exe, in libuv's order");
    assert.equal(resolve("python3.12", "c:/py/python3.12", "c:/py/python3.12.exe"), "C:\\Py\\python3.12",
        "the literal name comes before either appended one");
    assert.equal(resolve("gh.exe", "c:/py/gh.exe"), "C:\\Py\\gh.exe", "an exact name still resolves literally");
    assert.throws(() => resolve("python3.12", "c:/py/python3.12.xyz"), /python3\.12: not found on PATH/,
        "PATHEXT is not consulted for a name that has an extension");
    // The other half of the rule: a name without one is what PATHEXT is for.
    assert.equal(resolve("tool", "c:/py/tool.xyz"), "C:\\Py\\tool.XYZ");
});

test("resolveSpawnCommand: win32 whether a name has an extension is libuv's test -- the first dot, not the last character", () => {
    const env = { Path: "C:\\Py", PATHEXT: ".XYZ" };
    const resolve = (name, ...files) => m.resolveSpawnCommand(name, { platform: "win32", env, existsSync: onlyFiles(...files) }).cmd;
    // `tool.` ends in its dot, so it has none: it is looked up through PATHEXT, with no second dot joined on.
    assert.equal(resolve("tool.", "c:/py/tool.xyz"), "C:\\Py\\tool.XYZ");
    assert.throws(() => resolve("tool.", "c:/py/tool."), /tool\.: not found on PATH/, "and is not tried as a literal");
    // `.hidden` has one, so the literal comes first.
    assert.equal(resolve(".hidden", "c:/py/.hidden"), "C:\\Py\\.hidden");
    // `tool.v2.` ends in a dot but its FIRST dot is not the last character, so it has one too -- the only
    // shape on which the first-dot and last-dot readings disagree.
    assert.equal(resolve("tool.v2.", "c:/py/tool.v2."), "C:\\Py\\tool.v2.");
});

test("resolveSpawnCommand: win32 PATH is split the way libuv's search_path does it", () => {
    // libuv: a slice opening with `"` or `'` runs to the matching quote, so a `;` inside is part of the
    // directory; the quote at each end is then stripped independently of the other.
    const resolveIn = (pathValue, name, ...files) => m.resolveSpawnCommand(name, {
        platform: "win32", env: { Path: pathValue, PATHEXT: ".EXE" }, existsSync: onlyFiles(...files) }).cmd.toLowerCase();
    const existing = ["c:/a;b/gh.exe", "c:/other/git.exe"];
    assert.equal(resolveIn('"C:\\a;b";C:\\other', "gh", ...existing), "c:\\a;b\\gh.exe", "double quotes hold a semicolon");
    assert.equal(resolveIn("'C:\\a;b';C:\\other", "gh", ...existing), "c:\\a;b\\gh.exe", "and so do single quotes");
    assert.equal(resolveIn('"C:\\a;b";C:\\other', "git", ...existing), "c:\\other\\git.exe", "the entry after a quoted one is still read");
    // Independent stripping: an unterminated opening quote, a trailing quote alone, and a mismatched pair.
    assert.equal(resolveIn('"C:\\a;b', "gh", ...existing), "c:\\a;b\\gh.exe", "an unterminated quote runs to the end and loses its opening one");
    assert.equal(resolveIn('C:\\other"', "git", ...existing), "c:\\other\\git.exe", "a trailing quote is stripped without an opening one");
    assert.equal(resolveIn("\"C:\\other'", "git", ...existing), "c:\\other\\git.exe", "and a mismatched pair loses both");
    // A lone quote strips to an empty slice, which is skipped rather than searched.
    assert.throws(() => m.resolveSpawnCommand("gh", { platform: "win32", env: { Path: '"C:\\x";"', PATHEXT: ".EXE" },
        existsSync: onlyFiles("c:/a;b/gh.exe") }), /gh: not found on PATH/);
});

test("resolveSpawnCommand: win32 a shim with no cmd.exe to run it is not found, not run through a bare name", () => {
    assert.throws(() => m.resolveSpawnCommand("npx", {
        platform: "win32", env: WIN_ENV, existsSync: onlyFiles("c:/bin/npx.cmd"),
    }), (e) => e instanceof m.VcSecretsError && e.message === "cmd.exe: not found on PATH");
});

test("commandOnPath: win32 answers from the resolver, so a cwd-only or missing tool is absent", () => {
    const existsSync = onlyFiles("c:/bin/gpg.exe");
    assert.equal(m.commandOnPath("gpg", { platform: "win32", env: WIN_ENV, existsSync }), true);
    assert.equal(m.commandOnPath("az", { platform: "win32", env: WIN_ENV, existsSync }), false);
    assert.equal(m.commandOnPath("gpg", { platform: "win32", env: { Path: ".;tools", PATHEXT: ".EXE" },
        existsSync: (p) => !path.win32.isAbsolute(p) }), false);
});

test("commandOnPath: win32 a name that carries a path is present only when that file exists", () => {
    const existsSync = onlyFiles("c:/tools/x.exe");
    assert.equal(m.commandOnPath("C:\\tools\\x.exe", { platform: "win32", env: WIN_ENV, existsSync }), true);
    assert.equal(m.commandOnPath("C:\\nope\\x.exe", { platform: "win32", env: WIN_ENV, existsSync }), false);
});

test("buildSpawnInvocation: verbatim cmd line quotes every token", () => {
    const shell = "C:\\Windows\\System32\\cmd.exe";
    const inv = m.buildSpawnInvocation({ kind: "cmd-shim", cmd: "C:\\Program Files\\nodejs\\npx.cmd", shell }, ["-y", "@azure-devops/mcp@2.8.1"]);
    assert.equal(inv.cmd, shell);
    assert.deepEqual(inv.args, ['/d /v:off /s /c ""C:\\Program Files\\nodejs\\npx.cmd" "-y" "@azure-devops/mcp@2.8.1""']);
    assert.equal(inv.opts.windowsVerbatimArguments, true);

    const direct = m.buildSpawnInvocation({ kind: "direct", cmd: "npx" }, ["-y"]);
    assert.deepEqual(direct, { cmd: "npx", args: ["-y"], opts: {} });
});

test("buildSpawnInvocation: a cmd-shim argument ending in a backslash is refused by position, never by value; a direct spawn takes it", () => {
    const shell = "C:\\Windows\\System32\\cmd.exe";
    const shim = { kind: "cmd-shim", cmd: "C:\\nodejs\\npx.cmd", shell };
    const line = (args) => m.buildSpawnInvocation(shim, args).args[0];

    // Doubling the run is right for a wrapper that forwards to an MSVCRT-parsed program and wrong for a
    // batch file that reads %~1 itself, and the builder cannot tell which it is feeding: so none is
    // rewritten, and the line cmd.exe runs is always the argv the trust review showed.
    for (const bad of ["C:\\dir\\", "C:\\a b\\\\", "\\"]) {
        assert.throws(() => line(["ok", bad]),
            (e) => e instanceof m.VcSecretsError
                && e.message === "argument 2 ends with a backslash, which a .cmd/.bat shim cannot pass on unchanged -- drop the trailing backslash"
                && !e.message.includes(bad.trim()),
            `${JSON.stringify(bad)} must be refused without echoing it`);
    }
    // Interior backslashes, and a backslash that is not last, pass through untouched.
    assert.equal(line(["a\\b", "C:\\x", "C:\\dir\\file"]),
        '/d /v:off /s /c ""C:\\nodejs\\npx.cmd" "a\\b" "C:\\x" "C:\\dir\\file""');
    // A direct spawn hands the argument to the program as it is, so there is nothing to refuse.
    assert.deepEqual(m.buildSpawnInvocation({ kind: "direct", cmd: "npx" }, ["C:\\dir\\"]), { cmd: "npx", args: ["C:\\dir\\"], opts: {} });
});

test("buildSpawnInvocation: a cmd-shim argument cmd.exe would interpret is refused by position, never by value; a direct spawn takes it", () => {
    const shim = { kind: "cmd-shim", cmd: "C:\\nodejs\\npx.cmd", shell: "C:\\Windows\\System32\\cmd.exe" };

    // The child's environment holds the resolved secrets, and cmd.exe expands %VAR% inside quotes from it.
    for (const bad of ["%ADO_MCP_AUTH_TOKEN%", "100%", "a\nb", "a\rb"]) {
        assert.throws(() => m.buildSpawnInvocation(shim, ["ok", bad]),
            (e) => e instanceof m.VcSecretsError && /argument 2 contains/.test(e.message) && !e.message.includes(bad.trim()),
            `${JSON.stringify(bad)} must be refused without echoing it`);
    }
    // Legitimate on every direct path: a URL-encoded argument.
    assert.deepEqual(m.buildSpawnInvocation({ kind: "direct", cmd: "npx" }, ["a%20b", "x\ny"]), { cmd: "npx", args: ["a%20b", "x\ny"], opts: {} });
});

test("buildSpawnInvocation: a .cmd shim runs with delayed expansion off, so !NAME! in an argument stays literal", () => {
    // A machine with HKCU\Software\Microsoft\Command Processor\DelayedExpansion=1 expands !NAME! even inside
    // quotes, from the child's environment where the resolved secrets live. The argument is legitimate on
    // every direct path, so it is passed on unchanged and /v:off on the command line is what keeps it inert.
    const shim = { kind: "cmd-shim", cmd: "C:\\nodejs\\npx.cmd", shell: "C:\\Windows\\System32\\cmd.exe" };
    const inv = m.buildSpawnInvocation(shim, ["ok", "!GITHUB_TOKEN!"]);

    assert.ok(inv.args[0].startsWith("/d /v:off /s /c "), "delayed expansion is switched off on the command line");
    assert.ok(inv.args[0].includes(' "!GITHUB_TOKEN!"'), "the argument is passed through verbatim, quoted");
});

test("buildSpawnInvocation: a pathful .cmd command holding % is refused without echoing it; a direct spawn takes the same path", () => {
    // The quoted command sits on the same /c line as the arguments, so cmd.exe expands %VAR% in it from the
    // child's environment too.
    const existsSync = onlyFiles("c:/windows/system32/cmd.exe");
    for (const command of ["C:\\tools\\%X%\\x.cmd", "C:\\tools\\100%\\x.bat"]) {
        const resolved = m.resolveSpawnCommand(command, { platform: "win32", env: WIN_ENV, existsSync });
        assert.equal(resolved.kind, "cmd-shim", "the control: it is run through cmd.exe");
        assert.throws(() => m.buildSpawnInvocation(resolved, ["ok"]),
            (e) => e instanceof m.VcSecretsError && /^the command contains %/.test(e.message)
                && !e.message.includes("tools") && !e.message.includes("%X%"),
            `${command} must be refused without echoing it`);
    }
    // A direct spawn hands the path to the loader untouched, so a % there is only a character.
    const direct = m.resolveSpawnCommand("C:\\tools\\%X%\\x.exe", { platform: "win32", env: WIN_ENV, existsSync });
    assert.deepEqual(m.buildSpawnInvocation(direct, ["ok"]), { cmd: "C:\\tools\\%X%\\x.exe", args: ["ok"], opts: {} });
});

test("sanitizeEnv: strips DANGEROUS_ENV_VARS, keeps everything else", () => {
    assert.deepEqual(
        m.sanitizeEnv({ NODE_OPTIONS: "x", LD_PRELOAD: "y", PATH: "p" }),
        { PATH: "p" });
    assert.deepEqual(
        m.sanitizeEnv({ LD_AUDIT: "a", LD_LIBRARY_PATH: "b", DYLD_INSERT_LIBRARIES: "c", DYLD_LIBRARY_PATH: "d" }),
        {});
    assert.deepEqual(m.sanitizeEnv({ FOO: "bar" }), { FOO: "bar" });
});
