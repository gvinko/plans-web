// Keep file keys from an imported backup from overwriting local attachments.
// Only rewrite references in the rows that the restore plan will actually write.
const keyLists = ['planFile_c', 'sitePhotos_c', 'specDocs_c'];

export function prepareRestoredFiles(plan, incomingFiles, occupiedKeys, makeKey) {
  const occupied = new Set(occupiedKeys);
  const keys = new Map();
  const referenced = new Set();

  for (const row of [...plan.projects, ...plan.pages]) {
    for (const field of keyLists) {
      for (const item of Array.isArray(row[field]) ? row[field] : []) {
        if (item?.key) referenced.add(item.key);
      }
    }
  }

  const files = [];
  for (const file of incomingFiles) {
    if (!file?.key || keys.has(file.key)) continue;
    if (occupied.has(file.key)) {
      if (!referenced.has(file.key)) continue;
      let replacement;
      do { replacement = makeKey(file.key); } while (!replacement || occupied.has(replacement));
      keys.set(file.key, replacement);
      occupied.add(replacement);
      files.push({ ...file, key: replacement });
    } else {
      occupied.add(file.key);
      files.push(file);
    }
  }

  const rewrite = (row) => {
    let updated = row;
    for (const field of keyLists) {
      if (!Array.isArray(row[field])) continue;
      const items = row[field].map((item) =>
        item?.key && keys.has(item.key) ? { ...item, key: keys.get(item.key) } : item);
      if (items.some((item, i) => item !== row[field][i])) updated = { ...updated, [field]: items };
    }
    return updated;
  };

  return {
    projects: plan.projects.map(rewrite),
    pages: plan.pages.map(rewrite),
    files,
  };
}
