import { test, expect } from '@playwright/test';

test('legacy empty and unreadable drawings and orphan file metadata remain restorable', async ({ page }) => {
  test.skip(!!process.env.TEST_BASE_URL, 'Legacy ZIP fixture uses local source');
  await page.goto('http://127.0.0.1:4175/');
  const restored = await page.evaluate(async () => {
    const { db } = await import('/src/services/localDb.js');
    const { restoreBackup } = await import('/src/lib/backup.js');
    const { default: JSZip } = await import('/node_modules/.vite/deps/jszip.js');
    const zip = new JSZip();
    zip.file('backup.json', JSON.stringify({ app: 'Ductplanner', projects: [{ Id: 7201, Name: 'Legacy fixture' }], pages: [
      { Id: 7201, projectId_c: 7201, drawingJson_c: null },
      { Id: 7202, projectId_c: 7201, drawingJson_c: '' },
      { Id: 7203, projectId_c: 7201, drawingJson_c: '{unreadable original' },
    ], files: [{ key: 'unreferenced-no-blob', path: 'files/unreferenced-no-blob' }] }));
    await restoreBackup(await zip.generateAsync({ type: 'blob' }));
    return (await db.plan_pages.toArray()).map(row => row.drawingJson_c);
  });
  expect(restored).toEqual([null, '', '{unreadable original']);
});
