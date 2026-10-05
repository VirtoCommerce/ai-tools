// vc-secrets-preload.mjs — receives renewed tokens inside the MCP server process.
//
// Loaded with NODE_OPTIONS=--import, which takes a module URL. It is also the only code that runs
// inside the credential-holding process, which decides its shape: it imports the side-effect-free
// target matcher and nothing else, and its FIRST act is to decide whether this is the process we
// meant. NODE_OPTIONS reaches the whole subtree below the launcher — measured at 3 processes on
// Windows — so being loaded is not evidence of being wanted.
//
// node:net is therefore imported BELOW that decision, not above it: a process that is not the target
// never loads a networking module it will not use. Measured at 1.2–1.4 ms per process on node 22,
// against a 36–40 ms launch, which is not why it is written this way — the import graph of the
// process holding the token is.
import { isTargetEntry } from "./vc-secrets-target.mjs";

const entry = process.argv[1] ?? "";
const channel = process.env.VC_SECRETS_TOKEN_CHANNEL;
const nonce = process.env.VC_SECRETS_CHANNEL_NONCE;
// The variable to assign comes from our own environment, never from the wire: a payload able to
// name it would let the socket decide where a credential lands inside the process holding it,
// and the launcher already knows the name because it composed the environment.
const tokenEnv = process.env.VC_SECRETS_TOKEN_ENV;
// Which server this launch meant. The package is required; the bin is optional and, when empty,
// contributes no alternative -- a server entered through node_modules/.bin then never receives a renewal.
const targetPackage = process.env.VC_SECRETS_TARGET_PACKAGE;
const targetBin = process.env.VC_SECRETS_TARGET_BIN || null;

if (isTargetEntry(entry, targetPackage, targetBin) && channel && nonce && tokenEnv) {
    const { default: net } = await import("node:net");
    const sock = net.connect(channel);
    sock.unref();                       // a token receiver must not keep the server alive
    sock.on("connect", () => sock.write(JSON.stringify({ nonce }) + "\n"));

    let pending = "";
    sock.on("data", (buf) => {
        pending += buf.toString("utf8");
        // A stream socket may split or coalesce writes, so frames are newline-delimited and read
        // as such. Reading "one chunk is one frame" works on every machine it is tried on and
        // fails as a silently ignored renewal.
        let nl = pending.indexOf("\n");
        while (nl >= 0) {
            const line = pending.slice(0, nl);
            pending = pending.slice(nl + 1);
            nl = pending.indexOf("\n");
            if (line === "") {
                continue;
            }
            let msg;
            try {
                msg = JSON.parse(line);
            } catch {
                // Node embeds the first ten characters of the input in a JSON SyntaxError, so
                // reporting the parse failure verbatim would print a token prefix.
                process.stderr.write("vc-secrets preload: unreadable channel frame, ignored\n");
                continue;
            }
            if (typeof msg?.token === "string" && msg.token !== "") {
                process.env[tokenEnv] = msg.token;
            }
        }
    });

    // fd 2 only: fd 1 in this process is the client's JSON-RPC stream, and one stray line there
    // is a session that misbehaves with no error anywhere. Async write rather than writeSync
    // because nothing here exits the process — the server keeps serving on the token it has.
    sock.on("error", (e) => process.stderr.write(`vc-secrets preload: channel error: ${e.code ?? e.message}\n`));
}
