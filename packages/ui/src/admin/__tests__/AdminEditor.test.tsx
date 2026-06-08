import { validate, type Takuhon } from '@takuhon/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';

import exampleJson from '../../../../../examples/personal-profile/takuhon.json' with { type: 'json' };
import { AdminEditor, type AdminSaveOutcome } from '../AdminEditor.js';

function sample(): Takuhon {
  const result = validate(exampleJson);
  if (!result.ok) throw new Error('fixture invalid');
  return result.data;
}

const saved: AdminSaveOutcome = { status: 'saved', version: 'v2' };

describe('AdminEditor', () => {
  it('renders the field forms in form mode by default', () => {
    render(<AdminEditor initialDocument={sample()} onSave={vi.fn().mockResolvedValue(saved)} />);
    expect(screen.getByRole('heading', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Display name \(/)).toBeInTheDocument();
    // The links repeater legend is present.
    expect(screen.getByRole('group', { name: 'Links' })).toBeInTheDocument();
  });

  it('switches to the raw-JSON advanced mode and back', () => {
    render(<AdminEditor initialDocument={sample()} onSave={vi.fn().mockResolvedValue(saved)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Advanced (JSON)', pressed: false }));
    expect(screen.getByRole('textbox').tagName).toBe('TEXTAREA');
    fireEvent.click(screen.getByRole('button', { name: 'Form', pressed: false }));
    expect(screen.getByRole('heading', { name: 'Profile' })).toBeInTheDocument();
  });

  it('validates client-side and saves a valid document', async () => {
    const onSave = vi.fn<(d: Takuhon) => Promise<AdminSaveOutcome>>().mockResolvedValue(saved);
    render(<AdminEditor initialDocument={sample()} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]![0].profile.displayName.en).toBe('Pat Rivera');
  });

  it('blocks the save and surfaces field errors when the draft is invalid', async () => {
    const onSave = vi.fn<(d: Takuhon) => Promise<AdminSaveOutcome>>().mockResolvedValue(saved);
    // Empty the required displayName to force a client-side validation failure.
    const invalid: Takuhon = { ...sample(), profile: { ...sample().profile, displayName: {} } };
    render(<AdminEditor initialDocument={invalid} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText('Some fields need attention before saving.'),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^Display name \(/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('maps server validation errors (RFC 7807) onto the fields', async () => {
    const onSave = vi.fn<(d: Takuhon) => Promise<AdminSaveOutcome>>().mockResolvedValue({
      status: 'invalid',
      errors: [{ path: '#/profile/displayName/en', message: 'is too long' }],
    });
    render(<AdminEditor initialDocument={sample()} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('is too long')).toBeInTheDocument();
  });

  it('reports a save conflict', async () => {
    const onSave = vi.fn<(d: Takuhon) => Promise<AdminSaveOutcome>>().mockResolvedValue({
      status: 'conflict',
    });
    render(<AdminEditor initialDocument={sample()} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/changed on the server/)).toBeInTheDocument();
  });

  it('clears stale errors as soon as the operator edits a field', async () => {
    const onSave = vi.fn<(d: Takuhon) => Promise<AdminSaveOutcome>>().mockResolvedValue({
      status: 'invalid',
      errors: [{ path: '#/profile/displayName/en', message: 'is too long' }],
    });
    render(<AdminEditor initialDocument={sample()} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('is too long')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Display name \(/), { target: { value: 'Casey' } });
    expect(screen.queryByText('is too long')).not.toBeInTheDocument();
  });

  it('invokes Export with the current draft', () => {
    const onExport = vi.fn();
    render(
      <AdminEditor
        initialDocument={sample()}
        onSave={vi.fn().mockResolvedValue(saved)}
        onExport={onExport}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(onExport).toHaveBeenCalledTimes(1);
    expect(onExport.mock.calls[0]![0].schemaVersion).toBe('0.4.0');
  });

  it('loads an imported document into the editor', async () => {
    const imported: Takuhon = {
      ...sample(),
      profile: { ...sample().profile, displayName: { en: 'Imported Person' } },
    };
    const onImport = vi.fn<() => Promise<Takuhon | undefined>>().mockResolvedValue(imported);
    render(
      <AdminEditor
        initialDocument={sample()}
        onSave={vi.fn().mockResolvedValue(saved)}
        onImport={onImport}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    await waitFor(() => {
      expect(screen.getByLabelText(/^Display name \(/)).toHaveValue('Imported Person');
    });
    expect(
      screen.getByText('Imported. Review the fields, then save to apply.'),
    ).toBeInTheDocument();
  });

  it('rejects an invalid imported document and keeps the current draft', async () => {
    const onImport = vi.fn<() => Promise<unknown>>().mockResolvedValue({ not: 'a takuhon' });
    render(
      <AdminEditor
        initialDocument={sample()}
        onSave={vi.fn().mockResolvedValue(saved)}
        onImport={onImport}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(
      await screen.findByText('The imported file is not a valid takuhon document.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Display name \(/)).toHaveValue('Pat Rivera');
  });

  it('has no detectable a11y violations in form mode', async () => {
    const { container } = render(
      <AdminEditor initialDocument={sample()} onSave={vi.fn().mockResolvedValue(saved)} />,
    );
    expect(await axe.run(container)).toHaveNoViolations();
  });
});
