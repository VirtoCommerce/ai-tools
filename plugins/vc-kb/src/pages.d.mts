/**
 * Type declarations for pages.mjs, so the one TypeScript consumer — the test that holds this
 * resolver and `ecl:lint` to the same idea of what an ECL section is — gets real types under strict
 * mode instead of implicit any. Same pattern as `scripts/lib/knowledge-base.d.mts`.
 *
 * The plugin itself is plain ESM and stays that way: it ships to machines that run `node`, not a
 * build. This file is for the consumers on this side of the fence.
 */

/** The base's page store. Not a plane. */
export declare const PAGES_DIR: string;

export interface PageSection {
  /** The heading's id, numeric segments canonicalised: `13.3`, `VC-CART-001`. */
  id: string;
  title: string;
  /** Heading depth — 3 for `###`. */
  level: number;
  /** Base-relative, posix: `knowledge/oracles/e-commerce-edge-cases-library.md`. */
  page: string;
  /** The prefix this page claims with `citedAs:`, or null. */
  prefix: string | null;
  /** 1-based line of the heading. */
  line: number;
}

export interface FoundSection extends PageSection {
  /** The section verbatim, heading included, subsections with it and siblings not. */
  text: string;
}

export interface AmbiguousSection {
  ambiguous: { page: string; line: number; title: string }[];
}

/** Numeric segments with leading zeros stripped: `05.1` -> `5.1`. */
export declare function canonId(token: string): string;

/** The forms a cited id can take at the page: itself, and its tail when that is a section number. */
export declare function idForms(cited: string): string[];

/** The prefix a page declares its sections are cited by, or null. */
export declare function citedAs(text: string): string | null;

/** Every addressable heading in the base's pages. */
export declare function pageSections(base: string): PageSection[];

/** Open one section by the id somebody cited. */
export declare function findSection(base: string, cited: string): FoundSection | AmbiguousSection | null;

/** A section's own text, from its heading to the next heading of the same or higher level. */
export declare function sliceSection(file: string, line: number, level: number): string;
