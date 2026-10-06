import { test } from "node:test";
import assert from "node:assert/strict";
import * as m from "../vc-secrets.mjs";

test("readFailureReason: no shape of a JSON.parse message carries file content out", () => {
    // The three shapes V8 produces for a content window -- elided on both sides, anchored at the
    // start, and, for an input short enough, the whole text -- plus the two positional shapes that
    // carry none. The whole-text shape is why the reason is rebuilt from the positional triple
    // rather than filtered out of the message: a filter written against the other two lets an
    // entire short file through, and a short file is exactly what a one-secret .mcp.json is.
    const secret = "ghp_SUPERSECRETVALUE";
    for (const text of [`{"a":1,"b":2,"c":3,"d":4,"env":{"PAT":${secret},"x":1}}`, `{"P":${secret}}`,
        secret, `{"P":"${secret}",}`, `{"P":"${secret}"`]) {
        let reason = null;
        try {
            JSON.parse(text);
        } catch (e) {
            reason = m.readFailureReason(e);
        }
        assert.ok(reason !== null, `expected ${JSON.stringify(text)} to be malformed`);
        assert.doesNotMatch(reason, /ghp_|SUPERSECRET/,
            `content travelled for ${JSON.stringify(text)}: ${reason}`);
    }
});

test("readFailureReason: an fs failure passes through, because its code IS the diagnosis", () => {
    // The readers that wrap the read and the parse in one try hand both kinds of failure here.
    // ENOENT, EACCES and EISDIR describe the file rather than its contents, and collapsing them
    // into "not valid JSON" would send a developer to fix the syntax of a file that is either
    // perfectly valid or not a file at all.
    assert.equal(m.readFailureReason(Object.assign(new Error("permission denied"), { code: "EACCES" })),
        "EACCES");
});

test("forTerminal: a control byte from the redirect cannot reach the terminal as a command", () => {
    // The HTML sink escapes; this is the same sender with a different alphabet. CSI would move the
    // cursor and overwrite what is already on screen, OSC can reach the window title or the
    // clipboard — and unlike a bad tag, none of it is visible in the text that carried it.
    const nasty = `a\u001b[2Jb\u0007c\u009bd`;
    const safe = m.forTerminal(nasty);
    assert.ok(!/[\u0000-\u001f\u007f-\u009f]/.test(safe), `control bytes survived: ${JSON.stringify(safe)}`);
    assert.match(safe, /^a\?\[2Jb\?c\?d$/, "and the replacement itself must be ASCII");
});

test("forTerminal: an unbounded value is truncated", () => {
    assert.equal(m.forTerminal("x".repeat(1000), 10), "xxxxxxxxxx...");
    assert.equal(m.forTerminal("short", 10), "short");
});
