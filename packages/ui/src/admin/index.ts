/**
 * @takuhon/ui/admin — React form components for the takuhon admin editor.
 *
 * These are the building blocks behind the Cloudflare admin form UI (spec
 * §14.1 Phase 5). They are presentational and transport-agnostic: each is a
 * controlled component that takes a value plus `onChange`, with field errors
 * supplied as a {@link FieldErrorIndex} so server (RFC 7807) and client
 * (`@takuhon/core` `validate`) failures map to the same fields. Co-located CSS
 * Modules are emitted to `dist/admin/` and bundled by the consumer.
 *
 * Importing this entry also pulls in the shared design tokens, so the admin
 * components are themed standalone without depending on the profile UI entry.
 */

import '../styles/tokens.css';

export {
  canonicalPointer,
  collectErrorsUnder,
  errorsAt,
  hasErrorsUnder,
  indexErrors,
  indexValidationErrors,
  NO_FIELD_ERRORS,
  type FieldErrorIndex,
  type FieldErrorLike,
} from './errors.js';

export { Field, type FieldProps, type FieldControlProps } from './primitives/Field.js';
export { TextField, type TextFieldProps } from './primitives/TextField.js';
export { TextAreaField, type TextAreaFieldProps } from './primitives/TextAreaField.js';
export { SelectField, type SelectFieldProps, type SelectOption } from './primitives/SelectField.js';
export { CheckboxField, type CheckboxFieldProps } from './primitives/CheckboxField.js';
export {
  ImageField,
  type ImageFieldProps,
  type AssetUploadResult,
  type UploadAsset,
} from './primitives/ImageField.js';
export { GravatarField, type GravatarFieldProps } from './primitives/GravatarField.js';
export { LocaleTabs, type LocaleTabsProps } from './primitives/LocaleTabs.js';
export { Repeater, type RepeaterProps } from './primitives/Repeater.js';

export { getAdminLabel, type AdminLabelKey } from './admin-labels.js';

// The schema-driven form engine renders every section straight from the JSON
// Schema; the former per-section forms (ProfileForm, LinksForm, …) are gone.
export { SchemaForm, type SchemaFormProps } from './schema-form/SchemaForm.js';
export {
  sectionFieldKind,
  classifyNode,
  type FieldKind,
  type SchemaNode,
} from './schema-form/field-classification.js';
export {
  EMPTY_REGISTRY,
  humanize,
  hintAt,
  type FieldHint,
  type FieldRegistry,
  type CustomFieldContext,
} from './schema-form/field-registry.js';
export {
  ADMIN_SECTIONS,
  SECTION_REGISTRY,
  type AdminSection,
} from './schema-form/section-registry.js';

export { RawJsonEditor, type RawJsonEditorProps } from './RawJsonEditor.js';
export { AdminEditor, type AdminEditorProps, type AdminSaveOutcome } from './AdminEditor.js';
