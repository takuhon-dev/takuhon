import { useId } from 'react';

import styles from './controls.module.css';

export interface CheckboxFieldProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/**
 * A labelled checkbox. Laid out checkbox-first (distinct from the stacked
 * {@link Field} controls), with the label associated via `htmlFor`.
 */
export function CheckboxField({ label, checked, onChange }: CheckboxFieldProps): React.JSX.Element {
  const id = useId();
  return (
    <div className={styles.checkboxRow}>
      <input
        id={id}
        className={styles.checkbox}
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
      />
      <label className={styles.checkboxLabel} htmlFor={id}>
        {label}
      </label>
    </div>
  );
}
