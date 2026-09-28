import { useEffect, useState, type ReactElement } from 'react';
import { AUTOSAVE_SLOT, MANUAL_SLOTS, type GameHost, type SlotSummary } from '../platform/index.ts';
import { nameOf, tickDate } from '../world/nations.ts';
import { Num } from './why.tsx';

function slotName(slot: string): string {
  return slot === AUTOSAVE_SLOT ? 'Autosave' : `Slot ${slot.replace('slot-', '')}`;
}

function when(savedAt: number): string {
  return new Date(savedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** One save slot row: what is in it, and the actions it allows. */
function SlotRow(props: {
  slot: string;
  summary: SlotSummary | undefined;
  onSave?: () => void;
  onLoad: () => void;
}): ReactElement {
  const { summary } = props;
  return (
    <li className="slot" data-testid={`slot-${props.slot}`}>
      <div className="slot-info">
        <span className="slot-name">{slotName(props.slot)}</span>
        {summary === undefined ? (
          <span className="slot-meta">Empty</span>
        ) : (
          <span className="slot-meta">
            {nameOf(summary.humanId)} ·{' '}
            <Num
              why={{
                title: 'Saved at',
                value: `Month ${summary.tick} · ${tickDate(summary.tick)}`,
                text: `Loading this slot continues the world from month ${summary.tick}. Saved on this phone ${when(summary.savedAt)}; saves stay on the device and work offline.`,
              }}
            >
              month {summary.tick}
            </Num>
          </span>
        )}
      </div>
      <div className="slot-actions">
        {props.onSave !== undefined && (
          <button type="button" className="btn btn-small" onClick={props.onSave}>
            Save
          </button>
        )}
        <button type="button" className="btn btn-small" disabled={summary === undefined} onClick={props.onLoad}>
          Load
        </button>
      </div>
    </li>
  );
}

/** Save slots, a new game, and the on-device speed check. */
export function Saves(props: {
  host: GameHost;
  inGame: boolean;
  onLoad: (slot: string) => void;
  onNewGame: () => void;
  onToast: (text: string) => void;
}): ReactElement {
  const { host, onToast } = props;
  const [slots, setSlots] = useState<ReadonlyMap<string, SlotSummary>>(new Map());
  const [bench, setBench] = useState<number | null>(null);

  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    void host.listSaves().then((list) => {
      if (alive) setSlots(new Map(list.map((s) => [s.slot, s])));
    });
    return () => {
      alive = false;
    };
  }, [host, version]);

  const save = async (slot: string): Promise<void> => {
    const summary = await host.saveTo(slot);
    onToast(`Saved to ${slotName(slot)} at month ${summary.tick}`);
    setVersion((v) => v + 1);
  };

  return (
    <section className="saves" aria-label="Game">
      <h1 className="section-title">Saves</h1>
      <ul className="slots">
        <SlotRow slot={AUTOSAVE_SLOT} summary={slots.get(AUTOSAVE_SLOT)} onLoad={() => props.onLoad(AUTOSAVE_SLOT)} />
        {MANUAL_SLOTS.map((slot) => (
          <SlotRow
            key={slot}
            slot={slot}
            summary={slots.get(slot)}
            {...(props.inGame ? { onSave: () => void save(slot) } : {})}
            onLoad={() => props.onLoad(slot)}
          />
        ))}
      </ul>
      <h2 className="section-subtitle">Speed check</h2>
      <p className="hint">
        Runs 1,000 months of a throwaway world on this phone. The Gate 0 target is under 2 seconds.
      </p>
      <div className="bench">
        <button
          type="button"
          className="btn btn-small"
          onClick={() => {
            setBench(null);
            void host.benchmark(1000).then(setBench);
          }}
        >
          Run speed check
        </button>
        {bench !== null && (
          <Num
            why={{
              title: 'Speed check',
              value: `${Math.round(bench)} ms`,
              text: `1,000 ticks of catch-up with every nation run by the AI took ${Math.round(bench)} ms here. Gate 0 asks for under 2,000 ms on a mid-range phone.`,
            }}
          />
        )}
      </div>
      <button type="button" className="btn btn-quiet new-game" onClick={props.onNewGame}>
        Start a new game…
      </button>
    </section>
  );
}
