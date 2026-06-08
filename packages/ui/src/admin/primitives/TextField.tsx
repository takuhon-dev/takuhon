import { Field } from './Field.js';
import styles from './controls.module.css';

export interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  errors?: readonly string[];
  hint?: string;
  required?: boolean;
  placeholder?: string;
  /**
   * HTML input type. Defaults to `'text'`; `'url'` for link/avatar URLs,
   * `'month'` for `YearMonth` values (a native month picker emits `YYYY-MM`).
   */
  type?: 'text' | 'url' | 'email' | 'month';
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
}

/** A labelled single-line text input wired for accessibility via {@link Field}. */
export function TextField({
  label,
  value,
  onChange,
  errors,
  hint,
  required,
  placeholder,
  type = 'text',
  inputMode,
}: TextFieldProps): React.JSX.Element {
  return (
    <Field label={label} errors={errors} hint={hint} required={required}>
      {({ controlId, describedBy, invalid }) => (
        <input
          id={controlId}
          className={styles.control}
          type={type}
          value={value}
          placeholder={placeholder}
          inputMode={inputMode}
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
