import type { ReactElement, ReactNode } from 'react';
import type { ContributionTarget, CrisisRule, NationView, StandingPolicy } from '@nations/contracts';
import { fmt, rule } from './econ.ts';
import { Num, type Why } from './why.tsx';

type Posture = 'open' | 'hard' | 'closed';

function postureOf(p: StandingPolicy): Posture {
  return p.rejectAll ? 'closed' : p.hardBargains ? 'hard' : 'open';
}

const POSTURE: Readonly<Record<Posture, { label: string; policy: Partial<StandingPolicy>; text: string }>> = {
  open: { label: 'Open', policy: { rejectAll: false, hardBargains: false }, text: 'Trade at fair prices; your auto-accept conditions below answer offers you leave.' },
  hard: { label: 'Hard', policy: { rejectAll: false, hardBargains: true }, text: 'You may send offers outside the fair price band. Other nations’ policies never accept those on their own, and AI nations charge you back.' },
  closed: { label: 'Closed', policy: { rejectAll: true }, text: 'The isolationist setting: every offer is declined. Your nation still produces and consumes, but imports nothing.' },
};

const CRISIS_RULE: Readonly<Record<CrisisRule, { label: string; text: string }>> = {
  fairShare: { label: 'Fair share', text: 'An appeal you leave unanswered is paid in full: what you still owe of your share, if you have the credit.' },
  reciprocal: { label: 'Match', text: 'Pay your share in full if the world funded this pool’s last round to at least half its target, less in proportion if not. Tit for tat at world level.' },
  none: { label: 'None', text: 'Pay nothing to appeals you leave. Allowed, but every nation sees it, and strict nations remember free-riders.' },
};

const TARGET: Readonly<Record<ContributionTarget, string>> = { adaptation: 'Climate', health: 'Health', split: 'Split' };

