import type { jsPDF } from 'jspdf';
import type { PageLayout } from './pageLayout';
import type { TakeoffLine } from '../takeoff/takeoff';
import { formatSizeMm, type UnitSystem } from '../units';

const COLOR_KEY: { label: string; hex: [number, number, number] }[] = [
  { label: 'Rigid Duct', hex: [148, 163, 184] },
  { label: 'Flex Duct', hex: [56, 189, 248] },
  { label: 'Equipment / Fittings', hex: [30, 41, 59] },
  { label: 'Terminals', hex: [245, 158, 11] },
];

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}\u2026` : s;
}

export function drawLegend(doc: jsPDF, layout: PageLayout, lines: TakeoffLine[], system: UnitSystem): void {
  const { x, y, width, height } = layout.legend;
  let cursorY = y + 4;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('LEGEND', x, cursorY);
  cursorY += 6;

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  for (const { label, hex } of COLOR_KEY) {
    doc.setFillColor(...hex);
    doc.rect(x, cursorY - 3, 4, 4, 'F');
    doc.text(label, x + 6, cursorY);
    cursorY += 5;
  }

  cursorY += 3;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('DUCT & FITTING SCHEDULE', x, cursorY);
  cursorY += 4;

  doc.setLineWidth(0.2);
  doc.line(x, cursorY, x + width, cursorY);
  cursorY += 3.5;
  doc.setFontSize(6.5);
  doc.text('Item', x, cursorY);
  doc.text('Size', x + width * 0.52, cursorY);
  doc.text('Qty', x + width * 0.82, cursorY);
  cursorY += 1.5;
  doc.line(x, cursorY, x + width, cursorY);
  cursorY += 3.5;

  doc.setFont('helvetica', 'normal');
  for (const line of lines) {
    if (cursorY > y + height) break; // sheet ran out of room — remaining items covered by the BOM export
    const qty = line.unitLabel === 'ea' ? `${line.quantity}` : `${line.quantity.toFixed(1)} m`;
    doc.text(truncate(line.itemLabel, 24), x, cursorY);
    doc.text(formatSizeMm(line.sizeMm, system), x + width * 0.52, cursorY);
    doc.text(qty, x + width * 0.82, cursorY);
    cursorY += 4;
  }
}
