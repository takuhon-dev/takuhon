import { useId, useRef, useState } from 'react';

import { getAdminLabel } from '../admin-labels.js';

import { Field } from './Field.js';
import styles from './ImageField.module.css';
import controls from './controls.module.css';

/** Outcome of an asset upload, returned by {@link UploadAsset}. */
export type AssetUploadResult =
  | { status: 'uploaded'; url: string; publicUrl: string }
  | { status: 'error'; message?: string };

/**
 * Upload one image file and resolve where it now lives. Supplied by the host's
 * transport layer (it carries the admin token / origin); the UI stays
 * transport-agnostic.
 */
export type UploadAsset = (file: File) => Promise<AssetUploadResult>;

/** `accept` attribute matching the MIME types the server accepts (security.md §4.1). */
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

export interface ImageFieldProps {
  label: string;
  /** Current image URL stored in the document. */
  value: string;
  onChange: (url: string) => void;
  errors?: readonly string[];
  hint?: string;
  /**
   * When provided, a file-upload control is rendered alongside the URL input;
   * a successful upload sets the URL to the returned (relative) path. When
   * omitted, the field is URL-only.
   */
  uploadAsset?: UploadAsset;
}

/**
 * Avatar / image field: a URL input plus, when {@link ImageFieldProps.uploadAsset}
 * is supplied, a file picker that uploads the chosen image and writes the
 * returned URL back into the field. The relative `url` (not the absolute
 * `publicUrl`) is stored so the reference stays valid across origins.
 *
 * No `<img>` preview is rendered: the admin CSP is `img-src 'self' blob:`, so a
 * preview of an arbitrary external URL would be blocked — the URL input is the
 * portable, CSP-safe surface, and the public preview shows the real image.
 */
export function ImageField({
  label,
  value,
  onChange,
  errors,
  hint,
  uploadAsset,
}: ImageFieldProps): React.JSX.Element {
  const fileId = useId();
  const statusId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (!file || uploadAsset === undefined) return;
    setBusy(true);
    setUploadError(null);
    uploadAsset(file)
      .then((result) => {
        if (result.status === 'uploaded') {
          onChange(result.url);
        } else {
          setUploadError(result.message ?? getAdminLabel('status.uploadError'));
        }
      })
      .catch(() => {
        setUploadError(getAdminLabel('status.uploadError'));
      })
      .finally(() => {
        setBusy(false);
        // Clear the picker so re-selecting the same file fires `change` again.
        if (fileRef.current) fileRef.current.value = '';
      });
  };

  return (
    <Field label={label} errors={errors} hint={hint}>
      {({ controlId, describedBy, invalid }) => (
        <>
          <input
            id={controlId}
            className={controls.control}
            type="url"
            value={value}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            onChange={(event) => {
              onChange(event.target.value);
            }}
          />
          {uploadAsset !== undefined ? (
            <div className={styles.uploadRow}>
              <label className={styles.uploadLabel} htmlFor={fileId}>
                {getAdminLabel('field.avatarUpload')}
              </label>
              <input
                id={fileId}
                ref={fileRef}
                type="file"
                accept={ACCEPT}
                disabled={busy}
                aria-describedby={statusId}
                onChange={handleFile}
              />
              <span className={styles.uploadStatus} id={statusId} role="status" aria-live="polite">
                {busy ? getAdminLabel('status.uploading') : ''}
              </span>
              {uploadError !== null ? (
                <span className={styles.uploadError} role="alert">
                  {uploadError}
                </span>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </Field>
  );
}
