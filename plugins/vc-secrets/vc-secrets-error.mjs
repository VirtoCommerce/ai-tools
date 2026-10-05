// vc-secrets-error.mjs — the one error type every vc-secrets module throws.
//
// The error type lives alone so clients.mjs and the launcher can share it without a cycle. Putting it
// in clients.mjs instead would make that cycle, and clients.mjs parses clients.json at module
// evaluation time — so the first validation failure there would be a temporal-dead-zone crash rather
// than the error it meant to throw.
class VcSecretsError extends Error {
    constructor(message, exitCode = 1) {
        super(message);
        this.exitCode = exitCode;
    }
}

export { VcSecretsError };
