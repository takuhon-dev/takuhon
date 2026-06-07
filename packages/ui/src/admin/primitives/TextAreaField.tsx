import { Field } from './Field.js';
import styles from './controls.module.css';

export interface TextAreaFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  errors?: readonly string[];
  hint?: string;
  required?: boolean;
  placeholder?: string;
  rows?: number;
}

/** A labelled multi-line text input wired for accessibility via {@link Field}. */
export function TextAreaField({
  label,
  value,
  onChange,
  errors,
  hint,
  required,
  placeholder,
  rows = 4,
}: TextAreaFieldProps): React.JSX.Element {
  return (
    <Field label={label} errors={errors} hint={hint} required={required}>
      {({ controlId, describedBy, invalid }) => (
        <textarea
          id={controlId}
          className={`${styles.control} ${styles.textarea}`}
          value={value}
          rows={rows}
          placeholder={placeholder}
          aria-invalid={invalid || undefined}
          aria-required={required ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      )}
    </Field>
  );
}
