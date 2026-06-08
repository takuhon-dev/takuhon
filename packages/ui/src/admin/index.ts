/**
 * @takuhon/ui/admin — React form components for the takuhon admin editor.
 *
 * These are the building blocks behind the Cloudflare admin form UI (spec
 * §14.1 Phase 5). They are presentational and transport-agnostic: each is a
 * controlled component that takes a value plus `onChange`, with field errors
 * supplied as a {@link FieldErrorIndex} so server (RFC 7807) and client
 * (`@takuhon/core` `validate`) failures map to the same fields. Co-located CSS
 * Modules are emitted to `dist/admin/` and bundled by the consumer.
 */

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
export { LocaleTabs, type LocaleTabsProps } from './primitives/LocaleTabs.js';
export { Repeater, type RepeaterProps } from './primitives/Repeater.js';

export { getAdminLabel, type AdminLabelKey } from './admin-labels.js';

export { ProfileForm, type ProfileFormProps } from './sections/ProfileForm.js';
export { LinksForm, type LinksFormProps } from './sections/LinksForm.js';
export { CareersForm, type CareersFormProps } from './sections/CareersForm.js';
export { ProjectsForm, type ProjectsFormProps } from './sections/ProjectsForm.js';
export { SkillsForm, type SkillsFormProps } from './sections/SkillsForm.js';
export { SettingsForm, type SettingsFormProps } from './sections/SettingsForm.js';

export { RawJsonEditor, type RawJsonEditorProps } from './RawJsonEditor.js';
export { AdminEditor, type AdminEditorProps, type AdminSaveOutcome } from './AdminEditor.js';
