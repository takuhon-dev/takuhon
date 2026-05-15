import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ContactInfo } from '../ContactInfo.js';

describe('ContactInfo', () => {
  it('renders a contact form link when formUrl is set', () => {
    render(<ContactInfo contact={{ formUrl: 'https://example.com/contact' }} />);
    const link = screen.getByRole('link', { name: /contact form/i });
    expect(link).toHaveAttribute('href', 'https://example.com/contact');
  });

  it('hides email when showEmail is false even if email is set', () => {
    render(<ContactInfo contact={{ email: 'pat@example.com', showEmail: false }} />);
    expect(screen.queryByText(/pat@example.com/)).not.toBeInTheDocument();
  });

  it('shows email as a mailto link when showEmail is true', () => {
    render(<ContactInfo contact={{ email: 'pat@example.com', showEmail: true }} />);
    const link = screen.getByRole('link', { name: 'pat@example.com' });
    expect(link).toHaveAttribute('href', 'mailto:pat@example.com');
  });

  it('returns nothing when neither email is shown nor formUrl is set', () => {
    const { container } = render(<ContactInfo contact={{}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
