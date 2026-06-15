/**
 * The Takuhon WordPress admin screen (Phase 1).
 *
 * A minimal editor: it loads the current canonical profile, lets the owner
 * paste/import a takuhon.json, validates and derives the public bundle in the
 * browser with {@link deriveBundle}, and publishes both the master and the
 * bundle to the authenticated admin REST endpoint. The richer
 * `@wordpress/components` form (locale tabs, repeaters) is Phase 2.
 */

import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { deriveBundle } from './derive';

interface AdminConfig {
  readonly restUrl: string;
  readonly nonce: string;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string; details?: readonly string[] }
  | { kind: 'published'; locales: readonly string[] };

function getConfig(): AdminConfig | null {
  const config = (window as unknown as { TAKUHON_ADMIN?: AdminConfig }).TAKUHON_ADMIN;
  return config?.restUrl ? config : null;
}

function App({ config }: { config: AdminConfig }) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch(`${config.restUrl}/admin/profile`, {
      headers: { 'X-WP-Nonce': config.nonce },
      credentials: 'same-origin',
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((master: unknown) => {
        if (cancelled) return;
        const hasProfile =
          master !== null && typeof master === 'object' && Object.keys(master).length > 0;
        setText(hasProfile ? JSON.stringify(master, null, 2) : '');
        setStatus({ kind: 'idle' });
      })
      .catch(() => {
        if (!cancelled)
          setStatus({ kind: 'error', message: 'Could not load the current profile.' });
      });
    return () => {
      cancelled = true;
    };
  }, [config]);

  async function publish() {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (error) {
      setStatus({ kind: 'error', message: `That is not valid JSON: ${(error as Error).message}` });
      return;
    }

    const derived = deriveBundle(raw, new Date().toISOString());
    if (!derived.ok) {
      setStatus({
        kind: 'error',
        message: 'The profile is not valid:',
        details: derived.errors.map((e) => `${e.pointer || '/'}: ${e.message}`),
      });
      return;
    }

    setStatus({ kind: 'loading' });
    try {
      const response = await fetch(`${config.restUrl}/admin/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': config.nonce },
        credentials: 'same-origin',
        body: JSON.stringify({ master: derived.master, public: derived.public }),
      });
      if (!response.ok) {
        throw new Error(`The server returned ${response.status}.`);
      }
      const body = (await response.json()) as { locales?: string[] };
      setStatus({ kind: 'published', locales: body.locales ?? [] });
    } catch (error) {
      setStatus({ kind: 'error', message: `Could not publish: ${(error as Error).message}` });
    }
  }

  const busy = status.kind === 'loading';

  return (
    <div style={{ maxWidth: 800 }}>
      <p>
        Paste or edit your <code>takuhon.json</code> below, then publish. The profile is validated
        and the public page, JSON-LD, and API are generated in your browser before saving.
      </p>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        spellCheck={false}
        rows={24}
        style={{ width: '100%', fontFamily: 'monospace', fontSize: 13 }}
        aria-label="takuhon.json"
      />
      <p>
        <button
          type="button"
          className="button button-primary"
          onClick={() => void publish()}
          disabled={busy}
        >
          {busy ? 'Working…' : 'Validate & Publish'}
        </button>
      </p>
      <Notice status={status} />
    </div>
  );
}

function Notice({ status }: { status: Status }) {
  if (status.kind === 'error') {
    return (
      <div className="notice notice-error" style={{ padding: '8px 12px' }}>
        <p>{status.message}</p>
        {status.details && status.details.length > 0 ? (
          <ul style={{ listStyle: 'disc', marginLeft: 20 }}>
            {status.details.map((detail) => (
              <li key={detail}>
                <code>{detail}</code>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  if (status.kind === 'published') {
    const locales = status.locales.length > 0 ? ` (${status.locales.join(', ')})` : '';
    return (
      <div className="notice notice-success" style={{ padding: '8px 12px' }}>
        <p>Published{locales}.</p>
      </div>
    );
  }

  return null;
}

const root = document.getElementById('takuhon-admin-root');
const config = getConfig();
if (root && config) {
  createRoot(root).render(
    <StrictMode>
      <App config={config} />
    </StrictMode>,
  );
}
