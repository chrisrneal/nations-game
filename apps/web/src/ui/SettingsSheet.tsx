import { useRef, useState, type ReactElement } from 'react';
import type { AirportView } from '@nations/contracts';
import type { AirportHost } from '../platform/index.ts';
import { formatCash, short } from './format.ts';
import { Sheet } from './Sheet.tsx';

/** Saves to a file and back, starting over, and the airport's lifetime numbers. */
export function SettingsSheet(props: { view: AirportView; host: AirportHost; onClose: () => void; onToast: (text: string) => void }): ReactElement {
  const { view, host, onClose, onToast } = props;
  const file = useRef<HTMLInputElement>(null);
  const [confirming, setConfirming] = useState(false);

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
      onToast('Airport loaded.');
      onClose();
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'That file could not be loaded.');
    }
  };

  const life = view.life;
  return (
    <Sheet title="Airport" onClose={onClose}>
      <dl className="stats" data-testid="stats">
        <div>
          <dt>Earned, all airports</dt>
          <dd>{formatCash(life.earned)}</dd>
        </div>
        <div>
          <dt>Flights</dt>
          <dd>
            {short(life.flights)} ({life.flights === 0 ? 0 : Math.round((life.fullFlights / life.flights) * 100)}% full)
          </dd>
        </div>
        <div>
          <dt>Passengers</dt>
          <dd>{short(life.pax)}</dd>
        </div>
        <div>
          <dt>Offline earnings</dt>
          <dd>up to {view.offlineCapMinutes >= 60 ? `${view.offlineCapMinutes / 60} h` : `${view.offlineCapMinutes} min`}</dd>
        </div>
      </dl>
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
            Yes, throw this airport away
          </button>
        ) : (
          <button type="button" className="btn btn-quiet" onClick={() => setConfirming(true)}>
            Start a new airport
          </button>
        )}
      </div>
    </Sheet>
  );
}
