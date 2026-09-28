import type { ReactElement } from 'react';
import type { Pace } from '@nations/contracts';
import { PACE_INTERVAL_MS } from '../platform/index.ts';
import { tickDate } from '../world/nations.ts';
import { Num } from './why.tsx';

const PACES: readonly { pace: Pace; label: string; name: string }[] = [
  { pace: 'paused', label: '❚❚', name: 'Pause' },
  { pace: 'x1', label: '1×', name: 'Normal speed' },
  { pace: 'x4', label: '4×', name: 'Fast' },
];

/** Live tick counter and pace control, in the thumb zone. */
export function PaceBar(props: {
  tick: number;
  gameLength: number;
  over: boolean;
  pace: Pace;
  onPace: (pace: Pace) => void;
  onNextMonth: () => void;
}): ReactElement {
  const speed = props.over
    ? 'The game is over: the clock has stopped at 2035.'
    : props.pace === 'x1' || props.pace === 'x4'
      ? `Running at ${props.pace === 'x1' ? '1x' : '4x'}: one month every ${PACE_INTERVAL_MS[props.pace] / 1000} s in this play-test build.`
      : 'Paused: nothing moves until you press 1×, 4× or ⏭ for one month.';
  return (
    <div className="pacebar">
      <Num
        className="tick"
        why={{
          title: 'World clock',
          value: `Month ${props.tick} · ${tickDate(props.tick)}`,
          text: `One tick is one world month, starting January 2030; a full game is ${props.gameLength} months (${props.gameLength - props.tick} left). ${speed}`,
        }}
      >
        <span className="tick-count" data-testid="tick">
          {props.tick}
        </span>
        <span className="tick-date">{tickDate(props.tick)}</span>
      </Num>
      <div className="pace" role="radiogroup" aria-label="Speed">
        {PACES.map((p) => (
          <button
            key={p.pace}
            type="button"
            role="radio"
            aria-checked={props.pace === p.pace}
            aria-label={p.name}
            className={props.pace === p.pace ? 'pace-btn on' : 'pace-btn'}
            onClick={() => props.onPace(p.pace)}
          >
            {p.label}
          </button>
        ))}
        <button type="button" className="pace-btn" aria-label="Next month" data-testid="next-month" disabled={props.over} onClick={props.onNextMonth}>
          ⏭
        </button>
      </div>
    </div>
  );
}
