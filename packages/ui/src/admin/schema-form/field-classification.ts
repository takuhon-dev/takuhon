/**
 * Schema-driven field classification for the admin editor.
 *
 * Maps a node of the canonical takuhon JSON Schema (2020-12) to a
 * {@link FieldKind} — the widget the admin form should render for it. This is
 * the pure-logic foundation of the schema-driven form engine (design:
 * `admin-form-schema-driven-design.md`). It resolves local `$ref`s against
 * `$defs` and unwraps nullable `anyOf` unions, so the renderer never hand-wires
 * fields per section. No React here; the classifier is fully unit-testable.
 *
 * Presentation concerns the schema cannot express (widget overrides, ordering,
 * help text, cross-section reference selectors, image/Gravatar widgets) live in
 * a separate field-spec registry, not in the data schema (design decision A1).
 */

/**
 * Minimal structural view of a JSON Schema 2020-12 node — only the keywords the
 * classifier reads. The canonical schema (`@takuhon/core`'s `schema`) is cast to
 * this for traversal.
 */
export interface SchemaNode {
  $ref?: string;
  $defs?: Record<string, SchemaNode>;
  type?: string | readonly string[];
  format?: string;
  enum?: readonly unknown[];
  properties?: Record<string, SchemaNode>;
  required?: readonly string[];
  items?: SchemaNode;
  anyOf?: readonly SchemaNode[];
  maxLength?: number;
  minimum?: number;
  description?: string;
  default?: unknown;
}

/** The widget the admin form should render for a classified schema node. */
export type FieldKind =
  | { widget: 'text'; maxLength?: number }
  | { widget: 'url' }
  | { widget: 'email' }
  | { widget: 'month' }
  | { widget: 'date' }
  | { widget: 'datetime' }
  | { widget: 'integer'; minimum?: number }
  | { widget: 'checkbox'; default?: boolean }
  | { widget: 'select'; options: readonly string[] }
  | { widget: 'localeTag' }
  | { widget: 'localizedTitle' }
  | { widget: 'localizedBody' }
  | { widget: 'slug' }
  | { widget: 'array'; item: FieldKind }
  | { widget: 'object'; fields: readonly FieldEntry[] }
  | { widget: 'unsupported' };

/** A named property of an object schema: its optionality and classified kind. */
export interface FieldEntry {
  name: string;
  /** Listed in the object's `required` array. */
  required: boolean;
  /** The schema permits an explicit `null` (e.g. `anyOf: [X, { type: 'null' }]`). */
  nullable: boolean;
  kind: FieldKind;
}

/** Result of following one `$ref` and unwrapping a nullable `anyOf` union. */
export interface Resolved {
  node: SchemaNode;
  /** `$defs` name the node resolved from, after following one local `$ref`. */
  ref?: string;
  nullable: boolean;
}

const REF_PREFIX = '#/$defs/';

/** Name of the `$defs` entry a node's `$ref` targets, or `undefined`. */
export function refName(node: SchemaNode): string | undefined {
  const ref = node.$ref;
  if (typeof ref !== 'string' || !ref.startsWith(REF_PREFIX)) return undefined;
  return ref.slice(REF_PREFIX.length);
}

/**
 * Follow a single local `$ref` and unwrap a nullable union
 * (`anyOf: [X, { type: 'null' }]` → `X` with `nullable: true`). Idempotent for
 * already-concrete nodes; a missing `$ref` target leaves the node unchanged.
 */
export function deref(root: SchemaNode, node: SchemaNode): Resolved {
  let current = node;
  let nullable = false;

  const variants = current.anyOf;
  if (variants) {
    const nonNull = variants.filter((variant) => variant.type !== 'null');
    const [only] = nonNull;
    if (only && nonNull.length === 1 && nonNull.length < variants.length) {
      nullable = true;
      current = only;
    }
  }

  const name = refName(current);
  if (name === undefined) return { node: current, nullable };
  const target = root.$defs?.[name];
  if (!target) return { node: current, nullable };
  return { node: target, ref: name, nullable };
}

// Well-known scalar `$defs` whose intended widget is not inferable from `type`
// alone (pattern-only strings) or carries domain meaning worth a dedicated UI.
const REF_WIDGET: Readonly<Record<string, FieldKind>> = {
  LocalizedTitle: { widget: 'localizedTitle' },
  LocalizedBody: { widget: 'localizedBody' },
  YearMonth: { widget: 'month' },
  Slug: { widget: 'slug' },
  LocaleTag: { widget: 'localeTag' },
};

/** Classify a (possibly `$ref`/nullable) schema node into the widget to render. */
export function classifyNode(root: SchemaNode, node: SchemaNode): FieldKind {
  const { node: resolved, ref } = deref(root, node);

  if (ref !== undefined) {
    const known = REF_WIDGET[ref];
    if (known) return known;
  }

  if (Array.isArray(resolved.enum)) {
    return { widget: 'select', options: resolved.enum.map((value) => String(value)) };
  }

  const type = typeof resolved.type === 'string' ? resolved.type : undefined;

  if (type === 'string') {
    switch (resolved.format) {
      case 'email':
        return { widget: 'email' };
      case 'uri':
        return { widget: 'url' };
      case 'date':
        return { widget: 'date' };
      case 'date-time':
        return { widget: 'datetime' };
      default:
        return resolved.maxLength === undefined
          ? { widget: 'text' }
          : { widget: 'text', maxLength: resolved.maxLength };
    }
  }
  if (type === 'boolean') {
    // Carry the schema `default` so the checkbox can reflect it: a field with a
    // default (e.g. settings flags default true) shows that state when absent
    // and stores its value explicitly, while a default-less boolean stays
    // sparse (unchecked when absent, dropped when false).
    return typeof resolved.default === 'boolean'
      ? { widget: 'checkbox', default: resolved.default }
      : { widget: 'checkbox' };
  }
  if (type === 'integer' || type === 'number') {
    return resolved.minimum === undefined
      ? { widget: 'integer' }
      : { widget: 'integer', minimum: resolved.minimum };
  }
  if (type === 'array') {
    const item: FieldKind = resolved.items
      ? classifyNode(root, resolved.items)
      : { widget: 'unsupported' };
    return { widget: 'array', item };
  }
  if (type === 'object') {
    return { widget: 'object', fields: objectEntries(root, resolved) };
  }
  return { widget: 'unsupported' };
}

/** Classified properties of an object schema, in declaration order. */
export function objectEntries(root: SchemaNode, objectSchema: SchemaNode): FieldEntry[] {
  const properties = objectSchema.properties ?? {};
  const required = new Set(objectSchema.required ?? []);
  return Object.entries(properties).map(([name, propNode]) => ({
    name,
    required: required.has(name),
    nullable: deref(root, propNode).nullable,
    kind: classifyNode(root, propNode),
  }));
}

/** Classify a top-level section (e.g. `'education'`, `'contact'`) by name. */
export function sectionFieldKind(root: SchemaNode, section: string): FieldKind {
  const node = root.properties?.[section];
  if (!node) return { widget: 'unsupported' };
  return classifyNode(root, node);
}
