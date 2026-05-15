import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Footer } from '../Footer.js';

describe('Footer', () => {
  it('renders the "Powered by meport" attribution', () => {
    render(<Footer />);
    expect(screen.getByRole('contentinfo')).toHaveTextContent(/powered by meport/i);
  });

  it('links the meport name to the upstream repository', () => {
    render(<Footer />);
    const link = screen.getByRole('link', { name: /meport/i });
    expect(link).toHaveAttribute('href', 'https://github.com/takashi-matsuyama/meport');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });
});
