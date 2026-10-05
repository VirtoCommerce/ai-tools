import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto, { randomUUID } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import * as m from "../vc-secrets.mjs";
import * as cache from "../vc-secrets-cache.mjs";
import { tmpDirs, socketTest, lockTest } from "../test-support.mjs";
import {
    LAUNCHER_PATH, probe, scopedPaths, trustedStateFor, OAUTH_DECL, keyvaultPairCfg, trustEnv, NO_TRUST,
    withProcessEnv, namespaceOauthCfg, corruptTrustFile, namespaceStoreSeams, DECL_IDENTITY, LOGIN_DECL, LOGIN_CFG,
    trustedFor, loginDeps, seamsOf, definedSeams,
} from "../test-fixtures.mjs";

test("resolveEnvEntries: Key Vault reads run in parallel, so two that wait for each other both finish",
    { timeout: 15_000 },
    async () => {
        const started = [];
        let bothStarted = null;
        const gate = new Promise((resolve) => { bothStarted = resolve; });
        // Sequential reading never starts the second call, so the first waits on it forever; the deadline
        // turns that into a failure instead of a hung suite.
        const outcome = await m.withDeadline(m.resolveEnvEntries("s", keyvaultPairCfg(), async (name) => {
            started.push(name);
            if (started.length === 2) {
                bothStarted();
            }
            await gate;

            return `value-${name}`;
        }), 3000, () => "deadlock");
        assert.notEqual(outcome, "deadlock", `only ${started.join(", ")} was ever asked for: the reads are sequential`);
        assert.deepEqual(outcome.env, { A: "value-a", B: "value-b" });
    });

// The job object, run for real. The source-text tests above pin what the script says; only a Windows
// machine can show that terminating the bound process ends the tree it started. Both tests below build
// the same tree and differ only in the bind, so the second says whether the first could have failed.
//
// Skipped where the bind cannot run, with the missing thing named. A machine where Add-Type is blocked
// is NOT skipped: there the script is the feature not working, and the bind test must say so.
const CAN_BIND_JOB = process.platform === "win32" && probe(() => {
    m.resolveSpawnCommand(m.psCommand({}));

    return true;
});

const JOB_BIND_SKIP = !CAN_BIND_JOB && (process.platform === "win32"
    ? `needs ${m.psCommand({})} on PATH to run the bind`
    : `needs Windows: the bind is a Windows job object and this platform is ${process.platform}`);

const TIMED_OUT = Symbol("timed out");

// One file plays all three roles. Each member connects to the pipe the test owns and says who it is; that
// connection is its liveness, because a pid can be reused and a connection cannot outlive its process.
// The grandchild goes through cmd.exe /d /v:off /s /c with a verbatim line, as `npx.cmd` does for a real server.
// A fixture ends itself after 180 s, and when the test closes its end of the pipe.
const JOB_TREE_FIXTURE = String.raw`"use strict";
const net = require("node:net");
const { spawn } = require("node:child_process");
const [role, pipe] = process.argv.slice(2);

setTimeout(() => process.exit(0), 180000);

function join(label) {
    const socket = net.connect(pipe);
    socket.on("connect", () => socket.write(label + " " + process.pid + "\n"));
    socket.on("error", () => process.exit(3));
    socket.on("close", () => process.exit(0));
}

if (role === "parent") {
    process.stdin.setEncoding("utf8");
    process.stdin.once("data", () => {
        spawn(process.execPath, [__filename, "child", pipe], { stdio: "ignore", windowsHide: true });
    });
    process.stdin.on("end", () => process.exit(0));
} else if (role === "child") {
    join("child");
    const line = '"' + process.execPath + '" "' + __filename + '" grandchild "' + pipe + '"';
    spawn(process.env.ComSpec || "cmd.exe", ['/d /v:off /s /c "' + line + '"'],
        { stdio: "ignore", windowsHide: true, windowsVerbatimArguments: true });
} else {
    join("grandchild");
}
`;

// Starts the parent fixture, which does nothing until `go()`, and listens for its descendants. The
// returned `cleanup` is for a `finally`: it kills only a pid whose connection is still open, then closes
// the sockets and the server.
async function startJobTree() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-jobtree-"));
    tmpDirs.push(dir);
    const script = path.join(dir, "tree.cjs");
    fs.writeFileSync(script, JOB_TREE_FIXTURE);
    const pipe = `\\\\.\\pipe\\vc-secrets-job-${process.pid}-${randomUUID()}`;

    const members = new Map();
    const sockets = [];
    let reportUp = () => {};
    const bothUp = new Promise((resolve) => { reportUp = resolve; });
    const server = net.createServer((socket) => {
        sockets.push(socket);
        const entry = { pid: null, open: true };
        entry.closed = new Promise((resolve) => socket.once("close", () => {
            entry.open = false;
            resolve();
        }));
        socket.on("error", () => {});
        socket.setEncoding("utf8");
        let heard = "";
        socket.on("data", (chunk) => {
            if (entry.pid !== null) {
                return;
            }
            heard += chunk;
            const end = heard.indexOf("\n");
            if (end === -1) {
                return;
            }
            const [role, pid] = heard.slice(0, end).trim().split(" ");
            entry.pid = Number(pid);
            members.set(role, entry);
            if (members.has("child") && members.has("grandchild")) {
                reportUp();
            }
        });
    });
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(pipe, resolve);
    });

    // Not the temp directory: a process whose cwd is a directory keeps it from being removed.
    const parent = spawn(process.execPath, [script, "parent", pipe],
        { stdio: ["pipe", "ignore", "ignore"], windowsHide: true, cwd: path.dirname(LAUNCHER_PATH) });
    parent.on("error", () => {});
    parent.stdin.on("error", () => {});
    const parentExit = new Promise((resolve) => parent.once("exit", resolve));

    return {
        parent,
        parentExit,
        bothUp,
        members,
        go: () => parent.stdin.write("go\n"),
        allGone: () => Promise.all([...members.values()].map((x) => x.closed)),
        cleanup: async () => {
            try {
                parent.kill();
            } catch { /* already gone */ }
            for (const entry of members.values()) {
                if (entry.open) {
                    try {
                        process.kill(entry.pid);
                    } catch { /* ended between the check and the kill */ }
                }
            }
            for (const socket of sockets) {
                socket.destroy();
            }
            await m.withDeadline(new Promise((resolve) => server.close(resolve)), 5_000, () => TIMED_OUT);
        },
    };
}

// Deadlines add up to 60 + 30 + 15 + 15 s, under the test's own 150 s with room for the cleanup.
test("PS_CRED_READ_MANY's bind, run for real: terminating the bound process ends what it started through cmd.exe",
    { skip: JOB_BIND_SKIP, timeout: 150_000 }, async () => {
        const tree = await startJobTree();
        try {
            assert.ok(Number.isInteger(tree.parent.pid), "the parent fixture started");

            // The pid bound is the fixture's, never this process's: the job kills whatever holds it, and this
            // process is the test runner.
            const out = await m.withDeadline(
                m.runTool({ ...m.buildCredReadMany([], tree.parent.pid, {}), timeoutMs: 60_000 }),
                60_000, () => TIMED_OUT);
            assert.notEqual(out, TIMED_OUT, "the bind answered within 60 s");
            assert.deepEqual(JSON.parse(out), { creds: {}, job: "ok" });

            // Started only now, so that both members are created after the assignment.
            tree.go();
            assert.notEqual(await m.withDeadline(tree.bothUp, 30_000, () => TIMED_OUT), TIMED_OUT,
                "the child and the grandchild both connected within 30 s");
            for (const [role, entry] of tree.members) {
                assert.equal(entry.open, true, `${role} is connected before the kill`);
            }

            tree.parent.kill();
            assert.notEqual(await m.withDeadline(tree.parentExit, 15_000, () => TIMED_OUT), TIMED_OUT,
                "the parent ended within 15 s of being terminated");
            assert.notEqual(await m.withDeadline(tree.allGone(), 15_000, () => TIMED_OUT), TIMED_OUT,
                "the child and the grandchild ended within 15 s of the parent");
        } finally {
            await tree.cleanup();
        }
    });

// Pins how this Node starts a tree, not the launcher: if a Node ever ended every descendant of a killed
// parent by itself, the bind test above would pass without the bind, and this one says so as a skip.
test("without the bind, terminating the parent leaves part of the same tree running (what the bind test is told apart from)",
    { skip: JOB_BIND_SKIP, timeout: 150_000 }, async (t) => {
        const tree = await startJobTree();
        try {
            assert.ok(Number.isInteger(tree.parent.pid), "the parent fixture started");

            tree.go();
            assert.notEqual(await m.withDeadline(tree.bothUp, 30_000, () => TIMED_OUT), TIMED_OUT,
                "the child and the grandchild both connected within 30 s");

            tree.parent.kill();
            if (await m.withDeadline(tree.parentExit, 15_000, () => TIMED_OUT) === TIMED_OUT) {
                t.skip("the parent fixture did not end when terminated, so what outlives it cannot be measured");

                return;
            }
            if (await m.withDeadline(tree.allGone(), 15_000, () => TIMED_OUT) !== TIMED_OUT) {
                t.skip("this Node ends the tree without the bind, so the bind test above cannot discriminate here");

                return;
            }
            assert.ok([...tree.members.values()].some((x) => x.open), "a member outlived the parent that started it");
        } finally {
            await tree.cleanup();
        }
    });

test("login and logout: a repository's oauth entry is refused without this checkout's trust, before any listener, sign-in, lock or deletion", async () => {
    const cfg = namespaceOauthCfg();
    const moved = trustedStateFor(cfg);
    moved.repositories[cfg.projectRoot].projectId = "proj-other";
    const cases = [
        ["no record", NO_TRUST, /oauth "ado" is stored in namespace "proj-x", which this repository declares, and this checkout is not trusted -- review it, then run "vc-secrets trust" in /],
        ["a changed projectId", moved, /oauth "ado" is stored in namespace "proj-x", and the projectId changed since you trusted this checkout: projectId is "proj-x", trusted "proj-other" -- review it, then run "vc-secrets trust" again in /],
    ];
    for (const [what, trustState, pattern] of cases) {
        const seams = namespaceStoreSeams();
        const matches = (e) => {
            assert.match(e.message, pattern);

            return true;
        };
        await assert.rejects(() => m.cmdLogin("ado", cfg, { ...seams.login, trustState }), matches, `login, ${what}`);
        await assert.rejects(() => m.cmdLogout("ado", cfg, { ...seams.logout, trustState }), matches, `logout, ${what}`);
        assert.deepEqual(seams.calls, [], `${what}: nothing was started`);
    }

    // The controls: with the record, the same calls run.
    const trustState = trustedStateFor(cfg);
    const login = namespaceStoreSeams();
    await m.cmdLogin("ado", cfg, { ...login.login, trustState });
    assert.ok(login.calls.includes("listen"));
    assert.equal(login.calls.filter((call) => call.startsWith("write ")).length, 2, "both entries were stored");
    const logout = namespaceStoreSeams();
    await m.cmdLogout("ado", cfg, { ...logout.logout, trustState });
    assert.equal(logout.calls.filter((call) => call.startsWith("remove ")).length, 2);
});

test("login: the acknowledgement of the app registration is checked as before, ahead of the trust the namespace needs", async () => {
    // Both are refusals with no side effect, and the acknowledgement is the one a repository's declaration
    // has always met first: its remedy (a block in the person's own file) is unchanged by this one.
    const cfg = namespaceOauthCfg({ grant: false });
    const seams = namespaceStoreSeams();
    await assert.rejects(() => m.cmdLogin("ado", cfg, { ...seams.login, trustState: NO_TRUST }), /not authorized/);
    assert.deepEqual(seams.calls, []);
});

