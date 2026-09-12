import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface RasterizedPage {
  blob: Blob;
  widthPx: number;
  heightPx: number;
}

/** Rasterizes page 1 of a PDF to a PNG blob. scale=2 gives ~144dpi from a 72dpi source page. */
export async function rasterizePdfFirstPage(file: File, scale = 2): Promise<RasterizedPage> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not acquire 2D context for PDF rasterization');

  await page.render({ canvasContext: ctx, viewport }).promise;

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PDF rasterization failed'))), 'image/png'),
  );

  await pdf.destroy();
  return { blob, widthPx: canvas.width, heightPx: canvas.height };
}
