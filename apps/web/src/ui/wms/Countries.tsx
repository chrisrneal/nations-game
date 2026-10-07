import type { ReactElement } from 'react';
import type { WmsCountryView } from '@warehouse/contracts';

/** The pay factor a country's goodwill gives its shipments: (50 + goodwill)%, so x0.50 to x1.50. */
export function payFactor(goodwill: number): string {
  return `×${((50 + goodwill) / 100).toFixed(2)}`;
}

/**
 * The countries the WMS ships to (docs/wms-plan.md slice 8): orders shipped,
 * OTIF %, and goodwill, which moves with every shipment and scales what that
 * country's orders pay. Busiest first.
 */
export function Countries(props: { countries: readonly WmsCountryView[] }): ReactElement {
  const rows = [...props.countries].sort((a, b) => b.shipped - a.shipped || a.iso.localeCompare(b.iso));
  return (
    <div className="wms-countries" data-testid="wms-countries">
      <table>
        <thead>
          <tr>
            <th scope="col">Country</th>
            <th scope="col" className="num">
              Ship
            </th>
            <th scope="col" className="num">
              OTIF
            </th>
            <th scope="col">Goodwill</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.iso}>
              <th scope="row">
                <span aria-hidden="true">{c.flag}</span> {c.iso}
                <span className="c-name">{c.name}</span>
              </th>
              <td className="num">{c.shipped}</td>
              <td className={`num${c.otifPct !== null && c.otifPct < 90 ? ' late' : ''}`}>{c.otifPct === null ? '—' : `${c.otifPct}%`}</td>
              <td>
                <span className="gw">
                  <span className="gw-bar" aria-hidden="true">
                    <i style={{ transform: `scaleX(${c.goodwill / 100})` }} className={c.goodwill < 40 ? 'low' : c.goodwill >= 70 ? 'high' : undefined} />
                  </span>
                  <span className="num">{c.goodwill}</span>
                  <span className="muted num">{payFactor(c.goodwill)}</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="wms-note">
        Goodwill goes up 3 for an order shipped on time and in full, and down for late or short ones. A country's orders pay {payFactor(0)} at goodwill 0 to {payFactor(100)} at 100.
      </p>
    </div>
  );
}
