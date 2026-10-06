// OAuth checks layer: OAuth status, organisation-flag and tenant checks; imports only from lower layers.

import { VcSecretsError } from "../vc-secrets-error.mjs";

import { parseReference } from "./config.mjs";

// Bounded, because a host that completes the handshake and then says nothing -- captive portal,
// half-up VPN, intercepting proxy -- is not a connect failure: undici waits out its 300s headers
// timeout, and doctor prints NOTHING until every check has finished. Measured against a server that
// accepts and never answers: the request was still pending past 73s. A diagnostic that looks hung is
// worse than one that reports "unknown".
const TIMEOUT_TENANT_MS = 5_000;

// A verdict, never the object carrying it. cacheStatus returns the access token beside its state, so
// handing that object to the report is the one path by which a token could reach a printed line --
// the mapping simply has no way to carry it, which is stronger than remembering to redact.
function oauthStatusFrom(status) {
    if (status.state === "valid") {
        return "ok";
    }
    if (status.state === "needs-refresh") {
        return "needs-refresh";
    }
    if (status.state === "identity-mismatch") {
        // Same remedy as a first sign-in, different cause. A developer who signed in yesterday and is
        // asked again needs to know the DECLARATION moved, or the tool looks like it lost the token it
        // was trusted with.
        return "identity-changed";
    }
    if (status.state === "absent") {
        return "signin-required";
    }
    // Not a catch-all: a state added to cacheStatus later would otherwise arrive here as the QUIETEST
    // verdict this function can return, and a new failure mode would report as INFO.
    throw new VcSecretsError(`unknown cache state "${status.state}"`);
}

// Every oauth reference in the config, with the launchable kind and name that carry it, and the env
// var. Pure, because two callers need it -- the tenant check and the node-floor check -- and neither
// should resolve a secret to find out. Servers AND tasks: a task carries the same env references a
// server does, and doctor's own "declared" loop already checks both for the identical reason.
function oauthReferences(cfg) {
    const found = [];
    for (const [kind, map] of [["servers", cfg.servers], ["tasks", cfg.tasks ?? {}]]) {
        for (const [launchableName, launchable] of Object.entries(map)) {
            for (const [envVar, value] of Object.entries(launchable.env)) {
                let ref = null;
                try {
                    ref = parseReference(value);
                } catch {
                    continue;   // a malformed reference is already its own finding
                }
                if (ref?.kind === "oauth") {
                    found.push({ kind, launchableName, envVar, name: ref.name });
                }
            }
        }
    }

    return found;
}

// The organisation the launchable is run against, read from the argv that already carries it.
// Declaring it a second time in the oauth block would be the same fact in two places with nothing
// keeping them in agreement -- and the divergence would make doctor compare the declared tenant
// against the wrong organisation and report agreement.
// The server defines three options that take a value -- `--authentication`/`-a`, `--tenant`/`-t`,
// `--domains`/`-d` -- and the long forms are what its own README tells an operator to write. `--auth`
// is not one of them; it stays because it costs nothing until that exact token appears, and consuming
// a value after it is still the better guess if it ever does.
const ORG_FLAGS_WITH_VALUE = ["-a", "--auth", "--authentication", "-t", "--tenant"];

// `--domains` is declared to yargs as an ARRAY, so it swallows every following token up to the next
// flag -- the organisation included. Measured against the server's own option definitions: `--domains
// all myorg` and `--domains repositories builds myorg` both die at "Not enough non-option arguments",
// while `myorg --domains repositories builds` starts. So an argv naming domains before the
// organisation cannot launch at all, and answering null -- "could not determine", a reported state --
// is what keeps this parser's answer and the server's behaviour in step. Returning the first domain
// as the organisation instead would send doctor to compare a tenant against a name nobody launched.
const ORG_FLAGS_WITH_VALUES = ["-d", "--domains"];

function organisationFromArgs(args) {
    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        if (ORG_FLAGS_WITH_VALUE.includes(arg)) {
            i += 1;   // named rather than assumed: a generic "every flag takes a value" rule
            continue;  // swallows the organisation whenever a valueless flag precedes it
        }
        if (ORG_FLAGS_WITH_VALUES.includes(arg)) {
            while (i + 1 < args.length && !args[i + 1].startsWith("-")) {
                i += 1;
            }
            continue;
        }
        if (arg.startsWith("-")) {
            continue;
        }
        if (arg.includes("@") || arg.includes("/") || arg.includes("\\")) {
            continue;   // the package spec, or a path
        }

        return arg;
    }

    return null;   // unreadable: reported as "could not determine", never guessed
}

