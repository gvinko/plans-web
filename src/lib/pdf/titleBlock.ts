import type { jsPDF } from 'jspdf';
import type { PageLayout } from './pageLayout';

export interface TitleBlockInfo {
  projectName: string;
  designer: string;
  client: string;
  address: string;
  systemType: string;
  scaleLabel: string; // e.g. "1:100"
  date: string;
  revision: string;
  notes: string;
}

export function drawTitleBlock(doc: jsPDF, layout: PageLayout, info: TitleBlockInfo): void {
  const { x, y, width, height } = layout.titleBlock;

  doc.setDrawColor(0);
  doc.setLineWidth(0.4);
  doc.rect(x, y, width, height);

  const fields: [string, string][] = [
    ['Project', info.projectName],
    ['Client', info.client],
    ['Address', info.address],
    ['System', info.systemType],
    ['Scale', info.scaleLabel],
    ['Date', info.date],
    ['Revision', info.revision],
    ['Designer', info.designer],
  ];
  const rowH = height / fields.length;

  doc.setFontSize(7);
  fields.forEach(([label, value], i) => {
    const rowY = y + i * rowH;
    if (i > 0) doc.line(x, rowY, x + width, rowY);
    doc.setFont('helvetica', 'bold');
    doc.text(label.toUpperCase(), x + 2, rowY + rowH / 2, { baseline: 'middle' });
    doc.setFont('helvetica', 'normal');
    doc.text(value || '\u2014', x + 26, rowY + rowH / 2, { baseline: 'middle' });
  });

  if (info.notes) {
    doc.setFontSize(6);
    doc.setFont('helvetica', 'italic');
    doc.text(doc.splitTextToSize(info.notes, width - 4), x + 2, y + height + 5);
  }

  drawNorthArrow(doc, x + width - 8, y - 12);
}

function drawNorthArrow(doc: jsPDF, cx: number, cy: number): void {
  doc.setDrawColor(0);
  doc.setFillColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.line(cx, cy + 5, cx, cy - 4);
  doc.triangle(cx, cy - 7, cx - 2.2, cy - 2.5, cx + 2.2, cy - 2.5, 'F');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('N', cx, cy - 9, { align: 'center' });
}
