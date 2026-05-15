import { resolveLocale, validate } from '@meport/core';
import { MeportProfile } from '@meport/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import exampleJson from '../../../examples/personal-profile/meport.json' with { type: 'json' };

const result = validate(exampleJson);
if (!result.ok) {
  throw new Error(
    `Example meport.json failed validation: ${result.errors
      .map((e) => `${e.pointer} ${e.message}`)
      .join('; ')}`,
  );
}

const localized = resolveLocale(result.data, 'en');

const container = document.getElementById('root');
if (!container) throw new Error('Root container not found');

createRoot(container).render(
  <StrictMode>
    <MeportProfile data={localized} />
  </StrictMode>,
);
