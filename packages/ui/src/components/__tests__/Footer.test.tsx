import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Footer } from '../Footer.js';

describe('Footer', () => {
  it('renders the "Powered by ownport" attribution', () => {
    render(<Footer />);
    expect(screen.getByRole('contentinfo')).toHaveTextContent(/powered by ownport/i);
  });

  it('links the ownport name to the upstream repository', () => {
    render(<Footer />);
    const link = screen.getByRole('link', { name: /ownport/i });
    expect(link).toHaveAttribute('href', 'https://github.com/ownport-dev/ownport');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });
});
