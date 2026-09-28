import { useState, type ReactElement } from 'react';
import type { NationView, Resource, ResourceAmount } from '@nations/contracts';
import { nameOf } from '../world/nations.ts';
import { ICON, LABEL, RESOURCES, fairAmount, fmt, isFair, priceGapPct, rule, type TradeDraft } from './econ.ts';
import { Sheet } from './Sheet.tsx';
import { Num } from './why.tsx';

function AmountRow(props: {
  label: string;
  value: ResourceAmount;
  exclude: Resource;
  onChange: (value: ResourceAmount) => void;
  testId: string;
}): ReactElement {
  const { value } = props;
  const step = Math.max(1, Math.round(value.amount / 10));
  const set = (amount: number): void => props.onChange({ ...value, amount: Math.max(1, Math.round(amount)) });
  return (
    <div className="trade-row">
      <span className="trade-label">{props.label}</span>
      <div className="seg" role="radiogroup" aria-label={`${props.label}: resource`}>
        {RESOURCES.map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={value.resource === r}
            aria-label={LABEL[r]}
            disabled={r === props.exclude}
            className={value.resource === r ? 'seg-btn on' : 'seg-btn'}
            onClick={() => props.onChange({ ...value, resource: r })}
          >
            {ICON[r]}
          </button>
        ))}
      </div>
      <div className="stepper">
        <button type="button" className="step" aria-label={`Less ${props.label}`} onClick={() => set(value.amount - step)}>
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          className="amount"
          aria-label={`${props.label} amount`}
          data-testid={props.testId}
          value={value.amount}
          onChange={(e) => set(Number(e.target.value) || 1)}
        />
        <button type="button" className="step" aria-label={`More ${props.label}`} onClick={() => set(value.amount + step)}>
          +
        </button>
      </div>
    </div>
  );
}

/**
 * Make an offer, or counter one. Terms arrive pre-filled from a card, so the
 * usual path is open and send; everything here is adjustable, and the price
 * line says at once whether the sim will call it fair (RULES 3.2).
 */
export function TradeSheet(props: {
  view: NationView;
  draft: TradeDraft;
  counterOf: number | null;
  onSend: (draft: TradeDraft) => Promise<void>;
  onClose: () => void;
}): ReactElement {
  const { view } = props;
  const [draft, setDraft] = useState<TradeDraft>(props.draft);
  const [busy, setBusy] = useState(false);
  const fair = isFair(view, draft.give, draft.get);
  const gap = priceGapPct(view, draft.give, draft.get);
  const band = rule(view, 'priceBandPct');
  const hold = view.self.private.stocks[draft.give.resource];
  const canPay = hold >= draft.give.amount;
  const hardOk = view.self.private.policy.hardBargains;
  const partners = view.others.filter((o) => o.id !== view.selfId);
  const blocked = !canPay ? `You hold ${fmt(hold)} ${draft.give.resource}.` : !fair && !hardOk ? 'Outside the fair band: turn on hard bargains in your policies, or make it fair.' : null;

  const send = async (): Promise<void> => {
    setBusy(true);
    try {
      await props.onSend(draft);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title={props.counterOf === null ? 'Make an offer' : 'Counter-offer'} onClose={props.onClose}>
      <label className="trade-row">
        <span className="trade-label">To</span>
        <select
          className="partner"
          value={draft.to}
          disabled={props.counterOf !== null}
          onChange={(e) => setDraft({ ...draft, to: e.target.value })}
        >
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {nameOf(p.id)}
            </option>
          ))}
        </select>
      </label>
      <AmountRow label="You give" value={draft.give} exclude={draft.get.resource} testId="give-amount" onChange={(give) => setDraft({ ...draft, give })} />
      <AmountRow label="You get" value={draft.get} exclude={draft.give.resource} testId="get-amount" onChange={(get) => setDraft({ ...draft, get })} />
      <p className="why-text">
        <Num
          why={{
            title: 'Price',
            value: fair ? 'Fair' : 'Hard bargain',
            text: `World prices: food ${(view.prices.food / 1000).toFixed(3)}, energy ${(view.prices.energy / 1000).toFixed(3)} credit per unit, moved by world scarcity. Within ${band}% is fair; outside is a hard bargain, which partners' policies will not accept on their own.`,
          }}
        >
          {fair ? `Fair (${gap >= 0 ? '+' : ''}${gap}% vs world prices)` : `Hard bargain (${gap >= 0 ? '+' : ''}${gap}%)`}
        </Num>{' '}
        <button type="button" className="link" onClick={() => setDraft({ ...draft, get: { ...draft.get, amount: fairAmount(view, draft.give, draft.get.resource) } })}>
          Make it fair
        </button>
      </p>
      {blocked !== null && <p className="hint warn">{blocked}</p>}
      <button type="button" className="btn btn-primary" data-testid="send-offer" disabled={busy || blocked !== null} onClick={() => void send()}>
        {props.counterOf === null ? `Send to ${nameOf(draft.to)}` : `Send counter to ${nameOf(draft.to)}`}
      </button>
    </Sheet>
  );
}
