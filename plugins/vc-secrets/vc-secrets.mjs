// vc-secrets.mjs — secrets launcher: runs a declared process (an MCP server, or a task) with its secrets.
// Resolves the secrets a declared child needs from the OS credential store at launch time and
// injects them into that one child only. README.md carries the declaration schema, the three
// declaration homes and their precedence.

import { fileURLToPath } from "node:url";

import { canonicalPath } from "./lib/util.mjs";
import { runCli } from "./lib/cli.mjs";

export {
    jsonSyntaxWhere, readFailureReason, forTerminal,
} from "./lib/util.mjs";

export {
    redactSecrets, VALUE_ON_STDIN, COMMAND_ON_STDIN, runTool, resolveSpawnCommand, buildSpawnInvocation,
    commandOnPath, mergeDeclaredEnv, DANGEROUS_ENV_VARS, sanitizeEnv,
} from "./lib/spawn.mjs";

export {
    REF_RE, parseReference, parseLiteral, LITERAL_PREFIX, CONFIG_NAME, LOCAL_CONFIG_NAME, SCHEMA_VERSION,
    SCOPE_ORDER, configPaths, parseConfigFile, loadConfig, resolveEnvEntries, validateLaunchables, LEGACY_ENV_VARS,
    LEGACY_SECRET_ENV_VARS, SECRET_NAME_RE, LAUNCHABLE_NAME_RE, consumerShape, shapeDifferences,
    validateAuthorized, validateVaults, authorizationFor, crossingProblem, own, SERVER_DECL_KEYS, trustRootKey,
} from "./lib/config.mjs";

export {
    KEY_PREFIX, keyFor, keyToPath, legacyKeyToPath, detectLocalBackend, secretsDir, psEncode, psCommand,
    PS_CRED_READ, PS_CRED_WRITE, oversizeMarkerPath, recordOversizeMarker, clearOversizeMarker, readOversizeMarker,
    PS_CRED_DELETE, decodeCredBlobHex, buildLocalRead, buildLocalWrite, buildLocalDelete, deleteEntryIo,
    PS_CRED_READ_MANY, buildCredReadMany, credReadManyIo, buildKeyvaultRead, TIMEOUT_LOCAL_MS, TIMEOUT_AZ_MS,
    SECURITY_LINE_LIMIT, WCM_BLOB_LIMIT, quoteForSecurityInteractive, writeSecretValue, makeSecretResolver,
    mapResolveError, cmdMigrate, newKeyPresent, readLegacyLocalValue,
} from "./lib/keystore.mjs";

export {
    trustFilePath, launchShape, trustDifferences, trustProblem, trustRefusal, trustAssessment, trustNotes,
    gatedLaunchables, namespaceDeclarations, namespaceTrustProblem, namespaceStoreRefusal, readTrustState,
    writeTrustState, cmdTrust, cmdUntrust, openControllingTerminal,
} from "./lib/trust.mjs";

export {
    oauthEntryKeys, oauthKeyClashes, tokenLockFor, acquireTokenLock, ensureFreshToken, oauthLaunchDeps,
} from "./lib/oauth-token.mjs";

export {
    REDIRECT_PATH, MAX_ERROR_PARAMS, closeTabPage, escapeHtml, failedPage, listenForCallback, openBrowser,
    buildBrowserCommand, handleCallback, cmdLogin, cmdLogout, withDeadline, LOGIN_WAIT_MS,
} from "./lib/oauth-login.mjs";

export {
    oauthStatusFrom, oauthReferences, oauthTenantChecks, ORG_FLAGS_WITH_VALUE, ORG_FLAGS_WITH_VALUES,
    organisationFromArgs, resolveOrgTenant, TIMEOUT_TENANT_MS,
} from "./lib/oauth-checks.mjs";

export {
    CHANNEL_GREETING_MAX, channelPipeName, createChannel, PRELOAD_PATH, buildChildEnv,
    childNodeSupportsImport, childNodeVersionIo, isNodeCommand, childNodeRefusal, childNodeProbes,
    LAUNCH_KILL_ESCALATION, LAUNCH_STDIN_CLOSE_GRACE_MS, cmdRun, cmdTask, cmdLaunch, killProcessTree,
    forwardedSignalsFor, RENEWAL_TICK_MS,
} from "./lib/launch.mjs";

export {
    REQUIRED_SHIM_CONTRACT, probeKeystoreWrite, WRITE_PROBE_NAME, writeProbeValue, WRITE_PROBED_BACKENDS,
    cmdDoctor, doctorReport, readEnableLists, readWiredServers, readWiredElsewhere, consumedSecrets,
} from "./lib/doctor.mjs";

export {
    runCli, hardenSpawnEnv, failureLine, applyKeystrokes, promptHidden, cmdSet, cmdUnlock, unlockTargets,
    emitConfig, cmdEmitConfig,
} from "./lib/cli.mjs";

// Re-exported so the test file reaches them through the namespace import it already uses.
export {
    VcSecretsError,
} from "./vc-secrets-error.mjs";
export {
    clientNames, clientDescriptor, MIN_VERSION_UNKNOWN,
} from "./clients.mjs";
export {
    defaultDataHome, defaultShimDir, defaultShimPath,
} from "./scripts/shim-path.mjs";
export {
    PACKAGE_NAME_RE, BIN_NAME_RE,
} from "./vc-secrets-target.mjs";

export { isDirectRun };

// "Was this file started as the program?" -- the gate that keeps importing the module from running its CLI.
// Node resolves symlinks for import.meta.url but process.argv[1] stays as typed, so a plain
// path.resolve comparison is false whenever the plugin is reached through a symlinked directory (a
// marketplace cache entry, a linked checkout) and the CLI then exits 0 having done nothing -- no usage
// line, no error. Both sides are canonicalised, not only argv[1]: under `node --preserve-symlinks-main`
// import.meta.url of the entry file keeps the link path, so realpathing one side alone would leave the
// two apart again. The JS realpathSync, not `.native`: it is the resolution Node's own loader applies to
// the module URL, so the two sides agree (canonicalPath, with the same resolve fallback). import.meta.main
// would be simpler but is absent on older Node.
function isDirectRun(moduleUrl, argv1 = process.argv[1]) {
    if (!argv1) {
        return false;
    }

    return canonicalPath(fileURLToPath(moduleUrl)) === canonicalPath(argv1);
}

if (isDirectRun(import.meta.url)) {
    runCli(process.argv.slice(2));
}
