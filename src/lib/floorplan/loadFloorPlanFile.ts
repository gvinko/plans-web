import { rasterizePdfFirstPage, type RasterizedPage } from '../pdf/pdfToImage';

export type { RasterizedPage };

const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);

export function isSupportedFloorPlanFile(file: File): boolean {
  return file.type === 'application/pdf' || SUPPORTED_IMAGE_TYPES.has(file.type);
}

export async function loadFloorPlanFile(file: File): Promise<RasterizedPage> {
  if (file.type === 'application/pdf') {
    return rasterizePdfFirstPage(file);
  }
  if (SUPPORTED_IMAGE_TYPES.has(file.type)) {
    const bitmap = await createImageBitmap(file);
    const dims = { widthPx: bitmap.width, heightPx: bitmap.height };
    bitmap.close();
    return { blob: file, ...dims };
  }
  throw new Error(`Unsupported file type: ${file.type || 'unknown'}. Use PNG, JPG, WEBP, or PDF.`);
}
