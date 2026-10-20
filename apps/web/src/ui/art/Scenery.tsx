import type { ReactElement } from 'react';
import type { SnackId } from '@snacks/contracts';
import { MarkShape } from './Marks.tsx';
import { SNACK_COLOURS } from './palette.ts';
import { SnackArt } from './Snack.tsx';
import { Shadow, Svg } from './Svg.tsx';

/**
 * The things fixed on a board (RULES 3): lunchboxes, obstacles (a tree, a
 * bench, a sandpit) and the parents' picnic table. Obstacles carry nothing
 * that looks like a snack (no apples on the tree), so a snack on the board is
 * always a snack.
 */

const BOX = '#33b3a6';
const BOX_DARK = '#23877d';

/**
 * An open lunchbox with its snack sticking out, and a tag on the front with
 * the snack colour's mark (palette.ts), so the box can be told by its colour
 * without seeing colour. The lid is its own group: the replay pops it open
 * when a friend picks up (P7).
 */
export function LunchboxArt(props: { snack: SnackId; colour: string; className?: string | undefined; label?: string | undefined }): ReactElement {
  const known = SNACK_COLOURS[props.colour];
  return (
    <Svg kind="lunchbox" className={props.className} label={props.label}>
      <Shadow cy={44} rx={17} />
      <g className="lunchbox-lid">
        <rect x={7} y={10} width={34} height={9} rx={3.5} fill={BOX_DARK} transform="rotate(-10 7 19)" />
      </g>
      <g className="lunchbox-snack">
        <svg x={7} y={1} width={34} height={34} viewBox="0 0 48 48" overflow="visible">
          <SnackArt snack={props.snack} />
        </svg>
      </g>
      <rect x={5} y={23} width={38} height={19} rx={5} fill={BOX} />
      <path d="M5.5 28.5 H42.5" fill="none" stroke={BOX_DARK} strokeWidth={2} />
      <g transform="translate(26.5 26.5) scale(0.6)">
        <rect x={1.5} y={1.5} width={21} height={21} rx={6} fill={known?.fill ?? '#cccccc'} strokeWidth={2.6} />
        {known !== undefined && (
          <g strokeWidth={2.6}>
            <MarkShape mark={known.mark} />
          </g>
        )}
      </g>
      <rect x={10} y={32} width={10} height={4} rx={2} fill="#ffffff" stroke="none" opacity={0.5} />
    </Svg>
  );
}

export type ObstacleKind = 'tree' | 'bench' | 'sandpit';

/** Which obstacle a square shows: looks only, the same square always the same. */
export function obstacleKind(cell: number): ObstacleKind {
  return (['tree', 'bench', 'sandpit'] as const)[(cell * 7 + 3) % 3]!;
}

export function ObstacleArt(props: { kind: ObstacleKind; className?: string | undefined; label?: string | undefined }): ReactElement {
  return (
    <Svg kind={`obstacle obstacle-${props.kind}`} className={props.className} label={props.label}>
      {props.kind === 'tree' && (
        <>
          <Shadow cy={44} rx={13} />
          <path d="M21 30 L20 43 H28 L27 30 Z" fill="#9a6235" />
          <path d="M12 30 Q5 27 8 20 Q6 12 14 10 Q17 3 25 5 Q33 3 36 10 Q43 12 41 20 Q44 28 36 30 Q30 34 24 31 Q18 34 12 30 Z" fill="#4fae55" />
          <path d="M14 18 Q15 13 20 12 M28 11 Q33 11 35 15 M22 24 Q26 26 30 23" fill="none" stroke="#2f8a3e" strokeWidth={2} />
          <path d="M15 14 Q17 9 22 9" fill="none" stroke="#9fe08f" strokeWidth={2.4} />
        </>
      )}
      {props.kind === 'bench' && (
        <>
          <Shadow cy={43} rx={18} />
          <path d="M10 30 V42 M38 30 V42 M12 22 V30 M36 22 V30" fill="none" strokeWidth={3.2} />
          <rect x={5} y={11} width={38} height={6} rx={2.5} fill="#d4934f" />
          <rect x={5} y={18} width={38} height={5} rx={2.5} fill="#c48140" />
          <rect x={3} y={26} width={42} height={6} rx={2.5} fill="#d4934f" />
        </>
      )}
      {props.kind === 'sandpit' && (
        <>
          <rect x={4} y={14} width={40} height={28} rx={9} fill="#f5d98c" stroke="#a8693a" strokeWidth={4} />
          <path d="M9 34 Q14 31 19 34 M27 22 Q31 20 35 22" fill="none" stroke="#d9b45f" strokeWidth={2} />
          <path d="M29 39 L31 28 H39 L41 39 Z" fill="#4f8fe0" />
          <path d="M30.5 28 Q35 23 39.5 28" fill="none" strokeWidth={2} />
          <path d="M12 22 L20 30 M19.5 29.5 L22.5 32.5 L24.5 30.5 L21.5 27.5 Z" fill="#ffd23f" strokeWidth={2.2} />
        </>
      )}
    </Svg>
  );
}

/** The parents' picnic table: two grown-ups behind a checked cloth, a teapot on top. */
export function TableArt(props: { className?: string | undefined; label?: string | undefined }): ReactElement {
  return (
    <Svg kind="table" className={props.className} label={props.label}>
      <Shadow cy={44} rx={18} />
      <circle cx={15} cy={12} r={6.5} fill="#e8b48f" />
      <path d="M8.5 11 Q9 4.5 15 4.5 Q21 4.5 21.5 11 Q15 8 8.5 11 Z" fill="#6b3f1f" />
      <circle cx={33} cy={12} r={6.5} fill="#f9d3b4" />
      <path d="M26.5 11 Q27 4.5 33 4.5 Q39 4.5 39.5 11 Q33 8.5 26.5 11 Z" fill="#d9a441" />
      <circle cx={33} cy={4} r={3} fill="#d9a441" />
      <path d="M8 42 V34 M40 42 V34" fill="none" strokeWidth={3} />
      <rect x={3} y={18} width={42} height={17} rx={3} fill="#ffffff" />
      <g fill="#ef6f6c" stroke="none" opacity={0.85}>
        {[0, 1, 2, 3, 4, 5].flatMap((c) => [0, 1].map((r) => ((c + r) % 2 === 0 ? <rect key={`${c},${r}`} x={4.5 + c * 6.5} y={19.5 + r * 7} width={6.5} height={7} /> : null)))}
      </g>
      <rect x={3} y={18} width={42} height={17} rx={3} fill="none" />
      <path d="M20 18 Q20 12 24.5 12 Q29 12 29 18 Z" fill="#8fc3e8" />
      <path d="M29 14.5 Q32 14.5 31 17" fill="none" strokeWidth={1.8} />
    </Svg>
  );
}
