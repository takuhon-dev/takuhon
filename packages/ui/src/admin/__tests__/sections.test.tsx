import { gravatarUrl, type Link, type Project, type Settings, type Skill } from '@takuhon/core';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { indexErrors } from '../errors.js';
import { LinksForm } from '../sections/LinksForm.js';
import { ProfileForm } from '../sections/ProfileForm.js';
import { ProjectsForm } from '../sections/ProjectsForm.js';
import { SettingsForm } from '../sections/SettingsForm.js';
import { SkillsForm } from '../sections/SkillsForm.js';

const LOCALES = ['en', 'ja'] as const;

describe('ProfileForm', () => {
  it('creates an avatar object only once a URL is entered', () => {
    const onChange = vi.fn();
    render(
      <ProfileForm value={{ displayName: { en: 'Pat' } }} onChange={onChange} locales={LOCALES} />,
    );
    fireEvent.change(screen.getByLabelText('Avatar URL'), {
      target: { value: 'https://cdn.example/a.webp' },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ avatar: { url: 'https://cdn.example/a.webp' } }),
    );
  });

  it('drops the avatar when the URL is cleared and there is no alt text', () => {
    const onChange = vi.fn();
    render(
      <ProfileForm
        value={{ displayName: { en: 'Pat' }, avatar: { url: 'https://cdn.example/a.webp' } }}
        onChange={onChange}
        locales={LOCALES}
      />,
    );
    fireEvent.change(screen.getByLabelText('Avatar URL'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ avatar: undefined }));
  });

  it('offers an avatar upload control and stores the returned url when uploadAsset is given', async () => {
    const onChange = vi.fn();
    const uploadAsset = vi.fn().mockResolvedValue({
      status: 'uploaded',
      url: '/assets/1-ab.png',
      publicUrl: 'http://x/assets/1-ab.png',
    });
    render(
      <ProfileForm
        value={{ displayName: { en: 'Pat' } }}
        onChange={onChange}
        locales={LOCALES}
        uploadAsset={uploadAsset}
      />,
    );

    const file = new File([new Uint8Array([0x89, 0x50])], 'a.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Upload image'), { target: { files: [file] } });

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ avatar: { url: '/assets/1-ab.png' } }),
      );
    });
  });

  it('sets the avatar from a Gravatar email without ever storing the email', () => {
    const onChange = vi.fn();
    render(
      <ProfileForm value={{ displayName: { en: 'Pat' } }} onChange={onChange} locales={LOCALES} />,
    );
    fireEvent.change(screen.getByLabelText('Gravatar email'), {
      target: { value: 'person@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Use Gravatar' }));

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ avatar: { url: gravatarUrl('person@example.com') } }),
    );
    // The email is hashed into the URL and must never reach the document itself.
    expect(JSON.stringify(onChange.mock.calls)).not.toContain('person@example.com');
  });
});

describe('LinksForm', () => {
  it('appends a new link with a schema-valid slug id', () => {
    const onChange = vi.fn();
    render(<LinksForm value={[]} onChange={onChange} locales={LOCALES} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const next = onChange.mock.calls[0]![0] as Link[];
    expect(next).toHaveLength(1);
    expect(next[0]!.id).toMatch(/^link-1$/);
    expect(next[0]!.id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    expect(next[0]!.type).toBe('website');
  });

  it('re-keys to a custom link with an icon when the type changes', () => {
    const onChange = vi.fn();
    const link: Link = { id: 'a', type: 'website', url: 'https://x.example' };
    render(<LinksForm value={[link]} onChange={onChange} locales={LOCALES} />);
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'custom' } });
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ type: 'custom', iconUrl: '', url: 'https://x.example' }),
    ]);
  });

  it('marks the icon URL required for custom links', () => {
    const link: Link = { id: 'a', type: 'custom', url: 'https://x.example', iconUrl: '' };
    render(<LinksForm value={[link]} onChange={vi.fn()} locales={LOCALES} />);
    expect(screen.getByLabelText(/^Icon URL/)).toHaveAttribute('aria-required', 'true');
  });
});

describe('ProjectsForm', () => {
  it('parses comma-separated tags into an array', () => {
    const onChange = vi.fn();
    const project: Project = { id: 'p1', title: { en: 'Demo' } };
    render(<ProjectsForm value={[project]} onChange={onChange} locales={LOCALES} />);
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'react, ' } });
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ tags: ['react'] })]);
  });
});

describe('SkillsForm', () => {
  it('edits the plain-string label', () => {
    const onChange = vi.fn();
    const skill: Skill = { id: 's1', label: 'TypeScript' };
    render(<SkillsForm value={[skill]} onChange={onChange} />);
    const item = screen.getByRole('group', { name: 'TypeScript' });
    fireEvent.change(within(item).getByLabelText(/^Label/), { target: { value: 'Rust' } });
    expect(onChange).toHaveBeenLastCalledWith([{ id: 's1', label: 'Rust' }]);
  });
});

describe('SettingsForm', () => {
  const settings: Settings = { defaultLocale: 'en', availableLocales: ['en', 'ja'] };

  it('edits the available locale list', () => {
    const onChange = vi.fn();
    render(<SettingsForm value={settings} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/^Available locales/), { target: { value: 'en, fr' } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ availableLocales: ['en', 'fr'] }),
    );
  });

  it('surfaces locale-item errors on the aggregate field', () => {
    const errors = indexErrors([{ path: '#/settings/availableLocales/1', message: 'bad locale' }]);
    render(<SettingsForm value={settings} onChange={vi.fn()} errors={errors} />);
    expect(screen.getByText('bad locale')).toBeInTheDocument();
  });

  it('toggles a feature flag', () => {
    const onChange = vi.fn();
    render(<SettingsForm value={settings} onChange={onChange} />);
    // Defaults to true, so the first click turns it off.
    fireEvent.click(screen.getByLabelText(/Powered by takuhon/));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ showPoweredBy: false }));
  });
});
