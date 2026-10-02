// vc-secrets-probe.mjs — verification aid: initialize-handshake through vc-secrets run.
// Usage: node vc-secrets-probe.mjs <server>
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// Shared with the launcher on purpose. This file used a bare child.kill("SIGTERM"), which on Windows
// reaches the direct child only — dnx's dotnet.exe outlived every timeout, orphaned, and held a lock
// on the package file, so the next attempt failed with a file-in-use error instead of timing out
// again. Measured on Windows.
import { forwardedSignalsFor, isDirectRun, killProcessTree } from "./vc-secrets.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Two failures, two messages. A child that never answers is either a server binary
// that cannot start or a launcher that refused before spawning it — and under OAuth the second is
// routine (nobody has signed in yet) while the first is a regression. One message for both means a
// token regression reads exactly like a working setup on a broken machine, which is the shape that
// makes a verification aid worse than none.
//
// Decided from the LAST non-empty line, not from anything anywhere in the stream. vc-secrets writes its
// fatal message immediately before exiting, so on a launcher refusal the last word is the
// launcher's; when the server dies, vc-secrets's own exit path writes nothing, so the last word is the
// server's -- UNLESS the launcher printed a benign warning earlier on the run path AND the server then
// died silently at exit code 1, the one code the discriminator below cannot attribute. That residue is
// known and bounded, not handled. Scanning the whole stream instead reintroduces the conflation in
// both directions, and
// both were measured: a "vc-secrets: channel client refused (nonce)" line followed by "Segmentation
// fault" reported a launcher refusal for a launcher whose server had already started, and a SERVER
// line containing "token endpoint" reported "the server binary was never reached" — a claim that
// was simply false.
const LAUNCHER_LINE = /^vc-secrets: (.+)$/;
// The source's list minus "not signed in", which has no producer here that LAUNCHER_LINE can match:
// the package's only occurrence is a doctor INFO line, off the run path and without the "vc-secrets: "
// prefix. Keeping it was not free -- fail() embeds a failed tool's stderr, so an "az" refusal saying
// "not signed in" would have been classified token and answered with "vc-secrets login" when the
// remedy is "az login". Dropped, so such a line stays a launcher refusal quoted verbatim.
const TOKEN_REFUSAL = /vc-secrets login|no usable token|another vc-secrets is still refreshing|token endpoint/i;

// LIFTED from the launcher's own line, never composed here: `vc-secrets login` resolves
// cfg.oauth[name], so it takes an oauth ENTRY name while this module has only the SERVER name, and
// the two are independent. Measured against a config declaring server "azure-devops" -> oauth "ado":
// a remedy composed from the server name sends the developer to `unknown oauth entry`, contradicting
// the correct remedy the launcher printed one line above it.
const LOGIN_REMEDY = /run "vc-secrets login [^"]+"/;

function lastLineOf(stderrText) {
    const lines = String(stderrText ?? "").split("\n").map((l) => l.trim()).filter(Boolean);

    return lines.length > 0 ? lines[lines.length - 1] : "";
}

function classifyProbeFailure(stderrText, exitCode) {
    // Every launcher-fatal exit on the run path is code 1: fail() exits with a VcSecretsError's
    // exitCode and every one in the package leaves that at its default, and the spawn-failure path
    // exits 1 too. The launcher's only other exit RELAYS the server's code. So any other code is
    // proof the launcher did not refuse, whatever its last line happened to be -- which is what stops
    // a benign launcher line printed last from swallowing a server that died without saying anything.
    // Code 1 cannot separate the two, so the text rule below still decides there; so does an absent
    // code, for a caller that has none.
    if (typeof exitCode === "number" && exitCode !== 1) {
        return "server";
    }
    const last = lastLineOf(stderrText);
    const refusal = LAUNCHER_LINE.exec(last);
    if (refusal === null) {
        return "server";   // the last word was not the launcher's
    }

    return TOKEN_REFUSAL.test(last) ? "token" : "launcher";
}

