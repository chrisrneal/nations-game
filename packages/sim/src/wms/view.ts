import type { WmsState, WmsSummaryView } from '@warehouse/contracts';

/** Debug counts for the WMS (docs/wms-plan.md slice 1). */
export function wmsSummary(wms: WmsState): WmsSummaryView {
  let lines = 0;
  let units = 0;
  for (const order of wms.orders) {
    lines += order.lines.length;
    for (const line of order.lines) units += line.ordered;
  }
  return { orders: wms.orders.length, lines, units, skus: wms.inventory.length, pickers: wms.pickers.length, events: wms.events.length };
}
