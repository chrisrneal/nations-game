import { useEffect, useState, type ReactElement } from 'react';
import type { WmsAction, WmsPickRule, WmsPolicy, WmsReleaseMode } from '@warehouse/contracts';

/** The pick orders (RULES 16, W7): what each does and what it costs. */
export const PICK_RULES: readonly { readonly id: WmsPickRule; readonly name: string; readonly does: string; readonly cost: string }[] = [
  { id: 'priority', name: 'Priority', does: 'Pickers take P1 lines first, then the earliest ship-by. Stock goes to the same orders first.', cost: 'Standard orders wait behind urgent ones, even when their cutoff is closer.' },
  { id: 'cutoff', name: 'Cutoff', does: 'Pickers take the line whose ship-by is soonest, whatever its priority.', cost: 'A P1 with a later cutoff waits its turn.' },
  { id: 'nearest', name: 'Nearest bin', does: 'Each free picker takes the line with the shortest walk from where it stands.', cost: 'Least walking, most lines an hour, but urgency is ignored: cutoffs can slip.' },
];

/** The release modes (RULES 16, W7). */
export const RELEASE_MODES: readonly { readonly id: WmsReleaseMode; readonly name: string; readonly does: string; readonly cost: string }[] = [
  { id: 'waves', name: 'Waves', does: 'Every minute, all NEW orders go to the floor together, and the most urgent get the stock first.', cost: 'A new order can wait up to a minute before anyone works on it.' },
  { id: 'continuous', name: 'Continuous', does: 'Each order goes to the floor the moment it arrives.', cost: 'Stock goes to whoever came first, so a later P1 can find its bin empty.' },
  { id: 'manual', name: 'Manual', does: 'Nothing is released until you do it: Outbound › Release….', cost: 'If you forget, the floor stands still and cutoffs pass.' },
];

/**
 * The operating plan (decision record W7): decisions the WMS otherwise makes
 * itself. Each change is a `policy` command; the sim applies it within a tick,
 * and the page shows the sim's plan as soon as the View has it (a pending
 * choice shows meanwhile).
 */
export function Plan(props: { policy: WmsPolicy; crew: number; submit: (action: WmsAction) => void }): ReactElement {
  const { policy, crew, submit } = props;
  const key = `${policy.pick}|${policy.release}|${policy.pickers}`;
  // A choice waits for the sim's plan to change; once it has (or after a few seconds, if refused), the sim's plan shows.
  const [pending, setPending] = useState<{ plan: WmsPolicy; from: string } | null>(null);
  const shown = pending !== null && pending.from === key ? pending.plan : policy;
  useEffect(() => {
    if (pending === null) return;
    const timer = setTimeout(() => setPending(null), 3000);
    return () => clearTimeout(timer);
  }, [pending]);
  const change = (next: Partial<WmsPolicy>): void => {
    const plan = { ...shown, ...next };
    if (plan.pick === policy.pick && plan.release === policy.release && plan.pickers === policy.pickers) return;
    setPending({ plan, from: key });
    submit({ action: 'policy', policy: plan });
  };
  const pick = PICK_RULES.find((r) => r.id === shown.pick) ?? PICK_RULES[0];
  const release = RELEASE_MODES.find((r) => r.id === shown.release) ?? RELEASE_MODES[0];
  const receivers = crew - shown.pickers;
  return (
    <div className="wms-plan" data-testid="wms-plan">
      <p className="wms-plan-intro">You run the floor. These are the decisions the WMS makes on its own unless you change them. Watch the KPIs above and the Floor tab to see what each one does.</p>
      <section className="wms-plan-part" aria-labelledby="plan-pick">
        <h3 id="plan-pick">Pick order</h3>
        <div className="wms-seg wms-seg-wide" role="radiogroup" aria-labelledby="plan-pick">
          {PICK_RULES.map((r) => (
            <button key={r.id} type="button" role="radio" aria-checked={shown.pick === r.id} onClick={() => change({ pick: r.id })} data-testid={`plan-pick-${r.id}`}>
              {r.name}
            </button>
          ))}
        </div>
        <p className="wms-plan-does">{pick?.does}</p>
        <p className="wms-plan-cost">Catch: {pick?.cost}</p>
      </section>
      <section className="wms-plan-part" aria-labelledby="plan-release">
        <h3 id="plan-release">Release</h3>
        <div className="wms-seg wms-seg-wide" role="radiogroup" aria-labelledby="plan-release">
          {RELEASE_MODES.map((r) => (
            <button key={r.id} type="button" role="radio" aria-checked={shown.release === r.id} onClick={() => change({ release: r.id })} data-testid={`plan-release-${r.id}`}>
              {r.name}
            </button>
          ))}
        </div>
        <p className="wms-plan-does">{release?.does}</p>
        <p className="wms-plan-cost">Catch: {release?.cost}</p>
      </section>
      <section className="wms-plan-part" aria-labelledby="plan-crew">
        <h3 id="plan-crew">Crew</h3>
        <div className="wms-crew">
          <button type="button" className="wms-btn" aria-label="One fewer picker, one more receiver" disabled={shown.pickers <= 1} onClick={() => change({ pickers: shown.pickers - 1 })} data-testid="plan-crew-less">
            −
          </button>
          <div className="wms-crew-split" aria-live="polite" data-testid="plan-crew">
            <span>
              <b className="num">{shown.pickers}</b> picking
            </span>
            <span className="wms-crew-people" aria-hidden="true">
              {Array.from({ length: crew }, (_, i) => (
                <i key={i} className={i < shown.pickers ? 'pk' : 'rc'} />
              ))}
            </span>
            <span>
              <b className="num">{receivers}</b> receiving
            </span>
          </div>
          <button type="button" className="wms-btn" aria-label="One more picker, one fewer receiver" disabled={receivers <= 1} onClick={() => change({ pickers: shown.pickers + 1 })} data-testid="plan-crew-more">
            +
          </button>
        </div>
        <p className="wms-plan-does">Your {crew} people split between picking orders and receiving trucks. Moving someone takes effect at once; a line they leave is started again by someone else.</p>
        <p className="wms-plan-cost">Catch: more pickers ship faster but trucks wait longer at the doors, and the shelves can run dry.</p>
      </section>
    </div>
  );
}
