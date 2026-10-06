import { useRef, useState, type ReactElement } from 'react';
import type { WarehouseView } from '@warehouse/contracts';
import type { WarehouseHost, Feedback } from '../platform/index.ts';
import { formatCash, short } from './format.ts';
import { Sheet } from './Sheet.tsx';

/** The testing cheat's choices: run the warehouse this far ahead at once (an away recap sums it up). */
const SKIPS: readonly (readonly [string, number])[] = [
  ['+5 min', 5],
  ['+1 hour', 60],
  ['+8 hours', 480],
];

/** Saves to a file and back, starting over, the warehouse's lifetime numbers, and the testing time skip. */
export function SettingsSheet(props: { view: WarehouseView; host: WarehouseHost; feedback?: Feedback | undefined; onClose: () => void; onToast: (text: string) => void }): ReactElement {
  const { view, host, feedback, onClose, onToast } = props;
  const file = useRef<HTMLInputElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [prefs, setPrefs] = useState(feedback?.prefs ?? { sound: false, haptics: false });
  const toggle = (key: 'sound' | 'haptics'): void => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    feedback?.setPrefs(next);
  };

  const exportSave = async (): Promise<void> => {
    const { name, text } = await host.exportFile();
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    onToast('Saved to a file.');
  };

  const importSave = async (chosen: File | undefined): Promise<void> => {
    if (chosen === undefined) return;
    try {
      await host.importFile(await chosen.text());
      onToast('Warehouse loaded.');
      onClose();
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'That file could not be loaded.');
    }
  };

  const life = view.life;
  return (
    <Sheet title="Warehouse" onClose={onClose}>
      <dl className="stats" data-testid="stats">
        <div>
          <dt>Earned, all warehouses</dt>
          <dd>{formatCash(life.earned)}</dd>
        </div>
        <div>
          <dt>Shipments</dt>
          <dd>
            {short(life.shipments)} ({life.shipments === 0 ? 0 : Math.round((life.fullShipments / life.shipments) * 100)}% full)
          </dd>
        </div>
        <div>
          <dt>Orders shipped</dt>
          <dd>{short(life.orders)}</dd>
        </div>
        <div>
          <dt>POs received</dt>
          <dd>
            {short(life.pos)} ({short(life.received)} units)
          </dd>
        </div>
        <div>
          <dt>Offline earnings</dt>
          <dd>up to {view.offlineCapMinutes >= 60 ? `${view.offlineCapMinutes / 60} h` : `${view.offlineCapMinutes} min`}</dd>
        </div>
      </dl>
      {feedback !== undefined && (
        <div className="switches">
          <button type="button" role="switch" aria-checked={prefs.sound} className="switch" onClick={() => toggle('sound')} data-testid="sound">
            <span>Sound</span>
            <span className="switch-state">{prefs.sound ? 'On' : 'Off'}</span>
          </button>
          {feedback.canVibrate && (
            <button type="button" role="switch" aria-checked={prefs.haptics} className="switch" onClick={() => toggle('haptics')} data-testid="haptics">
              <span>Vibration</span>
              <span className="switch-state">{prefs.haptics ? 'On' : 'Off'}</span>
            </button>
          )}
        </div>
      )}
      <div className="skip" data-testid="skip">
        <p className="skip-title">Testing: skip ahead</p>
        <div className="skip-row">
          {SKIPS.map(([label, minutes]) => (
            <button
              key={label}
              type="button"
              className="btn"
              data-testid={`skip-${minutes}`}
              onClick={() => {
                void host.skip(minutes);
                onClose();
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="sheet-actions">
        <button type="button" className="btn" onClick={() => void exportSave()} data-testid="export">
          Save to a file
        </button>
        <button type="button" className="btn" onClick={() => file.current?.click()} data-testid="import">
          Load from a file
        </button>
        <input ref={file} type="file" accept="application/json,.json" hidden data-testid="import-file" onChange={(e) => void importSave(e.target.files?.[0])} />
        {confirming ? (
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              void host.newGame();
              onClose();
            }}
          >
            Yes, throw this warehouse away
          </button>
        ) : (
          <button type="button" className="btn btn-quiet" onClick={() => setConfirming(true)}>
            Start a new warehouse
          </button>
        )}
      </div>
    </Sheet>
  );
}
