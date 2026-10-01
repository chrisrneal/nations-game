import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * The purity rules below are the load-bearing part of this file: they are how
 * "packages/sim and packages/contracts are pure TypeScript" (CLAUDE.md) is
 * enforced rather than hoped for. Two other guards back them up:
 *   - those packages' tsconfigs use `lib` without DOM and `types: []`, so DOM and
 *     Node globals are type errors too;
 *   - packages/harness/src/purity.test.ts scans their source text, so an
 *     eslint-disable comment cannot buy a way past it.
 * Relaxing any of the three needs a new decision record in docs/DECISIONS.md.
 */


/**
 * Local rule: an explicit allow-list of import specifiers per package. ESLint's
 * own `no-restricted-imports` uses gitignore-style patterns, whose negations do
 * not express "nothing except these" reliably, and getting this wrong silently
 * would disable the architecture's main guard. This rule is 20 lines and says
 * exactly what it means.
 */
const airportPlugin = {
  rules: {
    'allowed-imports': {
      meta: {
        type: 'problem',
        docs: { description: 'Restrict a package to an allow-list of import specifiers.' },
        schema: [
          {
            type: 'object',
            properties: {
              allow: { type: 'array', items: { type: 'string' } },
              message: { type: 'string' },
            },
            additionalProperties: false,
          },
        ],
      },
      create(context) {
        const options = context.options[0] ?? {};
        const allow = (options.allow ?? []).map((pattern) => new RegExp(pattern));
        const message = options.message ?? 'This import is not allowed in this package.';
        const check = (node, value) => {
          if (typeof value !== 'string') return;
          if (!allow.some((pattern) => pattern.test(value))) {
            context.report({ node, message: `Import of "${value}" is not allowed. ${message}` });
          }
        };
        return {
          ImportDeclaration: (node) => check(node, node.source.value),
          ExportAllDeclaration: (node) => check(node, node.source.value),
          ExportNamedDeclaration: (node) => {
            if (node.source) check(node, node.source.value);
          },
          ImportExpression: (node) => {
            if (node.source.type === 'Literal') check(node, node.source.value);
          },
        };
      },
    },
  },
};

const RELATIVE = '^\\.{1,2}/';
const CONTRACTS = '^@airport/contracts($|/)';

const PURE_PACKAGES = ['packages/contracts/**/*.ts', 'packages/sim/**/*.ts'];

const IMPURE_GLOBALS = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'document',
  'window',
  'navigator',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'caches',
  'performance',
  'crypto',
  'setTimeout',
  'setInterval',
  'requestAnimationFrame',
  'process',
];

const purityMessage =
  'Not allowed in packages/sim or packages/contracts: they must stay pure (no DOM, network, clock or unseeded randomness). See CLAUDE.md and docs/DECISIONS.md.';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dev-dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      'apps/web/public/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      'no-console': 'off',
    },
  },
  // ---- purity: packages/sim and packages/contracts ----
  {
    files: PURE_PACKAGES,
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-globals': [
        'error',
        ...IMPURE_GLOBALS.map((name) => ({ name, message: purityMessage })),
        { name: 'Date', message: `${purityMessage} The host owns the clock; the sim counts ticks.` },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: `${purityMessage} Use the seeded RNG in State.` },
        { object: 'Date', property: 'now', message: purityMessage },
        { object: 'performance', property: 'now', message: purityMessage },
        { object: 'crypto', property: 'getRandomValues', message: purityMessage },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: 'NewExpression[callee.name="Date"]', message: purityMessage },
        { selector: 'MemberExpression[object.name="globalThis"]', message: purityMessage },
      ],
    },
  },
  {
    files: ['packages/sim/**/*.ts'],
    plugins: { airport: airportPlugin },
    rules: {
      'airport/allowed-imports': [
        'error',
        {
          allow: [RELATIVE, CONTRACTS],
          message: 'packages/sim may import only @airport/contracts and its own files. See CLAUDE.md.',
        },
      ],
    },
  },
  {
    files: ['packages/contracts/**/*.ts'],
    plugins: { airport: airportPlugin },
    rules: {
      'airport/allowed-imports': [
        'error',
        {
          allow: [RELATIVE],
          message: 'packages/contracts imports nothing outside itself. See CLAUDE.md.',
        },
      ],
    },
  },
  // Tests inside the pure packages may import the test runner, nothing else.
  {
    files: ['packages/sim/**/*.test.ts', 'packages/contracts/**/*.test.ts'],
    rules: {
      'airport/allowed-imports': [
        'error',
        {
          allow: [RELATIVE, CONTRACTS, '^vitest$', '^fast-check$'],
          message:
            'Tests in pure packages may import vitest, fast-check, @airport/contracts and their own files only.',
        },
      ],
    },
  },
  // ---- Node-side packages ----
  {
    files: ['packages/harness/**/*.ts', '*.config.ts', '*.config.js', 'apps/web/vite.config.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
  // ---- browser app ----
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@airport/sim',
              message:
                'The interface reaches the sim only through the Host interface in apps/web/src/platform. See CLAUDE.md.',
            },
          ],
        },
      ],
    },
  },
  // platform (lane P) is the one place allowed to construct the sim and a Worker.
  {
    files: ['apps/web/src/platform/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': 'off' },
  },
);
