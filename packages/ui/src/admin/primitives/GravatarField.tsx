import { gravatarUrl } from '@takuhon/core';
import { useState } from 'react';

import { getAdminLabel } from '../admin-labels.js';

import { Field } from './Field.js';
import styles from './GravatarField.module.css';
import controls from './controls.module.css';

export interface GravatarFieldProps {
  /** Called with the generated Gravatar URL when the owner applies an email. */
  onApply: (url: string) => void;
}

/**
 * "Use Gravatar" control: an email input plus a button that turns the email into
 * a Gravatar avatar URL via core's pure {@link gravatarUrl}. This is the third
 * way to set an avatar, alongside pasting a URL and uploading an image.
 *
 * The email is local-only — it is never written to the document or sent
 * anywhere. Only the generated URL is handed to {@link GravatarFieldProps.onApply}
 * (which the parent writes into `avatar.url`); the email input is cleared once
 * applied, so nothing about the address lingers in the form.
 */
export function GravatarField({ onApply }: GravatarFieldProps): React.JSX.Element {
  const [email, setEmail] = useState('');
  const trimmed = email.trim();

  const apply = (): void => {
    if (trimmed === '') return;
    onApply(gravatarUrl(trimmed));
    setEmail('');
  };

  return (
    <Field label={getAdminLabel('field.gravatarEmail')} hint={getAdminLabel('hint.gravatar')}>
      {({ controlId, describedBy }) => (
        <>
          <input
            id={controlId}
            className={controls.control}
            type="email"
            value={email}
            autoComplete="off"
            aria-describedby={describedBy}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                apply();
              }
            }}
          />
          <div className={styles.actionRow}>
            <button
              type="button"
              className={styles.applyButton}
              disabled={trimmed === ''}
              onClick={apply}
            >
              {getAdminLabel('field.gravatarApply')}
            </button>
          </div>
        </>
      )}
    </Field>
  );
}
