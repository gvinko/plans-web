export type PaperSize = 'a3' | 'a4';

export const PAGE_SIZES_MM: Record<PaperSize, { width: number; height: number }> = {
  a3: { width: 420, height: 297 }, // landscape
  a4: { width: 297, height: 210 },
};

export const STANDARD_SCALES = [20, 25, 50, 75, 100, 125, 150, 200, 250, 500];

const MARGIN_MM = 10;
const TITLE_BLOCK_WIDTH_MM = 90;
const TITLE_BLOCK_HEIGHT_MM = 55;
const LEGEND_WIDTH_MM = 60;
const GUTTER_MM = 5;

export interface Rect2D {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageLayout {
  paper: PaperSize;
  pageWidthMm: number;
  pageHeightMm: number;
  drawingArea: Rect2D;
  titleBlock: Rect2D;
  legend: Rect2D;
}

export function computeLayout(paper: PaperSize): PageLayout {
  const { width, height } = PAGE_SIZES_MM[paper];

  const titleBlock: Rect2D = {
    x: width - MARGIN_MM - TITLE_BLOCK_WIDTH_MM,
    y: height - MARGIN_MM - TITLE_BLOCK_HEIGHT_MM,
    width: TITLE_BLOCK_WIDTH_MM,
    height: TITLE_BLOCK_HEIGHT_MM,
  };
  const legend: Rect2D = {
    x: width - MARGIN_MM - LEGEND_WIDTH_MM,
    y: MARGIN_MM,
    width: LEGEND_WIDTH_MM,
    height: titleBlock.y - MARGIN_MM - GUTTER_MM,
  };
  const drawingArea: Rect2D = {
    x: MARGIN_MM,
    y: MARGIN_MM,
    width: width - MARGIN_MM * 2 - LEGEND_WIDTH_MM - GUTTER_MM,
    height: height - MARGIN_MM * 2,
  };

  return { paper, pageWidthMm: width, pageHeightMm: height, drawingArea, titleBlock, legend };
}

/** Largest standard scale (smallest drawing) at which the real-world extent fits the drawing area. */
export function chooseFitScale(realWidthMm: number, realHeightMm: number, drawingArea: { width: number; height: number }): number {
  for (const scale of STANDARD_SCALES) {
    if (realWidthMm / scale <= drawingArea.width && realHeightMm / scale <= drawingArea.height) return scale;
  }
  return STANDARD_SCALES[STANDARD_SCALES.length - 1];
}
