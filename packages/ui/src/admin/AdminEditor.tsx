import { schema, validate, type LocaleTag, type Takuhon } from '@takuhon/core';
import { useRef, useState } from 'react';

import styles from './AdminEditor.module.css';
import { RawJsonEditor } from './RawJsonEditor.js';
import { getAdminLabel, type AdminLabelKey } from './admin-labels.js';
import {
  indexErrors,
  indexValidationErrors,
  NO_FIELD_ERRORS,
  type FieldErrorIndex,
  type FieldErrorLike,
} from './errors.js';
import { type UploadAsset } from './primitives/ImageField.js';
import { SchemaForm } from './schema-form/SchemaForm.js';
import { sectionFieldKind, type SchemaNode } from './schema-form/field-classification.js';
import { type FieldRegistry } from './schema-form/field-registry.js';
import { CareersForm } from './sections/CareersForm.js';
import { LinksForm } from './sections/LinksForm.js';
import { ProfileForm } from './sections/ProfileForm.js';
import { ProjectsForm } from './sections/ProjectsForm.js';
import { SettingsForm } from './sections/SettingsForm.js';
import { SkillsForm } from './sections/SkillsForm.js';

/** Result of a save attempt, reported by the host's transport layer. */
export type AdminSaveOutcome =
  | { status: 'saved'; version?: string }
  | { status: 'conflict' }
  | { status: 'invalid'; errors: readonly FieldErrorLike[] }
  | { status: 'error'; message?: string };

export interface AdminEditorProps {
  /** Document to edit, typically loaded from `GET /api/admin/export`. */
  initialDocument: Takuhon;
  /** Persist the document. The editor validates client-side first. */
  onSave: (document: Takuhon) => Promise<AdminSaveOutcome>;
  /** Re-fetch the stored document, replacing the working draft. */
  onReload?: () => Promise<Takuhon>;
  /** Download / hand off the current draft (Export button). */
  onExport?: (document: Takuhon) => void;
  /**
   * Provide a document to load (Import button). Returns raw parsed JSON, which
   * the editor validates; `undefined` cancels. Validation lives here so an
   * invalid file cannot break the draft invariant.
   */
  onImport?: () => Promise<unknown>;
  formatLocale?: (locale: LocaleTag) => string;
  /**
   * Upload an avatar image file (host-supplied; carries the admin token). When
   * provided, the profile form's avatar field offers a file picker; otherwise
   * the avatar stays URL-only.
   */
  uploadAsset?: UploadAsset;
}

type Mode = 'form' | 'advanced';
type Tone = 'info' | 'success' | 'error';
interface Status {
  tone: Tone;
  message: string;
}

const schemaRoot = schema as unknown as SchemaNode;

/**
 * Sections without a bespoke form: rendered by the schema-driven
 * {@link SchemaForm} engine so every section is editable as a form rather than
 * only as raw JSON (spec §14.2 Phase 5). The hand-written forms above stay
 * until they are migrated onto the engine.
 */
const SCHEMA_SECTIONS = [
  { key: 'education', label: 'section.education' },
  { key: 'certifications', label: 'section.certifications' },
  { key: 'publications', label: 'section.publications' },
  { key: 'honors', label: 'section.honors' },
  { key: 'volunteering', label: 'section.volunteering' },
  { key: 'memberships', label: 'section.memberships' },
  { key: 'languages', label: 'section.languages' },
  { key: 'courses', label: 'section.courses' },
  { key: 'patents', label: 'section.patents' },
  { key: 'testScores', label: 'section.testScores' },
  { key: 'recommendations', label: 'section.recommendations' },
  { key: 'contact', label: 'section.contact' },
  { key: 'meta', label: 'section.meta' },
] as const satisfies readonly { key: keyof Takuhon; label: AdminLabelKey }[];

/**
 * UI hints for the schema-driven sections (decision A1): hide meta's
 * auto-managed fields, and clarify a label that would otherwise collide with
 * the profile's "Display name". The data schema itself stays UI-free.
 */
const SECTION_REGISTRY: FieldRegistry = {
  'meta.createdAt': { hidden: true },
  'meta.updatedAt': { hidden: true },
  'meta.generator': { hidden: true },
  'languages.displayName': { label: 'Language name' },
};

