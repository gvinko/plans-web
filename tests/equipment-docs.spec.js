import { test, expect } from '@playwright/test';

test('equipment references require the exact pair; project PDF bytes survive ZIP restore', async ({ page }) => {
  test.skip(!!process.env.TEST_BASE_URL, 'Source-module backup fixture');
  await page.goto('http://127.0.0.1:4175/');
  const result = await page.evaluate(async () => {
    const docs = await import('/src/data/equipmentDocs.js');
    const { db, storage, sdk } = await import('/src/services/localDb.js');
    const { buildBackupZip, restoreBackup } = await import('/src/lib/backup.js');
    const exact = docs.resolveEquipmentDocument(' arth72khta-3ph ', 'aoth72krta');
    const wrong = docs.resolveEquipmentDocument('ARTH72KHTA-3PH', 'AOTH90KRTA');
    const unknown = docs.resolveEquipmentDocument('FDYQN100', 'RZQ100');
    const file = await storage.upload(new File(['%PDF-1.4\nDisposable manual bytes\n'], 'qa-manual.pdf', { type: 'application/pdf' }));
    const reference = { name: exact.title, type: 'official-reference', sourceUrl: exact.sourceUrl, url: exact.url, version: exact.version };
    await db.projects.put({ Id: 92001, Name: 'Disposable equipment documents', projectDocuments_c: [reference, ...storage.toUpdateFormat([file])] });
    const before = await db.projects.get(92001);
    const { blob } = await buildBackupZip();
    await db.projects.update(92001, { projectDocuments_c: [] });
    await db.files.delete(file.key);
    const restored = await restoreBackup(blob);
    const after = await db.projects.get(92001);
    const hydrated = await sdk.table('projects_c').select().fetch();
    return { exact, wrong, unknown, before, after, restored, bytes: await (await db.files.get(file.key)).blob.text(), hydrated };
  });
  expect(result.exact).toMatchObject({ manufacturer: 'Fujitsu General', indoor: 'ARTH72KHTA-3PH', outdoor: 'AOTH72KRTA' });
  expect(result.wrong).toBeNull(); expect(result.unknown).toBeNull();
  expect(result.after).toEqual(result.before);
  expect(result.bytes).toBe('%PDF-1.4\nDisposable manual bytes\n');
  expect(result.restored).toMatchObject({ projects: 1, files: 1 });
  expect(result.hydrated.data[0].projectDocuments_c[0]).toEqual(result.before.projectDocuments_c[0]);
  expect(result.hydrated.data[0].projectDocuments_c[1].url).toMatch(/^blob:/);
});
