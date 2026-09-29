import type { NationEndowment } from '@nations/contracts';

/**
 * Layer 3, personality (docs/RULES.md section 7, docs/AI_DESIGN.md).
 *
 * Every trait is computed from the nation's row in data/world-2030.json, never
 * from a judgement about the country (RULES 7.4). Integer maths throughout:
 * intermediate values are kept in ten-thousandths and rounded half up once.
 */
export type Reciprocity = 'strict' | 'forgiving' | 'exploiter';

/** The eight structural inputs of RULES 7.1, whole numbers 0-100. */
export interface StructuralInputs {
  readonly importDependence: number;
  readonly exportConcentration: number;
  readonly tradeOpenness: number;
  readonly allianceDensity: number;
  readonly exposure: number;
  readonly preparedness: number;
  readonly growthHeadroom: number;
  readonly weight: number;
}

export interface Personality {
  /** 0-100: how much weight the nation puts on deals that help both sides. */
  readonly cooperativeness: number;
  /** 0-100: appetite for thin stock buffers and credit spent now. */
  readonly risk: number;
  /** 0-100: how much it values later payoffs (pools, resilience). */
  readonly timeHorizon: number;
  readonly reciprocity: Reciprocity;
  readonly inputs: StructuralInputs;
}

type Thresholds = Readonly<Record<string, number>>;

function clamp100(x10000: number): number {
  const rounded = Math.floor((x10000 + 5000) / 10000);
  return Math.max(0, Math.min(100, rounded));
}

/** RULES 7.1. `worldGdpPppBn` is the whole world's GDP, so `weight` is a share of it. */
export function structuralInputs(e: Omit<NationEndowment, 'id' | 'name'>, worldGdpPppBn: number): StructuralInputs {
  // Import dependence can be a half (e.g. 93.5), so it is carried x10000 in the formulas below.
  const importDependenceE4 = (200 - e.foodSelfSufficiency - e.energySelfSufficiency) * 5000;
  const weightE4 = worldGdpPppBn > 0 ? Math.min(1_000_000, Math.floor((e.gdpPppBn * 4_000_000) / worldGdpPppBn)) : 0;
  return {
    importDependence: clamp100(importDependenceE4),
    exportConcentration: Math.max(0, Math.max(e.foodSelfSufficiency, e.energySelfSufficiency, e.mineralsEndowment) - 50),
    tradeOpenness: Math.min(100, e.blocs.length * 8),
    allianceDensity: Math.min(100, e.alliances.length * 20),
    exposure: e.climateExposure,
    preparedness: e.pandemicPreparedness,
    growthHeadroom: Math.min(100, Math.floor(e.baselineGrowthBp / 10)),
    weight: clamp100(weightE4),
  };
}

/**
 * RULES 7.2. `rules` carries the four reciprocity thresholds (the View's
 * public rules). Import dependence and weight keep their fractions until the
 * final rounding, so Japan's 93.5 counts as 93.5, as in the RULES worked table.
 */
export function personalityFor(
  e: Omit<NationEndowment, 'id' | 'name'>,
  worldGdpPppBn: number,
  rules: Thresholds,
): Personality {
  const inputs = structuralInputs(e, worldGdpPppBn);
  const importE4 = (200 - e.foodSelfSufficiency - e.energySelfSufficiency) * 5000;
  const weightE4 = worldGdpPppBn > 0 ? Math.min(1_000_000, Math.floor((e.gdpPppBn * 4_000_000) / worldGdpPppBn)) : 0;
  const headroomE4 = Math.min(1_000_000, e.baselineGrowthBp * 1000);

  const cooperativeness = clamp100(
    300_000 + Math.floor((35 * importE4) / 100) + 2000 * inputs.tradeOpenness + 1000 * inputs.allianceDensity - Math.floor((15 * weightE4) / 100),
  );
  const risk = clamp100(500_000 + Math.floor((30 * headroomE4) / 100) - 4000 * inputs.exposure);
  const timeHorizon = clamp100(400_000 + 4000 * inputs.preparedness + Math.floor((20 * weightE4) / 100) - 2000 * inputs.exposure);

  const at = (id: string): number => {
    const v = rules[id];
    if (v === undefined) throw new Error(`Missing rule "${id}"`);
    return v;
  };
    let reciprocity: Reciprocity = 'strict';
  if (inputs.allianceDensity >= at('aiReciprocityAllianceThreshold')) reciprocity = 'strict';
  else if (importE4 >= at('aiForgivingImportThreshold') * 10000) reciprocity = 'forgiving';
  else if (inputs.exportConcentration >= at('aiExploiterExportThreshold') && importE4 < at('aiExploiterImportCeiling') * 10000) {
    reciprocity = 'exploiter';
  }
  return { cooperativeness, risk, timeHorizon, reciprocity, inputs };
}

/** The player-facing name for a stance (RULES 12 Q4 recommendation: never show "exploiter"). */
export function stanceLabel(r: Reciprocity): string {
  return r === 'strict' ? 'strict reciprocator' : r === 'forgiving' ? 'forgiving' : 'hard bargainer';
}
