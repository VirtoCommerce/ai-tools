/**
 * This skill's own directory — CWD-independent, so bundled data files
 * (`fix-repos.json`, `.module-registry.cache.json`) resolve regardless of
 * where the invoking process's working directory happens to be (the plugin
 * cache location Claude Code installs this skill into is not something
 * callers can reliably assume/discover). Shared by every file in this
 * directory that needs to locate a sibling data file.
 */
import { dirname } from "path";
import { fileURLToPath } from "url";

export const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
