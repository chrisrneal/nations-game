import { useMemo, useState, type ReactElement } from 'react';
import type { HostableProject, NationId, NationView, Project } from '@nations/contracts';
import { nameOf } from '../world/nations.ts';
import type { CardAction } from './cards.ts';
import { fmt, rule } from './econ.ts';
import {
  KIND_ICON,
  benefitLine,
  etaMonth,
  goodOf,
  invitations,
  joinTerms,
  myProjects,
  nameList,
  progressPct,
  projectCommands,
  shieldText,
  suggestedPartners,
  templateOf,
  yieldShare,
} from './projects.ts';
import { Sheet } from './Sheet.tsx';
import { Num } from './why.tsx';

const STATUS: Readonly<Record<Project['status'], string>> = { forming: 'Forming', building: 'Building', active: 'Running' };

function Bar(props: { pct: number; label: string }): ReactElement {
  return (
    <span className="row-bar project-bar" role="progressbar" aria-valuenow={props.pct} aria-valuemin={0} aria-valuemax={100} aria-label={props.label}>
      <span style={{ width: `${props.pct}%` }} />
    </span>
  );
}

/** One line on where a project stands, for the player's own projects. */
function mineLine(view: NationView, p: Project): string {
  const me = p.members.find((m) => m.nationId === view.selfId);
  const good = goodOf(p.kind);
  if (p.status === 'forming') {
    const waiting = p.invited.length;
    return `${p.members.length} of ${rule(view, 'projectSlots')} seats taken${waiting > 0 ? `, waiting on ${nameList(p.invited)}` : ''}; it needs ${rule(view, 'projectMinMembers')} by month ${p.formingDeadline}.`;
  }
  if (p.status === 'building') {
    return `${progressPct(p)}% paid; you have paid ${fmt(me?.paid ?? 0)} of ${fmt(me?.due ?? 0)} (${fmt(me?.installment ?? 0)} a month). Ready about month ${etaMonth(view, p)}.`;
  }
  return good === null
    ? `Cuts your ${shieldText(p.kind)} by ${Math.round(rule(view, 'projectShieldBp') / 100)}% after the pool's cover.`
    : `Your share: ${fmt(yieldShare(p, view.selfId))} ${good} a month of its ${fmt(p.yield)} (by what you paid). Climate damage at ${nameOf(p.host)} cuts it.`;
}

/**
 * Joint projects (RULES 13): what you are building, what you are invited to,
 * what you could host, and what the rest of the world is building. Every
 * decision is two taps from this screen (open, confirm).
 */
