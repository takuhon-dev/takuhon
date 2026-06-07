import { Field } from './Field.js';
import styles from './controls.module.css';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldProps {
  label: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  errors?: readonly string[];
  hint?: string;
  required?: boolean;
}

/** A labelled `<select>` wired for accessibility via {@link Field}. */
export function SelectField({
  label,
  value,
  options,
  onChange,
  errors,
  hint,
  required,
}: SelectFieldProps): React.JSX.Element {
  return (
    <Field label={label} errors={errors} hint={hint} required={required}>
      {({ controlId, describedBy, invalid }) => (
        <select
          id={controlId}
          className={styles.control}
          value={value}
          aria-invalid={invalid || undefined}
          aria-required={required ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}
