/**
 * Type declarations for knowledge-base.mjs so the TypeScript consumers
 * (scripts/knowledge/*.ts, scripts/maintenance/*.ts) get real types under strict
 * mode instead of implicit any. Same pattern as project-profile.d.mts.
 */

/** The knowledge tree's name inside the base. */
export declare const KNOWLEDGE_DIR: string;

export declare class KnowledgeBaseMissing extends Error {
  constructor(message: string);
}

/** The not-found message, remedy first. */
export declare function knowledgeMissingMessage(rel?: string): string;

/**
 * Absolute path of a file in the base's knowledge tree.
 * @throws {KnowledgeBaseMissing} when no base resolves.
 */
export declare function knowledgePath(rel: string): string;

/** Stable, machine-independent form for printing and for citations. */
export declare function knowledgeLabel(rel: string): string;

/** Whether the base is reachable AND holds this file. Never throws. */
export declare function knowledgeExists(rel: string): boolean;

/** The knowledge tree's root, for callers that enumerate rather than name. */
export declare function knowledgeRoot(): string;
