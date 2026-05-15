import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LocaleSwitcher } from '../LocaleSwitcher.js';

describe('LocaleSwitcher', () => {
  it('renders one option per available locale', () => {
    render(
      <LocaleSwitcher
        availableLocales={['en', 'ja', 'pt-BR']}
        currentLocale="en"
        onSelect={vi.fn()}
      />,
    );
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);
    expect(options.map((o) => o.textContent)).toEqual(['en', 'ja', 'pt-BR']);
  });

  it('selects the currentLocale value', () => {
    render(
      <LocaleSwitcher availableLocales={['en', 'ja']} currentLocale="ja" onSelect={vi.fn()} />,
    );
    expect(screen.getByRole('combobox')).toHaveValue('ja');
  });

  it('calls onSelect with the chosen locale when the user changes selection', () => {
    const handleSelect = vi.fn();
    render(
      <LocaleSwitcher availableLocales={['en', 'ja']} currentLocale="en" onSelect={handleSelect} />,
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ja' } });
    expect(handleSelect).toHaveBeenCalledTimes(1);
    expect(handleSelect).toHaveBeenCalledWith('ja');
  });

  it('applies the custom ariaLabel to the control', () => {
    render(
      <LocaleSwitcher
        availableLocales={['en', 'ja']}
        currentLocale="en"
        onSelect={vi.fn()}
        ariaLabel="Choose language"
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Choose language' })).toBeInTheDocument();
  });

  it('uses formatLocale to render the option label', () => {
    render(
      <LocaleSwitcher
        availableLocales={['en', 'ja']}
        currentLocale="en"
        onSelect={vi.fn()}
        formatLocale={(locale) => (locale === 'en' ? 'English' : '日本語')}
      />,
    );
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['English', '日本語']);
  });
});
