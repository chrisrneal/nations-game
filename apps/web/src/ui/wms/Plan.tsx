import { useEffect, useState, type ReactElement } from 'react';
import type { WmsAction, WmsGrowthView, WmsLaborMode, WmsNeeds, WmsPickRule, WmsPolicy, WmsReleaseMode } from '@warehouse/contracts';
import { formatCash, type ClockShape } from '../format.ts';
import { NeedsPanel } from './Labour.tsx';

/** The pick orders (RULES 16, W7): what each does and what it costs. */
export const PICK_RULES: readonly { readonly id: WmsPickRule; readonly name: string; readonly does: string; readonly cost: string }[] = [
  { id: 'priority', name: 'Priority', does: 'The WMS gives pickers P1 tasks first, then the earliest ship-by. Stock goes to the same orders first.', cost: 'Standard orders wait behind urgent ones, even when their cutoff is closer.' },
  { id: 'cutoff', name: 'Cutoff', does: 'The WMS gives pickers the task whose ship-by is soonest, whatever its priority.', cost: 'A P1 with a later cutoff waits its turn.' },
  { id: 'nearest', name: 'Nearest bin', does: 'The WMS gives each picker the task with the shortest walk from where it will stand.', cost: 'Least walking, most lines an hour, but urgency is ignored: cutoffs can slip.' },
];

/** The release modes (RULES 16, W7). */
export const RELEASE_MODES: readonly { readonly id: WmsReleaseMode; readonly name: string; readonly does: string; readonly cost: string }[] = [
  { id: 'waves', name: 'Waves', does: 'At every wave, all NEW orders go to the floor together, and the most urgent get the stock first.', cost: 'A new order can wait a whole interval before anyone works on it.' },
  { id: 'continuous', name: 'Continuous', does: 'Each order goes to the floor the moment it arrives.', cost: 'Stock goes to whoever came first, so a later P1 can find its bin empty.' },
  { id: 'manual', name: 'Manual', does: 'Nothing is released until you do it: Outbound › Release….', cost: 'If you forget, the floor stands still and cutoffs pass.' },
];

/** The labour plans (W9). */
export const LABOR_MODES: readonly { readonly id: WmsLaborMode; readonly name: string; readonly does: string; readonly cost: string }[] = [
  { id: 'fixed', name: 'Fixed', does: 'People stay where you put them: the split below, or a move from Crew.', cost: 'When a truck docks or a wave lands, the other side does not help.' },
  { id: 'balance', name: 'Balance by need', does: 'Every 15 warehouse minutes the WMS moves one person to the side with more tasks waiting a head.', cost: 'Whoever moves drops what they hold, and fewer receivers means stock lands later: on time goes up, fill can drop.' },
];

/** A wave interval in warehouse time: 30 min, 1 h, 2 h. */
export function waveName(ticks: number, time: ClockShape): string {
  const m = Math.floor(ticks / time.ticksPerMinute);
  return m < 60 || m % 60 !== 0 ? `${m} min` : `${m / 60} h`;
}

/**
 * The operating plan (decision record W7): decisions the WMS otherwise makes
 * itself. Each change is a `policy` command; the sim applies it within a tick,
 * and the page shows the sim's plan as soon as the View has it (a pending
 * choice shows meanwhile).
 */
