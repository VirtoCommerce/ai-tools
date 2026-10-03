import os from "node:os";
import path from "node:path";

// This module only DEFINES. It is imported by install-shim.mjs, which has side effects, and by the
// launcher's emit-config, which must have none — so the shared values cannot live in the installer.
const SHIM = "vc-secrets-shim.mjs";
const CANONICAL_DATA_ID = "vc-secrets-ai-tools";

// The documented default, and only the default. Where --data-dir was honoured the installed path
// differs, and nothing outside the installer can know that it was.
//
// Three levels, three functions, because two different callers want two different levels: the
// installer reports the data home in its own message and creates the plugin directory, while a config
// generator wants the file. Exporting only the deepest one pushes dirname() arithmetic back out to
// every caller, which is the duplication this module was extracted to end.
function defaultDataHome(env = process.env) {
    return path.join(env.HOME || os.homedir(), ".claude", "plugins", "data");
}

function defaultShimDir(env = process.env) {
    return path.join(defaultDataHome(env), CANONICAL_DATA_ID);
}

function defaultShimPath(env = process.env) {
    return path.join(defaultShimDir(env), SHIM);
}

export { SHIM, CANONICAL_DATA_ID, defaultDataHome, defaultShimDir, defaultShimPath };
