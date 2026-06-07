import { fireEvent, render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';

import { CheckboxField } from '../primitives/CheckboxField.js';
import { SelectField } from '../primitives/SelectField.js';
import { TextAreaField as TextArea } from '../primitives/TextAreaField.js';
import { TextField } from '../primitives/TextField.js';

describe('TextField', () => {
  it('associates the label with the input and reflects the value', () => {
    render(<TextField label="Display name" value="Pat" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Display name')).toHaveValue('Pat');
  });

  it('calls onChange with the new value on input', () => {
    const onChange = vi.fn();
    render(<TextField label="URL" value="" onChange={onChange} type="url" />);
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'https://x.example' } });
    expect(onChange).toHaveBeenCalledWith('https://x.example');
  });

  it('exposes errors via aria-invalid and aria-describedby', () => {
    render(<TextField label="URL" value="bad" onChange={vi.fn()} errors={['must be a uri']} />);
    const input = screen.getByLabelText('URL');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(screen.getByText('must be a uri')).toBeInTheDocument();
  });

  it('marks required fields with aria-required', () => {
    render(<TextField label="Name" value="" onChange={vi.fn()} required />);
    expect(screen.getByLabelText(/Name/)).toHaveAttribute('aria-required', 'true');
  });
});

describe('TextAreaField', () => {
  it('renders a textarea bound to the label', () => {
    const onChange = vi.fn();
    render(<TextArea label="Bio" value="hello" onChange={onChange} />);
    const area = screen.getByLabelText('Bio');
    expect(area.tagName).toBe('TEXTAREA');
    fireEvent.change(area, { target: { value: 'world' } });
    expect(onChange).toHaveBeenCalledWith('world');
  });
});

describe('SelectField', () => {
  const options = [
    { value: 'en', label: 'English' },
    { value: 'ja', label: 'Japanese' },
  ];

  it('renders the options and current value', () => {
    render(<SelectField label="Default locale" value="ja" options={options} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Default locale')).toHaveValue('ja');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'English',
      'Japanese',
    ]);
  });

  it('calls onChange with the selected value', () => {
    const onChange = vi.fn();
    render(<SelectField label="Default locale" value="en" options={options} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Default locale'), { target: { value: 'ja' } });
    expect(onChange).toHaveBeenCalledWith('ja');
  });
});

describe('CheckboxField', () => {
  it('reflects checked state and reports toggles', () => {
    const onChange = vi.fn();
    render(<CheckboxField label="Show Powered by" checked={false} onChange={onChange} />);
    const box = screen.getByLabelText('Show Powered by');
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('admin primitives a11y', () => {
  it('has no detectable a11y violations when composed in a form', async () => {
    const { container } = render(
      <form aria-label="Test form">
        <TextField label="Display name" value="Pat" onChange={vi.fn()} required />
        <TextArea label="Bio" value="hello" onChange={vi.fn()} />
        <SelectField
          label="Theme"
          value="default"
          options={[{ value: 'default', label: 'Default' }]}
          onChange={vi.fn()}
        />
        <CheckboxField label="Show Powered by" checked onChange={vi.fn()} />
      </form>,
    );
    expect(await axe.run(container)).toHaveNoViolations();
  });
});
