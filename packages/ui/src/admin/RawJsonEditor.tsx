import { validate, type Takuhon } from '@takuhon/core';
import { useId, useState } from 'react';

import styles from './RawJsonEditor.module.css';
import { getAdminLabel } from './admin-labels.js';

export interface RawJsonEditorProps {
  value: Takuhon;
  /** Called with the parsed document whenever the text is valid JSON + schema. */
  onChange: (next: Takuhon) => void;
}

const MAX_SHOWN_PROBLEMS = 50;

/**
 * Advanced editing surface: the entire document as JSON text. Edits commit to
 * the draft only when the text parses and passes schema validation, so the
 * structured form view it shares state with never sees a malformed document.
 * This is also the only way to edit sections without a dedicated form (spec
 * §14.1 Phase 5 — JSON editor retained as the advanced mode).
 */
export function RawJsonEditor({ value, onChange }: RawJsonEditorProps): React.JSX.Element {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [problems, setProblems] = useState<readonly string[]>([]);
  const labelId = useId();
  const errorId = useId();

  const apply = (next: string): void => {
    setText(next);
    let parsed: unknown;
    try {
      parsed = JSON.parse(next);
    } catch (error) {
      setProblems([error instanceof Error ? error.message : 'Invalid JSON.']);
      return;
    }
    const result = validate(parsed);
    if (!result.ok) {
      setProblems(
        result.errors
          .slice(0, MAX_SHOWN_PROBLEMS)
          .map((error) => `${error.pointer || '/'}: ${error.message}`),
      );
      return;
    }
    setProblems([]);
    onChange(result.data);
  };

  const hasProblems = problems.length > 0;

  return (
    <section className={styles.wrapper} aria-labelledby={labelId}>
      <h2 className={styles.heading} id={labelId}>
        {getAdminLabel('mode.advanced')}
      </h2>
      <p className={styles.hint}>{getAdminLabel('advanced.hint')}</p>
      <textarea
        className={styles.textarea}
        value={text}
        spellCheck={false}
        aria-label={getAdminLabel('mode.advanced')}
        aria-invalid={hasProblems || undefined}
        aria-describedby={hasProblems ? errorId : undefined}
        onChange={(event) => {
          apply(event.target.value);
        }}
      />
      {hasProblems ? (
        <div className={styles.problems} id={errorId} role="alert">
          <p className={styles.problemsTitle}>{getAdminLabel('advanced.invalid')}</p>
          <ul>
            {problems.map((problem, i) => (
              <li key={i}>{problem}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
