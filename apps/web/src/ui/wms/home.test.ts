import { describe, expect, it } from 'vitest';
import { nextSpeed } from './Home.tsx';

describe('the speed button (W9)', () => {
  it('steps up through the running speeds and round to the slowest; from pause it runs at the default', () => {
    expect(nextSpeed(1)).toBe(5);
    expect(nextSpeed(5)).toBe(10);
    expect(nextSpeed(10)).toBe(1);
    expect(nextSpeed(0)).toBe(5);
  });
});