test("login and logout: with no seam the trust file is read -- a corrupt one stops a repository's entry and never the person's own", async () => {
    const env = trustEnv();
    const file = corruptTrustFile(env);
    const repository = namespaceOauthCfg();
    const own = m.loadConfig(scopedPaths({ user: { oauth: { ado: OAUTH_DECL } } }));
    await withProcessEnv(env, async () => {
        const seams = namespaceStoreSeams();
        const unreadable = (e) => {
            assert.ok(e.message.includes(file), e.message);

            return true;
        };
        await assert.rejects(() => m.cmdLogin("ado", repository, seams.login), unreadable);
        await assert.rejects(() => m.cmdLogout("ado", repository, seams.logout), unreadable);
        assert.deepEqual(seams.calls, [], "an unreadable file counts as not trusted");

        const mine = namespaceStoreSeams();
        await m.cmdLogin("ado", own, mine.login);
        await m.cmdLogout("ado", own, mine.logout);
        assert.ok(mine.calls.includes("listen") && mine.calls.includes("acquireLock"),
            "the person's own entry never consults the file, so a corrupt one cannot stop them managing it");
    });
});

// The opener probe is injected rather than left to the real PATH. With a real `commandOnPath` the
// linux case asserts whatever this machine happens to have installed: it passes here because
// wslview and powershell.exe are absent, and would fail on a WSL box that has wslview — an
// environment-dependent test that reports the machine, not the code.
const onPath = (...present) => (tool) => present.includes(tool);

// The win32 branch resolves cmd.exe to an absolute path, so its tests stand a resolver in rather than
// lean on whichever PATH and filesystem the machine running them has.
const WIN_CMD = "C:\\Windows\\System32\\cmd.exe";

const resolvesCmd = (name) => ({ kind: "direct", cmd: name === "cmd.exe" ? WIN_CMD : name });

// ---------------------------------------------------------------------------------------------
// The callback surface -- the loopback listener, handleCallback, the two HTML pages,
// and the browser opener. Ported from the launcher's own suite.
// ---------------------------------------------------------------------------------------------

test("buildBrowserCommand: one command per platform", () => {
    assert.deepEqual(m.buildBrowserCommand("linux", {}, "http://x/", onPath("xdg-open")),
        { cmd: "xdg-open", args: ["http://x/"] });
    assert.deepEqual(m.buildBrowserCommand("darwin", {}, "http://x/", onPath()),
        { cmd: "open", args: ["http://x/"] });
    assert.equal(m.buildBrowserCommand("win32", {}, "http://x/", onPath(), resolvesCmd).cmd, WIN_CMD,
        "the resolved absolute cmd.exe, never the bare name libuv would look for in the cwd first");
});

test("buildBrowserCommand: win32 with no resolvable cmd.exe has no opener, and never falls back to a bare name", () => {
    const unresolvable = () => { throw new m.VcSecretsError("cmd.exe: not found on PATH"); };
    assert.equal(m.buildBrowserCommand("win32", {}, "http://x/", onPath(), unresolvable), null);
    // The default resolver, over an env whose only PATH entry holds no cmd.exe.
    assert.equal(m.buildBrowserCommand("win32", { Path: "C:\\vc-secrets-no-such-dir" }, "http://x/", onPath()), null);
});

test("buildBrowserCommand: on WSL the interop opener is preferred over xdg-open", () => {
    // xdg-open inside WSL opens a Linux browser that may not exist, or nothing at all; wslview
    // and powershell.exe hand the URL to the Windows default browser, which is where the
    // developer is actually signed in.
    assert.equal(m.buildBrowserCommand("linux", {}, "http://x/", onPath("wslview", "xdg-open")).cmd, "wslview");
    assert.equal(m.buildBrowserCommand("linux", {}, "http://x/", onPath("powershell.exe", "xdg-open")).cmd,
        "powershell.exe");
});

test("buildBrowserCommand: no opener at all is a supported path, not a failure", () => {
    // Measured on one of our machines: no /mnt/c, no cmd.exe on PATH. cmdLogin prints the URL
    // and keeps waiting on the listener, so sign-in still completes by hand.
    assert.equal(m.buildBrowserCommand("linux", { VC_SECRETS_WSL_NO_INTEROP: "1" }, "http://x/",
        onPath("wslview", "xdg-open")), null, "the override must win over anything on PATH");
    assert.equal(m.buildBrowserCommand("linux", {}, "http://x/", onPath()), null);
});

