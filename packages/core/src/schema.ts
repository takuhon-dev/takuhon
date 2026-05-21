/**
 * Re-exports the canonical JSON Schema for takuhon profiles.
 *
 * The schema source of truth lives at `packages/core/takuhon.schema.json`
 * (also distributed via the `@takuhon/core/schema.json` sub-path). This module
 * is the convenient ESM-side entry point for consumers that want to feed it
 * directly to a JSON Schema validator (e.g. Ajv) without a filesystem read.
 */

import schemaJson from '../takuhon.schema.json' with { type: 'json' };

export const schema = schemaJson;
export type Schema = typeof schemaJson;
