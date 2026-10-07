import type { ReactElement } from 'react';
import type { WmsAction, WmsLaborMode, WmsNeed, WmsNeeds, WmsRole } from '@warehouse/contracts';
import type { ClockShape } from '../format.ts';
import { countdown } from './grid.ts';

/** Each side's name, and who moves to it from the other side. */
const SIDE: Readonly<Record<WmsRole, { readonly name: string; readonly other: string }>> = {
  pick: { name: 'Picking', other: 'a dock hand' },
  receive: { name: 'Dock', other: 'a picker' },
};

/** Tasks waiting a head, to one decimal: display only, the sim decides with whole numbers. */
function perHead(n: WmsNeed): string {
  return n.people === 0 ? '—' : (Math.round((n.waiting * 10) / n.people) / 10).toFixed(1);
}

function NeedRow(props: { role: WmsRole; need: WmsNeed; short: boolean; canMove: boolean; submit: (action: WmsAction) => void }): ReactElement {
  const { role, need, short } = props;
  const side = SIDE[role];
  return (
    <div className={`need-row${short ? ' need-short' : ''}`} data-testid={`need-${role}`}>
      <span className="need-main">
        <b>{side.name}</b>
        <span className="need-nums">
          <span className="num">{need.people}</span> people · <span className="num">{need.idle}</span> idle · <span className="num">{need.waiting}</span> waiting
          <span className="muted"> ({perHead(need)} a head)</span>
        </span>
      </span>
      <button
        type="button"
        className={`wms-btn${short ? ' wms-btn-primary' : ''}`}
        disabled={!props.canMove}
        onClick={() => props.submit({ action: 'role', worker: 0, role })}
        aria-label={`Move ${side.other} to ${role === 'pick' ? 'picking' : 'the dock'}`}
        data-testid={`need-move-${role}`}
      >
        + 1 here
      </button>
    </div>
  );
}

/**
 * Where the work is (decision record W9): each side of the crew, the tasks
 * waiting for it and a button to move one person over (the WMS picks
 * whoever has least in hand). Under the balance plan it says when the WMS
 * looks next; the side it would move someone to is lit.
 */
export function NeedsPanel(props: { needs: WmsNeeds; labor: WmsLaborMode; time: ClockShape; submit: (action: WmsAction) => void }): ReactElement {
  const { needs, labor, time, submit } = props;
  const verdict =
    needs.short === null
      ? 'The work is even: nobody needs to move.'
      : `${SIDE[needs.short].name} is behind: move ${SIDE[needs.short].other} over.`;
  return (
    <div className="needs" data-testid="needs">
      <NeedRow role="pick" need={needs.pick} short={needs.short === 'pick'} canMove={needs.receive.people > 1} submit={submit} />
      <NeedRow role="receive" need={needs.receive} short={needs.short === 'receive'} canMove={needs.pick.people > 1} submit={submit} />
      <p className="needs-verdict" data-testid="needs-verdict">
        {verdict}
        {labor === 'balance' && <span className="muted"> Balance looks again in {countdown(needs.nextBalanceIn, time)}.</span>}
      </p>
    </div>
  );
}
