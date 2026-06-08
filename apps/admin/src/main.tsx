import { validate, type Takuhon } from '@takuhon/core';
import { AdminEditor } from '@takuhon/ui/admin';
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { createAdminClient, type AdminClient } from './admin-client.js';

import './index.css';

/** Trigger a client-side download of the document as `takuhon.json`. */
function downloadJson(doc: Takuhon): void {
  const blob = new Blob([`${JSON.stringify(doc, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'takuhon.json';
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Open a file picker and resolve the parsed JSON. Resolves `undefined` when the
 * dialog is cancelled (so the editor treats it as a no-op) and `null` when the
 * file is not valid JSON (so the editor reports it as an invalid import).
 */
function pickJsonFile(): Promise<unknown> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(undefined);
        return;
      }
      file
        .text()
        .then((text) => {
          try {
            resolve(JSON.parse(text));
          } catch {
            resolve(null);
          }
        })
        .catch(() => {
          resolve(null);
        });
    });
    input.click();
  });
}

type Phase =
  | { kind: 'auth'; error?: string }
  | { kind: 'loading' }
  | { kind: 'empty'; error?: string }
  | { kind: 'editing'; doc: Takuhon }
  | { kind: 'error'; message: string };

function TokenGate({
  onSubmit,
  error,
}: {
  onSubmit: (token: string, baseUrl: string) => void;
  error?: string;
}): React.JSX.Element {
  const [token, setToken] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  return (
    <form
      className="gate"
      onSubmit={(event) => {
        event.preventDefault();
        if (token.trim() !== '') onSubmit(token.trim(), baseUrl.trim());
      }}
    >
      <h1>takuhon admin</h1>
      <p className="muted">
        The token is kept in memory for this tab only and sent as a Bearer header.
      </p>
      <label htmlFor="token">Admin token</label>
      <input
        id="token"
        type="password"
        autoComplete="off"
        value={token}
        onChange={(event) => {
          setToken(event.target.value);
        }}
      />
      <label htmlFor="base-url">API origin (optional)</label>
      <input
        id="base-url"
        type="url"
        placeholder="https://me.example"
        autoComplete="off"
        value={baseUrl}
        onChange={(event) => {
          setBaseUrl(event.target.value);
        }}
      />
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit">Connect</button>
    </form>
  );
}

function App(): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>({ kind: 'auth' });
  const [client, setClient] = useState<AdminClient | null>(null);

  const connect = async (token: string, baseUrl: string): Promise<void> => {
    const next = createAdminClient({ token, baseUrl });
    setClient(next);
    setPhase({ kind: 'loading' });
    const result = await next.load();
    switch (result.kind) {
      case 'ok':
        setPhase({ kind: 'editing', doc: result.doc });
        break;
      case 'empty':
        setPhase({ kind: 'empty' });
        break;
      case 'unauthorized':
        setClient(null);
        setPhase({ kind: 'auth', error: 'Invalid admin token.' });
        break;
      case 'error':
        setPhase({ kind: 'error', message: result.message });
        break;
    }
  };

  const importFromFile = async (): Promise<void> => {
    const raw = await pickJsonFile();
    if (raw === undefined) return;
    // Validate before seeding the editor: AdminEditor reads container fields
    // (settings.availableLocales, the arrays) directly, so a malformed import
    // would crash the form. Only a schema-valid document is accepted here.
    const result = validate(raw);
    if (!result.ok) {
      setPhase({ kind: 'empty', error: 'The imported file is not a valid takuhon document.' });
      return;
    }
    setPhase({ kind: 'editing', doc: result.data });
  };

  if (phase.kind === 'auth') {
    return <TokenGate onSubmit={(t, b) => void connect(t, b)} error={phase.error} />;
  }
  if (phase.kind === 'loading') {
    return <p className="status">Loading…</p>;
  }
  if (phase.kind === 'error') {
    return (
      <div className="status">
        <p className="error" role="alert">
          {phase.message}
        </p>
        <button
          type="button"
          onClick={() => {
            setPhase({ kind: 'auth' });
          }}
        >
          Back
        </button>
      </div>
    );
  }
  if (phase.kind === 'empty') {
    return (
      <div className="status">
        <h1>takuhon admin</h1>
        <p>No profile is stored yet. Import a takuhon.json to start editing.</p>
        {phase.error ? (
          <p className="error" role="alert">
            {phase.error}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => {
            void importFromFile();
          }}
        >
          Import takuhon.json
        </button>
      </div>
    );
  }

  // phase.kind === 'editing'
  return (
    <AdminEditor
      initialDocument={phase.doc}
      onSave={(doc) => client!.save(doc)}
      onReload={async () => {
        const result = await client!.load();
        if (result.kind === 'ok') return result.doc;
        throw new Error('Reload failed.');
      }}
      onExport={downloadJson}
      onImport={pickJsonFile}
    />
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('Root container not found');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
