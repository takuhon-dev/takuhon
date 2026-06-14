import { gravatarUrl } from '@takuhon/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';

import { CheckboxField } from '../primitives/CheckboxField.js';
import { GravatarField } from '../primitives/GravatarField.js';
import { ImageField } from '../primitives/ImageField.js';
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

describe('ImageField', () => {
  const pngFile = (): File =>
    new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'a.png', { type: 'image/png' });

  it('is URL-only (no file input) when no uploadAsset is given', () => {
    render(<ImageField label="Avatar" value="https://x/a.png" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Avatar')).toHaveValue('https://x/a.png');
    expect(screen.queryByLabelText('Upload image')).toBeNull();
  });

  it('calls onChange when the URL is typed', () => {
    const onChange = vi.fn();
    render(<ImageField label="Avatar" value="" onChange={onChange} uploadAsset={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Avatar'), { target: { value: 'https://x/b.png' } });
    expect(onChange).toHaveBeenCalledWith('https://x/b.png');
  });

  it('uploads a file and writes the returned url back into the field', async () => {
    const onChange = vi.fn();
    const uploadAsset = vi.fn().mockResolvedValue({
      status: 'uploaded',
      url: '/assets/1-ab.png',
      publicUrl: 'http://x/assets/1-ab.png',
    });
    render(<ImageField label="Avatar" value="" onChange={onChange} uploadAsset={uploadAsset} />);

    const file = pngFile();
    fireEvent.change(screen.getByLabelText('Upload image'), { target: { files: [file] } });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('/assets/1-ab.png');
    });
    expect(uploadAsset).toHaveBeenCalledWith(file);
  });

  it('shows an error and leaves the value when the upload fails', async () => {
    const onChange = vi.fn();
    const uploadAsset = vi
      .fn()
      .mockResolvedValue({ status: 'error', message: 'Image is too large (the limit is 5 MB).' });
    render(<ImageField label="Avatar" value="" onChange={onChange} uploadAsset={uploadAsset} />);

    fireEvent.change(screen.getByLabelText('Upload image'), { target: { files: [pngFile()] } });

    expect(await screen.findByRole('alert')).toHaveTextContent('Image is too large');
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('GravatarField', () => {
  it('renders an email input and an apply button', () => {
    render(<GravatarField onApply={vi.fn()} />);
    expect(screen.getByLabelText('Gravatar email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use Gravatar' })).toBeInTheDocument();
  });

  it('disables the apply button until an email is entered', () => {
    render(<GravatarField onApply={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Use Gravatar' });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Gravatar email'), {
      target: { value: 'person@example.com' },
    });
    expect(button).toBeEnabled();
  });

  it('applies the gravatar URL for the entered email and clears the input', () => {
    const onApply = vi.fn();
    render(<GravatarField onApply={onApply} />);
    const input = screen.getByLabelText('Gravatar email');
    fireEvent.change(input, { target: { value: '  Person@Example.com  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use Gravatar' }));
    expect(onApply).toHaveBeenCalledWith(gravatarUrl('person@example.com'));
    expect(input).toHaveValue('');
  });

  it('applies on Enter within the email input', () => {
    const onApply = vi.fn();
    render(<GravatarField onApply={onApply} />);
    const input = screen.getByLabelText('Gravatar email');
    fireEvent.change(input, { target: { value: 'person@example.com' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onApply).toHaveBeenCalledWith(gravatarUrl('person@example.com'));
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
