import { schema } from '@takuhon/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { indexErrors } from '../errors.js';
import { SchemaForm } from '../schema-form/SchemaForm.js';
import {
  sectionFieldKind,
  type FieldKind,
  type SchemaNode,
} from '../schema-form/field-classification.js';

const root = schema as unknown as SchemaNode;
const locales = ['en', 'ja'] as const;

function educationKind(): FieldKind {
  return sectionFieldKind(root, 'education');
}

function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

describe('SchemaForm — array section (education)', () => {
  const item = {
    id: 'edu-1',
    institution: { en: 'MIT' },
    startDate: '2015-09',
    grade: 'A',
  };

  it('renders the repeater and the item fields from the schema', () => {
    render(
      <SchemaForm
        kind={educationKind()}
        value={[item]}
        onChange={vi.fn()}
        pointer="/education"
        label="Education"
        locales={locales}
      />,
    );
    expect(screen.getByText('Education')).toBeTruthy();
    // Localized title → LocaleTabs labelled by the humanized field name.
    expect(screen.getByText('Institution')).toBeTruthy();
    // Scalars → labelled inputs.
    expect(screen.getByLabelText('Start date', { exact: false })).toBeTruthy();
    expect(screen.getByLabelText('Grade')).toBeTruthy();
  });

  it('propagates an edit back through onChange as the updated array', () => {
    const onChange = vi.fn();
    render(
      <SchemaForm
        kind={educationKind()}
        value={[item]}
        onChange={onChange}
        pointer="/education"
        label="Education"
        locales={locales}
      />,
    );
    fireEvent.change(screen.getByLabelText('Grade'), { target: { value: 'A+' } });
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)?.[0] as unknown[];
    expect(record(next[0]).grade).toBe('A+');
    expect(record(next[0]).id).toBe('edu-1');
  });

  it('maps a validation error to the right item field by pointer', () => {
    const errors = indexErrors([{ pointer: '/education/0/grade', message: 'too long' }]);
    render(
      <SchemaForm
        kind={educationKind()}
        value={[item]}
        onChange={vi.fn()}
        pointer="/education"
        label="Education"
        locales={locales}
        errors={errors}
      />,
    );
    expect(screen.getByText('too long')).toBeTruthy();
  });

  it('hides a field the registry marks hidden, keeping the rest', () => {
    render(
      <SchemaForm
        kind={educationKind()}
        value={[item]}
        onChange={vi.fn()}
        pointer="/education"
        label="Education"
        locales={locales}
        registry={{ 'education.grade': { hidden: true } }}
      />,
    );
    expect(screen.queryByLabelText('Grade')).toBeNull();
    expect(screen.getByLabelText('Start date', { exact: false })).toBeTruthy();
  });
});

describe('SchemaForm — object section (contact)', () => {
  it('renders an object section as a labelled fieldset with typed controls', () => {
    render(
      <SchemaForm
        kind={sectionFieldKind(root, 'contact')}
        value={{ email: 'me@example.com', showEmail: true }}
        onChange={vi.fn()}
        pointer="/contact"
        label="Contact"
        locales={locales}
      />,
    );
    expect(screen.getByText('Contact')).toBeTruthy();
    const email = screen.getByLabelText<HTMLInputElement>('Email');
    expect(email.value).toBe('me@example.com');
    expect(email.type).toBe('email');
    const showEmail = screen.getByLabelText<HTMLInputElement>('Show email');
    expect(showEmail.checked).toBe(true);
  });

  it('adds a missing optional key on edit', () => {
    const onChange = vi.fn();
    render(
      <SchemaForm
        kind={sectionFieldKind(root, 'contact')}
        value={{}}
        onChange={onChange}
        pointer="/contact"
        label="Contact"
        locales={locales}
      />,
    );
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } });
    const next = onChange.mock.calls.at(-1)?.[0];
    expect(record(next).email).toBe('a@b.co');
  });
});
