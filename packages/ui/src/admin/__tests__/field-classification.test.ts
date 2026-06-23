import { schema } from '@takuhon/core';
import { describe, expect, it } from 'vitest';

import {
  classifyNode,
  deref,
  objectEntries,
  refName,
  sectionFieldKind,
  type FieldEntry,
  type FieldKind,
  type SchemaNode,
} from '../schema-form/field-classification.js';

// The canonical schema, viewed structurally for the classifier.
const root = schema as unknown as SchemaNode;

function entry(fields: readonly FieldEntry[], name: string): FieldEntry {
  const found = fields.find((field) => field.name === name);
  if (!found) throw new Error(`no field entry named ${name}`);
  return found;
}

describe('refName', () => {
  it('extracts a local $defs name', () => {
    expect(refName({ $ref: '#/$defs/Career' })).toBe('Career');
  });

  it('ignores non-local or absent refs', () => {
    expect(refName({})).toBeUndefined();
    expect(refName({ $ref: 'https://example.com/x.json' })).toBeUndefined();
  });
});

describe('deref', () => {
  it('follows a single local $ref to its def', () => {
    const result = deref(root, { $ref: '#/$defs/YearMonth' });
    expect(result.ref).toBe('YearMonth');
    expect(result.node.type).toBe('string');
    expect(result.nullable).toBe(false);
  });

  it('unwraps a nullable anyOf union and reports nullable', () => {
    const node: SchemaNode = {
      anyOf: [{ $ref: '#/$defs/YearMonth' }, { type: 'null' }],
    };
    const result = deref(root, node);
    expect(result.nullable).toBe(true);
    expect(result.ref).toBe('YearMonth');
  });

  it('leaves a concrete node and unknown refs unchanged', () => {
    expect(deref(root, { type: 'string' }).node.type).toBe('string');
    const missing = deref(root, { $ref: '#/$defs/DoesNotExist' });
    expect(missing.ref).toBeUndefined();
  });
});

describe('classifyNode — scalar refs and formats', () => {
  const cases: readonly [string, FieldKind['widget']][] = [
    ['YearMonth', 'month'],
    ['Slug', 'slug'],
    ['LocaleTag', 'localeTag'],
    ['Url', 'url'],
    ['Email', 'email'],
    ['IsoDateTime', 'datetime'],
    ['LocalizedTitle', 'localizedTitle'],
    ['LocalizedBody', 'localizedBody'],
  ];
  it.each(cases)('classifies $defs/%s as %s', (def, widget) => {
    expect(classifyNode(root, { $ref: `#/$defs/${def}` }).widget).toBe(widget);
  });

  it('classifies an enum def as a select carrying its options', () => {
    const kind = classifyNode(root, { $ref: '#/$defs/Visibility' });
    expect(kind).toEqual({ widget: 'select', options: ['public', 'private'] });
  });

  it('classifies booleans and integers', () => {
    expect(classifyNode(root, { type: 'boolean' })).toEqual({ widget: 'checkbox' });
    expect(classifyNode(root, { type: 'integer', minimum: 0 })).toEqual({
      widget: 'integer',
      minimum: 0,
    });
  });

  it('carries maxLength on a plain string', () => {
    expect(classifyNode(root, { type: 'string', maxLength: 50 })).toEqual({
      widget: 'text',
      maxLength: 50,
    });
  });
});

describe('classifyNode — arrays and objects', () => {
  it('classifies an array as a repeater over its classified item', () => {
    const kind = classifyNode(root, { type: 'array', items: { $ref: '#/$defs/Career' } });
    expect(kind.widget).toBe('array');
    if (kind.widget !== 'array') throw new Error('unreachable');
    expect(kind.item.widget).toBe('object');
  });

  it('recurses into object properties', () => {
    const kind = classifyNode(root, { $ref: '#/$defs/Contact' });
    expect(kind.widget).toBe('object');
    if (kind.widget !== 'object') throw new Error('unreachable');
    expect(entry(kind.fields, 'email').kind.widget).toBe('email');
    expect(entry(kind.fields, 'showEmail').kind.widget).toBe('checkbox');
    expect(entry(kind.fields, 'formUrl').kind.widget).toBe('url');
  });
});

describe('sectionFieldKind — real sections', () => {
  it('treats array sections as a repeater of objects', () => {
    for (const section of ['careers', 'education', 'certifications', 'recommendations']) {
      const kind = sectionFieldKind(root, section);
      expect(kind.widget, section).toBe('array');
      if (kind.widget !== 'array') throw new Error('unreachable');
      expect(kind.item.widget, `${section} item`).toBe('object');
    }
  });

  it('treats contact/meta/settings as objects', () => {
    for (const section of ['contact', 'meta', 'settings']) {
      expect(sectionFieldKind(root, section).widget, section).toBe('object');
    }
  });

  it('classifies education item fields end-to-end', () => {
    const section = sectionFieldKind(root, 'education');
    if (section.widget !== 'array' || section.item.widget !== 'object') {
      throw new Error('expected array of objects');
    }
    const fields = section.item.fields;
    expect(entry(fields, 'id').kind.widget).toBe('slug');
    expect(entry(fields, 'institution').kind.widget).toBe('localizedTitle');
    expect(entry(fields, 'description').kind.widget).toBe('localizedBody');
    expect(entry(fields, 'startDate').kind.widget).toBe('month');
    expect(entry(fields, 'isCurrent').kind.widget).toBe('checkbox');
    expect(entry(fields, 'url').kind.widget).toBe('url');
    expect(entry(fields, 'visibility').kind.widget).toBe('select');
    expect(entry(fields, 'order').kind.widget).toBe('integer');

    // required vs optional vs nullable, read straight from the schema.
    expect(entry(fields, 'institution').required).toBe(true);
    expect(entry(fields, 'degree').required).toBe(false);
    expect(entry(fields, 'endDate').nullable).toBe(true);
  });

  it('returns unsupported for an unknown section', () => {
    expect(sectionFieldKind(root, 'nope').widget).toBe('unsupported');
  });
});

describe('objectEntries', () => {
  it('preserves declaration order and marks required fields', () => {
    const meta = root.$defs?.Meta;
    if (!meta) throw new Error('Meta def missing');
    const fields = objectEntries(root, meta);
    expect(fields.map((field) => field.name)).toEqual([
      'createdAt',
      'updatedAt',
      'generator',
      'contentLicense',
      'privacy',
    ]);
    expect(entry(fields, 'contentLicense').required).toBe(true);
    expect(entry(fields, 'createdAt').required).toBe(false);
    expect(entry(fields, 'createdAt').kind.widget).toBe('datetime');
  });
});
