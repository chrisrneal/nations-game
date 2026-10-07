import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import type { WmsAction, WmsTaskView, WmsWorkerView } from '@warehouse/contracts';
import { short, type ClockShape } from '../format.ts';
import { clock } from './grid.ts';

/** The crew filter chips (W8). */
type CrewFilter = 'all' | 'pick' | 'receive' | 'idle';

const FILTERS: readonly { readonly id: CrewFilter; readonly label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pick', label: 'Pickers' },
  { id: 'receive', label: 'Dock' },
  { id: 'idle', label: 'Idle' },
];

function matches(p: WmsWorkerView, f: CrewFilter): boolean {
  return f === 'all' || (f === 'idle' ? p.state === 'idle' : p.role === f);
}

const STATE_TEXT: Readonly<Record<WmsWorkerView['state'], string>> = { idle: 'Idle', walking: 'Walking', working: 'Working' };
const ROLE_TEXT: Readonly<Record<WmsWorkerView['role'], string>> = { pick: 'Picker', receive: 'Dock' };
const KIND_TEXT: Readonly<Record<WmsTaskView['kind'], string>> = { PICK: 'Pick', RECEIVE: 'Receive', PUTAWAY: 'Put away', LOAD: 'Load' };

/** A task in one line: what, which order or PO line, where, and how far through. */
function TaskLine(props: { task: WmsTaskView }): ReactElement {
  const t = props.task;
  return (
    <span className="crew-task">
      <span className={`task-kind task-${t.kind.toLowerCase()}`}>{KIND_TEXT[t.kind]}</span>
      <span className="crew-task-ref">{t.ref}</span>
      <span className="crew-task-where">{t.where}</span>
      <span className="num">
        {t.done}/{t.qty}
      </span>
    </span>
  );
}

/** One worker's row on the Crew page: who, what they do now, what is lined up, and how busy they have been. */
function WorkerRow(props: { worker: WmsWorkerView; onOpen: (id: number) => void }): ReactElement {
  const p = props.worker;
  return (
    <li>
      <button type="button" className={`crew-row crew-${p.state}`} onClick={() => props.onOpen(p.id)} data-testid={`crew-worker-${p.id}`}>
        <span className={`crew-badge role-${p.role}`}>{p.name}</span>
        <span className="crew-main">
          <span className="crew-line">
            <span className="crew-role">{ROLE_TEXT[p.role]}</span>
            <span className={`crew-state state-${p.state}`}>{STATE_TEXT[p.state]}</span>
            {p.queue.length > 0 && <span className="muted">+{p.queue.length} next</span>}
          </span>
          {p.task === null ? <span className="crew-line muted">No task: waiting for work</span> : <TaskLine task={p.task} />}
          <i className="crew-bar" aria-hidden="true">
            <i style={{ transform: `scaleX(${p.pct / 100})` }} />
          </i>
        </span>
        <span className="crew-stats">
          <b className="num">{short(p.stats.tasks)}</b>
          <span className="muted">tasks</span>
          <span className="num">{p.utilPct === null ? '—' : `${p.utilPct}%`}</span>
        </span>
      </button>
    </li>
  );
}

/**
 * The crew (decision record W8): every worker, what they are doing, what the
 * WMS has lined up for them and how much work they have done. A tap opens a
 * worker's tasks.
 */
export function CrewList(props: { workers: readonly WmsWorkerView[]; onOpen: (id: number) => void; children?: ReactNode }): ReactElement {
  const [filter, setFilter] = useState<CrewFilter>('all');
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, props.workers.filter((p) => matches(p, f.id)).length])) as Record<CrewFilter, number>, [props.workers]);
  const shown = props.workers.filter((p) => matches(p, filter));
  return (
    <>
      {props.children}
      <div className="wms-filters" role="tablist" aria-label="Filter the crew">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} className="wms-filter" onClick={() => setFilter(f.id)} data-testid={`crew-filter-${f.id}`}>
            {f.label} <span className="num">{counts[f.id]}</span>
          </button>
        ))}
      </div>
      <ol className="crew-list" data-testid="crew-list">
        {shown.map((p) => (
          <WorkerRow key={p.id} worker={p} onOpen={props.onOpen} />
        ))}
        {shown.length === 0 && <li className="wms-empty">Nobody here right now.</li>}
      </ol>
    </>
  );
}

function Field(props: { label: string; children: ReactNode }): ReactElement {
  return (
    <div>
      <dt>{props.label}</dt>
      <dd>{props.children}</dd>
    </div>
  );
}

/** A share of a worker's time as a whole %. */
function share(part: number, whole: number): string {
  return whole === 0 ? '—' : `${Math.floor((part * 100) / whole)}%`;
}

