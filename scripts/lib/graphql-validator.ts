/**
 * GraphQL query validator — validates query strings against the live xAPI schema
 * BEFORE any HTTP request is sent. Catches DV-006, DV-008, DV-009, DV-010 (and
 * DV-007/DV-011 as arg/field name errors) from review-criteria.md at lint time.
 *
 * Usage:
 *   import { introspect, buildSchema, validateQuery } from './graphql-validator.js';
 *   const intro = await introspect(process.env.BACK_URL);
 *   const schema = buildSchema(intro);
 *   const result = validateQuery(schema, '{ me { id } }');
 *   if (!result.valid) { console.error(result.errors); }
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import {
  buildClientSchema,
  parse,
  validate as graphqlValidate,
  getIntrospectionQuery,
  GraphQLSchema,
  GraphQLError,
  IntrospectionQuery,
} from "graphql";

export interface ValidationError {
  code: string; // DV-* mapping where possible
  message: string;
  line?: number;
  column?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  operationName?: string;
  operationType?: "query" | "mutation" | "subscription";
}

export interface IntrospectOptions {
  backUrl: string;
  token?: string; // optional bearer token
  timeoutMs?: number;
}

/**
 * Fetches full introspection from a live GraphQL endpoint.
 * Throws on network error, non-200 HTTP, or introspection disabled.
 */
export async function introspect(
  opts: IntrospectOptions
): Promise<IntrospectionQuery> {
  const { backUrl, token, timeoutMs = 15000 } = opts;
  const url = `${backUrl.replace(/\/$/, "")}/graphql`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ query: getIntrospectionQuery() }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(
        `Introspection HTTP ${res.status} at ${url} — schema introspection may be disabled`
      );
    }

    const json = (await res.json()) as {
      data?: IntrospectionQuery;
      errors?: Array<{ message: string }>;
    };

    if (json.errors?.length) {
      throw new Error(
        `Introspection errors: ${json.errors.map((e) => e.message).join("; ")}`
      );
    }

    if (!json.data || !json.data.__schema) {
      throw new Error("Introspection returned no __schema");
    }

    return json.data;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Persists introspection JSON to disk for offline use.
 */
export function saveSchemaCache(
  intro: IntrospectionQuery,
  path: string
): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(intro, null, 2), "utf-8");
}

export function loadSchemaCache(path: string): IntrospectionQuery {
  if (!existsSync(path)) {
    throw new Error(`Schema cache not found at ${path}`);
  }
  return JSON.parse(readFileSync(path, "utf-8")) as IntrospectionQuery;
}

/**
 * Builds an executable GraphQLSchema from an introspection result.
 */
export function buildSchema(intro: IntrospectionQuery): GraphQLSchema {
  return buildClientSchema(intro);
}

/**
 * Validates a GraphQL query string against the schema.
 * Returns structured errors with best-effort DV-* code mapping.
 */
export function validateQuery(
  schema: GraphQLSchema,
  query: string
): ValidationResult {
  let documentNode;
  try {
    documentNode = parse(query);
  } catch (e) {
    const err = e as GraphQLError;
    return {
      valid: false,
      errors: [
        {
          code: "DV-SYNTAX",
          message: err.message,
          line: err.locations?.[0]?.line,
          column: err.locations?.[0]?.column,
        },
      ],
    };
  }

  const opDef = documentNode.definitions.find(
    (d) => d.kind === "OperationDefinition"
  );
  const operationName =
    opDef && "name" in opDef && opDef.name?.value ? opDef.name.value : undefined;
  const operationType =
    opDef && "operation" in opDef ? opDef.operation : undefined;

  const graphqlErrors = graphqlValidate(schema, documentNode);

  if (graphqlErrors.length === 0) {
    return { valid: true, errors: [], operationName, operationType };
  }

  return {
    valid: false,
    errors: graphqlErrors.map(mapErrorToDVCode),
    operationName,
    operationType,
  };
}

/**
 * Heuristic mapping from graphql-js validation errors to review-criteria DV-* codes.
 * Falls back to DV-GENERIC for unmapped patterns.
 */
function mapErrorToDVCode(err: GraphQLError): ValidationError {
  const msg = err.message;
  let code = "DV-GENERIC";

  if (/Cannot query field "(\w+)" on type "(\w+)"/.test(msg)) {
    // wrong return field OR unknown operation at root level
    code = /on type "(Query|Mutation|Subscription|Mutations|Queries)"/i.test(msg)
      ? "DV-006" // unknown query/mutation name
      : "DV-009"; // wrong response field
  } else if (/Unknown argument "(\w+)"/.test(msg)) {
    code = "DV-008";
  } else if (
    /Field "(\w+)" is not defined by type "(\w+)Type"/.test(msg) ||
    /Field "(\w+)" of required type/.test(msg)
  ) {
    code = "DV-010";
  } else if (/required type .* was not provided/i.test(msg)) {
    code = "DV-010";
  } else if (/Syntax Error/.test(msg)) {
    code = "DV-SYNTAX";
  }

  return {
    code,
    message: msg,
    line: err.locations?.[0]?.line,
    column: err.locations?.[0]?.column,
  };
}
