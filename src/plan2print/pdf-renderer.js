export async function renderFirstPdfPage(file) {
  const [{ getDocument, GlobalWorkerOptions }, worker] = await Promise.all([
    import('pdfjs-dist/build/pdf.mjs'),
    import('pdfjs-dist/build/pdf.worker.mjs?url'),
  ]);
  GlobalWorkerOptions.workerSrc = worker.default;
  const pdfDocument = await getDocument({ data: await file.arrayBuffer() }).promise;
  const page = await pdfDocument.getPage(1);
  const viewport = page.getViewport({ scale: 1.5 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  return canvas;
}