export function Projects(props: { view: NationView; onAction: (action: CardAction) => Promise<void> }): ReactElement {
  const { view } = props;
  const [hosting, setHosting] = useState<HostableProject | null>(null);
  const [picked, setPicked] = useState<readonly NationId[]>([]);
  const [confirm, setConfirm] = useState<Project | null>(null);
  const [busy, setBusy] = useState(false);
  const mine = myProjects(view);
  const invites = invitations(view);
  const world = view.projects.projects.filter((p) => !p.members.some((m) => m.nationId === view.selfId) && !p.invited.includes(view.selfId));
  const active = view.projects.projects.filter((p) => p.status === 'active');
  const added = useMemo(() => {
    const sum = { food: 0, energy: 0 };
    for (const p of active) {
      const g = goodOf(p.kind);
      if (g !== null) sum[g] += p.yield;
    }
    return sum;
  }, [active]);
  const seats = rule(view, 'projectSlots');

  const run = async (action: CardAction): Promise<void> => {
    setBusy(true);
    try {
      await props.onAction(action);
    } finally {
      setBusy(false);
    }
  };

  const openHost = (h: HostableProject): void => {
    setHosting(h);
    setPicked(suggestedPartners(view, h));
  };

  const candidates = (h: HostableProject): NationId[] => {
    const t = templateOf(view, h.template);
    const good = goodOf(t.kind);
    return view.others
      .filter((o) => o.public.kind === 'playable')
      .filter((o) => !t.sharedTieRequired || view.projects.tiedTo.includes(o.id))
      .filter((o) => good !== null || !view.projects.projects.some((p) => p.kind === t.kind && p.members.some((m) => m.nationId === o.id)))
      .sort((a, b) => (good === null ? 0 : a.public[good].production - a.public[good].demand - (b.public[good].production - b.public[good].demand)) || nameOf(a.id).localeCompare(nameOf(b.id)))
      .map((o) => o.id);
  };

  return (
    <section className="projects" aria-label="Projects">
      <h1 className="section-title">Projects</h1>
      <p className="hint">
        <Num
          why={{
            title: 'Joint projects',
            value: `${active.length} running`,
            text: `Nations with a surplus host plants that make more food or energy; partners pay monthly installments and share the output by what each paid. Shields cut crisis damage for their members. The world is short of goods, so every unit a project makes lifts the shared multiplier. Leaving mid-build forfeits what you paid and costs trust (RULES 13).`,
          }}
        >
          The world runs {active.length} joint project{active.length === 1 ? '' : 's'}, adding {fmt(added.food)} food and {fmt(added.energy)} energy a month.
        </Num>
      </p>

      {invites.length > 0 && (
        <>
          <h2 className="section-subtitle">Invitations</h2>
          <ul className="slots">
            {invites.map((p) => {
              const t = templateOf(view, p.template);
              const terms = joinTerms(view, p);
              return (
                <li key={p.id} className="slot project-slot" data-testid={`invite-${p.id}`}>
                  <span className="slot-info">
                    <span className="slot-name">
                      {KIND_ICON[t.kind]} {nameOf(p.host)}: {t.name}
                    </span>
                    <span className="slot-meta">
                      {benefitLine(view, p, terms.units)} from month {terms.ready}; about {fmt(terms.due)} credit over {p.buildTicks} months. Answer by month {p.formingDeadline}.
                    </span>
                  </span>
                  <span className="slot-actions">
                    <button type="button" className="btn btn-primary btn-small" disabled={busy} onClick={() => void run({ kind: 'send', command: projectCommands.answer(view, 'joinProject', p.id), done: `Joined ${nameOf(p.host)}'s ${t.name}` })}>
                      Join
                    </button>
                    <button type="button" className="btn btn-small" disabled={busy} onClick={() => void run({ kind: 'send', command: projectCommands.answer(view, 'declineProject', p.id), done: `Declined ${nameOf(p.host)}'s ${t.name}` })}>
                      Decline
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <h2 className="section-subtitle">Yours</h2>
      {mine.length === 0 && <p className="empty">You are not in any project yet. Join an invitation, or host one below.</p>}
      <ul className="slots">
        {mine.map((p) => {
          const t = templateOf(view, p.template);
          const canLeave = p.host !== view.selfId && p.status !== 'active';
          return (
            <li key={p.id} className="slot project-slot" data-testid={`project-${p.id}`}>
              <span className="slot-info">
                <span className="slot-name">
                  {KIND_ICON[t.kind]} {t.name} <span className="tag">{STATUS[p.status]}</span>
                </span>
                <span className="slot-meta">
                  {p.host === view.selfId ? 'You host it' : `${nameOf(p.host)} hosts it`}
                  {p.members.length > 1 ? ` with ${nameList(p.members.map((m) => m.nationId).filter((id) => id !== p.host))}` : ''}. {mineLine(view, p)}
                </span>
                {p.status === 'building' && <Bar pct={progressPct(p)} label={`${t.name} paid`} />}
              </span>
              {canLeave && (
                <span className="slot-actions">
                  <button type="button" className="btn btn-quiet btn-small" disabled={busy} onClick={() => setConfirm(p)}>
                    Leave…
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <h2 className="section-subtitle">Host one</h2>
      <ul className="slots">
        {view.projects.hostable.map((h) => {
          const t = templateOf(view, h.template);
          const good = goodOf(t.kind);
          const late = view.tick + rule(view, 'projectFormingTicks') + h.buildTicks >= rule(view, 'gameLengthTicks');
          const problem = h.problem ?? (late ? 'too late to finish before the game ends' : null);
          return (
            <li key={h.template} className={problem === null ? 'slot project-slot' : 'slot project-slot muted'}>
              <span className="slot-info">
                <span className="slot-name">
                  {KIND_ICON[t.kind]} {t.name}
                </span>
                <span className="slot-meta">
                  {problem !== null
                    ? `Not open to you: ${problem}.`
                    : good === null
                      ? `Cuts members' ${shieldText(t.kind)} by ${Math.round(rule(view, 'projectShieldBp') / 100)}%; your due ${fmt(h.cost)} credit over ${h.buildTicks} months.`
                      : `${fmt(h.yield)} ${good} a month for its members; ${fmt(h.cost)} credit shared, ${h.buildTicks} months to build.`}
                </span>
              </span>
              {problem === null && (
                <span className="slot-actions">
                  <button type="button" className="btn btn-small" onClick={() => openHost(h)}>
                    Host…
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {world.length > 0 && (
        <>
          <h2 className="section-subtitle">Around the world</h2>
          <ul className="rows">
            {world.map((p) => {
              const t = templateOf(view, p.template);
              return (
                <li key={p.id} className="row project-row">
                  <span className="row-name">
                    {KIND_ICON[t.kind]} {nameOf(p.host)}: {t.name}
                  </span>
                  <span className="row-meta">
                    {STATUS[p.status]}
                    {p.status === 'building' ? ` ${progressPct(p)}%` : ''} · {p.members.length} member{p.members.length === 1 ? '' : 's'}
                    {p.left.length > 0 ? ` · ${nameList(p.left.map((l) => l.nationId))} walked out` : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {hosting !== null && (
        <Sheet title={`Host a ${templateOf(view, hosting.template).name}`} onClose={() => setHosting(null)}>
          <p className="why-text">
            {templateOf(view, hosting.template).blurb} Invite up to {seats - 1} partners; it needs {rule(view, 'projectMinMembers')} members, you included, within {rule(view, 'projectFormingTicks')} months.
          </p>
          <ul className="options partner-pick" aria-label="Partners">
            {candidates(hosting).map((id) => {
              const on = picked.includes(id);
              const t = templateOf(view, hosting.template);
              const good = goodOf(t.kind);
              const o = view.others.find((x) => x.id === id)!;
              const b = good === null ? null : o.public[good].production - o.public[good].demand;
              return (
                <li key={id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    className={on ? 'btn option pick on' : 'btn option pick'}
                    disabled={!on && picked.length >= seats - 1}
                    onClick={() => setPicked(on ? picked.filter((x) => x !== id) : [...picked, id])}
                  >
                    <span className="option-label">
                      {on ? '☑' : '☐'} {nameOf(id)}
                    </span>
                    <span className="option-consequence">
                      Trust {view.self.private.trust[id] ?? 0}
                      {b === null ? '' : b < 0 ? ` · ${fmt(-b)} ${good} short a month` : ` · ${good} to spare`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || picked.length < rule(view, 'projectMinMembers') - 1}
            onClick={() => {
              const h = hosting;
              setHosting(null);
              void run({ kind: 'send', command: projectCommands.propose(view, h.template, picked), done: `Invited ${nameList(picked)}` });
            }}
          >
            Invite {picked.length === 0 ? 'partners' : nameList(picked)}
          </button>
        </Sheet>
      )}

      {confirm !== null && (
        <Sheet title={`Leave the ${templateOf(view, confirm.template).name}?`} onClose={() => setConfirm(null)}>
          <p className="why-text">
            {confirm.status === 'building'
              ? `You forfeit the ${fmt(confirm.members.find((m) => m.nationId === view.selfId)?.paid ?? 0)} credit you have paid, and ${nameList(confirm.members.map((m) => m.nationId).filter((id) => id !== view.selfId))} each trust you ${rule(view, 'projectTrustLeave')} less. The others' build takes longer.`
              : 'It is still forming: leaving now costs nothing.'}
          </p>
          <ul className="options">
            <li>
              <button
                type="button"
                className="btn option"
                disabled={busy}
                onClick={() => {
                  const p = confirm;
                  setConfirm(null);
                  void run({ kind: 'send', command: projectCommands.answer(view, 'leaveProject', p.id), done: `Left the ${templateOf(view, p.template).name}` });
                }}
              >
                <span className="option-label">Leave</span>
                <span className="option-consequence">Final. Nothing you paid comes back.</span>
              </button>
            </li>
            <li>
              <button type="button" className="btn option" onClick={() => setConfirm(null)}>
                <span className="option-label">Stay</span>
                <span className="option-consequence">Your installments continue.</span>
              </button>
            </li>
          </ul>
        </Sheet>
      )}
    </section>
  );
}
