import { useEffect, useState, type ReactElement } from 'react';
import type { InstallPrompt, InstallState } from '../platform/index.ts';

/**
 * The install prompt: one tap to add the airport to the home screen, so it opens
 * full screen and offline. Android and desktop show the browser's own dialog;
 * iPhone and iPad get the two Share-menu steps, because Safari has no dialog.
 * Nothing shows once the app is installed.
 */
export function InstallBanner(props: { install: InstallPrompt | undefined; onToast: (text: string) => void }): ReactElement | null {
  const { install, onToast } = props;
  const [state, setState] = useState<InstallState>(() => install?.state() ?? 'none');
  const [hidden, setHidden] = useState(false);
  useEffect(() => install?.subscribe(setState), [install]);
  if (install === undefined || hidden || state === 'installed' || state === 'none') return null;
  return (
    <aside className="install" aria-label="Install the app" data-testid="install">
      <span className="install-icon" aria-hidden="true">
        📲
      </span>
      <span className="install-text">
        {state === 'prompt' ? 'Install it: opens full screen, works offline, and the airport keeps earning while closed.' : 'Install on iPhone: tap Share, then “Add to Home Screen”.'}
      </span>
      {state === 'prompt' && (
        <button
          type="button"
          className="btn btn-small btn-primary"
          onClick={() =>
            void install.prompt().then((outcome) => {
              if (outcome === 'accepted') onToast('Installed. Open the airport from your home screen.');
            })
          }
        >
          Install
        </button>
      )}
      <button type="button" className="btn btn-small btn-quiet" aria-label="Not now" onClick={() => setHidden(true)}>
        ✕
      </button>
    </aside>
  );
}
