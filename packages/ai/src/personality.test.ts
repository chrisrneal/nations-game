import { describe, expect, it } from 'vitest';
import { TUNABLES } from '@nations/sim';
import { endowmentsOf } from './director.ts';
import { personalityFor, stanceLabel } from './personality.ts';
import { fullRoster } from './testkit.test.helpers.ts';

const rules = Object.fromEntries(Object.entries(TUNABLES).map(([k, t]) => [k, t.value]));
const endowments = endowmentsOf(fullRoster());
const world = endowments.reduce((s, e) => s + e.gdpPppBn, 0);
const of = (id: string) => personalityFor(endowments.find((e) => e.id === id)!, world, rules);

describe('personality from data/world-2030.json (RULES 7)', () => {
  it('reproduces the three worked examples of RULES 7.3 exactly', () => {
    expect(of('japan')).toMatchObject({
      cooperativeness: 73,
      risk: 38,
      timeHorizon: 59,
      reciprocity: 'forgiving',
      inputs: { importDependence: 94, exportConcentration: 0, tradeOpenness: 48, allianceDensity: 20, exposure: 35, preparedness: 60, growthHeadroom: 6, weight: 12 },
    });
    expect(of('nigeria')).toMatchObject({ cooperativeness: 47, risk: 43, timeHorizon: 46, reciprocity: 'exploiter' });
    expect(of('australia')).toMatchObject({ cooperativeness: 41, risk: 44, timeHorizon: 63, reciprocity: 'strict' });
  });

  it('gives the roster all three styles, from thresholds alone', () => {
    const styles = endowments.filter((e) => e.kind === 'playable').map((e) => of(e.id).reciprocity);
    expect(styles.filter((s) => s === 'strict').length).toBe(5);
    expect(styles.filter((s) => s === 'forgiving').length).toBe(7);
    expect(styles.filter((s) => s === 'exploiter').length).toBe(5);
  });

  it('moves with the tunable thresholds, not with anything about the country', () => {
    const strictOnly = { ...rules, aiReciprocityAllianceThreshold: 20 };
    const japan = personalityFor(endowments.find((e) => e.id === 'japan')!, world, strictOnly);
    expect(japan.reciprocity).toBe('strict');
  });

  it('never shows the word "exploiter" to a player', () => {
    expect(stanceLabel('exploiter')).toBe('hard bargainer');
  });
});
