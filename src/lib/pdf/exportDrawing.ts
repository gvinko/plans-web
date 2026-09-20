import { jsPDF } from 'jspdf';
import type { Canvas } from 'fabric';
import { computeLayout, chooseFitScale, type PaperSize } from './pageLayout';
import { renderFabricObjectToPdf, type PageTransform } from './fabricToPdf';
import { drawTitleBlock, type TitleBlockInfo } from './titleBlock';
import { drawLegend } from './legend';
import type { TakeoffLine } from '../takeoff/takeoff';
import type { UnitSystem } from '../units';

export interface ExportDrawingParams {
  canvas: Canvas;
  pxPerMm: number;
  paper: PaperSize;
  titleBlockInfo: Omit<TitleBlockInfo, 'scaleLabel'>;
  takeoffLines: TakeoffLine[];
  unitSystem: UnitSystem;
  /** Standard scale denominator (e.g. 100 for 1:100). Omit to auto-fit the drawing area. */
  manualScaleDenominator?: number;
}

export function exportDrawingToPdf(params: ExportDrawingParams): jsPDF {
  const { canvas, pxPerMm, paper, titleBlockInfo, takeoffLines, unitSystem, manualScaleDenominator } = params;
  const layout = computeLayout(paper);
  if (!Number.isFinite(pxPerMm) || pxPerMm <= 0) throw new Error('The plan scale is invalid. Recalibrate the drawing, then export again.');

  const objects = canvas.getObjects();
  const bounds = objects.reduce(
    (acc, o) => {
      const r = o.getBoundingRect();
      if (![r.left, r.top, r.width, r.height].every(Number.isFinite)) return acc;
      return {
        minX: Math.min(acc.minX, r.left),
        minY: Math.min(acc.minY, r.top),
        maxX: Math.max(acc.maxX, r.left + r.width),
        maxY: Math.max(acc.maxY, r.top + r.height),
      };
    },
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  const hasContent = Number.isFinite(bounds.minX);
  const widthPx = hasContent ? bounds.maxX - bounds.minX : 0;
  const heightPx = hasContent ? bounds.maxY - bounds.minY : 0;

  const realWidthMm = widthPx / pxPerMm;
  const realHeightMm = heightPx / pxPerMm;
  const requestedScale = Number(manualScaleDenominator);
  const scaleDenominator = Number.isFinite(requestedScale) && requestedScale > 0
    ? requestedScale
    : chooseFitScale(realWidthMm, realHeightMm, layout.drawingArea);

  const pxToMm = 1 / pxPerMm / scaleDenominator; // page-mm per canvas-px, at the chosen print scale
  const paperWidthMm = realWidthMm / scaleDenominator;
  const paperHeightMm = realHeightMm / scaleDenominator;
  const offsetX = layout.drawingArea.x + Math.max(0, (layout.drawingArea.width - paperWidthMm) / 2);
  const offsetY = layout.drawingArea.y + Math.max(0, (layout.drawingArea.height - paperHeightMm) / 2);
  const originX = hasContent ? bounds.minX : 0;
  const originY = hasContent ? bounds.minY : 0;

  const transform: PageTransform = {
    toPageMm: (p) => ({ x: offsetX + (p.x - originX) * pxToMm, y: offsetY + (p.y - originY) * pxToMm }),
    pxToMm,
  };

  // Use explicit dimensions rather than a shorthand page name. This avoids jsPDF's
  // internal f2 error when a browser or minifier passes an unexpected format value.
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [layout.pageWidthMm, layout.pageHeightMm], putOnlyUsedFonts: true });

  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.rect(5, 5, layout.pageWidthMm - 10, layout.pageHeightMm - 10);

  for (const obj of objects) {
    try {
      renderFabricObjectToPdf(doc, obj, transform);
    } catch {
      // A corrupt imported symbol must not prevent the rest of the marked-up plan exporting.
    }
  }

  drawTitleBlock(doc, layout, { ...titleBlockInfo, scaleLabel: `1:${scaleDenominator}` });
  drawLegend(doc, layout, takeoffLines, unitSystem);

  return doc;
}