/** A labelled choice between a few values, one tap each. */
function Seg<T extends string>(props: { name: string; value: T; options: readonly { value: T; label: string }[]; onChange: (value: T) => void }): ReactElement {
  return (
    <div className="seg" role="radiogroup" aria-label={props.name}>
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={props.value === o.value}
          aria-label={`${props.name}: ${o.label}`}
          className={props.value === o.value ? 'seg-btn on' : 'seg-btn'}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Dial(props: { why: Why; label: string; children: ReactNode }): ReactElement {
  return (
    <li className="slot">
      <Num className="slot-info policy-label" why={props.why}>
        {props.label}
      </Num>
      {props.children}
    </li>
  );
}

function Stepper(props: { name: string; value: string; onDown: () => void; onUp: () => void }): ReactElement {
  return (
    <div className="stepper">
      <button type="button" className="step" aria-label={`Lower ${props.name}`} onClick={props.onDown}>
        −
      </button>
      <span className="amount">{props.value}</span>
      <button type="button" className="step" aria-label={`Raise ${props.name}`} onClick={props.onUp}>
        +
      </button>
    </div>
  );
}

/**
 * Standing policies (RULES 8.2): how your nation answers while you are away.
 * Three groups - trade posture, auto-accept conditions, crisis contribution
 * rule - plus the resilience floor. Each change is one `setPolicy` command;
 * the dials live in the sim's State and apply from the end of this month.
 */
export function Policies(props: { view: NationView; onChange: (policy: Partial<StandingPolicy>) => void }): ReactElement {
  const { view, onChange } = props;
  const policy = view.self.private.policy;
  const threshold = rule(view, 'autoAcceptTrustThreshold');
  const posture = postureOf(policy);
  const closed = posture === 'closed';
  const income = view.self.private.last.income;
  const pct = (policy.contributionBp / 100).toFixed(2);
  const perMonth = Math.floor((income * policy.contributionBp) / 10_000);
  const bpStep = 25;
  const bpMax = 1_000;
  const toggles: { key: 'acceptFairDeficit' | 'acceptTrusted'; label: string; text: string }[] = [
    { key: 'acceptFairDeficit', label: 'Accept fair offers that cover a shortage', text: 'On its last month, an unanswered offer at a fair price that brings food or energy you are short of is accepted, if you can pay and keep a month of what you pay with.' },
    { key: 'acceptTrusted', label: `Accept anything from partners you trust (${threshold}+)`, text: `Accept any offer you can pay from a nation you trust at ${threshold} or more, even a hard bargain.` },
  ];

  return (
    <section aria-label="Standing policies">
      <h2 className="section-subtitle">Standing policies</h2>
      <p className="hint">How your nation answers while you are away. Changes apply at the end of this month.</p>

      <h3 className="group-title">Trade posture</h3>
      <ul className="slots">
        <Dial label="Posture" why={{ title: 'Trade posture', value: POSTURE[posture].label, text: POSTURE[posture].text }}>
          <Seg
            name="Trade posture"
            value={posture}
            options={(['open', 'hard', 'closed'] as const).map((p) => ({ value: p, label: POSTURE[p].label }))}
            onChange={(p) => onChange(POSTURE[p].policy)}
          />
        </Dial>
        <Dial label="Cover first" why={{ title: 'Cover first', value: policy.coverPriority, text: 'When several offers compete, your policy covers this shortage first.' }}>
          <Seg
            name="Cover first"
            value={policy.coverPriority}
            options={[
              { value: 'food', label: '🌾' },
              { value: 'energy', label: '⚡' },
            ]}
            onChange={(g) => onChange({ coverPriority: g })}
          />
        </Dial>
      </ul>

      <ul className="slots">
        <li className="slot">
          <Num
            className="slot-info policy-label"
            why={{
              title: 'Keep us supplied',
              value: policy.autoImport === true ? 'On' : 'Off',
              text: `Each month your nation offers fair prices for next month's food and energy shortfall to the nations with a surplus you trust most (up to ${rule(view, 'autoImportOffersPerGood')} offers a good). Routine imports then stop being cards; you only hear about a shortfall no seller can cover. Off: you buy by hand from the shortfall cards.`,
            }}
          >
            Keep us supplied
          </Num>
          <button
            type="button"
            role="switch"
            aria-checked={policy.autoImport === true}
            aria-label="Keep us supplied"
            className={policy.autoImport === true ? 'switch on' : 'switch'}
            onClick={() => onChange({ autoImport: policy.autoImport !== true })}
          >
            {policy.autoImport === true ? 'On' : 'Off'}
          </button>
        </li>
      </ul>

      <h3 className="group-title">Auto-accept conditions</h3>
      {closed && <p className="hint">Your posture is Closed, so these do nothing until you open it.</p>}
      <ul className="slots">
        {toggles.map((t) => (
          <li key={t.key} className="slot">
            <Num className="slot-info policy-label" why={{ title: t.label, value: policy[t.key] ? 'On' : 'Off', text: t.text }}>
              {t.label}
            </Num>
            <button
              type="button"
              role="switch"
              aria-checked={policy[t.key]}
              aria-label={t.label}
              className={policy[t.key] ? 'switch on' : 'switch'}
              onClick={() => onChange({ [t.key]: !policy[t.key] })}
            >
              {policy[t.key] ? 'On' : 'Off'}
            </button>
          </li>
        ))}
      </ul>

      <h3 className="group-title">Crisis contribution rule</h3>
      <ul className="slots">
        <Dial label="Unanswered appeals" why={{ title: 'Crisis rule', value: CRISIS_RULE[policy.crisisRule].label, text: CRISIS_RULE[policy.crisisRule].text }}>
          <Seg
            name="Crisis rule"
            value={policy.crisisRule}
            options={(['fairShare', 'reciprocal', 'none'] as const).map((r) => ({ value: r, label: CRISIS_RULE[r].label }))}
            onChange={(r) => onChange({ crisisRule: r })}
          />
        </Dial>
        <Dial
          label="Monthly share"
          why={{
            title: 'Monthly contribution',
            value: `${pct}% of income`,
            text: `Paid into the pools every month, about ${fmt(perMonth)} credit at last month's income of ${fmt(income)}. It counts towards your share of every appeal, so a steady payer rarely needs to answer one.`,
          }}
        >
          <Stepper
            name="monthly share"
            value={`${pct}%`}
            onDown={() => onChange({ contributionBp: Math.max(0, policy.contributionBp - bpStep) })}
            onUp={() => onChange({ contributionBp: Math.min(bpMax, policy.contributionBp + bpStep) })}
          />
        </Dial>
        <Dial label="Goes to" why={{ title: 'Which pool', value: TARGET[policy.contributionTo], text: 'The climate adaptation pool, the health pool, or half to each.' }}>
          <Seg
            name="Pool"
            value={policy.contributionTo}
            options={(['adaptation', 'health', 'split'] as const).map((t) => ({ value: t, label: TARGET[t] }))}
            onChange={(t) => onChange({ contributionTo: t })}
          />
        </Dial>
      </ul>

      <h3 className="group-title">Resilience</h3>
      <ul className="slots">
        <Dial
          label="Resilience floor"
          why={{ title: 'Resilience floor', value: String(policy.resilienceFloor), text: `Below this level, credit is spent automatically to restore resilience, at ${rule(view, 'resilienceCostPerPoint')} credit a point.` }}
        >
          <Stepper
            name="floor"
            value={String(policy.resilienceFloor)}
            onDown={() => onChange({ resilienceFloor: Math.max(0, policy.resilienceFloor - 10) })}
            onUp={() => onChange({ resilienceFloor: Math.min(rule(view, 'resilienceMax'), policy.resilienceFloor + 10) })}
          />
        </Dial>
      </ul>
    </section>
  );
}