// One unauthenticated HEAD, with no fallback to any previously-resolved value on failure: caching the
// last answer across calls would let doctor report agreement from a stale tenant on a network hiccup
// -- the diagnostic passing while the very mismatch it exists to catch stays invisible.
async function resolveOrgTenant(org, { request = fetch } = {}) {
    try {
        const res = await request(`https://vssps.dev.azure.com/${encodeURIComponent(org)}`,
            { method: "HEAD", signal: AbortSignal.timeout(TIMEOUT_TENANT_MS) });

        // `|| null` rather than `??`: an EMPTY header is not an answer either, and letting "" through
        // renders a mismatch against a blank organisation tenant.
        return res.headers.get("x-vss-resourcetenant") || null;
    } catch {
        return null;   // unreachable, or too slow to be worth waiting for: "unknown", never a match
    }
}

// resolveOrgTenant reads an Azure DevOps endpoint's binding header, so the tenant check means
// something only for a token issued against that resource -- for any other resource there is no
// organisation tenant to compare against, and running the check anyway would either print a WARN
// that can never clear or, on a coincidental match, FAIL a correctly-configured entry. The App ID
// GUID and the URL form are both Microsoft's own public identifiers for the Azure DevOps resource
// (documented at learn.microsoft.com/en-us/azure/devops/integrate/get-started/authentication/
// service-principal-managed-identity), not a client identifier or app registration -- carrying it
// here does not violate the "no tenant id, client id, organisation or app-registration name
// hardcoded" constraint.
//
// Lowercase, matching the .toLowerCase() comparison below: a marker added here in mixed case would
// silently never match, so keep every entry already lowercase rather than relying on the call site.
const AZURE_DEVOPS_RESOURCE_MARKERS = ["499b84ac-1321-427f-aa17-267ca6975798", "app.vssps.visualstudio.com"];

function isAzureDevOpsScoped(scopes) {
    return scopes.some((scope) => AZURE_DEVOPS_RESOURCE_MARKERS.some((marker) => scope.toLowerCase().includes(marker)));
}

// Extracted from cmdDoctor so applicability -- which consumer answers for an oauth entry, if any,
// whether its declaration is even for the right resource, and whether its argv could be read -- has a
// test surface that needs no keystore access. cmdDoctor calls this with no third argument, so the
// real resolveOrgTenant comes from the parameter's own default; a test passes a stub instead, to
// avoid a network call.
async function oauthTenantChecks(cfg, references, { resolveOrgTenant: resolve = resolveOrgTenant } = {}) {
    const checks = [];
    const bindings = [];
    for (const [name, decl] of Object.entries(cfg.oauth ?? {})) {
        // Driven by the DECLARATION, not by the reference: the reference only appears with the
        // switch, and a tenant-binding mistake is worth catching at setup, before the switch lands.
        // The reference wins when one exists (it is authoritative); otherwise the consuming
        // launchable is found by the "vc-secrets login <name>" convention -- a SERVER whose name
        // equals the entry's, never a task, since nothing launches a task by that convention.
        const ref = references.find((r) => r.name === name);
        const consumerKind = ref ? ref.kind : (Object.hasOwn(cfg.servers, name) ? "servers" : null);
        const consumerName = ref ? ref.launchableName : (consumerKind === "servers" ? name : null);
        const hasConsumer = consumerKind !== null;
        const adoScoped = isAzureDevOpsScoped(decl.scopes);
        // Not applicable, not a WARN that can never pass -- and the causes must not collapse into one
        // line: "nothing launches it" (no consumer at all -- there is no argv to read in the first
        // place) is a different fact from "a consumer exists but its token is not for Azure DevOps"
        // (nothing for resolveOrgTenant to check), and both differ again from "a consumer exists, is
        // ADO-scoped, and its argv could not be read" (the WARN doctorReport prints, in lib/doctor.mjs).
        const applicable = hasConsumer && adoScoped;
        const org = applicable ? organisationFromArgs(cfg[consumerKind][consumerName].args) : null;
        const check = { name, org, declared: decl.tenantId, applicable, bound: null };
        if (!applicable) {
            check.reason = hasConsumer ? "not-ado-scope" : "no-consumer";
        }
        checks.push(check);
        // Started here, awaited together below. Each is one unauthenticated HEAD that may burn the
        // whole TIMEOUT_TENANT_MS, and doctor prints nothing until every check has finished -- so
        // awaiting inside the loop makes a developer wait for their sum rather than for the slowest.
        // They are independent by construction: resolveOrgTenant answers null rather than rejecting.
        bindings.push(org === null ? null : resolve(org));
    }
    const bound = await Promise.all(bindings);
    for (const [i, tenant] of bound.entries()) {
        checks[i].bound = tenant;
    }

    return checks;
}

export {
    TIMEOUT_TENANT_MS, oauthStatusFrom, oauthReferences, ORG_FLAGS_WITH_VALUE, ORG_FLAGS_WITH_VALUES,
    organisationFromArgs, resolveOrgTenant, oauthTenantChecks,
};
