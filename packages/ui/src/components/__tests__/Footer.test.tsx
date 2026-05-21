import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Footer } from '../Footer.js';

describe('Footer', () => {
  it('renders the "Powered by takuhon" attribution', () => {
    render(<Footer />);
    expect(screen.getByRole('contentinfo')).toHaveTextContent(/powered by takuhon/i);
  });

  it('links the takuhon name to the upstream repository', () => {
    render(<Footer />);
    const link = screen.getByRole('link', { name: /takuhon/i });
    expect(link).toHaveAttribute('href', 'https://github.com/takuhon-dev/takuhon');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });
});
