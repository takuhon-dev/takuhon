/**
 * Parity tests for the six sections that were migrated from bespoke forms onto
 * the schema-driven engine (PR4). Each asserts the behavior the hand-written
 * form had still holds when rendered by {@link SchemaForm} + {@link SECTION_REGISTRY}:
 * the avatar trio, comma-separated lists, and the inverted visibility matrix.
 */

import { gravatarUrl, schema, type Settings } from '@takuhon/core';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { indexErrors, type FieldErrorIndex } from '../errors.js';
import { type UploadAsset } from '../primitives/ImageField.js';
import { SchemaForm } from '../schema-form/SchemaForm.js';
import { sectionFieldKind, type SchemaNode } from '../schema-form/field-classification.js';
import { SECTION_REGISTRY } from '../schema-form/section-registry.js';

const root = schema as unknown as SchemaNode;
const LOCALES = ['en', 'ja'] as const;

interface SectionOptions {
  onChange?: (next: unknown) => void;
  errors?: FieldErrorIndex;
  uploadAsset?: UploadAsset;
}

function renderSection(key: string, value: unknown, options: SectionOptions = {}): void {
  render(
    <SchemaForm
      kind={sectionFieldKind(root, key)}
      value={value}
      onChange={options.onChange ?? vi.fn()}
      pointer={`/${key}`}
      label={key}
      locales={LOCALES}
      registry={SECTION_REGISTRY}
      errors={options.errors}
      uploadAsset={options.uploadAsset}
    />,
  );
}

describe('profile (avatar widget)', () => {
  it('creates an avatar object only once a URL is entered', () => {
    const onChange = vi.fn();
    renderSection('profile', { displayName: { en: 'Pat' } }, { onChange });
    fireEvent.change(screen.getByLabelText('Avatar URL'), {
      target: { value: 'https://cdn.example/a.webp' },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ avatar: { url: 'https://cdn.example/a.webp' } }),
    );
  });

  it('drops the avatar when the URL is cleared and there is no alt text', () => {
    const onChange = vi.fn();
    renderSection(
      'profile',
      { displayName: { en: 'Pat' }, avatar: { url: 'https://cdn.example/a.webp' } },
      { onChange },
    );
    fireEvent.change(screen.getByLabelText('Avatar URL'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ avatar: undefined }));
  });

  it('offers an upload control and stores the returned url when uploadAsset is given', async () => {
    const onChange = vi.fn();
    const uploadAsset = vi.fn().mockResolvedValue({
      status: 'uploaded',
      url: '/assets/1-ab.png',
      publicUrl: 'http://x/assets/1-ab.png',
    });
    renderSection('profile', { displayName: { en: 'Pat' } }, { onChange, uploadAsset });

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
    renderSection('profile', { displayName: { en: 'Pat' } }, { onChange });
    fireEvent.change(screen.getByLabelText('Gravatar email'), {
      target: { value: 'person@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Use Gravatar' }));

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ avatar: { url: gravatarUrl('person@example.com') } }),
    );
    expect(JSON.stringify(onChange.mock.calls)).not.toContain('person@example.com');
  });
});

describe('links', () => {
  it('appends a new link with a schema-valid slug id and the website default', () => {
    const onChange = vi.fn();
    renderSection('links', [], { onChange });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const next = onChange.mock.calls[0]![0] as { id: string; type: string }[];
    expect(next).toHaveLength(1);
    expect(next[0]!.id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    expect(next[0]!.type).toBe('website');
  });
});

describe('projects', () => {
  it('parses comma-separated tags into an array', () => {
    const onChange = vi.fn();
    renderSection('projects', [{ id: 'p1', title: { en: 'Demo' } }], { onChange });
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'react, ' } });
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ tags: ['react'] })]);
  });
});

describe('skills', () => {
  it('edits the plain-string label', () => {
    const onChange = vi.fn();
    renderSection('skills', [{ id: 's1', label: 'TypeScript' }], { onChange });
    const item = screen.getByRole('group', { name: 'TypeScript' });
    // `label` is required, so its control's accessible name carries a required marker.
    fireEvent.change(within(item).getByLabelText(/^Label/), { target: { value: 'Rust' } });
    expect(onChange).toHaveBeenLastCalledWith([{ id: 's1', label: 'Rust' }]);
  });
});

describe('settings', () => {
  const settings: Settings = { defaultLocale: 'en', availableLocales: ['en', 'ja'] };

  it('edits the available locale list as a comma-separated field', () => {
    const onChange = vi.fn();
    renderSection('settings', settings, { onChange });
    fireEvent.change(screen.getByLabelText(/^Available locales/), { target: { value: 'en, fr' } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ availableLocales: ['en', 'fr'] }),
    );
  });

  it('surfaces locale-item errors on the aggregate field', () => {
    const errors = indexErrors([{ path: '#/settings/availableLocales/1', message: 'bad locale' }]);
    renderSection('settings', settings, { errors });
    expect(screen.getByText('bad locale')).toBeInTheDocument();
  });

  it('reflects a default-true flag as checked and stores false when turned off', () => {
    const onChange = vi.fn();
    renderSection('settings', settings, { onChange });
    // showPoweredBy defaults to true (schema default), so the first click turns it off.
    fireEvent.click(screen.getByLabelText(/Powered by takuhon/));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ showPoweredBy: false }));
  });

  it('hides a section by storing publicVisibility[section] = false', () => {
    const onChange = vi.fn();
    renderSection('settings', settings, { onChange });
    fireEvent.click(screen.getByLabelText('Education'));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ publicVisibility: { education: false } }),
    );
  });

  it('drops publicVisibility entirely when a hidden section is re-shown', () => {
    const onChange = vi.fn();
    renderSection(
      'settings',
      { ...settings, publicVisibility: { education: false } },
      { onChange },
    );
    fireEvent.click(screen.getByLabelText('Education'));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ publicVisibility: undefined }),
    );
  });
});
