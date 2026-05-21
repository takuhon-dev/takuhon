import { resolveLocale, validate } from '@takuhon/core';
import { render } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';

import exampleJson from '../../../../../examples/personal-profile/takuhon.json' with { type: 'json' };
import { LocaleSwitcher } from '../LocaleSwitcher.js';
import { OwnportHead } from '../TakuhonHead.js';
import { OwnportProfile } from '../TakuhonProfile.js';

const validated = validate(exampleJson);
if (!validated.ok) {
  throw new Error('Example fixture failed validation; a11y audit cannot run.');
}
const example = resolveLocale(validated.data, 'en');

async function audit(node: Element): Promise<axe.AxeResults> {
  return axe.run(node);
}

describe('axe-core a11y audit', () => {
  it('OwnportProfile has no detectable a11y violations', async () => {
    const { container } = render(<OwnportProfile data={example} />);
    expect(await audit(container)).toHaveNoViolations();
  });

  it('LocaleSwitcher has no detectable a11y violations', async () => {
    const { container } = render(
      <LocaleSwitcher availableLocales={['en', 'ja']} currentLocale="en" onSelect={vi.fn()} />,
    );
    expect(await audit(container)).toHaveNoViolations();
  });

  it('OwnportHead does not introduce body-level a11y violations', async () => {
    const { container } = render(
      <OwnportHead data={example} siteUrl="https://example.com" pageUrl="https://example.com/" />,
    );
    expect(await audit(container)).toHaveNoViolations();
  });
});
