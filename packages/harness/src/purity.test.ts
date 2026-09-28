/**
 * Gate 0, criterion 1, in executable form: "sim core has no UI, DOM, network or
 * clock imports".
 *
 * ESLint and the tsconfig lib/types settings already block these, but lint
 * configs get relaxed and `eslint-disable` comments get pasted in. This test
 * reads the actual source of packages/sim and packages/contracts and fails the
 * build if impurity appears by any route. It is deliberately dumb text
 * matching: no config to disable, nothing to opt out of.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const PURE_PACKAGES = ['packages/contracts/src', 'packages/sim/src'] as const;

/** Imports allowed in pure packages. Everything else is a failure. */
const ALLOWED_IMPORTS = /^(\.{1,2}\/|@nations\/contracts($|\/))/;
/** Extra imports allowed in *.test.ts inside pure packages: the test runner itself. */
const ALLOWED_TEST_IMPORTS = /^(vitest|fast-check)$/;

const BANNED_IDENTIFIERS: readonly { pattern: RegExp; why: string }[] = [
  { pattern: /\bMath\s*\.\s*random\b/, why: 'use the seeded RNG in State (determinism, seam 5)' },
  { pattern: /\bDate\b/, why: 'the host owns the clock; the sim counts ticks (seam 4)' },
  { pattern: /\bperformance\s*\.\s*now\b/, why: 'the host owns the clock (seam 4)' },
  { pattern: /\bfetch\s*\(/, why: 'the sim never talks to the network' },
  { pattern: /\b(XMLHttpRequest|WebSocket|EventSource)\b/, why: 'the sim never talks to the network' },
  { pattern: /\b(document|window|navigator|localStorage|sessionStorage|indexedDB)\b/, why: 'the sim runs in a Worker and on a server; no DOM' },
  { pattern: /\b(setTimeout|setInterval|requestAnimationFrame|queueMicrotask)\b/, why: 'the sim is synchronous; the host schedules ticks' },
  { pattern: /\bcrypto\b/, why: 'randomness must be reproducible; use the seeded RNG' },
  { pattern: /\bprocess\s*\.\s*env\b/, why: 'no ambient configuration; behaviour comes from State and tunables' },
];

function listTypeScriptFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...listTypeScriptFiles(full));
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) found.push(full);
  }
  return found;
}

/** Remove comments so prose such as "no Date here" does not trip the scan. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function importSpecifiers(code: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /\bimport\s[^;]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bexport\s[^;]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of code.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier !== undefined) specifiers.push(specifier);
    }
  }
  return specifiers;
}

const pureFiles = PURE_PACKAGES.flatMap((pkg) => listTypeScriptFiles(join(repoRoot, pkg)));

describe('pure packages stay pure', () => {
  it('finds source files to check (guards against a silently empty scan)', () => {
    expect(pureFiles.length).toBeGreaterThan(5);
  });

  it.each(pureFiles.map((file) => [relative(repoRoot, file), file] as const))(
    '%s imports only contracts and relative files',
    (name, file) => {
      const isTest = name.includes('.test.');
      const code = stripComments(readFileSync(file, 'utf8'));
      for (const specifier of importSpecifiers(code)) {
        const allowed =
          ALLOWED_IMPORTS.test(specifier) || (isTest && ALLOWED_TEST_IMPORTS.test(specifier));
        expect(
          allowed,
          `${name} imports "${specifier}". Pure packages may import only @nations/contracts and relative files (CLAUDE.md).`,
        ).toBe(true);
      }
    },
  );

  it.each(pureFiles.map((file) => [relative(repoRoot, file), file] as const))(
    '%s uses no DOM, network, clock or unseeded randomness',
    (name, file) => {
      const code = stripComments(readFileSync(file, 'utf8'));
      for (const { pattern, why } of BANNED_IDENTIFIERS) {
        expect(pattern.test(code), `${name} uses ${String(pattern)}: ${why} (CLAUDE.md).`).toBe(
          false,
        );
      }
    },
  );
});