function setSection(doc: Takuhon, key: keyof Takuhon, value: unknown): Takuhon {
  return { ...doc, [key]: value };
}

/**
 * Top-level admin editor: holds the working draft, switches between the field
 * forms and the raw-JSON advanced mode, and runs client-side validation before
 * delegating persistence to the host via `onSave` (transport-agnostic). Server
 * (RFC 7807) and client (`validate`) errors map to the same fields.
 */
export function AdminEditor({
  initialDocument,
  onSave,
  onReload,
  onExport,
  onImport,
  formatLocale,
  uploadAsset,
}: AdminEditorProps): React.JSX.Element {
  const [draft, setDraft] = useState<Takuhon>(initialDocument);
  const [mode, setMode] = useState<Mode>('form');
  const [errors, setErrors] = useState<FieldErrorIndex>(NO_FIELD_ERRORS);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  // Bumped whenever the document is replaced wholesale (reload / import) to
  // remount the raw-JSON editor so its text re-seeds from the new draft.
  const [loadGen, setLoadGen] = useState(0);
  // Identifies the latest user intent. A save reads it after awaiting `onSave`
  // and discards its outcome if an edit (which bumps the counter) landed
  // meanwhile — preventing a stale "Saved." or stale server errors.
  const intentRef = useRef(0);

  const locales = draft.settings.availableLocales;

  // Any edit clears the previous validation snapshot so resolved errors do not
  // linger while the operator works through them, and invalidates any in-flight
  // save outcome.
  const updateDraft = (next: Takuhon): void => {
    intentRef.current += 1;
    setDraft(next);
    setErrors(NO_FIELD_ERRORS);
    setStatus(null);
  };

  const loadDocument = (next: Takuhon, message: Status | null): void => {
    intentRef.current += 1;
    setDraft(next);
    setErrors(NO_FIELD_ERRORS);
    setStatus(message);
    setLoadGen((generation) => generation + 1);
  };

  const handleSave = async (): Promise<void> => {
    const result = validate(draft);
    if (!result.ok) {
      setErrors(indexValidationErrors(result.errors));
      setStatus({ tone: 'error', message: getAdminLabel('status.invalid') });
      return;
    }
    setErrors(NO_FIELD_ERRORS);
    intentRef.current += 1;
    const intent = intentRef.current;
    setBusy(true);
    setStatus({ tone: 'info', message: getAdminLabel('status.saving') });
    try {
      const outcome = await onSave(result.data);
      if (intent !== intentRef.current) return; // an edit landed mid-save; ignore
      switch (outcome.status) {
        case 'saved':
          setStatus({ tone: 'success', message: getAdminLabel('status.saved') });
          break;
        case 'conflict':
          setStatus({ tone: 'error', message: getAdminLabel('status.conflict') });
          break;
        case 'invalid':
          setErrors(indexErrors(outcome.errors));
          setStatus({ tone: 'error', message: getAdminLabel('status.invalid') });
          break;
        case 'error':
          setStatus({ tone: 'error', message: outcome.message ?? getAdminLabel('status.error') });
          break;
      }
    } catch {
      if (intent === intentRef.current) {
        setStatus({ tone: 'error', message: getAdminLabel('status.error') });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleReload = async (): Promise<void> => {
    if (!onReload) return;
    setBusy(true);
    setStatus({ tone: 'info', message: getAdminLabel('status.loading') });
    try {
      const next = await onReload();
      loadDocument(next, null);
    } catch {
      setStatus({ tone: 'error', message: getAdminLabel('status.error') });
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async (): Promise<void> => {
    if (!onImport) return;
    try {
      const raw = await onImport();
      if (raw === undefined) return;
      const result = validate(raw);
      if (!result.ok) {
        setStatus({ tone: 'error', message: getAdminLabel('status.importInvalid') });
        return;
      }
      loadDocument(result.data, {
        tone: 'info',
        message: getAdminLabel('status.imported'),
      });
    } catch {
      setStatus({ tone: 'error', message: getAdminLabel('status.error') });
    }
  };

  // Flattened error list for the summary. This is the safety net that surfaces
  // failures in sections without a dedicated form (e.g. meta, education): their
  // pointers would otherwise map to no visible field.
  const errorEntries = [...errors].flatMap(([pointer, messages]) =>
    messages.map((message) => ({ pointer, message })),
  );

  return (
    <div className={styles.editor}>
      <div className={styles.toolbar} role="toolbar" aria-label={getAdminLabel('toolbar.label')}>
        <div className={styles.modes} role="group" aria-label={getAdminLabel('mode.label')}>
          <button
            type="button"
            className={`${styles.modeButton} ${mode === 'form' ? styles.modeActive : ''}`}
            aria-pressed={mode === 'form'}
            onClick={() => {
              setMode('form');
            }}
          >
            {getAdminLabel('mode.form')}
          </button>
          <button
            type="button"
            className={`${styles.modeButton} ${mode === 'advanced' ? styles.modeActive : ''}`}
            aria-pressed={mode === 'advanced'}
            onClick={() => {
              setMode('advanced');
            }}
          >
            {getAdminLabel('mode.advanced')}
          </button>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primary}
            disabled={busy}
            onClick={() => {
              void handleSave();
            }}
          >
            {getAdminLabel('action.save')}
          </button>
          {onReload ? (
            <button
              type="button"
              className={styles.secondary}
              disabled={busy}
              onClick={() => {
                void handleReload();
              }}
            >
              {getAdminLabel('action.reload')}
            </button>
          ) : null}
          {onExport ? (
            <button
              type="button"
              className={styles.secondary}
              onClick={() => {
                onExport(draft);
              }}
            >
              {getAdminLabel('action.export')}
            </button>
          ) : null}
          {onImport ? (
            <button
              type="button"
              className={styles.secondary}
              disabled={busy}
              onClick={() => {
                void handleImport();
              }}
            >
              {getAdminLabel('action.import')}
            </button>
          ) : null}
        </div>
      </div>

      <p className={styles.status} role="status" aria-live="polite" data-tone={status?.tone}>
        {status?.message ?? ''}
      </p>

      {errorEntries.length > 0 ? (
        <section className={styles.summary} aria-labelledby="admin-error-summary">
          <h2 className={styles.summaryHeading} id="admin-error-summary">
            {getAdminLabel('status.fixSummary')}
          </h2>
          <ul>
            {errorEntries.map((entry, i) => (
              <li key={i}>
                {entry.pointer === ''
                  ? entry.message
                  : `${entry.pointer.replace(/^\//, '')}: ${entry.message}`}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {mode === 'form' ? (
        <div className={styles.sections}>
          <ProfileForm
            value={draft.profile}
            onChange={(profile) => {
              updateDraft({ ...draft, profile });
            }}
            locales={locales}
            errors={errors}
            formatLocale={formatLocale}
            uploadAsset={uploadAsset}
          />
          <LinksForm
            value={draft.links}
            onChange={(links) => {
              updateDraft({ ...draft, links });
            }}
            locales={locales}
            errors={errors}
            formatLocale={formatLocale}
          />
          <CareersForm
            value={draft.careers}
            onChange={(careers) => {
              updateDraft({ ...draft, careers });
            }}
            locales={locales}
            errors={errors}
            formatLocale={formatLocale}
          />
          <ProjectsForm
            value={draft.projects}
            onChange={(projects) => {
              updateDraft({ ...draft, projects });
            }}
            locales={locales}
            errors={errors}
            formatLocale={formatLocale}
          />
          <SkillsForm
            value={draft.skills}
            onChange={(skills) => {
              updateDraft({ ...draft, skills });
            }}
            errors={errors}
          />
          <SettingsForm
            value={draft.settings}
            onChange={(settings) => {
              updateDraft({ ...draft, settings });
            }}
            errors={errors}
            formatLocale={formatLocale}
          />
          {SCHEMA_SECTIONS.map(({ key, label }) => (
            <SchemaForm
              key={key}
              kind={sectionFieldKind(schemaRoot, key)}
              value={draft[key]}
              onChange={(next) => {
                updateDraft(setSection(draft, key, next));
              }}
              pointer={`/${key}`}
              label={getAdminLabel(label)}
              locales={locales}
              errors={errors}
              registry={SECTION_REGISTRY}
              formatLocale={formatLocale}
            />
          ))}
        </div>
      ) : (
        <RawJsonEditor key={loadGen} value={draft} onChange={updateDraft} />
      )}
    </div>
  );
}
