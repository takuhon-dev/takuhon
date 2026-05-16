import { createPublicApp } from '@meport/api';
import { validate, type Meport } from '@meport/core';

import exampleJson from '../../../examples/personal-profile/meport.json' with { type: 'json' };

import { KvMeportStorage } from './kv-storage.js';

export interface Env {
  MEPORT_KV: KVNamespace;
}

function bundledFallback(): Meport {
  const r = validate(exampleJson);
  if (!r.ok) throw new Error('Bundled fixture failed validation.');
  return r.data;
}

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const app = createPublicApp({
      storage: new KvMeportStorage(env.MEPORT_KV),
      fallback: bundledFallback,
    });
    return app.fetch(request, env);
  },
};
