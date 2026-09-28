import { defineConfig } from 'vitest/config';

/**
 * One runner for the whole monorepo. Node environment only for now: there are no
 * UI tests yet, and adding jsdom before anything needs it would slow every run.
 * Lane U adds a jsdom project when it has a component worth testing (logged in
 * docs/GAPS.md).
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts'],
    reporters: ['default'],
    passWithNoTests: false,
  },
});
