/**
 * Where each nation sits on the simplified map: rough [longitude, latitude] of
 * its population centre, plus where its label goes so crowded regions stay
 * readable on a 360 px screen. Display only.
 */
export type LabelSide = 'above' | 'below' | 'left' | 'right';

export const POSITIONS: Readonly<Record<string, { at: readonly [number, number]; label: LabelSide }>> = {
  'united-states': { at: [-95, 39], label: 'right' },
  canada: { at: [-100, 54], label: 'above' },
  mexico: { at: [-102, 22], label: 'right' },
  brazil: { at: [-49, -13], label: 'right' },
  germany: { at: [10, 51], label: 'left' },
  russia: { at: [50, 57], label: 'right' },
  turkiye: { at: [34, 39], label: 'above' },
  'saudi-arabia': { at: [45, 24], label: 'right' },
  egypt: { at: [30, 27], label: 'left' },
  nigeria: { at: [8, 9], label: 'left' },
  'south-africa': { at: [25, -29], label: 'right' },
  india: { at: [78, 22], label: 'below' },
  china: { at: [110, 33], label: 'left' },
  japan: { at: [138, 37], label: 'above' },
  korea: { at: [127, 36], label: 'below' },
  indonesia: { at: [113, -3], label: 'below' },
  australia: { at: [140, -27], label: 'below' },
};

/**
 * Longitude -128..162 and latitude 65..-40, with latitude stretched 1.5x so
 * the Middle East and East Asia clusters separate on a narrow phone.
 */
export const MAP_BOX = { width: 290, height: 158 } as const;

export function project(id: string): { x: number; y: number } {
  const [lon, lat] = POSITIONS[id]?.at ?? [0, 0];
  return { x: lon + 128, y: (65 - lat) * 1.5 };
}

export function labelAt(id: string): { x: number; y: number; anchor: 'start' | 'middle' | 'end' } {
  const { x, y } = project(id);
  switch (POSITIONS[id]?.label ?? 'above') {
    case 'above':
      return { x, y: y - 5, anchor: 'middle' };
    case 'below':
      return { x, y: y + 10, anchor: 'middle' };
    case 'left':
      return { x: x - 5, y: y + 3, anchor: 'end' };
    case 'right':
      return { x: x + 5, y: y + 3, anchor: 'start' };
  }
}
