import type {
  CrisisEventPayloads,
  CrisisResult,
  EconomyEventPayloads,
  Event,
  NationId,
  NationView,
  Recap,
  RecapLine,
} from '@nations/contracts';
import { TUNABLES } from './tunables.ts';

/**
 * The away recap (RULES 8.1): what happened to one nation between two of its
 * Views, in at most `recapMaxLines` plain sentences with numbers, most
 * important first. Built only from that nation's two Views and the events it
 * was allowed to see, so a host, a server or a test can build it without
 * State.
 *
 * Order: score, crises that locked, appeals still open, own pledges, what the
 * standing policy answered, and the largest trust moves.
 */
export function buildRecap(before: NationView, after: NationView, events: readonly Event[]): Recap {
  const self = after.selfId;
  const seen = events.filter((e) => e.audience.length === 0 || e.audience.includes(self));
  const name = (id: NationId): string => (id === self ? 'you' : (after.others.find((o) => o.id === id)?.name ?? id));
  const lines: RecapLine[] = [];

  const score = (v: NationView): number => v.scores.nations.find((n) => n.id === self)?.finalScore ?? 0;
  const mult = (v: NationView): string => (v.scores.multiplierBp / 10_000).toFixed(2);
  lines.push({
    kind: 'score',
    text: `Months ${before.tick}-${after.tick}: score ${score(before)} -> ${score(after)}, world multiplier ${mult(before)} -> ${mult(after)}.`,
  });

  for (const e of seen) {
    if (e.type !== 'crisisLocked') continue;
    const r = (e.payload as CrisisEventPayloads['crisisLocked']).result;
    lines.push({ kind: 'crisis', text: crisisLine(r, self, seen) });
  }

  for (const c of after.crises.open) {
    const share = c.shares[self] ?? 0;
    const answer = c.answers[self];
    const rule = after.self.private.policy.crisisRule;
    lines.push({
      kind: 'crisis',
      text: `${label(c.kind)} appeal open until month ${c.deadlineTick}: your share is ${share} Credit; ${
        answer === undefined ? `your policy (${rule}) answers on the deadline` : `you ${answer.answer} ${answer.amount}`
      }.`,
    });
  }

  for (const e of seen) {
    if (e.type === 'pledgeHonoured') {
      const p = (e.payload as CrisisEventPayloads['pledgeHonoured']).pledge;
      if (p.nationId === self) lines.push({ kind: 'pledge', text: `Your pledge of ${p.amount} to the ${p.pool} pool was honoured.` });
    } else if (e.type === 'pledgeBroken') {
      const { pledge: p, reason } = e.payload as CrisisEventPayloads['pledgeBroken'];
      if (p.nationId === self) {
        lines.push({ kind: 'pledge', text: `Your pledge of ${p.amount} broke (${reason}): every nation trusts you ${TUNABLES.trustPerPledgeBroken.value} less.` });
      }
    }
  }

  let accepted = 0;
  let declined = 0;
  let settled = 0;
  for (const e of seen) {
    if (e.type === 'offerSettled') {
      const p = e.payload as EconomyEventPayloads['offerSettled'];
      settled++;
      if (p.by === 'policy' && p.offer.to === self) accepted++;
    } else if (e.type === 'offerRejected') {
      const p = e.payload as EconomyEventPayloads['offerRejected'];
      if (p.by === 'policy' && p.offer.to === self) declined++;
    }
  }
  if (settled + accepted + declined > 0) {
    lines.push({ kind: 'trade', text: `${settled} trades settled; your policy accepted ${accepted} offers and declined ${declined}.` });
  }

  const moves = Object.entries(after.self.private.trust)
    .map(([id, value]) => [id as NationId, value - (before.self.private.trust[id as NationId] ?? value)] as const)
    .filter(([, d]) => d !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]) || (a[0] < b[0] ? -1 : 1))
    .slice(0, 2);
  if (moves.length > 0) {
    lines.push({ kind: 'trust', text: `Largest trust moves: ${moves.map(([id, d]) => `${name(id)} ${d > 0 ? '+' : ''}${d}`).join(', ')}.` });
  }

  return { nationId: self, fromTick: before.tick, toTick: after.tick, lines: lines.slice(0, TUNABLES.recapMaxLines.value) };
}

function label(kind: CrisisResult['kind']): string {
  return kind === 'climate' ? 'Climate' : 'Pandemic';
}

function crisisLine(r: CrisisResult, self: NationId, seen: readonly Event[]): string {
  const funded = Math.floor((r.effective * 100) / Math.max(1, r.target));
  let paid = 0;
  for (const e of seen) {
    if (e.type !== 'appealAnswered') continue;
    const a = e.payload as CrisisEventPayloads['appealAnswered'];
    if (a.crisisId === r.id && a.nationId === self) paid = a.amount;
  }
  const hit = seen.find((e) => e.type === 'crisisHit' && (e.payload as CrisisEventPayloads['crisisHit']).hit.crisisId === r.id);
  const damage = hit === undefined ? 'no damage to you' : (() => {
    const h = (hit.payload as CrisisEventPayloads['crisisHit']).hit;
    const months = h.toTick - h.fromTick + 1;
    // Cover that reached you is what the damage was cut by; less than the pool's own means you paid less than your share (RULES 4.3 rule 1).
    const fullCover = Math.floor((h.bpUnpooled * (10_000 - r.coverBp)) / 10_000);
    const reached =
      r.coverBp > 0 && h.bp > fullCover + 1
        ? `, only ${Math.round(((h.bpUnpooled - h.bp) * 10_000) / (h.bpUnpooled * r.coverBp / 100))}% of the pool's cover reached you`
        : '';
    return `your output -${(h.bp / 100).toFixed(1)}% for ${months} month${months === 1 ? '' : 's'}${reached}`;
  })();
  const role = r.contributors.includes(self)
    ? paid > 0
      ? `you paid ${paid} at the appeal`
      : 'your monthly payments covered your share'
    : r.freeRiders.includes(self)
      ? 'you paid less than half your share'
      : 'no share was asked of you';
  return `${label(r.kind)} crisis (severity ${r.severity}): pool met ${funded}% of target, ${r.outcome}; ${role}; ${damage}.`;
}
