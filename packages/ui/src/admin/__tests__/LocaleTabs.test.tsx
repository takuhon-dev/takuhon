import { fireEvent, render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';

import { indexErrors } from '../errors.js';
import { LocaleTabs } from '../primitives/LocaleTabs.js';

describe('LocaleTabs', () => {
  it('renders one tab per locale and selects the first by default', () => {
    render(
      <LocaleTabs
        label="Display name"
        value={{ en: 'Pat', ja: 'パット' }}
        locales={['en', 'ja']}
        onChange={vi.fn()}
      />,
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['en', 'ja']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    // The panel shows the active locale's value.
    expect(screen.getByRole('textbox')).toHaveValue('Pat');
  });

  it('switches the visible value when another tab is clicked', () => {
    render(
      <LocaleTabs
        label="Display name"
        value={{ en: 'Pat', ja: 'パット' }}
        locales={['en', 'ja']}
        onChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'ja' }));
    expect(screen.getByRole('textbox')).toHaveValue('パット');
  });

  it('writes edits back into the active locale and prunes empties', () => {
    const onChange = vi.fn();
    render(
      <LocaleTabs
        label="Tagline"
        value={{ en: 'hi' }}
        locales={['en', 'ja']}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello' } });
    expect(onChange).toHaveBeenLastCalledWith({ en: 'hello' });

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('moves the active tab with arrow keys (roving tabindex)', () => {
    render(
      <LocaleTabs
        label="Display name"
        value={{ en: 'Pat', ja: 'パット' }}
        locales={['en', 'ja']}
        onChange={vi.fn()}
      />,
    );
    const [first] = screen.getAllByRole('tab');
    first!.focus();
    fireEvent.keyDown(first!, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'ja' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('textbox')).toHaveValue('パット');
  });

  it('renders a multiline control when multiline is set', () => {
    render(
      <LocaleTabs
        label="Bio"
        value={{ en: 'long' }}
        locales={['en']}
        onChange={vi.fn()}
        multiline
      />,
    );
    expect(screen.getByRole('textbox').tagName).toBe('TEXTAREA');
  });

  it('surfaces per-locale errors at pointer/locale', () => {
    const errors = indexErrors([{ path: '#/profile/displayName/en', message: 'is required' }]);
    render(
      <LocaleTabs
        label="Display name"
        value={{}}
        locales={['en', 'ja']}
        onChange={vi.fn()}
        pointer="/profile/displayName"
        errors={errors}
      />,
    );
    expect(screen.getByText('is required')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
  });

  it('surfaces base-pointer errors not tied to a specific locale', () => {
    const errors = indexErrors([
      { path: '#/profile/displayName', message: 'must have a value in at least one locale' },
    ]);
    render(
      <LocaleTabs
        label="Display name"
        value={undefined}
        locales={['en', 'ja']}
        onChange={vi.fn()}
        pointer="/profile/displayName"
        errors={errors}
      />,
    );
    expect(screen.getByText('must have a value in at least one locale')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
  });

  it('announces which tabs contain errors to screen readers', () => {
    const errors = indexErrors([{ path: '#/profile/displayName/ja', message: 'too long' }]);
    render(
      <LocaleTabs
        label="Display name"
        value={{ en: 'Pat' }}
        locales={['en', 'ja']}
        onChange={vi.fn()}
        pointer="/profile/displayName"
        errors={errors}
      />,
    );
    // The 'ja' tab carries an accessible "(has errors)" marker; 'en' does not.
    expect(screen.getByRole('tab', { name: /ja \(has errors\)/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'en' })).toBeInTheDocument();
  });

  it('has no detectable a11y violations', async () => {
    const { container } = render(
      <LocaleTabs
        label="Display name"
        value={{ en: 'Pat', ja: 'パット' }}
        locales={['en', 'ja']}
        onChange={vi.fn()}
      />,
    );
    expect(await axe.run(container)).toHaveNoViolations();
  });
});