export function Plan(props: {
  policy: WmsPolicy;
  crew: number;
  doors: number;
  growth: WmsGrowthView;
  cash: number;
  needs: WmsNeeds;
  waveChoices: readonly number[];
  newOrders: readonly number[];
  time: ClockShape;
  submit: (action: WmsAction) => void;
}): ReactElement {
  const { policy, crew, doors, growth, cash, needs, waveChoices, newOrders, time, submit } = props;
  const key = `${policy.pick}|${policy.release}|${policy.pickers}|${policy.waveTicks}|${policy.labor}`;
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
    if (plan.pick === policy.pick && plan.release === policy.release && plan.pickers === policy.pickers && plan.waveTicks === policy.waveTicks && plan.labor === policy.labor) return;
    setPending({ plan, from: key });
    submit({ action: 'policy', policy: plan });
  };
  const pick = PICK_RULES.find((r) => r.id === shown.pick) ?? PICK_RULES[0];
  const release = RELEASE_MODES.find((r) => r.id === shown.release) ?? RELEASE_MODES[0];
  const labor = LABOR_MODES.find((r) => r.id === shown.labor) ?? LABOR_MODES[0];
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
        {shown.release === 'waves' && (
          <>
            <h4 className="wms-plan-sub" id="plan-wave">
              Wave every
            </h4>
            <div className="wms-seg wms-seg-wide" role="radiogroup" aria-labelledby="plan-wave">
              {waveChoices.map((t) => (
                <button key={t} type="button" role="radio" aria-checked={shown.waveTicks === t} onClick={() => change({ waveTicks: t })} data-testid={`plan-wave-${t}`}>
                  {waveName(t, time)}
                </button>
              ))}
            </div>
            <p className="wms-plan-does">Short waves start orders sooner. Long waves pool more orders, so the most urgent take the stock first.</p>
            <p className="wms-plan-cost">Catch: long waves leave orders waiting and the pickers idle between them; 2 h waves cut on-time shipping by about a tenth.</p>
          </>
        )}
        <button type="button" className="wms-btn wms-btn-wide" disabled={newOrders.length === 0} onClick={() => submit({ action: 'release', orders: [...newOrders] })} data-testid="plan-release-now">
          Release a wave now <span className="num">{newOrders.length} NEW</span>
        </button>
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
        <p className="wms-plan-does">Your {crew} people split between picking orders and receiving and putting away trucks. Moving someone takes effect at once; a task they leave goes to someone else.</p>
        <p className="wms-plan-cost">Catch: more pickers ship faster but trucks wait longer at the doors, and the shelves can run dry.</p>
      </section>
      <section className="wms-plan-part" aria-labelledby="plan-labour">
        <h3 id="plan-labour">Labour</h3>
        <div className="wms-seg wms-seg-wide" role="radiogroup" aria-labelledby="plan-labour">
          {LABOR_MODES.map((r) => (
            <button key={r.id} type="button" role="radio" aria-checked={shown.labor === r.id} onClick={() => change({ labor: r.id })} data-testid={`plan-labor-${r.id}`}>
              {r.name}
            </button>
          ))}
        </div>
        <p className="wms-plan-does">{labor?.does}</p>
        <p className="wms-plan-cost">Catch: {labor?.cost}</p>
        <h4 className="wms-plan-sub">Where the work is</h4>
        <NeedsPanel needs={needs} labor={policy.labor} time={time} submit={submit} />
      </section>
      <section className="wms-plan-part" aria-labelledby="plan-grow">
        <h3 id="plan-grow">Grow</h3>
        <div className="wms-grow">
          <button
            type="button"
            className="wms-btn"
            disabled={growth.hireCost === null || cash < growth.hireCost}
            onClick={() => submit({ action: 'hire', role: 'pick' })}
            data-testid="plan-hire-pick"
          >
            Hire a picker
            <span className="num">{growth.hireCost === null ? 'Full' : formatCash(growth.hireCost)}</span>
          </button>
          <button
            type="button"
            className="wms-btn"
            disabled={growth.hireCost === null || cash < growth.hireCost}
            onClick={() => submit({ action: 'hire', role: 'receive' })}
            data-testid="plan-hire-receive"
          >
            Hire a receiver
            <span className="num">{growth.hireCost === null ? 'Full' : formatCash(growth.hireCost)}</span>
          </button>
          <button type="button" className="wms-btn" disabled={growth.doorCost === null || cash < growth.doorCost} onClick={() => submit({ action: 'door' })} data-testid="plan-door">
            Open dock door {doors + 1}
            <span className="num">{growth.doorCost === null ? 'All open' : formatCash(growth.doorCost)}</span>
          </button>
        </div>
        <p className="wms-plan-does">
          {crew} of {growth.maxCrew} people, {doors} of {growth.maxDoors} dock doors. Shipments pay for both. A door takes one more truck an appointment slot and one more truck at once.
        </p>
        <p className="wms-plan-cost">Catch: each hire costs more than the last, and people only help when there is work for them.</p>
      </section>
    </div>
  );
}