test("buildBrowserCommand: a URL carrying & or | survives to the browser on every platform", () => {
    // The property, stated per platform, because it is not the same property. On linux and darwin the
    // URL is its own argv element and nothing re-parses it. On win32 that is NOT enough and the
    // previous version of this test asserted it anyway: cmd.exe re-parses everything after /c, so the
    // element boundary the assertion checked is invisible to it and the URL truncated at the first &.
    // Green test, broken launch, measured only when a real sign-in reached a real Windows browser.
    const nasty = "http://127.0.0.1:1/?code=a&b=c|whoami";
    for (const platform of ["linux", "darwin"]) {
        const built = m.buildBrowserCommand(platform, {}, nasty, onPath("xdg-open"));
        assert.ok(built.args.includes(nasty), `${platform} must pass the URL as one argument`);
    }
    const win = m.buildBrowserCommand("win32", {}, nasty, onPath(), resolvesCmd);
    assert.deepEqual(win.args, [`/c start "" "${nasty}"`], "one verbatim line, with the URL quoted");
    assert.equal(win.opts.windowsVerbatimArguments, true,
        "without this node re-quotes the line and the quotes stop protecting anything");
    assert.match(win.args[0], /\?code=a&b=c\|whoami"$/, "everything after the & must still be there");
    // A third property, again not the same one. powershell.exe joins everything after -Command back
    // into script text, so the argv element is as invisible to it as it is to cmd.exe -- and & is an
    // argument-mode metacharacter anywhere in a token. Asserting the element would pass on the broken
    // form, which is exactly how the win32 assertion stayed green while the launch was broken.
    const wsl = m.buildBrowserCommand("linux", {}, nasty, onPath("powershell.exe"));
    const script = wsl.args.slice(wsl.args.indexOf("-Command") + 1).join(" ");
    assert.equal(script, `Start-Process '${nasty}'`, "the URL must reach PowerShell as a single-quoted literal");
    assert.match(script, /&b=c\|whoami'$/, "everything after the & must still be there");
});

test("buildBrowserCommand: a URL carrying the quote character its shell's form relies on is refused, not quoted anyway", () => {
    // The win32 form embeds the URL in a quoted string, so a quote inside it would end that string
    // early and hand the rest to cmd.exe as syntax. Cannot happen from outside today — guids,
    // base64url and configured scopes — so this keeps it that way rather than trusting it stays.
    assert.throws(() => m.buildBrowserCommand("win32", {}, 'http://127.0.0.1:1/?a="&calc', onPath()),
        m.VcSecretsError);
    // The WSL branch embeds the URL in a single-quoted PowerShell literal, so there it is the single
    // quote that would end the string early. Same invariant, the other shell's quoting character.
    assert.throws(() => m.buildBrowserCommand("linux", {}, "http://127.0.0.1:1/?a='&calc", onPath("powershell.exe")),
        m.VcSecretsError);
});

test("openBrowser: the spawn options the builder asked for actually reach spawn", async () => {
    // The other half of the same defect: the win32 spec carries windowsVerbatimArguments and the
    // inline default dropped spec.opts, so the builder was right and the launch was not. A spec field
    // nothing reads is worse than no field at all.
    let seen = null;
    const spec = { cmd: "cmd", args: ['/c start "" "http://x/?a=1&b=2"'], opts: { windowsVerbatimArguments: true } };
    m.openBrowser(spec, { spawnProcess: (cmd, args, opts) => {
        seen = { cmd, args, opts };

        return { unref() {}, on() {} };
    } });
    assert.equal(seen.opts.windowsVerbatimArguments, true);
    assert.equal(seen.opts.detached, true, "and the defaults it does not override are still there");
    assert.deepEqual(seen.args, spec.args);
});

test("openBrowser: a missing opener is reported, not thrown", () => {
    // spawn fails ASYNCHRONOUSLY, so by the time `error` arrives the caller's try/catch is gone and an
    // unhandled one would end the sign-in on a stack trace -- with the listener already waiting and
    // the URL already printable. A degradation must read as one.
    const logged = [];
    let emit = null;
    m.openBrowser({ cmd: "xdg-open", args: ["http://x/"] }, {
        log: (line) => logged.push(line),
        spawnProcess: () => ({ unref() {}, on(event, fn) { if (event === "error") { emit = fn; } } }),
    });
    assert.ok(emit, "openBrowser must subscribe to the child's error");
    emit(Object.assign(new Error("spawn xdg-open ENOENT"), { code: "ENOENT" }));
    assert.match(logged.join(""), /could not open a browser \(ENOENT\)/);
    assert.match(logged.join(""), /by hand/, "and must say what the developer can still do");
});

test("openBrowser: an opener that spawned and then failed is reported too", () => {
    // `error` covers only a spawn that never happened, and that is the RARER shape. wslview with
    // interop off, xdg-open on a headless host and a policy-blocked powershell each spawn cleanly
    // and exit non-zero -- so the sign-in went on waiting for a browser that was never going to
    // appear, with nothing printed and no timeout to end it.
    const logged = [];
    const handlers = {};
    m.openBrowser({ cmd: "wslview", args: ["http://x/"] }, {
        log: (line) => logged.push(line),
        spawnProcess: () => ({ unref() {}, on(event, fn) { handlers[event] = fn; } }),
    });
    assert.ok(handlers.close, "openBrowser must subscribe to the child's close");
    handlers.close(1);
    assert.match(logged.join(""), /exited with code 1/);
    assert.match(logged.join(""), /by hand/, "and must say what the developer can still do");
});

test("openBrowser: a clean exit and a killed opener say nothing", () => {
    // Exit 0 is the ordinary case: an opener hands the URL to the browser and returns. `null` is
    // what a signal gives -- an opener the developer killed, or one that execs into the browser and
    // dies with it. Neither is the opener reporting a failure of its own, and a line on either
    // would land AFTER a sign-in that worked, which is worse than silence.
    const logged = [];
    const handlers = {};
    m.openBrowser({ cmd: "xdg-open", args: ["http://x/"] }, {
        log: (line) => logged.push(line),
        spawnProcess: () => ({ unref() {}, on(event, fn) { handlers[event] = fn; } }),
    });
    handlers.close(0);
    handlers.close(null);
    assert.deepEqual(logged, []);
});

test("withDeadline: a promise that wins leaves no timer behind", async (t) => {
    // The half that is easy to omit and impossible to see. A bare Promise.race keeps the loser's
    // timer pending, and node holds the process open until it fires -- so a sign-in that finished
    // in ten seconds would leave the CLI sitting for the rest of the ten minutes, which is exactly
    // the hang the deadline was added to end. Ticking past the deadline AFTER the win is what
    // distinguishes a cleared timer from one that merely has not fired yet.
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let fired = false;
    const value = await m.withDeadline(Promise.resolve("arrived"), m.LOGIN_WAIT_MS,
        () => { fired = true; return "late"; });
    assert.equal(value, "arrived");
    t.mock.timers.tick(m.LOGIN_WAIT_MS);
    assert.equal(fired, false, "the timer must have been cleared, not merely outrun");
});

test("withDeadline: the deadline wins when nothing ever arrives", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const raced = m.withDeadline(new Promise(() => {}), m.LOGIN_WAIT_MS, () => "deadline");
    t.mock.timers.tick(m.LOGIN_WAIT_MS);
    assert.equal(await raced, "deadline");
});

const GET = (url) => ({ url, method: "GET" });

test("handleCallback: a mismatched state decides nothing, and says so", () => {
    // It used to END the sign-in with "state_mismatch". Anything that can reach this port can send
    // that, so the abort was available to anybody and the message named a cause the developer did not
    // have. Ignored now -- and reported, so that an error Entra sends without echoing state is still
    // visible rather than a silent wait.
    const r = m.handleCallback(GET("/callback?code=abc&state=WRONG"), "RIGHT", "/callback");
    assert.equal(r.ignore, true);
    assert.match(r.notice, /state that is not this sign-in/);
    assert.equal(r.code, undefined, "and the code is not carried forward");
    assert.equal(r.error, undefined, "nor turned into a failure the caller would report");
});

test("handleCallback: an Entra error carries its AADSTS code into the result", () => {
    // Entra redirects here when the user is not in the assigned group or declines. Without this
    // the best `login` can say is "no code received", and the AADSTS string a developer can
    // actually act on never reaches them.
    const r = m.handleCallback(
        GET("/callback?error=access_denied&error_description=AADSTS50105%3A+not+assigned&state=RIGHT"),
        "RIGHT", "/callback");
    assert.match(r.error, /access_denied/);
    assert.match(r.description, /AADSTS50105/);
    assert.equal(r.code, undefined);
});

test("handleCallback: an error beats the code, but only once the state matches", () => {
    // Both halves of a reversed decision. The goal of the old order is kept: with a matching state an
    // error is reported before the code is looked at, so a developer reads their AADSTS code and not a
    // generic "no code received". What the old order also permitted is gone: an error whose state does
    // not match no longer ends anything, because that abort was available to any local process.
    const real = m.handleCallback(
        GET("/callback?error=access_denied&error_description=AADSTS50105&code=abc&state=RIGHT"),
        "RIGHT", "/callback");
    assert.match(real.error, /access_denied/);
    assert.match(real.description, /AADSTS50105/);

    const forged = m.handleCallback(
        GET("/callback?error=access_denied&error_description=AADSTS50105&state=WRONG"), "RIGHT", "/callback");
    assert.equal(forged.ignore, true);
    assert.equal(forged.error, undefined);
});

test("handleCallback: a request to another path is ignored, not treated as a failed sign-in", () => {
    // A browser fetching /favicon.ico for the "you can close this tab" page must not abort a
    // sign-in that is about to succeed.
    assert.equal(m.handleCallback(GET("/favicon.ico"), "RIGHT", "/callback").ignore, true);
    // What the path check actually decides, and the reason the line above does not pin it: a
    // NON-callback path carrying ANY of code, error or state. /favicon.ico is turned away by the
    // stray-request branch below whatever the path check does, so deleting the check left the whole
    // suite green. One of the three parameters is enough to disarm that branch; with a matching
    // state and a code, as here, the code is accepted from a path Entra never redirected to.
    assert.equal(m.handleCallback(GET("/evil?code=abc&state=RIGHT"), "RIGHT", "/callback").ignore, true);
});

test("handleCallback: a stray request on the callback path is ignored, not read as an attack", () => {
    // The callback moved to "/" to match the registered bare `http://localhost`, so the path no
    // longer filters anything out. A port scanner, or a browser asking for the root, would reach
    // the state check and end the wait with "state_mismatch" — aborting a sign-in that was about
    // to succeed, and telling the developer they are under attack. Under WSL the loopback relay
    // makes the port reachable from Windows, so this is not hypothetical.
    assert.equal(m.handleCallback(GET("/"), "RIGHT", "/").ignore, true);
    assert.equal(m.handleCallback(GET("/?probe=1"), "RIGHT", "/").ignore, true);
    // The "not read as an attack" half of the title, which nothing asserted: the verdict is the same
    // with the branch removed, because the state check also ignores. What changes is the DIAGNOSIS --
    // every browser request for "/" then prints the notice below, which names a state that is not
    // this sign-in's. Deleting the branch left the suite green; this is the line that reddens.
    assert.equal(m.handleCallback(GET("/"), "RIGHT", "/").notice, undefined,
        "a browser asking for the root is not something to warn the developer about");
    // A request that claims to be a callback but carries someone else's state is ignored WITH a
    // notice -- it neither ends the sign-in nor disappears.
    const wrongState = m.handleCallback(GET("/?code=abc&state=WRONG"), "RIGHT", "/");
    assert.equal(wrongState.ignore, true);
    assert.ok(wrongState.notice, "and it must not be silent");
    // And the real redirect still gets through on the root path — the case no other test covers,
    // because every one of them passes the old "/callback".
    assert.deepEqual(m.handleCallback(GET("/?code=abc&state=RIGHT"), "RIGHT", "/"), { code: "abc" });
});

test("handleCallback: an error carries every other parameter Entra sent, except a code", () => {
    // Measured: `access_denied` arrived with no error_description at all, and reporting two fixed
    // fields threw away whatever Entra had sent instead. `code` is excluded rather than assumed
    // absent — it has no business on an error redirect, and echoing one into a page or a log is the
    // one thing this must never do.
    const r = m.handleCallback(
        GET("/?error=access_denied&error_subcode=cancel&trace_id=t-1&code=SECRET&state=RIGHT"),
        "RIGHT", "/");
    assert.equal(r.error, "access_denied");
    assert.deepEqual(r.extras, [["error_subcode", "cancel"], ["trace_id", "t-1"], ["state", "RIGHT"]]);
    assert.ok(!JSON.stringify(r).includes("SECRET"), "a code must not survive into the error verdict");
});

test("the tab title names which sign-in the tab belongs to", () => {
    // A machine can hold more than one: entries are named per organisation, so two projects can each
    // have a tab open, and "vc-secrets" on both is the one thing that cannot tell them apart.
    const title = (html) => /<title>([^<]*)<\/title>/.exec(html)[1];
    assert.equal(title(m.closeTabPage("ado-oauth-org")), "Signed in - ado-oauth-org");
    assert.equal(title(m.failedPage({ error: "access_denied", description: "", extras: [] }, "ado-oauth-org")),
        "Sign-in failed - ado-oauth-org");
    // Without a name it still says what happened rather than the tool's own name.
    assert.equal(title(m.closeTabPage()), "Signed in");
    assert.equal(title(m.failedPage({ error: "x", description: "", extras: [] })), "Sign-in failed");
    // And the failure title must not read as a success at a glance, which is where a tab title is read.
    assert.doesNotMatch(title(m.failedPage({ error: "x", description: "", extras: [] }, "org")), /signed in/i);
    // The name is escaped although it is validated `[a-z0-9-]+` at load, because the page must not
    // depend on a check made somewhere else -- and nothing asserted that until now: removing
    // escapeHtml from BOTH titles left the whole suite green, since every name above is one that
    // escaping does not change. Asserted on the raw HTML rather than through `title()`: its `[^<]*`
    // cannot span an unescaped bracket, so on a regression the match fails outright and the helper
    // throws a TypeError on `exec(...)[1]` -- a failure that names nothing about escaping.
    const hostile = "a<script>&\"x";
    assert.match(m.closeTabPage(hostile), /<title>Signed in - a&lt;script&gt;&amp;&quot;x<\/title>/);
    assert.match(m.failedPage({ error: "x", description: "", extras: [] }, hostile),
        /<title>Sign-in failed - a&lt;script&gt;&amp;&quot;x<\/title>/);
});

test("failedPage: renders the reason, and escapes it because the sender chose it", () => {
    // Anything that can reach the loopback port during a sign-in picks these values, so an
    // unescaped one would execute as script on this page's own origin.
    const html = m.failedPage({ error: "bad<x>", description: 'a "quoted" & odd one', extras: [["k", "<v>"]] });
    assert.ok(html.includes("bad&lt;x&gt;"), html);
    assert.ok(html.includes("&quot;quoted&quot;"), html);
    assert.ok(html.includes("&amp; odd"), html);
    assert.ok(html.includes("&lt;v&gt;"), html);
    assert.ok(!/<x>|<v>/.test(html), "no raw angle brackets from the query may reach the page");
});

test("handleCallback: the parameter list a redirect can carry is bounded", () => {
    // Whatever can reach this port can send thousands. Bounding it in the verdict means the page and
    // the terminal message inherit one limit instead of each needing its own.
    const many = Array.from({ length: 100 }, (unused, i) => `p${i}=v${i}`).join("&");
    const r = m.handleCallback(GET(`/?error=access_denied&state=RIGHT&${many}`), "RIGHT", "/");
    assert.equal(r.extras.length, m.MAX_ERROR_PARAMS);
});

test("failedPage: names the usual causes, because a bare access_denied is not actionable", () => {
    // The first cause is the measured one: opening the printed URL in a browser that carries no work
    // account returns a bare `access_denied`, and its own page asks for an account to be added to the
    // browser profile. That is the likely case precisely when the URL is printed, because the
    // developer then opens it somewhere other than their usual browser.
    const html = m.failedPage({ error: "access_denied", description: "", extras: [] });
    assert.match(html, /no work\s+account/i);
    assert.match(html, /declined consent/i);
    assert.match(html, /not assigned/i);
    assert.doesNotMatch(html, /signed in/i, "still must not read as a success at a glance");
});

test("handleCallback: a non-GET request is ignored", () => {
    assert.equal(m.handleCallback({ url: "/callback?code=abc&state=RIGHT", method: "POST" },
        "RIGHT", "/callback").ignore, true);
});

test("handleCallback: the right path with neither code nor error is an error, not a wait", () => {
    assert.equal(m.handleCallback(GET("/callback?state=RIGHT"), "RIGHT", "/callback").error, "no_code");
});

socketTest("listenForCallback: binds loopback only, so the code cannot arrive from the network", async () => {
    // The authorization code travels in this request. A listener on 0.0.0.0 would accept it from
    // anywhere routable, and nothing about the successful case would look different — which is
    // why the one-word change from 127.0.0.1 needs an assertion rather than only a comment.
    const server = await m.listenForCallback("STATE");
    try {
        const addresses = Object.values(os.networkInterfaces()).flat()
            .filter((i) => i.family === "IPv4" && !i.internal).map((i) => i.address);
        if (addresses.length === 0) {
            return;   // nothing routable to probe from; the negative below would prove nothing
        }
        const refused = await new Promise((resolve) => {
            const probe = net.connect({ host: addresses[0], port: server.port });
            probe.once("connect", () => { probe.destroy(); resolve(false); });
            probe.once("error", () => resolve(true));
        });
        assert.equal(refused, true, `the listener answered on ${addresses[0]}, not just loopback`);
    } finally {
        await server.close();
    }
});

socketTest("listenForCallback: a refused sign-in does not tell the browser it succeeded", async () => {
    // The browser is where the developer is looking. "Signed in." after Entra refused them sends
    // them away from the terminal holding the AADSTS code — defeating the error-before-state
    // ordering that exists precisely so that code reaches them.
    const server = await m.listenForCallback("STATE");
    try {
        const waiting = server.next();
        const res = await fetch(`http://127.0.0.1:${server.port}${m.REDIRECT_PATH}`
            + "?error=access_denied&error_description=AADSTS50105&state=STATE");
        assert.equal(res.status, 400);
        const body = await res.text();
        assert.match(body, /failed/i);
        assert.doesNotMatch(body, /signed in/i, "the page must not claim a sign-in that did not happen");
        assert.equal((await waiting).error, "access_denied");
    } finally {
        await server.close();
    }
});

socketTest("listenForCallback: a forged error is reported and waited past, not obeyed", async () => {
    // The wiring, not the verdict: handleCallback's decision is unit-tested above, and what this proves
    // is that an ignore-with-notice really keeps the listener waiting AND really reaches the developer.
    // Anything on this machine can send that request -- under WSL mirrored, anything on the Windows
    // side too -- so obeying it would hand every local process an abort button on someone's sign-in.
    const logged = [];
    const server = await m.listenForCallback("STATE", { log: (line) => logged.push(line) });
    try {
        const waiting = server.next();
        const forged = await fetch(`http://127.0.0.1:${server.port}${m.REDIRECT_PATH}?error=access_denied`);
        assert.equal(forged.status, 404, "a request that decides nothing must not be answered as a callback");
        assert.match(logged.join(""), /state that is not this sign-in/);
        // And the real one still lands, which is the half that proves the listener was never settled.
        const real = await fetch(`http://127.0.0.1:${server.port}${m.REDIRECT_PATH}?code=abc&state=STATE`);
        assert.equal(real.status, 200);
        assert.deepEqual(await waiting, { code: "abc" });
    } finally {
        await server.close();
    }
});

socketTest("listenForCallback: a stray request is answered and waited past, the callback ends the wait", async () => {
    // handleCallback's verdicts are unit-tested; what this proves is the WIRING — that an
    // `ignore` verdict really does keep the listener waiting rather than resolving with it. A
    // browser fetching /favicon.ico for the close-this-tab page would otherwise end the sign-in
    // with no code, and the failure would look like Entra never redirected.
    const server = await m.listenForCallback("STATE");
    try {
        const waiting = server.next();
        const stray = await fetch(`http://127.0.0.1:${server.port}/favicon.ico`);
        assert.equal(stray.status, 404);
        const settled = await Promise.race([waiting, new Promise((r) => setTimeout(() => r("still-waiting"), 50))]);
        assert.equal(settled, "still-waiting", "a 404 must not end the sign-in");

        const ok = await fetch(`http://127.0.0.1:${server.port}${m.REDIRECT_PATH}?code=abc&state=STATE`);
        assert.equal(ok.status, 200);
        assert.match(await ok.text(), /close this tab/i);
        assert.deepEqual(await waiting, { code: "abc" });
    } finally {
        await server.close();
    }
});

// A browser opens speculative connections to the redirect URI and can leave one carrying no request
// at all. `server.close()` severs an IDLE connection but not that one -- a connection that never
// completed a request is not idle, so close() waits on it for as long as the browser holds it, and
// cmdLogin's `finally` never returns although the tokens are already stored. Measured on Windows: the
// verb hung past 88 s with one accepted socket alive, and closing the browser tab did not release it.
//
// The connection is opened deliberately here rather than driven through a browser, because whether a
// browser leaves such a socket is the browser's business: on Linux it does not, and a test that waited
// for one would be green on the platform where the defect is invisible.
//
// Named for the rule rather than for listenForCallback: createChannel already severs its sockets
// before closing and says why in its own comment, so this is the second site of one rule, and a third
// listener must be in scope without anyone remembering to widen a test.
socketTest("a teardown does not wait on a peer that only connected -- the sign-in listener", async () => {
    const server = await m.listenForCallback("STATE");
    const arrived = server.next();

    // TWO lingering peers, and allowHalfOpen on each. Both details are what let this test fail for
    // the right reason, and each was measured: with one peer, a sever loop that stops after its first
    // element passes and the production hang returns; without allowHalfOpen, the client closes on FIN
    // so a teardown weakened from destroy() to end() also passes. Plural is what the field produced
    // too -- the Windows capture that started this showed two accepted sockets.
    const lingering = [];
    for (let i = 0; i < 2; i++) {
        const sock = net.connect({ port: server.port, host: "127.0.0.1", allowHalfOpen: true });
        await new Promise((resolve) => sock.once("connect", resolve));
        lingering.push(sock);
    }

    const callback = net.connect(server.port, "127.0.0.1");
    await new Promise((resolve) => callback.once("connect", resolve));
    callback.write(`GET ${m.REDIRECT_PATH}?code=abc&state=STATE HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`);
    assert.deepEqual(await arrived, { code: "abc" });

    try {
        const outcome = await Promise.race([
            server.close().then(() => "closed"),
            new Promise((resolve) => setTimeout(() => resolve("waited on the preconnect"), 1000)),
        ]);
        assert.equal(outcome, "closed", "close() must not wait on a connection that sent no request");
    } finally {
        // In a finally, not after the race: an assertion above throws on a wiring regression and
        // would otherwise leak this listener and its sockets into the rest of the run.
        for (const sock of lingering) {
            sock.destroy();
        }
        callback.destroy();
    }
});

const LOGIN_KEYS = m.oauthEntryKeys("azure-mcp", LOGIN_DECL, LOGIN_CFG);

// UNACKNOWLEDGED_CFG differs from LOGIN_CFG in exactly one property, so a test driven by it fails
// for the reason its name gives. USER_CFG differs in two -- the declaration's home AND the absent
// registrations block -- and has to: the whole claim is that the first makes the second irrelevant.
const UNACKNOWLEDGED_CFG = { ...LOGIN_CFG, registrations: {} };

const USER_DECL = { ...DECL_IDENTITY, kind: "oauth", scope: "user", home: "user", declaredName: "azure-mcp" };

const USER_CFG = { oauth: { "azure-mcp": USER_DECL }, projectId: "login-p1" };

const USER_KEYS = m.oauthEntryKeys("azure-mcp", USER_DECL, USER_CFG);

function cmdLoginSeams() {
    return seamsOf(m.cmdLogin.toString());
}

// One per verb, because `seamsOf` takes a function's text and nothing generalises across the two.
// cmdLogout's own comment used to claim cmdLoginSeams covered it; it does not, and the whole suite
// stayed green with a bogus seam in cmdLogout's parameter list.
function cmdLogoutSeams() {
    return seamsOf(m.cmdLogout.toString());
}

// ---------------------------------------------------------------------------------------------
// cmdLogin — the port of the interactive sign-in verb. Ported from the upstream launcher's
// suite (mcpw.test.js): `m.McpwError` becomes `m.VcSecretsError`, and every "mcpw"/"mcpw login" in
// a user-facing string becomes "vc-secrets"/"vc-secrets login". `cache.entryNames(serverName)`
// becomes `oauthEntryKeys(serverName, decl, cfg)` — both return { refresh, access }, but the
// values here are the full three-segment keystore keys keyFor produces, not the source's bare
// entry names, so an assertion on a written/removed name reads it off LOGIN_KEYS below instead of
// a literal "oauth-azure-mcp-*" string.
//
// cmdLogin refuses a project-scope entry whose app registration the user file has not acknowledged,
// so every test below runs on an acknowledged one and LOGIN_CFG carries the block. It grants
// nothing: the verb's gate reads whether the registration is acknowledged at all, and WHICH
// launchable may then consume the token is resolveEnvEntries' decision, not this verb's — a block
// with contents would imply this fixture pins a relation it does not.
// ---------------------------------------------------------------------------------------------

test("cmdLogin: a hostile parameter reaches the terminal message declawed", async () => {
    const { deps } = loginDeps({
        listen: async () => ({ port: 1, next: async () => ({
            error: "access_denied", description: "", extras: [["subcode", `x\u001b[2Jy`]],
        }), close: async () => {} }),
    });
    await assert.rejects(() => m.cmdLogin("azure-mcp", LOGIN_CFG, deps), (e) => {
        assert.ok(!/[\u0000-\u001f]/.test(e.message), `raw control byte in: ${JSON.stringify(e.message)}`);
        assert.match(e.message, /subcode=x\?\[2Jy/);

        return true;
    });
});

test("loginDeps: every cmdLogin seam that reaches outside this process is injected", () => {
    const seams = cmdLoginSeams();
    // A parser that quietly finds nothing would make this test pass forever. Pin the whole list,
    // so adding a seam fails here and forces a decision about whether it needs injecting.
    assert.deepEqual(seams, ["listen", "open", "browser", "exchange", "writeEntry", "removeEntry",
        "randomState", "log", "backend", "acquireLock", "now", "sleep", "waitMs", "oversize", "trustState"],
        "the seam list changed, or the parse broke — both need a human");
    // These four stay inside the process: a pure command builder, the clock, a timer, and a plain
    // number of milliseconds. `waitMs` is injected by the tests that drive the deadline, but it
    // needs no fixture default — left alone it is ten minutes, and no test waits that long: every
    // one either answers the callback or injects its own `waitMs`.
    const mayDefault = ["browser", "now", "sleep", "waitMs"];
    const injected = definedSeams(loginDeps().deps);
    assert.deepEqual(seams.filter((s) => !mayDefault.includes(s) && !injected.includes(s)), [],
        "each of these would fall through to a real implementation in every login test");
});

test("cmdLogout: every seam this verb declares is pinned, so a new one forces a decision", () => {
    // The LIST only, where cmdLogin's guard above also checks a fixture injects each seam: this
    // verb's tests build their deps inline, as the source's do, so there is no single fixture to
    // check them against. The list is the half that carries the weight anyway -- it is what makes
    // a NEW outside-process seam fail here instead of falling through to a real implementation in
    // every test that omits it.
    //
    // `backend` is declared but unreachable in practice while `deleteEntry` is injected, since it
    // only feeds `deleteEntryIo(backend)`. It is pinned all the same: whether that stays true is
    // exactly the decision this test exists to force.
    assert.deepEqual(cmdLogoutSeams(),
        ["deleteEntry", "backend", "acquireLock", "now", "sleep", "log", "trustState"],
        "the seam list changed, or the parse broke — both need a human");
});

test("cmdLogin: the refresh entry is written before the access entry", async () => {
    // Entra invalidates the old refresh token the moment it issues a new one, so persisting the
    // new one is the only irreversible step in the design. Writing the access entry first would
    // widen the window in which a crash leaves no way back in except an interactive login.
    const { deps, written } = loginDeps();
    await m.cmdLogin("azure-mcp", LOGIN_CFG, deps);
    assert.deepEqual(written.map(([name]) => name), [LOGIN_KEYS.refresh, LOGIN_KEYS.access]);
});

test("cmdLogin: the refresh entry carries the new refresh token under the declaration's identity", async () => {
    // The two names and their order were pinned; the CONTENTS were not. Every field here is one a
    // later read compares, so a refresh entry holding the access token, or the tenant and client
    // transposed, stores a session ensureFreshToken rejects on identity at the next launch --
    // sending the developer back to `login` with nothing naming why.
    const { deps, written } = loginDeps();
    await m.cmdLogin("azure-mcp", LOGIN_CFG, deps);
    assert.deepEqual(cache.parseEntry(written.find(([name]) => name === LOGIN_KEYS.refresh)[1]),
        { schema: 1, refreshToken: "new-rt", tenantId: LOGIN_DECL.tenantId,
            clientId: LOGIN_DECL.clientId, scopes: LOGIN_DECL.scopes });
});

test("cmdLogin: the access entry carries the token and the timing the exchange returned", async () => {
    // The same gap on the other write, and it fails differently: the three timing fields decide
    // when a renewal fires, so a transposition here is a session that renews at the wrong moment
    // rather than one that is refused outright.
    const { deps, written } = loginDeps();
    await m.cmdLogin("azure-mcp", LOGIN_CFG, deps);
    assert.deepEqual(cache.parseEntry(written.find(([name]) => name === LOGIN_KEYS.access)[1]),
        { schema: 1, accessToken: "at", expiresAt: 1_703_600_000, obtainedAt: 1_700_000_000,
            lifetimeMs: 3600_000, uptimeAtIssue: 1000 });
});

test("cmdLogin: a failed refresh write is fatal, and the access entry is not written after it", async () => {
    // The access entry would then describe a session whose refresh token was never stored — a
    // login that works for an hour and cannot be renewed.
    const { deps, written } = loginDeps({
        writeEntry: async (name) => {
            if (name.endsWith("-refresh")) { throw new m.VcSecretsError("keystore full"); }
            written.push([name]);
        },
    });
    await assert.rejects(() => m.cmdLogin("azure-mcp", LOGIN_CFG, deps), /keystore full/);
    assert.deepEqual(written, [], "nothing may be written once the refresh write failed");
});

test("cmdLogin: a failed ACCESS write is not fatal — losing it costs one exchange", async () => {
    const { deps, logged } = loginDeps({
        writeEntry: async (name) => { if (name.endsWith("-access")) { throw new m.VcSecretsError("nope"); } },
    });
    await m.cmdLogin("azure-mcp", LOGIN_CFG, deps);
    assert.ok(logged.some((l) => /access/i.test(l)), `the degraded write must be reported: ${logged.join("")}`);
});

test("cmdLogin: an access entry too large for the keystore is recorded, not just logged", async () => {
    // On Credential Manager this failure is DETERMINISTIC: the value is over the ceiling, so the
    // identical write fails identically at every launch and every renewal, forever. It printed one
    // line to fd 2 and was forgotten, and the next tick printed it again -- so the machine paid a
    // token exchange, and a refresh-token rotation with it, every five minutes with nothing
    // anywhere saying the condition was permanent. The marker is what lets doctor say it.
    const { deps, marked, logged } = loginDeps({
        writeEntry: async (name) => {
            if (name.endsWith("-access")) {
                throw Object.assign(new m.VcSecretsError("too large for Credential Manager"), { toolExitCode: 4 });
            }
        },
        backend: "wcm",
    });
    await m.cmdLogin("azure-mcp", LOGIN_CFG, deps);
    assert.equal(marked.length, 1, `exactly one marker: ${JSON.stringify(marked)}`);
    const [key, info] = marked[0];
    assert.equal(key, LOGIN_KEYS.access);
    assert.equal(info.backend, "wcm");
    assert.equal(info.limit, m.WCM_BLOB_LIMIT);
    // Measured from what we tried to write, not scraped from the backend's message -- the number is
    // in hand here, and parsing a string for it would be a second way to be wrong about it.
    assert.equal(info.bytes, Buffer.byteLength(cache.serializeAccess({ accessToken: "at",
        expiresAt: 1_703_600_000, obtainedAt: 1_700_000_000, lifetimeMs: 3600_000, uptimeAtIssue: 1000 })));
    // "signed in, but" included on purpose: without it the same sentence reads as a failed login,
    // at the moment a developer is most likely to re-run `login` and rotate away the token they
    // just got. The prefix is a parameter of the shared write tail, so it is droppable in one edit.
    assert.ok(logged.some((l) => /signed in, but the access entry could not be stored/.test(l)),
        "and the login still reports it, without reading as a failed sign-in");
});

test("cmdLogin: an access write that failed for any other reason leaves no marker", async () => {
    // The distinction the whole file rests on. A transient failure -- a locked store, a timeout --
    // will succeed on the next attempt, and a marker left for one would have doctor report a
    // permanent condition that the very next launch silently disproves. Recording unconditionally
    // is the easy mistake and it looks identical from a green run.
    const { deps, marked } = loginDeps({
        writeEntry: async (name) => {
            if (name.endsWith("-access")) { throw new m.VcSecretsError("the keystore was busy"); }
        },
        backend: "wcm",
    });
    await m.cmdLogin("azure-mcp", LOGIN_CFG, deps);
    assert.deepEqual(marked, [], "only a deterministic oversize failure may be recorded");
});

test("cmdLogin: a successful access write clears any marker for that entry", async () => {
    // The load-bearing half: the marker is CURRENT STATE, not an event record. An entry that
    // shrank back under the ceiling -- a group membership dropped, a narrower scope list -- must
    // stop being reported, or doctor goes on naming a problem that is fixed.
    const { deps, cleared } = loginDeps();
    await m.cmdLogin("azure-mcp", LOGIN_CFG, deps);
    assert.deepEqual(cleared, [LOGIN_KEYS.access]);
});

test("cmdLogin: the previous access entry is deleted before the new refresh entry is written", async () => {
    // An access entry carries no identity of its own -- serializeAccess stores none -- so cacheStatus
    // checks the declaration against the REFRESH entry and then serves whatever access token sits
    // beside it. Sign in as a different account, store the new refresh token, then fail to store the
    // new access token, and the previous account's token is still there and still inside its
    // lifetime: the next read returns it and the server runs as that principal. Deleting FIRST makes
    // the worst case an access entry that is missing, which costs one exchange.
    //
    // Removals and writes share one array because the ordering BETWEEN them is the entire fix; two
    // separate logs would each be green in the order that reintroduces the hole.
    const events = [];
    const { deps } = loginDeps({
        writeEntry: async (name) => { events.push(`write ${name}`); },
        removeEntry: async (name) => { events.push(`remove ${name}`); },
    });
    await m.cmdLogin("azure-mcp", LOGIN_CFG, deps);
    assert.deepEqual(events, [`remove ${LOGIN_KEYS.access}`, `write ${LOGIN_KEYS.refresh}`,
        `write ${LOGIN_KEYS.access}`]);
});

test("cmdLogin: a first sign-in, with no access entry to delete, still stores both entries", async () => {
    // Exit 3 is how every backend reports "no such entry" -- gpg maps ENOENT to it, keychain maps
    // 44 -- and on a first sign-in there is nothing to delete, so this is the ordinary path and not
    // an edge case. Without the exemption the pre-delete would refuse every first sign-in, and only
    // after the authorization code had been spent, which is the one failure a developer cannot retry.
    const { deps, written } = loginDeps({
        removeEntry: async () => {
            throw Object.assign(new m.VcSecretsError("no stored entry"), { toolExitCode: 3 });
        },
    });
    await m.cmdLogin("azure-mcp", LOGIN_CFG, deps);
    assert.deepEqual(written.map(([name]) => name), [LOGIN_KEYS.refresh, LOGIN_KEYS.access]);
});

test("cmdLogin: a pre-delete failing for any other reason stores nothing and clears both entries", async () => {
    // The delete is what stops the previous account's token from being served, so a failure that is
    // not "there was no entry" leaves exactly the state it exists to prevent. Swallowing it would
    // store the new refresh token beside the OLD access token -- the principal confusion, reached
    // through the one path that looks like a successful sign-in. Clearing both instead makes the
    // state unambiguously signed-out; the cost is one interactive sign-in, and it is the cheaper
    // side of that trade.
    const removed = [];
    let calls = 0;
    const { deps, written } = loginDeps({
        removeEntry: async (name) => {
            removed.push(name);
            if (++calls === 1) { throw new m.VcSecretsError("keystore locked"); }
        },
    });
    await assert.rejects(() => m.cmdLogin("azure-mcp", LOGIN_CFG, deps), /keystore locked/);
    assert.deepEqual(written, [], "nothing may be stored once the stale access entry could not be removed");
    assert.deepEqual(removed, [LOGIN_KEYS.access, LOGIN_KEYS.access, LOGIN_KEYS.refresh]);
});

test("cmdLogin: the redirect_uri is the registered localhost URI, with the bound port and no path", async () => {
    // Three independent failure modes in one string, and none of them fails locally.
    //
    // The port must come from the listener, or Entra redirects the browser to a port nothing is
    // listening on and the sign-in hangs with no error. The host must be `localhost` and the path
    // must be absent, because Entra matches this string against the app registration — bare
    // `http://localhost` under Mobile and desktop applications — and ignores the port only for
    // that host. Either mismatch is AADSTS50011.
    //
    // So if a change to the launcher makes this fail (the URI is composed in cmdLogin, in
    // lib/oauth-login.mjs), fix the launcher -- do not update the expectation. This string is not a
    // mirror of the code; it is what an administrator configured in Entra.
    let seenUri = null;
    const { deps } = loginDeps({
        listen: async () => ({ port: 45678, next: async () => ({ code: "c" }), close: async () => {} }),
        exchange: async (tenantId, body) => {
            seenUri = new URLSearchParams(body).get("redirect_uri");

            return { refreshToken: "rt", accessToken: "at", expiresAt: 1, obtainedAt: 0,
                lifetimeMs: 3600_000, uptimeAtIssue: 1 };
        },
    });
    await m.cmdLogin("azure-mcp", LOGIN_CFG, deps);
    assert.equal(seenUri, "http://localhost:45678/");
});

test("cmdLogin: a callback error aborts before any exchange and names the Entra code", async () => {
    let exchanged = false;
    const { deps } = loginDeps({
        listen: async () => ({ port: 1, close: async () => {},
            next: async () => ({ error: "access_denied", description: "AADSTS50105: not assigned" }) }),
        exchange: async () => { exchanged = true; return {}; },
    });
    await assert.rejects(() => m.cmdLogin("azure-mcp", LOGIN_CFG, deps), /AADSTS50105/);
    assert.equal(exchanged, false, "a refused sign-in must not reach the token endpoint");
});

test("cmdLogin: the listener is closed even when the sign-in fails", async () => {
    // An abandoned listener holds the port for the life of the process, so the next attempt
    // binds a different one — and on a failure path nobody is watching to notice.
    let closed = false;
    const { deps } = loginDeps({
        listen: async () => ({ port: 1, close: async () => { closed = true; },
            next: async () => ({ error: "state_mismatch" }) }),
    });
    await assert.rejects(() => m.cmdLogin("azure-mcp", LOGIN_CFG, deps));
    assert.equal(closed, true);
});

test("cmdLogin: with no browser opener the URL is printed and the sign-in still proceeds", async () => {
    const { deps, opened, logged, written } = loginDeps({ browser: () => null });
    await m.cmdLogin("azure-mcp", LOGIN_CFG, deps);
    assert.deepEqual(opened, [], "nothing to open");
    assert.ok(logged.some((l) => l.includes("https://login.microsoftonline.com/")),
        `the URL must reach the operator: ${logged.join("")}`);
    assert.equal(written.length, 2, "and the sign-in completes normally");
});

test("cmdLogin: the URL is printed on the browser branch too, since that is where the advice points", async () => {
    // Three messages point the developer at the "URL above" -- openBrowser's spawn failure,
    // openBrowser's non-zero exit, and the deadline -- and every one of them fires on a path where
    // a browser WAS opened. While the URL was printed only on the branch with no opener, all three
    // named something the developer had never been shown.
    const { deps, opened, logged } = loginDeps({ browser: () => ({ cmd: "xdg-open", args: ["http://x/"] }) });
    await m.cmdLogin("azure-mcp", LOGIN_CFG, deps);
    assert.equal(opened.length, 1, "this fixture must take the branch that opens a browser");
    assert.ok(logged.some((l) => l.includes("https://login.microsoftonline.com/")),
        `the URL must be printed even when a browser opens: ${logged.join("")}`);
});

test("cmdLogin: a callback that never arrives ends on the deadline instead of waiting forever", async () => {
    // There was no timeout anywhere in the sign-in, and `next()` resolves only when the callback
    // arrives. Every way a browser fails to reach it is silent, so the command sat on a cursor with
    // no reason given and no way out but Ctrl-C.
    //
    // The listener must still be closed: it holds its port for the life of the process, and on this
    // path there is nobody watching to notice.
    let closed = false;
    const { deps } = loginDeps({
        waitMs: 5,
        listen: async () => ({ port: 51234, next: () => new Promise(() => {}),
            close: async () => { closed = true; } }),
    });
    await assert.rejects(() => m.cmdLogin("azure-mcp", LOGIN_CFG, deps),
        (e) => /timed_out/.test(e.message) && /URL above/.test(e.message));
    assert.equal(closed, true, "the listener must be closed on the deadline path");
});

test("cmdLogin: the verifier never leaves the process, only its digest does", async () => {
    // PKCE is worthless if the verifier travels with the authorize request. The code grant is
    // the only place it may appear.
    let authorizeUrl = null;
    const { deps } = loginDeps({
        browser: (platform, env, url) => { authorizeUrl = url; return null; },
        exchange: async (tenantId, body) => {
            const verifier = new URLSearchParams(body).get("code_verifier");
            assert.ok(verifier, "the code grant must carry the verifier");
            assert.ok(!authorizeUrl.includes(verifier), "but the authorize URL must not");
            // "only its digest does" was the unasserted half: dropping `challenge` from cmdLogin's
            // buildAuthorizeUrl call emits `code_challenge=undefined`, which the two lines above
            // accept happily -- the sign-in then fails at Entra, not here.
            const challenge = new URL(authorizeUrl).searchParams.get("code_challenge");
            assert.equal(challenge, crypto.createHash("sha256").update(verifier).digest("base64url"),
                "the digest must travel, and be the S256 digest of THIS verifier");

            return { refreshToken: "rt", accessToken: "at", expiresAt: 1, obtainedAt: 0,
                lifetimeMs: 3600_000, uptimeAtIssue: 1 };
        },
    });
    await m.cmdLogin("azure-mcp", LOGIN_CFG, deps);
});

test("cmdLogin: macOS is a supported platform, not a refusal", async () => {
    // Every other verb already works there — detectLocalBackend returns keychain on darwin, the
    // read path is non-interactive, and the lock has its own darwin branch. login was briefly the
    // one feature that dropped the platform, which is a contradiction rather than a limitation.
    const { deps, written } = loginDeps({ backend: "keychain" });
    await m.cmdLogin("azure-mcp", LOGIN_CFG, deps);
    assert.deepEqual(written.map(([name]) => name), [LOGIN_KEYS.refresh, LOGIN_KEYS.access]);
});

test("cmdLogin: a backend with no keystore is refused before a code is spent", async () => {
    // The check that survives: whatever the reason, discovering it after the exchange leaves the
    // developer signed in with nothing stored and a single-use code already burned.
    let bound = false;
    const { deps } = loginDeps({
        backend: "nonesuch",
        listen: async () => { bound = true; return { port: 1, next: async () => ({ code: "c" }), close: async () => {} }; },
    });
    await assert.rejects(() => m.cmdLogin("azure-mcp", LOGIN_CFG, deps), /nonesuch/);
    assert.equal(bound, false, "nothing may be opened or bound when the token cannot be stored");
});

test("cmdLogin: a failed refresh write also clears the stale entries a previous login left", async () => {
    // Within one login the order already prevents access-without-refresh. The gap is ACROSS
    // invocations: Entra invalidated the old refresh token the moment it issued this one, so the
    // previous login's entries are now lies — the old access token keeps working until it
    // expires and then the session dies with nothing to renew from. Clearing both makes the
    // state unambiguously signed-out instead of quietly doomed.
    const removed = [];
    const { deps } = loginDeps({
        writeEntry: async (name) => { if (name.endsWith("-refresh")) { throw new m.VcSecretsError("keystore full"); } },
        removeEntry: async (n) => { removed.push(n); },
    });
    await assert.rejects(() => m.cmdLogin("azure-mcp", LOGIN_CFG, deps), /keystore full/);
    // The access entry appears TWICE, and the sequence is asserted rather than the set: the first
    // removal is the pre-delete this login always performs, the second is this cleanup. A set would
    // stay green if the pre-delete disappeared, which is the regression worth catching here.
    assert.deepEqual(removed, [LOGIN_KEYS.access, LOGIN_KEYS.access, LOGIN_KEYS.refresh]);
});

test("cmdLogin: a cleanup failure does not replace the write error the developer needs", async () => {
    // The first delete must SUCCEED for this test to reach its subject. Both the pre-delete and the
    // cleanup go through this one seam, so a double that throws unconditionally fails the login
    // before the refresh write is ever attempted -- and the assertion below would then be pinning
    // the pre-delete's error, under a name that promises the write's.
    let calls = 0;
    const { deps } = loginDeps({
        writeEntry: async (name) => { if (name.endsWith("-refresh")) { throw new m.VcSecretsError("keystore full"); } },
        removeEntry: async () => { if (++calls > 1) { throw new m.VcSecretsError("delete failed too"); } },
    });
    await assert.rejects(() => m.cmdLogin("azure-mcp", LOGIN_CFG, deps), /keystore full/);
});

test("cmdLogin: an undeclared server is refused before a port is bound", async () => {
    let bound = false;
    const { deps } = loginDeps({ listen: async () => { bound = true; return { port: 1, next: async () => ({}), close: async () => {} }; } });
    await assert.rejects(() => m.cmdLogin("ghost", LOGIN_CFG, deps), /ghost/);
    assert.equal(bound, false);
});

test("cmdLogin: both writes happen under the lock, and it is taken AFTER the sign-in, not across it", async () => {
    // Two claims in one order, because they trade against each other. Under the lock: a renewal
    // finishing between the exchange and these writes would otherwise overwrite the token just
    // issued with the rotated one from the chain Entra killed by issuing it. After the sign-in:
    // the same mutex serialises every renewal on this machine, and a browser waits on a human.
    const order = [];
    const { deps } = loginDeps({
        listen: async () => ({ port: 1, next: async () => { order.push("browser"); return { code: "c" }; },
            close: async () => {} }),
        exchange: async () => { order.push("exchange"); return { refreshToken: "rt", accessToken: "at" }; },
        writeEntry: async (name) => { order.push(name.endsWith("refresh") ? "write-refresh" : "write-access"); },
        acquireLock: async () => { order.push("lock"); return { release: async () => order.push("release") }; },
    });
    await m.cmdLogin("azure-mcp", LOGIN_CFG, deps);
    assert.deepEqual(order, ["browser", "exchange", "lock", "write-refresh", "write-access", "release"]);
});

test("cmdLogin: a renewal that will not release still stores the token, and names what may undo it", async () => {
    // The asymmetry the shared helper deliberately does not decide. By this point the
    // authorization code is spent and single-use: refusing would leave the developer signed in at
    // Entra with nothing on disk, and a second attempt cannot reuse the code.
    let ms = 0;
    const { deps, written, logged } = loginDeps({
        acquireLock: async () => cache.HELD_BY_OTHER,
        now: () => (ms += 10_000),
        sleep: async () => {},
    });
    await m.cmdLogin("azure-mcp", LOGIN_CFG, deps);
    assert.equal(written.length, 2, "a spent code must still end up stored");
    // A wedged holder that later wakes will overwrite this write, and the developer would otherwise
    // meet that only as an unexplained request to sign in again.
    assert.match(logged.join(""), /still holding the lock/, "the hazard has to be named where it is taken");
    assert.match(logged.join(""), /run this again/, "together with what to do about it");
    // The entry name, not a bare verb: `logout` is argument-required, so advice without it sends a
    // developer to a usage line whose `[name]` reads as optional -- and the window this advisory
    // exists to close stays open while they decide the advice was stale.
    assert.match(logged.join(""), /"vc-secrets logout azure-mcp"/, "and a remedy the CLI accepts");
});

test("cmdLogin: no lock failure costs the developer a spent authorization code", async () => {
    // Every way of not getting the lock, including the ones acquireTokenLock rethrows rather than
    // classifies. Past the exchange the code is single-use and gone: an exception here would store
    // nothing, clear nothing, and leave the previous login's entries lying — and adding the lock is
    // what made that step able to fail at all, so refusing would be a regression, not a discovery.
    for (const boom of [Object.assign(new Error("refused"), { code: "EPERM" }),
        Object.assign(new Error("too many open files"), { code: "EMFILE" }),
        new TypeError("acquireLock is not a function")]) {
        const { deps, written, logged } = loginDeps({ acquireLock: async () => { throw boom; } });
        await m.cmdLogin("azure-mcp", LOGIN_CFG, deps);
        assert.equal(written.length, 2, `${boom.code ?? boom.name} lost the sign-in`);
        assert.match(logged.join(""), /NOT serialised/, "and the developer is told what was not promised");
        // Without this, a wiring TypeError and an ordinary sandbox EPERM print the same line, and
        // the first is a bug while the second is the environment working as measured.
        assert.match(logged.join(""), new RegExp(boom.code ?? boom.name),
            `the warning must name ${boom.code ?? boom.name}`);
    }
});

test("cmdLogin: a sandbox refusal and a fault nothing classified do not print the same diagnosis", async () => {
    // acquireTokenLock treats EPERM/EACCES as "unbindable" -- one measured sandbox condition -- and
    // RETHROWS everything it will not classify, its own comment naming a wide catch as the mistake.
    // cmdLogin's catch then made that exact mistake one level up: a TypeError from broken wiring
    // printed "the token lock could not be taken", and the reader went to check a sandbox that was
    // perfectly fine. "cmdLogin: no lock failure costs the developer a spent authorization code"
    // pins that both still store the token and both name the code; this one pins that they are not
    // the same sentence, which is the part that was wrong.
    const sentences = [];
    for (const boom of [Object.assign(new Error("refused"), { code: "EPERM" }),
        new TypeError("acquireLock is not a function")]) {
        const { deps, logged } = loginDeps({ acquireLock: async () => { throw boom; } });
        await m.cmdLogin("azure-mcp", LOGIN_CFG, deps);
        sentences.push(logged.find((l) => /NOT serialised/.test(l)));
    }
    assert.match(sentences[0], /could not be taken \(EPERM\)/);
    assert.match(sentences[1], /FAILED \(TypeError\)/);
    assert.doesNotMatch(sentences[1], /could not be taken/,
        "a fault nothing classified must not read as the sandbox declining a bind");
});

test("cmdLogin: the lock is released even when the refresh write fails and the entries are cleared", async () => {
    // The clearing branch deletes the very entries a waiting renewal is about to read, so it has
    // to run inside the lock too — and a leaked holder blocks every launch on this machine.
    const { deps, lock } = loginDeps({
        writeEntry: async () => { throw new m.VcSecretsError("keystore full"); },
        removeEntry: async () => {},
    });
    await assert.rejects(() => m.cmdLogin("azure-mcp", LOGIN_CFG, deps), /keystore full/);
    assert.deepEqual(lock, ["acquire", "release"]);
});

test("cmdLogin: a project-scope entry the user file has not acknowledged is refused before a port is bound", async () => {
    // Before the bind, for the same reason the backend check is: past the exchange the
    // authorization code is spent, and a refusal discovered there cannot be retried with it. The
    // bind is the observable because it is the first thing cmdLogin does to the outside world.
    let bound = false;
    const { deps } = loginDeps({
        listen: async () => { bound = true; return { port: 1, next: async () => ({}), close: async () => {} }; },
    });
    await assert.rejects(() => m.cmdLogin("azure-mcp", UNACKNOWLEDGED_CFG, deps), /not authorized/);
    assert.equal(bound, false, "an unauthorized sign-in must not reach the listener");
});

test("cmdLogin: the refusal names the registration that must be acknowledged, not the declaration", async () => {
    // The remedy is a block in the USER file keyed by the (tenantId, clientId) pair, and naming the
    // declaration instead would send the developer to edit the repository file that is precisely
    // what may not authorize itself.
    const { deps } = loginDeps();
    const e = await m.cmdLogin("azure-mcp", UNACKNOWLEDGED_CFG, deps).then(() => null, (err) => err);
    assert.ok(e, "the sign-in must be refused");
    assert.match(e.message,
        new RegExp(`registrations\\."${DECL_IDENTITY.tenantId}"\\."${DECL_IDENTITY.clientId}"`));
    // "not the declaration" is a relation, and the match above is satisfied by a message naming BOTH
    // paths. The sibling refusal test states its two halves this way; this one only stated one.
    assert.doesNotMatch(e.message, /oauth\."azure-mcp"\.authorized/,
        "naming the declaration sends the developer to edit the file that may not authorize itself");
});

test("cmdLogin: the policy refusal wins over the capability refusal", async () => {
    // Both would refuse this call. If the backend check ran first the developer would be told their
    // machine has no keystore -- true, and the wrong thing to go and fix, because installing one
    // changes nothing about a sign-in they are not authorized to make.
    const { deps } = loginDeps({ backend: "nonesuch" });
    await assert.rejects(() => m.cmdLogin("azure-mcp", UNACKNOWLEDGED_CFG, deps), (e) => {
        assert.match(e.message, /not authorized/);
        assert.doesNotMatch(e.message, /keystore/);

        return true;
    });
});

test("cmdLogin: a user-scope entry needs no registrations block, because its own file is the authorization", async () => {
    // Nothing is crossing a scope boundary: the declaration lives in the file the grant would live
    // in. Demanding a block here would make the developer authorize themselves, and `authorized` on
    // a user-scope declaration is absent in exactly the same way an unacknowledged registration is
    // -- which is why the exemption is keyed on the declaration's home and not on that absence.
    const { deps, written } = loginDeps();
    await m.cmdLogin("azure-mcp", USER_CFG, deps);
    assert.deepEqual(written.map(([name]) => name), [USER_KEYS.refresh, USER_KEYS.access]);
});

const LOGOUT_DECL = { ...DECL_IDENTITY, kind: "oauth", scope: "project", home: "project", declaredName: "azure-mcp" };

const LOGOUT_CFG = { oauth: { "azure-mcp": LOGOUT_DECL }, projectId: "logout-p1", projectRoot: "/repo/logout" };

const LOGOUT_TRUST = trustedFor(LOGOUT_CFG);

const LOGOUT_KEYS = m.oauthEntryKeys("azure-mcp", LOGOUT_DECL, LOGOUT_CFG);

const FREE_LOCK = async () => ({ release: async () => {} });

// ---------------------------------------------------------------------------------------------
// cmdLogout -- the port of the sign-out verb. Ported from the upstream launcher's suite
// (mcpw.test.js): `m.McpwError` becomes `m.VcSecretsError`, `cache.entryNames(serverName)`
// becomes `oauthEntryKeys(serverName, decl, cfg)` (both return { refresh, access }, but the
// values here are the full three-segment keystore keys keyFor produces -- an assertion on a
// removed/attempted name reads it off LOGOUT_KEYS below instead of a literal
// "oauth-azure-mcp-*" string), and every "mcpw"/"mcpw run" in a user-facing string becomes
// "vc-secrets"/"vc-secrets run".
//
// cmdLogout resolves its own lock internally, the same way cmdLogin does --
// `acquireLock` defaults to null in the parameter list and falls through to
// `tokenLockFor(serverName, decl, cfg)`. Two source tests are dropped for it, having lost their
// referent: "a call site that forgets the lock is refused rather than left unserialised"
// (mcpw.test.js) checked a wiring seam that no longer exists once the lock is resolved
// inside the verb; "main hands logout the shared lock builder rather than one of its own"
// (mcpw.test.js) source-inspected a `main` wiring this package's `main` never performs --
// it calls `cmdLogout(arg, cfg)` with no deps object, exactly like the `login` branch. The
// "three writers, one lock name" test near the end of this section replaces both: it proves the
// default actually reaches the real tokenLockFor, driven directly, for all three writers.
//
// cmdLogout gets NO authorization/policy gate. Minting a credential is the privileged act;
// removing one is not, and refusing a removal leaves the refresh token on disk, which is the one
// outcome logout exists to prevent. So LOGOUT_CFG carries no `registrations` block at all, unlike
// LOGIN_CFG -- an unacknowledged project-scope entry still logs out cleanly.
// ---------------------------------------------------------------------------------------------

test("cmdLogout: removes both entries, refresh before access", async () => {
    // The ORDER is asserted rather than sorted away, and "cmdLogout: a store that fails part-way
    // has already removed the refresh token, not the access one" is why.
    // The source sorts both sides here (mcpw.test.js), which makes the order invisible:
    // measured, reversing `names` in the production loop left the whole suite green.
    const deleted = [];
    await m.cmdLogout("azure-mcp", LOGOUT_CFG, { trustState: LOGOUT_TRUST, deleteEntry: async (n) => { deleted.push(n); },
        acquireLock: FREE_LOCK });
    assert.deepEqual(deleted, [LOGOUT_KEYS.refresh, LOGOUT_KEYS.access]);
});

test("cmdLogout: an already-absent entry is success, and both are still attempted", async () => {
    // The not-found signal is toolExitCode, the property runTool actually sets -- a stub carrying
    // `code` would be read by nothing in production.
    const attempted = [];
    const report = await m.cmdLogout("azure-mcp", LOGOUT_CFG, { trustState: LOGOUT_TRUST,
        deleteEntry: async (n) => {
            attempted.push(n);
            throw Object.assign(new m.VcSecretsError("not found"), { toolExitCode: 3 });
        },
        acquireLock: FREE_LOCK,
    });
    assert.deepEqual(attempted, [LOGOUT_KEYS.refresh, LOGOUT_KEYS.access],
        "one absent entry must not stop the other from being removed, and in the order the "
        + "partial-failure test depends on");
    assert.deepEqual(report.removed, []);
    assert.deepEqual(report.alreadyAbsent, [LOGOUT_KEYS.refresh, LOGOUT_KEYS.access]);
});

test("cmdLogout: a real failure is not swallowed as already-absent", async () => {
    // Only exit 3 means "no such entry". Treating every failure as success would report a
    // logout that left the refresh token on disk -- the one outcome logout exists to prevent.
    await assert.rejects(() => m.cmdLogout("azure-mcp", LOGOUT_CFG, { trustState: LOGOUT_TRUST,
        deleteEntry: async () => { throw Object.assign(new m.VcSecretsError("keystore locked"), { toolExitCode: 1 }); },
        acquireLock: FREE_LOCK,
    }), /keystore locked/);
});

test("cmdLogout: a store that fails part-way has already removed the refresh token, not the access one", async () => {
    // The reason the two tests above assert an order instead of sorting it. There is no
    // transaction here: the loop rethrows anything that is not exit 3, so a store that dies
    // half-way leaves whatever has gone, gone, and whatever has not, on disk. Refresh-first bounds
    // that to a short-lived access token. The other order leaves the REFRESH token -- the
    // credential this verb exists to remove -- behind a failure a developer may reasonably read as
    // "nothing happened".
    //
    // Inherited from the source, which builds `names` the same way and sorts it away in its own
    // assertions, so this is a strengthening of the port rather than a correction to it.
    const deleted = [];
    await assert.rejects(() => m.cmdLogout("azure-mcp", LOGOUT_CFG, { trustState: LOGOUT_TRUST,
        deleteEntry: async (n) => {
            if (deleted.length === 1) {
                throw Object.assign(new m.VcSecretsError("keystore locked"), { toolExitCode: 1 });
            }
            deleted.push(n);
        },
        acquireLock: FREE_LOCK,
    }), /keystore locked/);
    assert.deepEqual(deleted, [LOGOUT_KEYS.refresh],
        "the long-lived credential must be the one already gone when a store fails part-way");
});

test("cmdLogout: a part-way failure says what it already removed, instead of losing it with the stack", async () => {
    // "cmdLogout: a store that fails part-way has already removed the refresh token, not the access
    // one" observes that half-done state from OUTSIDE, through its own double. Nobody who
    // runs the command has that vantage point: the loop threw bare, its return value died with the
    // stack, and the developer read "keystore locked" over a state where the refresh token -- the
    // credential this verb exists to remove -- is in fact already gone. Retrying is right either
    // way; what changes is what the developer believes is still on disk.
    await assert.rejects(() => m.cmdLogout("azure-mcp", LOGOUT_CFG, { trustState: LOGOUT_TRUST,
        deleteEntry: async (n) => {
            if (n === LOGOUT_KEYS.access) {
                throw Object.assign(new m.VcSecretsError("keystore locked"), { toolExitCode: 1 });
            }
        },
        acquireLock: FREE_LOCK,
    }), (e) => {
        assert.match(e.message, /keystore locked/, "the failure itself must still lead");
        assert.match(e.message, /HALF done/);
        assert.match(e.message, new RegExp(LOGOUT_KEYS.refresh.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
        assert.deepEqual(e.removed, [LOGOUT_KEYS.refresh], "and structured, for anything that is not a human");
        assert.equal(e.toolExitCode, 1, "the classification must survive the rewording");

        return true;
    });
});

test("cmdLogout: a failure on the FIRST entry claims nothing was removed", async () => {
    // The other side of the same message, and the one that would be a lie: "HALF done" appended
    // unconditionally would tell a developer a credential is gone when the store refused before
    // touching anything.
    await assert.rejects(() => m.cmdLogout("azure-mcp", LOGOUT_CFG, { trustState: LOGOUT_TRUST,
        deleteEntry: async () => { throw Object.assign(new m.VcSecretsError("keystore locked"), { toolExitCode: 1 }); },
        acquireLock: FREE_LOCK,
    }), (e) => {
        assert.doesNotMatch(e.message, /HALF done/);
        assert.deepEqual(e.removed, []);

        return true;
    });
});

test("cmdLogout: an undeclared server is refused before anything is deleted", async () => {
    const attempted = [];
    await assert.rejects(() => m.cmdLogout("ghost", LOGOUT_CFG, { trustState: LOGOUT_TRUST,
        deleteEntry: async (n) => { attempted.push(n); },
        acquireLock: FREE_LOCK,
    }), /ghost/);
    assert.deepEqual(attempted, [], "a typo must not delete another server's entries");
});

test("cmdLogout: the lock is released even when a deletion throws", async () => {
    // Same reason ensureFreshToken releases in a finally: a leaked holder outlives the process
    // that took it and blocks every launch on this machine until someone notices.
    let released = 0;
    await assert.rejects(() => m.cmdLogout("azure-mcp", LOGOUT_CFG, { trustState: LOGOUT_TRUST,
        deleteEntry: async () => { throw Object.assign(new m.VcSecretsError("keystore locked"), { toolExitCode: 1 }); },
        acquireLock: async () => ({ release: async () => { released++; } }),
    }), /keystore locked/);
    assert.equal(released, 1, "a failed deletion must not leave the renewal lock held");
});

test("cmdLogout: the one thing that can undo the removal is named, even when nothing was removed", async () => {
    // A sign-in already waiting on a human takes the lock only when the browser returns, so it
    // lands after this logout and writes a live token. No mutex closes that ordering, and this
    // line is the only place it is reported -- the alternative to it was an epoch entry, weighed
    // and declined. Asserted on the empty removal too, because that is the case where a pending
    // sign-in is the likely reason and the notice matters most.
    for (const deleteEntry of [async () => {},
        async () => { throw Object.assign(new m.VcSecretsError("not found"), { toolExitCode: 3 }); }]) {
        const logged = [];
        await m.cmdLogout("azure-mcp", LOGOUT_CFG,
            { trustState: LOGOUT_TRUST, deleteEntry, acquireLock: FREE_LOCK, log: (line) => logged.push(line) });
        assert.match(logged.join(""), /already open in a browser/, "the residual has to reach the developer");
        assert.match(logged.join(""), /azure-mcp/, "and name the entry it applies to");
    }
});

test("cmdLogout: a holder that never releases fails the logout instead of reporting a removal", async () => {
    const attempted = [];
    let ms = 0;
    await assert.rejects(() => m.cmdLogout("azure-mcp", LOGOUT_CFG, { trustState: LOGOUT_TRUST,
        deleteEntry: async (n) => { attempted.push(n); },
        acquireLock: async () => cache.HELD_BY_OTHER,
        now: () => (ms += 10_000),
        sleep: async () => {},
    }), /still refreshing/);
    assert.deepEqual(attempted, [], "a removal that cannot be serialised must not be reported as one");
});

test("cmdLogout: where the lock cannot be bound at all, the removal proceeds and says so", async () => {
    const deleted = [];
    const logged = [];
    let ms = 0;
    await m.cmdLogout("azure-mcp", LOGOUT_CFG, { trustState: LOGOUT_TRUST,
        log: (line) => logged.push(line),
        deleteEntry: async (n) => { deleted.push(n); },
        acquireLock: async () => { throw Object.assign(new Error("bind refused"), { code: "EPERM" }); },
        // Never reached while a refusal is read as a refusal -- injected so that reading it as a
        // HOLDER instead fails here in milliseconds rather than after the whole 45 s ceiling.
        now: () => (ms += 10_000),
        sleep: async () => {},
    });
    assert.equal(deleted.length, 2, "a credential that cannot be revoked is the worse failure");
    assert.match(logged.join(""), /NOT serialised/, "and the promise it could not keep is named");
    assert.match(logged.join(""), /EPERM/, "with the errno, not a guess at the cause");
});

// One in-process mutex standing in for the socket, so the reproduction runs sandboxed too: what
// is under test is the order logout and a renewal agree on, not the socket that enforces it --
// that is what the lockTest cases in this file cover.
function sharedLock() {
    let held = false;

    return async () => {
        if (held) {
            return cache.HELD_BY_OTHER;
        }
        held = true;

        return { release: async () => { held = false; } };
    };
}

test("cmdLogout: a renewal in flight cannot put back the credential logout reported removed", async () => {
    // The window ensureFreshToken already closed is the one between its two cache reads. This is
    // the other one: the holder is inside the exchange, on the network, and will write both
    // entries the moment Entra answers. An unlocked delete lands in front of that write, reports
    // success, and the refresh token is back on disk with nothing to notice.
    const store = new Map([[LOGOUT_KEYS.refresh, "r1"], [LOGOUT_KEYS.access, "a1"]]);
    const acquireLock = sharedLock();
    let reached, answer;
    const inExchange = new Promise((r) => { reached = r; });
    const entra = new Promise((r) => { answer = r; });
    const renewal = m.ensureFreshToken({
        serverName: "azure-mcp",
        readCache: async () => (store.has(LOGOUT_KEYS.refresh)
            ? { state: "needs-refresh", refreshToken: store.get(LOGOUT_KEYS.refresh) }
            : { state: "absent" }),
        writeCache: async (fresh) => {
            store.set(LOGOUT_KEYS.refresh, fresh.refreshToken);
            store.set(LOGOUT_KEYS.access, fresh.accessToken);
        },
        exchange: async () => { reached(); await entra; return { accessToken: "a2", refreshToken: "r2" }; },
        acquireLock,
        sleep: async () => {},
    });
    await inExchange;
    const logout = m.cmdLogout("azure-mcp", LOGOUT_CFG, { trustState: LOGOUT_TRUST,
        deleteEntry: async (n) => {
            if (!store.delete(n)) {
                throw Object.assign(new m.VcSecretsError("not found"), { toolExitCode: 3 });
            }
        },
        acquireLock,
        sleep: () => new Promise((r) => setImmediate(r)),
    });
    answer();
    const [token] = await Promise.all([renewal, logout]);
    assert.deepEqual([...store.keys()], [], "logout reported a removal a renewal was able to undo");
    assert.equal(token, "a2", "and the launch it waited for still has to survive");
});

test("cmdLogout: an unserialised removal is announced, and a serialised one is quiet", async () => {
    // Deleting the warning outright left the source's suite green, and it is the ONLY signal
    // there is: the report carries no serialisation field, because nothing in production would
    // read one.
    const lines = [];
    const write = process.stderr.write;
    process.stderr.write = (line) => { lines.push(String(line)); return true; };
    try {
        await m.cmdLogout("azure-mcp", LOGOUT_CFG, { trustState: LOGOUT_TRUST,
            deleteEntry: async () => {},
            acquireLock: async () => { throw Object.assign(new Error("nope"), { code: "EACCES" }); },
        });
        await m.cmdLogout("azure-mcp", LOGOUT_CFG, { trustState: LOGOUT_TRUST,
            deleteEntry: async () => {}, acquireLock: FREE_LOCK,
        });
    } finally {
        process.stderr.write = write;
    }
    assert.match(lines.join(""), /NOT serialised/, "the one signal a developer sees cannot be silent");
    assert.match(lines.join(""), /EACCES/, "and it names the errno rather than a guess at the cause");
    assert.equal(lines.filter((l) => l.includes("NOT serialised")).length, 1,
        "the serialised path must not warn");
});

test("cmdLogout: an error from the lock reaches the caller, and nothing is deleted on the way past", async () => {
    // The half of the source's mcpw.test.js that lost its referent. That test drives the
    // error THROUGH cmdLogout and asserts twice -- it propagates, AND nothing was attempted. This
    // package pinned acquireTokenLock directly instead (vc-secrets-oauth.test.mjs, the
    // "not laundered into one" test), which was right while cmdLogout did not exist, but only the
    // first assertion survived the re-point. The second one is the half about logout.
    //
    // The shape it forecloses is not hypothetical: it is written out, correctly, in cmdLogin,
    // whose `.catch((e) => ({ lock: null, reason: "unbindable", error: e }))` belongs THERE
    // because a failed lock must not cost a single-use authorization code. Copied down onto this
    // verb it reads a TypeError from broken wiring as "the sandbox refused the bind", and logout
    // then deletes both credentials unserialised and reports success -- with an errno of
    // `undefined` as the only trace. Harmonising the two verbs' lock handling is the obvious
    // future edit; this test is what notices it.
    //
    // Both assertions are independent pins, each with its own defect, and both were measured.
    // The rejection: appending that `.catch` reddens this test alone. The `attempted` assertion:
    // wrapping the lock call in a try/catch that deletes best-effort before rethrowing -- the same
    // "be permissive when the lock machinery fails" family, and the likelier edit of the two --
    // also reddens this test alone. What does NOT isolate `attempted` is a deletion escaping
    // ahead of the lock on every path: that reddens six siblings too, because they pin the
    // ordering incidentally. Recorded because an earlier draft of this comment generalised from
    // that one mutation to "nothing isolates it", which would have invited the next reader to
    // delete the assertion as decorative.
    const attempted = [];
    const boom = new TypeError("acquireLock is not a function");
    await assert.rejects(() => m.cmdLogout("azure-mcp", LOGOUT_CFG, { trustState: LOGOUT_TRUST,
        deleteEntry: async (name) => { attempted.push(name); },
        acquireLock: async () => { throw boom; },
    }), (e) => e === boom, "the wiring error must reach the caller unchanged");
    assert.deepEqual(attempted, [], "and nothing may be deleted on the way past");
});

lockTest("the renewal, a login and a logout all lock on ONE name -- pre-occupied, not read off the source", async () => {
    // The source captures this by monkeypatching c.acquireLock (mcpw.test.js) -- unavailable
    // here for the same reason tokenLockFor's own test gives (this file, "tokenLockFor: project
    // scope keys the lock exactly the way keyFor keys the keystore entry"): cache.acquireLock is
    // a read-only ES module export. Proven instead by PRE-occupying the exact path keyFor's own
    // rule predicts and observing all three writers collide with it -- if any of them computed
    // its lock name some other way, it would bind its OWN, unoccupied lock instead of contending
    // on this one.
    //
    // An improvement on the source: login and logout are now both real, ported verbs (logout
    // resolves its own lock internally, the same way login always has), so both are
    // driven directly with `acquireLock: undefined` -- reaching the destructuring default is the
    // point, not omitting the key (the source's own comment on this test makes the same
    // distinction). The source could drive only the renewal's builder and the login verb this
    // way; its third writer was `m.tokenLockFor(arg)()` standing in for logout's wiring, because
    // logout's own lock was wired from its `main`, not from inside the verb.
    const entryName = "azure-mcp";
    const decl = { ...DECL_IDENTITY, kind: "oauth", scope: "project", home: "project", declaredName: entryName };
    const cfg = { oauth: { [entryName]: decl }, projectId: "lock-name-p1", projectRoot: "/repo/lock-name",
        registrations: { [DECL_IDENTITY.tenantId]: { [DECL_IDENTITY.clientId]: {} } } };
    const lockPath = cache.lockPathFor(entryName, cfg.projectId, { platform: process.platform, env: process.env });
    const holder = await cache.acquireLock(lockPath);
    // Captured before the assertion, and released defensively in the finally below: under a WRONG
    // scope key this comes back as a real, live-listening lock instead of HELD_BY_OTHER, and an
    // un-released listener keeps the process alive long after the assertion has already failed --
    // measured directly, mutating oauthLaunchDeps' own scope key hung this exact test until the
    // lock below was captured and released rather than only asserted on.
    let renewalLock = null;
    try {
        // Writer 1: the renewal path, oauthLaunchDeps' own acquireLock.
        renewalLock = await m.oauthLaunchDeps(entryName, decl, cfg, { backend: "gpg" }).acquireLock();
        assert.equal(renewalLock, cache.HELD_BY_OTHER, "oauthLaunchDeps must contend on the pre-occupied path");

        // Writer 2: cmdLogin, with its `acquireLock` left at the destructuring default. cmdLogin
        // treats a busy lock as a warning, not a refusal, so it still returns -- the log line is
        // the only signal that it actually contended on the SAME path rather than sailing through
        // on one of its own.
        const { deps: loginDepsObj, logged: loginLogged } = loginDeps({ acquireLock: undefined,
            now: () => 0, sleep: async () => {}, trustState: trustedFor(cfg) });
        await m.cmdLogin(entryName, cfg, loginDepsObj);
        assert.match(loginLogged.join(""), /was still holding the lock/,
            "cmdLogin's default must contend on the same pre-occupied path");

        // Writer 3: cmdLogout, same default, but this verb treats a busy lock as fatal.
        let ms = 0;
        await assert.rejects(() => m.cmdLogout(entryName, cfg, {
            trustState: trustedFor(cfg), deleteEntry: async () => {}, acquireLock: undefined,
            now: () => (ms += 10_000), sleep: async () => {},
        }), /still refreshing/, "cmdLogout's default must contend on the same pre-occupied path");
    } finally {
        if (renewalLock && renewalLock !== cache.HELD_BY_OTHER) { await renewalLock.release(); }
        await holder.release();
    }
});
