import type { ReactElement } from 'react';
import type { AirportView } from '@nations/contracts';
import { Sheet } from './Sheet.tsx';

/** Welcome to the new city: its twist, and what the slots now add. */
export function CityIntro(props: { view: AirportView; onClose: () => void }): ReactElement {
  const { view, onClose } = props;
  return (
    <Sheet title={`Welcome to ${view.city.name}`} onClose={onClose}>
      <p className="twist" data-testid="city-twist">
        {view.city.twist}
      </p>
      <p className="sheet-note">
        {view.slots.owned} {view.slots.owned === 1 ? 'slot' : 'slots'}: every fare here is +{Math.round((view.slots.bonusBp - 10_000) / 100)}%.
      </p>
      <button type="button" className="btn btn-primary btn-wide" onClick={onClose} data-testid="open-city">
        Open the airport
      </button>
    </Sheet>
  );
}
