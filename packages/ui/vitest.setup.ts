import '@testing-library/jest-dom/vitest';

import type { AxeResults } from 'axe-core';
import { expect } from 'vitest';

interface MatcherResult {
  actual: AxeResults['violations'];
  message: () => string;
  pass: boolean;
}

function toHaveNoViolations(results: AxeResults): MatcherResult {
  const violations = results.violations ?? [];
  const pass = violations.length === 0;
  return {
    actual: violations,
    pass,
    message: () => {
      if (pass) return 'expected axe-core results to contain violations';
      const lines = violations.map((v) => {
        const targets = v.nodes.map((n) => n.target.join(', ')).join('; ');
        return `[${v.id}] ${v.help} (impact=${v.impact ?? 'unknown'}) — ${targets}`;
      });
      return `axe-core reported ${String(violations.length)} violation(s):\n${lines.join('\n')}`;
    },
  };
}

expect.extend({ toHaveNoViolations });
