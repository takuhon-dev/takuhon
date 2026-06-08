import { useId } from 'react';

import styles from './Field.module.css';

/** Identifiers a {@link Field} hands to the control it wraps. */
export interface FieldControlProps {
  /** `id` for the control, paired with the rendered `<label htmlFor>`. */
  controlId: string;
  /** `aria-describedby` value linking the control to its hint/error text. */
  describedBy: string | undefined;
  /** Whether the control should advertise `aria-invalid`. */
  invalid: boolean;
}

export interface FieldProps {
  /** Visible label text. */
  label: string;
  /** Validation messages to render beneath the control. */
  errors?: readonly string[];
  /** Optional helper text shown between the label and the control. */
  hint?: string;
  /** Marks the field visually and via `aria-required` on the control. */
  required?: boolean;
  /** Render the control, wired with the supplied accessibility ids. */
  children: (props: FieldControlProps) => React.ReactNode;
}

/**
 * Layout + accessibility wrapper for a single form control. Owns the `id`
 * wiring so the label, hint, error list, and control stay associated for
 * screen readers (WCAG 2.1 AA, spec §8.5). Presentational only — it holds no
 * value state; the wrapped control is controlled by its parent.
 */
export function Field({ label, errors, hint, required, children }: FieldProps): React.JSX.Element {
  const controlId = useId();
  const hintId = useId();
  const errorId = useId();
  const hasErrors = (errors?.length ?? 0) > 0;
  const describedBy =
    [hint ? hintId : undefined, hasErrors ? errorId : undefined].filter(Boolean).join(' ') ||
    undefined;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={controlId}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {hint ? (
        <p className={styles.hint} id={hintId}>
          {hint}
        </p>
      ) : null}
      {children({ controlId, describedBy, invalid: hasErrors })}
      {hasErrors ? (
        <ul className={styles.errors} id={errorId}>
          {errors!.map((message, i) => (
            <li key={i}>{message}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
