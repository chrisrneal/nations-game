import type { ReactElement } from 'react';
import type { WmsKpis } from '@warehouse/contracts';
import { short } from '../format.ts';

function percent(value: number | null): string {
  return value === null ? '—' : `${value}%`;
}

/**
 * The KPI strip (docs/wms-plan.md slice 6): one sticky line under the header,
 * scrolling sideways on its own if the phone is narrow. Lines/hr is measured
 * over the last four minutes; fill rate and OTIF over every order shipped
 * since the warehouse opened.
 */
export function KpiStrip(props: { kpis: WmsKpis }): ReactElement {
  const k = props.kpis;
  const items: readonly { readonly label: string; readonly value: string; readonly alert?: boolean }[] = [
    { label: 'Open', value: String(k.open) },
    { label: 'Lines/hr', value: short(k.linesPerHour) },
    { label: 'Fill', value: percent(k.fillRatePct), alert: k.fillRatePct !== null && k.fillRatePct < 95 },
    { label: 'OTIF', value: percent(k.otifPct), alert: k.otifPct !== null && k.otifPct < 90 },
    { label: 'Exc', value: String(k.exceptions), alert: k.exceptions > 0 },
    { label: 'Pickers', value: `${k.pickersBusy}/${k.pickersTotal}` },
  ];
  return (
    <dl className="wms-kpis" data-testid="wms-kpis">
      {items.map((item) => (
        <div key={item.label} className={item.alert === true ? 'alert' : undefined}>
          <dt>{item.label}</dt>
          <dd className="num">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
