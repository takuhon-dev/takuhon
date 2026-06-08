/**
 * Types for the generated standalone validator (`takuhon-validator.cjs`).
 * The implementation is emitted by `scripts/generate-validator.mjs`.
 */
import type { ErrorObject } from 'ajv';

/** Ajv standalone validator: returns true/false and stashes `errors`. */
export interface StandaloneValidate {
  (data: unknown): boolean;
  errors?: ErrorObject[] | null;
}

declare const validate: StandaloneValidate;
export default validate;
