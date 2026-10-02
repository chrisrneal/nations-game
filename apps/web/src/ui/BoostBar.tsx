import { memo, useLayoutEffect, useRef, type ReactElement } from 'react';
import type { BoostId, BoostView } from '@airport/contracts';
import { formatDuration } from './format.ts';
import type { AirportStore } from './store.ts';

const ICONS: Readonly<Record<BoostId, string>> = { rushHour: '🧳', allHands: '🙌', surge: '💰' };

type Phase = 'locked' | 'ready' | 'running' | 'recharging';

function phaseOf(b: BoostView): Phase {
  if (b.locked !== null) return 'locked';
  if (b.left > 0) return 'running';
  if (b.recharge > 0) return 'recharging';
  return 'ready';
}

/**
 * The three boosts (RULES 15) in the thumb zone. React renders a button when its
 * phase changes (locked, ready, running, recharging); the countdown and the
 * bar behind it are written to the DOM every tick (P7). The boost that fixes
 * the bottleneck pulses while it is ready.
 */
export function BoostBar(props: { boosts: readonly BoostView[]; tickMs: number; store: AirportStore; onBoost: (id: BoostId) => void }): ReactElement {
  return (
    <div className="boosts" data-testid="boosts">
      {props.boosts.map((b, i) => (
        <BoostButton key={b.id} index={i} id={b.id} name={b.name} effect={b.effect} phase={phaseOf(b)} locked={b.locked} helps={b.helps} tickMs={props.tickMs} store={props.store} onBoost={props.onBoost} />
      ))}
    </div>
  );
}

interface BoostButtonProps {
  readonly index: number;
  readonly id: BoostId;
  readonly name: string;
  readonly effect: string;
  readonly phase: Phase;
  readonly locked: string | null;
  readonly helps: boolean;
  readonly tickMs: number;
  readonly store: AirportStore;
  readonly onBoost: (id: BoostId) => void;
}

const BoostButton = memo(function BoostButton(props: BoostButtonProps): ReactElement {
  const { index, id, name, effect, phase, locked, helps, tickMs, store, onBoost } = props;
  const fill = useRef<HTMLElement>(null);
  const status = useRef<HTMLSpanElement>(null);

  useLayoutEffect(
    () =>
      store.onFrame((update) => {
        const b = update.view.boosts[index];
        if (b === undefined || fill.current === null || status.current === null) return;
        if (b.left > 0) {
          fill.current.style.transform = `scaleX(${b.left / Math.max(1, b.length)})`;
          status.current.textContent = formatDuration((b.left * tickMs) / 1000);
        } else if (b.recharge > 0 && b.locked === null) {
          fill.current.style.transform = `scaleX(${1 - b.recharge / Math.max(1, b.rechargeLength)})`;
          status.current.textContent = formatDuration((b.recharge * tickMs) / 1000);
        } else {
          fill.current.style.transform = 'scaleX(1)';
          status.current.textContent = b.locked ?? 'Ready';
        }
      }),
    [store, index, tickMs],
  );

  const label = phase === 'locked' ? `${name}: ${locked ?? ''}` : phase === 'ready' ? `${name}: ${effect}. Tap to start.` : phase === 'running' ? `${name} is running` : `${name} is recharging`;
  return (
    <button
      type="button"
      className={`boost boost-${phase}${helps && phase === 'ready' ? ' helps' : ''}`}
      disabled={phase !== 'ready'}
      onClick={() => onBoost(id)}
      aria-label={label}
      data-testid={`boost-${id}`}
    >
      <i ref={fill} className="boost-fill" aria-hidden="true" />
      <span className="boost-name">
        <span className="boost-icon" aria-hidden="true">{ICONS[id]}</span>{name}
      </span>
      <span ref={status} className="boost-status" aria-hidden="true" />
    </button>
  );
});
