import type { ReactElement } from 'react';
import type { NationView, StandingPolicy } from '@nations/contracts';
import { rule } from './econ.ts';
import { Num } from './why.tsx';

/**
 * Standing policies (RULES 8.2): how your nation answers while you are away.
 * Each change is a `setPolicy` command; the dials live in the sim's State.
 */
export function Policies(props: { view: NationView; onChange: (policy: Partial<StandingPolicy>) => void }): ReactElement {
  const policy = props.view.self.private.policy;
  const threshold = rule(props.view, 'autoAcceptTrustThreshold');
  const toggles: { key: 'acceptFairDeficit' | 'acceptTrusted' | 'rejectAll' | 'hardBargains'; label: string; text: string }[] = [
    { key: 'acceptFairDeficit', label: 'Accept fair offers that cover a shortage', text: 'On its last month, an unanswered offer at a fair price that brings food or energy you are short of is accepted, if you can pay and keep a month of what you pay with.' },
    { key: 'acceptTrusted', label: `Accept anything from partners you trust (${threshold}+)`, text: `Accept any offer you can pay from a nation you trust at ${threshold} or more, even a hard bargain.` },
    { key: 'rejectAll', label: 'Reject every offer', text: 'The isolationist setting: every offer is declined. Your nation still produces and consumes, but imports nothing.' },
    { key: 'hardBargains', label: 'Allow my hard bargains', text: 'Let you send offers outside the fair price band. Partners’ policies never accept those on their own.' },
  ];
  return (
    <section aria-label="Standing policies">
      <h2 className="section-subtitle">Standing policies</h2>
      <p className="hint">How your nation answers while you are away.</p>
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
              onClick={() => props.onChange({ [t.key]: !policy[t.key] })}
            >
              {policy[t.key] ? 'On' : 'Off'}
            </button>
          </li>
        ))}
        <li className="slot">
          <Num className="slot-info policy-label" why={{ title: 'Cover first', value: policy.coverPriority, text: 'When several offers compete, your policy covers this shortage first.' }}>
            Cover first
          </Num>
          <div className="seg" role="radiogroup" aria-label="Cover first">
            {(['food', 'energy'] as const).map((g) => (
              <button key={g} type="button" role="radio" aria-checked={policy.coverPriority === g} className={policy.coverPriority === g ? 'seg-btn on' : 'seg-btn'} onClick={() => props.onChange({ coverPriority: g })}>
                {g === 'food' ? '🌾' : '⚡'}
              </button>
            ))}
          </div>
        </li>
        <li className="slot">
          <Num
            className="slot-info policy-label"
            why={{ title: 'Resilience floor', value: String(policy.resilienceFloor), text: `Below this level, Credit is spent automatically to restore resilience, at ${rule(props.view, 'resilienceCostPerPoint')} credit a point.` }}
          >
            Resilience floor
          </Num>
          <div className="stepper">
            <button type="button" className="step" aria-label="Lower floor" onClick={() => props.onChange({ resilienceFloor: Math.max(0, policy.resilienceFloor - 10) })}>
              −
            </button>
            <span className="amount">{policy.resilienceFloor}</span>
            <button type="button" className="step" aria-label="Raise floor" onClick={() => props.onChange({ resilienceFloor: Math.min(rule(props.view, 'resilienceMax'), policy.resilienceFloor + 10) })}>
              +
            </button>
          </div>
        </li>
      </ul>
    </section>
  );
}
