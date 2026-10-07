import type { ReactElement } from 'react';
import type { WmsCrewKpis, WmsInboundKpis, WmsInventoryKpis, WmsKpis } from '@warehouse/contracts';
import { formatCash, short } from '../format.ts';

export interface Kpi {
  readonly label: string;
  readonly value: string;
  readonly alert?: boolean;
  readonly testId?: string;
}

function percent(value: number | null): string {
  return value === null ? '—' : `${value}%`;
}

/** Outbound (docs/wms-plan.md slice 6): the next wave, then lines/hr over the last four minutes; fill rate and OTIF over every order shipped since opening. */
export function outboundKpis(k: WmsKpis, nextWave: string): Kpi[] {
  return [
    { label: 'Wave in', value: nextWave, testId: 'wms-next-wave' },
    { label: 'Open', value: String(k.open) },
    { label: 'Lines/hr', value: short(k.linesPerHour) },
    { label: 'Fill', value: percent(k.fillRatePct), alert: k.fillRatePct !== null && k.fillRatePct < 95 },
    { label: 'OTIF', value: percent(k.otifPct), alert: k.otifPct !== null && k.otifPct < 90 },
    { label: 'Exc', value: String(k.exceptions), alert: k.exceptions > 0 },
    { label: 'Pickers', value: `${k.pickersBusy}/${k.pickersTotal}` },
  ];
}

/** The floor (W7, W8): the next wave (or how orders are released), OTIF, money a warehouse hour, lines an hour, and who is busy: pickers, doors and receivers. */
export function floorKpis(k: WmsKpis, ik: WmsInboundKpis, nextWave: string): Kpi[] {
  return [
    { label: 'Wave in', value: nextWave, testId: 'wms-next-wave' },
    { label: 'OTIF', value: percent(k.otifPct), alert: k.otifPct !== null && k.otifPct < 90 },
    { label: '$/hr', value: formatCash(k.earnedPerHour) },
    { label: 'Lines/hr', value: short(k.linesPerHour) },
    { label: 'Pickers', value: `${k.pickersBusy}/${k.pickersTotal}` },
    { label: 'Doors', value: `${ik.doorsBusy}/${ik.doorsTotal}`, alert: ik.atDock > ik.doorsBusy },
    { label: 'Rcvrs', value: `${ik.receiversBusy}/${ik.receiversTotal}` },
    { label: 'Exc', value: String(k.exceptions), alert: k.exceptions > 0 },
  ];
}

/** Inbound (W6): POs open and where they are, doors and receivers busy, units counted in an hour, exceptions, POs on time. */
export function inboundKpis(k: WmsInboundKpis): Kpi[] {
  return [
    { label: 'Open POs', value: String(k.open) },
    { label: 'Transit', value: String(k.inTransit) },
    { label: 'Doors', value: `${k.doorsBusy}/${k.doorsTotal}`, alert: k.atDock > k.doorsBusy },
    { label: 'Rcvrs', value: `${k.receiversBusy}/${k.receiversTotal}` },
    { label: 'Units/hr', value: short(k.unitsPerHour) },
    { label: 'Exc', value: String(k.exceptions), alert: k.exceptions > 0 },
    { label: 'On time', value: percent(k.onTimePct), alert: k.onTimePct !== null && k.onTimePct < 85 },
  ];
}

/** Inventory (W6): units on hand and free, on order, SKUs low and short, cycle-count accuracy. */
export function inventoryKpis(k: WmsInventoryKpis): Kpi[] {
  return [
    { label: 'On hand', value: short(k.onHand) },
    { label: 'Avail', value: short(k.available) },
    { label: 'Inbound', value: short(k.onOrder) },
    { label: 'Low', value: `${k.low}/${k.skus}` },
    { label: 'Short', value: String(k.short), alert: k.short > 0 },
    { label: 'Accuracy', value: percent(k.accuracyPct), alert: k.accuracyPct !== null && k.accuracyPct < 90 },
  ];
}

/** The crew (W8): how many are working, walking and idle, the tasks waiting for a picker or a receiver, and the crew's share of time working. */
export function crewKpis(k: WmsCrewKpis): Kpi[] {
  return [
    { label: 'Crew', value: String(k.crew) },
    { label: 'Working', value: String(k.working) },
    { label: 'Walking', value: String(k.walking) },
    { label: 'Idle', value: String(k.idle), alert: k.idle > 0 && k.pickOpen + k.receiveOpen > 0 },
    { label: 'Pick wait', value: String(k.pickOpen), alert: k.pickOpen > 0 },
    { label: 'Rcv wait', value: String(k.receiveOpen), alert: k.receiveOpen > 0 },
    { label: 'Busy', value: percent(k.utilPct) },
  ];
}

/**
 * The KPI strip under the header: one sticky line for the page on show,
 * scrolling sideways on its own if the phone is narrow.
 */
export function KpiStrip(props: { items: readonly Kpi[] }): ReactElement {
  return (
    <dl className="wms-kpis" data-testid="wms-kpis">
      {props.items.map((item) => (
        <div key={item.label} className={item.alert === true ? 'alert' : undefined} data-testid={item.testId}>
          <dt>{item.label}</dt>
          <dd className="num">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
