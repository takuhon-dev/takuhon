import { validate, type Takuhon } from '@takuhon/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import exampleJson from '../../../../../examples/personal-profile/takuhon.json' with { type: 'json' };
import { AdminEditor, type AdminSaveOutcome } from '../AdminEditor.js';

function sample(): Takuhon {
  const result = validate(exampleJson);
  if (!result.ok) throw new Error('fixture invalid');
  return result.data;
}

const saved: AdminSaveOutcome = { status: 'saved' };
const noop = (): Promise<AdminSaveOutcome> => Promise.resolve(saved);

describe('AdminEditor — schema-driven sections (PR3)', () => {
  it('renders a fieldset for each formerly form-less section', () => {
    render(<AdminEditor initialDocument={sample()} onSave={noop} />);
    // Section legends become accessible group names. (These strings also appear
    // as publicVisibility checkbox labels in Settings, so we match the group
    // role specifically rather than the bare text.)
    for (const name of [
      'Education',
      'Certifications',
      'Publications',
      'Recommendations',
      'Contact',
      'Metadata',
    ]) {
      expect(screen.getByRole('group', { name }), name).toBeTruthy();
    }
  });

  it('renders the settings.contact group as "Contact form" (distinct from the profile Contact section)', () => {
    render(<AdminEditor initialDocument={sample()} onSave={noop} />);
    // settings.contact (1.1.0) gets a "Contact form" legend so it does not
    // collide with the profile "Contact" section, which stays a single group.
    expect(screen.getByRole('group', { name: 'Contact form' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Contact' })).toBeTruthy();
  });

  it('exposes a typed control for a field that was raw-JSON-only (contact email)', () => {
    render(<AdminEditor initialDocument={sample()} onSave={noop} />);
    // contact.email from the fixture now shows in an <input type=email>.
    expect(screen.getByDisplayValue('pat@example.com')).toBeTruthy();
  });

  it('hides meta auto-managed fields via the registry (decision A1)', () => {
    render(<AdminEditor initialDocument={sample()} onSave={noop} />);
    expect(screen.queryByLabelText('Created at', { exact: false })).toBeNull();
    expect(screen.queryByLabelText('Updated at', { exact: false })).toBeNull();
    expect(screen.queryByLabelText('Generator', { exact: false })).toBeNull();
  });
});
