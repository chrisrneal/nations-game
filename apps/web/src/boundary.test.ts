import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Proof for seam 3: the interface (everything in apps/web/src outside
 * platform/) reaches the sim only through the Host. It may import React, the
 * contracts types, its own files, and the platform's
 * public entry `platform/index.ts` - never the sim, Comlink, a
 * platform internal, or a Worker or storage API directly.
 *
 * ESLint already bans `@warehouse/sim` here; this test is stricter and cannot be
 * switched off with an inline comment.
 */
const SRC = dirname(fileURLToPath(import.meta.url));
const PLATFORM = join(SRC, 'platform');
const PLATFORM_ENTRY = join(PLATFORM, 'index.ts');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return path === PLATFORM ? [] : files(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const IMPORT = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s*['"]([^'"]+)['"]/gm;

function imports(source: string): string[] {
  return [...source.matchAll(IMPORT)].map((m) => m[1] ?? m[2] ?? m[3] ?? '');
}

const PACKAGES = new Set(['react', 'react-dom/client', '@warehouse/contracts']);
const FORBIDDEN_APIS = [/\bnew\s+Worker\b/, /\bindexedDB\b/, /\bpostMessage\b/, /\bnew\s+SharedWorker\b/];

export function violations(file: string, source: string): string[] {
  const problems: string[] = [];
  for (const spec of imports(source)) {
    if (!spec.startsWith('.')) {
      if (!PACKAGES.has(spec)) problems.push(`imports "${spec}"`);
      continue;
    }
    const target = resolve(dirname(file), spec);
    if (target.endsWith('.css')) continue;
    if (!target.startsWith(SRC)) problems.push(`imports "${spec}" from outside the app`);
    else if (target.startsWith(PLATFORM + '/') && target !== PLATFORM_ENTRY) {
      problems.push(`imports platform internal "${spec}" instead of platform/index.ts`);
    }
  }
  for (const api of FORBIDDEN_APIS) if (api.test(source)) problems.push(`uses ${api.source}`);
  return problems;
}

describe('interface boundary (seam 3)', () => {
  const uiFiles = files(SRC);

  it('finds the interface files', () => {
    expect(uiFiles.length).toBeGreaterThan(5);
  });

  it.each(uiFiles.map((f) => [relative(SRC, f), f]))('%s reaches the sim only through the Host', (_name, file) => {
    expect(violations(file, readFileSync(file, 'utf8'))).toEqual([]);
  });

  it('catches the shortcuts it exists to stop', () => {
    const fake = join(SRC, 'ui', 'Fake.tsx');
    expect(violations(fake, "import { step } from '@warehouse/sim';")).toHaveLength(1);
    expect(violations(fake, "import type { Derived } from '@warehouse/sim';")).toHaveLength(1);
    expect(violations(fake, "import { stepWarehouse } from '@warehouse/sim';")).toHaveLength(1);
    expect(violations(fake, "import { WarehouseEngine } from '../platform/engine.ts';")).toHaveLength(1);
    expect(violations(fake, "const m = await import('../platform/engine.ts');")).toHaveLength(1);
    expect(violations(fake, "const w = new Worker('x.js');")).toHaveLength(1);
    expect(violations(fake, "import { createHost } from '../platform/index.ts';")).toEqual([]);
  });
});
