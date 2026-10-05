// clients.mjs — the per-client differences, read as data so a fourth client is an entry in
// clients.json rather than a branch in the code.
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { VcSecretsError } from "./vc-secrets-error.mjs";

// A floor nobody measured must not read as "there is no floor": null means no floor exists, this
// sentinel means the answer is unknown. One value for both would omit the version warning precisely
// for the client whose floor is in doubt.
const MIN_VERSION_UNKNOWN = "unknown";

const REQUIRED = {
    displayName: "string",
    format: "string",
    serversKey: "string",
    configFiles: "object",
};

const CLIENTS = JSON.parse(fs.readFileSync(fileURLToPath(new URL("./clients.json", import.meta.url)), "utf8"));

function clientNames() {
    return Object.keys(CLIENTS).sort();
}

function clientDescriptor(name) {
    const entry = CLIENTS[name];
    if (!entry) {
        throw new VcSecretsError(`unknown client "${name}" (known: ${clientNames().join(", ")})`);
    }
    for (const [key, type] of Object.entries(REQUIRED)) {
        // Type-checked, not merely present: `"configFiles": 5` passes a presence check and then yields
        // an empty key list two callers away, where the message no longer names the cause.
        if (typeof entry[key] !== type || entry[key] === null) {
            throw new VcSecretsError(`client "${name}": ${key} must be a ${type}`);
        }
    }
    if (!["json", "toml"].includes(entry.format)) {
        throw new VcSecretsError(`client "${name}": format must be "json" or "toml", got ${JSON.stringify(entry.format)}`);
    }
    if (Object.keys(entry.configFiles).length === 0) {
        throw new VcSecretsError(`client "${name}": configFiles must name at least one scope`);
    }

    return {
        displayName: entry.displayName,
        format: entry.format,
        serversKey: entry.serversKey,
        // configFiles values are DISPLAY TEMPLATES for a human ("<repo>/.mcp.json"), never paths to
        // hand to fs. A consumer that needs a resolvable path derives it.
        configFiles: entry.configFiles,
        launcherRef: entry.launcherRef ?? null,
        minVersion: entry.minVersion ?? null,
    };
}

export { clientNames, clientDescriptor, MIN_VERSION_UNKNOWN };
