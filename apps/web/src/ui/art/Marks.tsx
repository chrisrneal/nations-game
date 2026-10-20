import type { ReactElement, ReactNode } from 'react';
import type { ClueFact, KidFeature, SnackTrait } from '@snacks/contracts';
import { INK, SNACK_COLOURS, type ColourMark } from './palette.ts';
import { Svg } from './Svg.tsx';

/**
 * Small pictures for everything a clue can point at (RULES 4, 6), so a clue
 * can be read from the art alone (K10): a colour chip with its own mark, crunchy
 * (a jagged crunch) or soft (a cloud), sweet (a wrapped sweet) or salty (a salt
 * shaker), round, long or twisty, the hat, the glasses and sisters. A "not" is
 * a slash across the picture. Each is in a 24-unit box.
 */

const BOX = '0 0 24 24';
const THIN = 1.6;

/** Points round a centre, every other one pulled in: stars and the crunch. */
function spikes(cx: number, cy: number, outer: number, inner: number, n: number): string {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * i) / n - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join(' L')} Z`;
}

const MARK: Readonly<Record<ColourMark, ReactElement>> = {
  triangle: <path d="M12 5.5 L18.5 17 L5.5 17 Z" />,
  square: <rect x={6.5} y={6.5} width={11} height={11} rx={1.5} />,
  star: <path d={spikes(12, 12.6, 7, 3, 5)} />,
  diamond: <path d="M12 4.5 L19.5 12 L12 19.5 L4.5 12 Z" />,
  leaf: (
    <>
      <path d="M5.5 18 Q5.5 6.5 18.5 5.5 Q18.5 18 5.5 18 Z" />
      <path d="M7 16.5 L14.5 9" fill="none" />
    </>
  ),
};

/** The mark a colour wears; null for a colour the game doesn't know. */
export function colourMark(colour: string): ColourMark | null {
  return SNACK_COLOURS[colour]?.mark ?? null;
}

/** The marks drawn alone, for the lunchbox tag (inside its own box). */
export function MarkShape(props: { mark: ColourMark }): ReactElement {
  return <g fill="#ffffff">{MARK[props.mark]}</g>;
}

/** A colour, as a chip: the colour, and its mark in white on it. */
export function ColourChip(props: { colour: string; className?: string | undefined; label?: string | undefined }): ReactElement {
  const known = SNACK_COLOURS[props.colour];
  return (
    <Svg kind="mark" box={BOX} line={THIN} className={props.className} label={props.label}>
      <rect x={1.5} y={1.5} width={21} height={21} rx={6} fill={known?.fill ?? '#cccccc'} />
      {known !== undefined && <MarkShape mark={known.mark} />}
    </Svg>
  );
}

const TRAIT: Readonly<Record<string, ReactElement>> = {
  crunchy: <path d={spikes(12, 12, 10, 5.5, 8)} fill="#fff1c9" />,
  soft: <path d="M6.5 18 Q2.5 18 3 14 Q3.5 10.5 7.5 10.8 Q8.5 5.5 13 6 Q17.5 6.5 17.8 10.5 Q21.5 10.8 21 14.5 Q20.5 18 16.5 18 Z" fill="#ffffff" />,
  sweet: (
    <>
      <path d="M7.5 12 L2.5 7.5 L2.5 16.5 Z" fill="#ffd1e4" />
      <path d="M16.5 12 L21.5 7.5 L21.5 16.5 Z" fill="#ffd1e4" />
      <circle cx={12} cy={12} r={5.5} fill="#ff8fbf" />
      <path d="M9.5 10.5 Q12 9 14.5 10.5" fill="none" stroke="#ffffff" strokeWidth={1.3} />
    </>
  ),
  salty: (
    <>
      <path d="M7.5 21.5 L8.5 10.5 L15.5 10.5 L16.5 21.5 Z" fill="#ffffff" />
      <path d="M8.5 10.5 Q8.5 4 12 4 Q15.5 4 15.5 10.5 Z" fill="#b8c4cc" />
      <g fill={INK} stroke="none">
        <circle cx={10.8} cy={7.4} r={0.8} />
        <circle cx={13.2} cy={7.4} r={0.8} />
        <circle cx={12} cy={5.6} r={0.8} />
      </g>
    </>
  ),
  round: <circle cx={12} cy={12} r={7.5} fill="#ffffff" />,
  long: <rect x={2.5} y={8.5} width={19} height={7} rx={3.5} fill="#ffffff" />,
  twisty: <path d="M12 12 C9 6.5 3 6.5 3 12 C3 17.5 9 17.5 12 12 C15 6.5 21 6.5 21 12 C21 17.5 15 17.5 12 12 Z" fill="#ffffff" strokeWidth={2.2} />,
};

const FEATURE: Readonly<Record<KidFeature | 'sister', ReactElement>> = {
  hat: (
    <>
      <path d="M7 15 Q7.5 5.5 12 5.5 Q16.5 5.5 17 15 Z" fill="#4f8fe0" />
      <path d="M2.5 16.5 Q12 11.5 21.5 16.5 Q12 14.5 2.5 16.5 Z" fill="#4f8fe0" />
      <path d="M7.4 12.5 Q12 11 16.6 12.5" fill="none" stroke="#ffd23f" strokeWidth={1.8} />
    </>
  ),
  glasses: (
    <>
      <circle cx={7} cy={13} r={4.3} fill="#e8f6ff" />
      <circle cx={17} cy={13} r={4.3} fill="#e8f6ff" />
      <path d="M11.3 12.5 Q12 11.5 12.7 12.5 M2.7 12 L1 10 M21.3 12 L23 10" fill="none" />
    </>
  ),
  sister: (
    <>
      <path d="M2 22 Q2 15 7 15 Q12 15 12 22 Z M12 22 Q12 15 17 15 Q22 15 22 22 Z" fill="#ffffff" />
      <circle cx={7} cy={10} r={3.6} fill="#fbd9bd" />
      <circle cx={17} cy={10} r={3.6} fill="#fbd9bd" />
      <g fill={INK} stroke="none">
        <circle cx={5} cy={19} r={0.9} />
        <circle cx={8.5} cy={18.5} r={0.9} />
        <circle cx={15} cy={19} r={0.9} />
        <circle cx={18.5} cy={18.5} r={0.9} />
      </g>
    </>
  ),
};

/** A slash across a picture: "not". */
function Not(): ReactElement {
  return (
    <>
      <path d="M3 21 L21 3" stroke="#ffffff" strokeWidth={5} />
      <path d="M3 21 L21 3" strokeWidth={2.4} />
    </>
  );
}

/** The two bars of "same as". */
function Same(): ReactElement {
  return <path d="M3 8 H8 M3 13 H8" strokeWidth={2.2} />;
}

function Glyph(props: { kind: string; children: ReactNode; className?: string | undefined; label?: string | undefined }): ReactElement {
  return (
    <Svg kind={`mark mark-${props.kind}`} box={BOX} line={THIN} className={props.className} label={props.label}>
      {props.children}
    </Svg>
  );
}

/** One trait value as a picture: a colour chip, or the feel, taste or shape. */
export function TraitIcon(props: { trait: SnackTrait; value: string; not?: boolean; className?: string | undefined; label?: string | undefined }): ReactElement {
  if (props.trait === 'colour') {
    const known = SNACK_COLOURS[props.value];
    return (
      <Glyph kind={`colour-${props.value}`} className={props.className} label={props.label}>
        <rect x={1.5} y={1.5} width={21} height={21} rx={6} fill={known?.fill ?? '#cccccc'} />
        {known !== undefined && <MarkShape mark={known.mark} />}
        {props.not === true && <Not />}
      </Glyph>
    );
  }
  return (
    <Glyph kind={props.value} className={props.className} label={props.label}>
      {TRAIT[props.value] ?? <circle cx={12} cy={12} r={3} />}
      {props.not === true && <Not />}
    </Glyph>
  );
}

/** A kid feature (the hat, the glasses) or sisters. */
export function FeatureIcon(props: { feature: KidFeature | 'sister'; not?: boolean; same?: boolean; className?: string | undefined; label?: string | undefined }): ReactElement {
  return (
    <Glyph kind={props.feature} className={props.className} label={props.label}>
      {FEATURE[props.feature]}
      {props.same === true && <Same />}
      {props.not === true && <Not />}
    </Glyph>
  );
}

/** A clue's facts as pictures, in the order the card says them. */
export function FactIcons(props: { facts: readonly ClueFact[]; className?: string | undefined }): ReactElement {
  return (
    <span className={`facts${props.className === undefined ? '' : ` ${props.className}`}`} aria-hidden="true">
      {props.facts.map((fact, i) => {
        switch (fact.kind) {
          case 'is':
            return <TraitIcon key={i} trait={fact.trait} value={fact.value} />;
          case 'not':
            return <TraitIcon key={i} trait={fact.trait} value={fact.value} not />;
          case 'same':
            return <FeatureIcon key={i} feature={fact.feature} same />;
          case 'notSister':
            return <FeatureIcon key={i} feature="sister" not />;
        }
      })}
    </span>
  );
}
