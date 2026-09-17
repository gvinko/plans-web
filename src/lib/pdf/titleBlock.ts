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
  drawingNumber: string;
  companyName?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  logoImage?: HTMLImageElement | null;
}

export function drawTitleBlock(doc: jsPDF, layout: PageLayout, info: TitleBlockInfo): void {
  const { x, y, width, height } = layout.titleBlock;

  doc.setDrawColor(0);
  doc.setLineWidth(0.4);
  doc.rect(x, y, width, height);

  const hasBrand = Boolean(info.companyName || info.logoImage);
  const brandStripH = hasBrand ? 16 : 0;
  const bottomTableH = 12;

  // --- Brand strip: logo + company name + contact line ---
  if (hasBrand) {
    doc.line(x, y + brandStripH, x + width, y + brandStripH);
    let textX = x + 2;
    if (info.logoImage) {
      const logoH = brandStripH - 4;
      const logoW = (info.logoImage.naturalWidth / info.logoImage.naturalHeight) * logoH || logoH;
      try {
        doc.addImage(info.logoImage, 'PNG', x + 2, y + 2, logoW, logoH);
        textX = x + 2 + logoW + 3;
      } catch {
        // Unsupported/corrupt image — fall back to text-only branding rather than failing the export.
      }
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(info.companyName || '', textX, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    const contactLine = [info.contactName, info.contactPhone, info.contactEmail].filter(Boolean).join('  \u2022  ');
    if (contactLine) doc.text(contactLine, textX, y + 11);
  }

  // --- Job block: client/address (the job site) + drawing title ---
  const jobY = y + brandStripH;
  const jobH = height - brandStripH - bottomTableH;
  doc.line(x, jobY + jobH, x + width, jobY + jobH);

  let cursorY = jobY + 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(info.client || info.projectName || '\u2014', x + 2, cursorY);
  cursorY += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  if (info.address) {
    for (const line of doc.splitTextToSize(info.address, width - 4)) {
      doc.text(line, x + 2, cursorY);
      cursorY += 3.8;
    }
  }

  cursorY += 1;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text(info.systemType || '\u2014', x + 2, cursorY);

  if (info.notes) {
    cursorY += 4.5;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6);
    for (const line of doc.splitTextToSize(info.notes, width - 4)) {
      if (cursorY > jobY + jobH - 2) break;
      doc.text(line, x + 2, cursorY);
      cursorY += 3.2;
    }
  }

  // --- Bottom mini-table: Drawn By | Scale | Revision | Date | Drawing No. ---
  const tableY = y + height - bottomTableH;
  const cols: [string, string][] = [
    ['Drawn By', info.designer],
    ['Scale', info.scaleLabel],
    ['Rev', info.revision],
    ['Date', info.date],
    ['Dwg No.', info.drawingNumber],
  ];
  const colW = width / cols.length;
  cols.forEach(([label, value], i) => {
    const colX = x + i * colW;
    if (i > 0) doc.line(colX, tableY, colX, tableY + bottomTableH);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.text(label.toUpperCase(), colX + 1.5, tableY + 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text(value || '\u2014', colX + 1.5, tableY + 9);
  });

  drawNorthArrow(doc, x + width - 8, y - 14);
}

/** 8-point compass star (alternating filled/outline spikes) rather than a plain arrow — matches
 * the convention seen on real site drawings, e.g. Echo Air Conditioning's mechanical layouts. */
function drawNorthArrow(doc: jsPDF, cx: number, cy: number): void {
  const outerR = 7;
  const innerR = 2.5;
  const points: [number, number][] = Array.from({ length: 8 }, (_, i) => {
    const r = i % 2 === 0 ? outerR : innerR;
    const rad = ((i * 45 - 90) * Math.PI) / 180;
    return [cx + Math.cos(rad) * r, cy + Math.sin(rad) * r];
  });

  doc.setDrawColor(0);
  doc.setLineWidth(0.2);
  for (let i = 0; i < 8; i++) {
    const [p1x, p1y] = points[i];
    const [p2x, p2y] = points[(i + 1) % 8];
    doc.setFillColor(i % 2 === 0 ? 0 : 255, i % 2 === 0 ? 0 : 255, i % 2 === 0 ? 0 : 255);
    doc.triangle(cx, cy, p1x, p1y, p2x, p2y, 'FD');
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('N', cx, cy - outerR - 3, { align: 'center' });
}
