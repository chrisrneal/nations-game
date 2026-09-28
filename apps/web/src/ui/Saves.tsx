import { useEffect, useRef, useState, type ReactElement } from 'react';
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

/** Hands the browser a file to save: the player keeps it wherever they like. */
function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Save slots, export to and import from a file, a new game, and the on-device speed check. */
export function Saves(props: {
  host: GameHost;
  inGame: boolean;
  /** Fingerprint of the running game, shown so a restored file can be checked against it. */
  fingerprint?: string;
  onLoad: (slot: string) => void;
  /** Called after a file was imported and the game resumed. */
  onImported: () => void;
  onNewGame: () => void;
  onToast: (text: string) => void;
}): ReactElement {
  const { host, onToast } = props;
  const fileInput = useRef<HTMLInputElement>(null);
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
      <h2 className="section-subtitle">File</h2>
      <p className="hint">A file keeps your game safe even if this phone's site data is cleared. Import it on any device.</p>
      <div className="slot-actions file-actions">
        {props.inGame && (
          <button
            type="button"
            className="btn btn-small"
            data-testid="export"
            onClick={() =>
              void host.exportFile().then(
                (file) => {
                  download(file.name, file.text);
                  onToast(`Exported ${file.name}`);
                },
                (error: unknown) => onToast(String(error)),
              )
            }
          >
            Export to file
          </button>
        )}
        <button type="button" className="btn btn-small" data-testid="import" onClick={() => fileInput.current?.click()}>
          Import from file
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          data-testid="import-file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file === undefined) return;
            void file
              .text()
              .then((text) => host.importFile(text))
              .then(
                () => {
                  onToast('Game restored from file. Paused - press 1× to continue.');
                  setVersion((v) => v + 1);
                  props.onImported();
                },
                (error: unknown) => onToast(error instanceof Error ? error.message : String(error)),
              );
          }}
        />
      </div>
      {props.fingerprint !== undefined && (
        <p className="hint">
          Game check:{' '}
          <Num
            why={{
              title: 'Game check',
              value: props.fingerprint,
              text: 'A fingerprint of the whole world. A save or file that restores this game shows the same code at the same month.',
            }}
          >
            <span data-testid="fingerprint">{props.fingerprint.slice(0, 8)}</span>
          </Num>
        </p>
      )}
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
