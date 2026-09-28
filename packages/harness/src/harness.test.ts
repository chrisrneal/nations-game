import { describe, expect, it } from 'vitest';
import { HARNESS_PLACEHOLDER_MESSAGE } from './index.ts';

describe('harness', () => {
  it('has a placeholder message until the sim can be run', () => {
    expect(HARNESS_PLACEHOLDER_MESSAGE).toContain('placeholder');
  });
});