function describeFailure(server, stderrText, exitCode) {
    const kind = classifyProbeFailure(stderrText, exitCode);
    if (kind === "token") {
        // A line carrying no remedy gets none invented for it. A concurrent refresh is one such case.
        // A REFUSED token endpoint is NOT: the launcher tags HTTP 400 refused and appends the remedy
        // deliberately, because a refusal means the refresh token is dead -- and this lift carries that
        // through. The case without a remedy is the RETRYABLE endpoint failure, which it rethrows
        // unchanged rather than advising a browser that cannot help.
        const remedy = LOGIN_REMEDY.exec(lastLineOf(stderrText));

        return `probe: ${server} -> token not obtainable (the server binary was never reached)`
            + (remedy === null ? "" : ` -- ${remedy[0]}`);
    }
    if (kind === "launcher") {
        // The launcher's own words, verbatim: they already name the cause, and paraphrasing here
        // would be a second place to keep in step with the messages vc-secrets actually emits.
        return `probe: ${server} -> launcher refused: ${LAUNCHER_LINE.exec(lastLineOf(stderrText))[1]}`;
    }

    return `probe: ${server} -> server exited before responding`;
}

function main(server) {
    // The classifier decides from the launcher's LAST line, and this knob makes the launcher print a
    // benign timing measurement after everything else -- so a server that dies silently is reported as
    // a launcher refusal, and the inversion lands exactly when a developer sets the knob to diagnose a
    // bad launch. Measured. Dropped for the child only; the probe's own behaviour is unchanged.
    const childEnv = { ...process.env };
    delete childEnv.VC_SECRETS_TIMING;
    const child = spawn(process.execPath, [path.join(__dirname, "vc-secrets.mjs"), "run", server],
        { stdio: ["pipe", "pipe", "pipe"], detached: process.platform !== "win32", env: childEnv });
    const request = { jsonrpc: "2.0", id: 1, method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "vc-secrets-probe", version: "0" } } };
    child.stdin.on("error", () => {});
    child.stdin.write(JSON.stringify(request) + "\n");

    // Captured AND forwarded: the classification needs the text, and the developer still needs to
    // read it. Piping it without echoing would hide the very diagnostics vc-secrets writes.
    let stderrText = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
        stderrText += chunk;
        fs.writeSync(2, chunk);   // echoed synchronously: the summary below must not queue behind it
    });

    const timer = setTimeout(() => {
        fs.writeSync(2, `probe: ${server} -> TIMEOUT (30 s)\n`);
        killProcessTree(child, "SIGTERM");
        process.exit(1);
    }, 30_000);

    // The price of spawning detached, and half a pattern until it is paid: detached also takes the
    // child OUT of the terminal's foreground group, so Ctrl-C stops reaching it. Measured -- a
    // detached child survives a SIGINT sent to its parent's group, a non-detached one does not. So
    // without these the probe dies and leaves the launcher, and the server it spawned, running: the
    // orphaned tree this file shares killProcessTree to prevent, arriving by the other door. SIGHUP is
    // the same door: it is what closing the terminal the probe runs in delivers, and the launcher,
    // detached, would not receive it. SIGQUIT is Ctrl-\ in that terminal, and the default action kills
    // the probe without running its "exit" handlers, with the same result -- except on win32, which the
    // list leaves it out of. cmdLaunch installs the same set, from the same list, for the same reason.
    for (const signal of forwardedSignalsFor()) {
        process.on(signal, (received) => {
            clearTimeout(timer);
            killProcessTree(child, received);
            process.exit(1);   // synchronous, so the close handler cannot print a verdict for an abandoned run
        });
    }

    let buffer = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
        buffer += chunk;
        let newline;
        while ((newline = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            if (!line) {
                continue;
            }
            let message;
            try {
                message = JSON.parse(line);
            } catch {
                continue;   // partial or non-JSON line
            }
            if (message.id !== 1) {
                continue;
            }
            clearTimeout(timer);
            const ok = Boolean(message.result?.serverInfo);
            fs.writeSync(2, `probe: ${server} -> ${ok ? `OK ${message.result.serverInfo.name}` : `FAIL ${line.slice(0, 200)}`}\n`);
            killProcessTree(child, "SIGTERM");
            process.exit(ok ? 0 : 1);
        }
    });
    child.on("close", (code) => {
        clearTimeout(timer);
        fs.writeSync(2, `${describeFailure(server, stderrText, code)}\n`);
        process.exit(1);
    });
}

export { classifyProbeFailure, describeFailure };

// Guarded so the suite can require the classification without spawning anything — the module used
// to run on load, which is why its logic had no test at all.
if (isDirectRun(import.meta.url)) {
    const server = process.argv[2];
    if (!server) {
        fs.writeSync(2, "usage: node vc-secrets-probe.mjs <server>\n");
        process.exit(2);
    }
    main(server);
}