/** A task card in the worker's list: tap it to open its order or PO. */
function TaskCard(props: { task: WmsTaskView; time: ClockShape; label: string; onOpen: (task: WmsTaskView) => void }): ReactElement {
  const t = props.task;
  const pct = t.qty === 0 ? 0 : Math.min(100, Math.floor((t.done * 100) / t.qty));
  return (
    <li>
      <button type="button" className={`task-card task-${t.status.toLowerCase()}`} onClick={() => props.onOpen(t)} data-testid={`task-${t.no}`}>
        <span className="task-head">
          <span className="task-label muted">{props.label}</span>
          <span className={`task-kind task-${t.kind.toLowerCase()}`}>{KIND_TEXT[t.kind]}</span>
          <b className="task-ref">{t.ref}</b>
          {t.priority > 0 && t.priority < 3 && <span className={`pri-${t.priority}`}>P{t.priority}</span>}
          <span className="task-code muted">{t.code}</span>
        </span>
        <span className="task-body">
          <span className="task-sku">
            {t.sku} <span className="muted">{t.desc}</span>
          </span>
          <span className="task-where">{t.where}</span>
          <span className="num">
            {t.done}/{t.qty}
          </span>
        </span>
        {t.status === 'ACTIVE' && (
          <i className="crew-bar" aria-hidden="true">
            <i style={{ transform: `scaleX(${pct / 100})` }} />
          </i>
        )}
        {t.status === 'DONE' && (
          <span className="task-when muted">
            {clock(t.started, props.time)}–{clock(t.finished, props.time)}
          </span>
        )}
      </button>
    </li>
  );
}

/**
 * One worker (W8): what they are doing now, the tasks the WMS has lined up
 * for them next, the ones they finished last, and their record since they
 * were hired. Tapping a task opens its order or PO.
 */
export function WorkerDetail(props: {
  worker: WmsWorkerView | undefined;
  time: ClockShape;
  /** Others on the same side: the last one cannot move (W9). */
  sameRole: number;
  onBack: () => void;
  onTask: (task: WmsTaskView) => void;
  submit: (action: WmsAction) => void;
}): ReactElement {
  const p = props.worker;
  const total = p === undefined ? 0 : p.stats.busy + p.stats.walking + p.stats.idle;
  return (
    <div className="wms-detail" data-testid="wms-worker">
      <div className="wms-detail-bar">
        <button type="button" className="wms-back" onClick={props.onBack} data-testid="wms-worker-back">
          ‹ Crew
        </button>
        {p !== undefined && (
          <>
            <h3 className="wms-detail-title">
              {p.name} · {ROLE_TEXT[p.role]}
            </h3>
            <span className={`crew-state state-${p.state}`}>{STATE_TEXT[p.state]}</span>
          </>
        )}
      </div>
      {p === undefined ? (
        <p className="wms-empty">This worker has left the crew.</p>
      ) : (
        <div className="wms-detail-body">
          <dl className="wms-summary">
            <Field label="Tasks done">{short(p.stats.tasks)}</Field>
            <Field label="Units">{short(p.stats.units)}</Field>
            <Field label="Working">{share(p.stats.busy, total)}</Field>
            <Field label="Walking">{share(p.stats.walking, total)}</Field>
            <Field label="Idle">{share(p.stats.idle, total)}</Field>
            <Field label={p.state === 'walking' ? 'Walking to' : 'Where'}>{p.shipDoor > 0 ? `Door S${p.shipDoor}` : p.at < 0 ? 'Dock' : (p.task?.where ?? `Aisle ${String.fromCharCode(65 + p.aisle)}, bay ${p.bay}`)}</Field>
          </dl>
          <div className="wms-actions worker-move">
            <button
              type="button"
              className="wms-btn"
              disabled={props.sameRole <= 1}
              onClick={() => props.submit({ action: 'role', worker: p.id, role: p.role === 'pick' ? 'receive' : 'pick' })}
              data-testid="worker-move"
            >
              Move to {p.role === 'pick' ? 'the dock' : 'picking'}
            </button>
            <span className="muted">{props.sameRole <= 1 ? `The only ${p.role === 'pick' ? 'picker' : 'dock hand'}: someone has to stay.` : 'Drops what they hold; it goes to someone else.'}</span>
          </div>
          <h4 className="wms-subhead">Now</h4>
          {p.task === null ? (
            <p className="wms-note">No task. The WMS gives {p.role === 'pick' ? 'pickers allocated order lines' : 'the dock crew staged orders to load onto trailers first, then the lines of docked trucks and their put-aways'} as they come.</p>
          ) : (
            <ol className="task-list">
              <TaskCard task={p.task} time={props.time} label={p.state === 'walking' ? 'Walking to' : 'Working'} onOpen={props.onTask} />
            </ol>
          )}
          <h4 className="wms-subhead">Next ({p.queue.length})</h4>
          {p.queue.length === 0 ? (
            <p className="wms-note">Nothing lined up. The WMS plans every second and lines up a few tasks for each worker.</p>
          ) : (
            <ol className="task-list" data-testid="worker-queue">
              {p.queue.map((t, i) => (
                <TaskCard key={t.no} task={t} time={props.time} label={`${i + 1}.`} onOpen={props.onTask} />
              ))}
            </ol>
          )}
          <h4 className="wms-subhead">Done lately</h4>
          {p.done.length === 0 ? (
            <p className="wms-note">Nothing finished yet.</p>
          ) : (
            <ol className="task-list" data-testid="worker-done">
              {p.done.map((t) => (
                <TaskCard key={t.no} task={t} time={props.time} label="✓" onOpen={props.onTask} />
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
