import * as XLSX from 'xlsx';
import { parseCatalogRow, type ImportedCatalogRow } from './excelSchema';

export interface ParsedWorkbookResult {
  rows: ImportedCatalogRow[];
  skippedRowCount: number;
}

export async function parseCatalogFile(file: File): Promise<ParsedWorkbookResult> {
  const isCsv = file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv');

  const workbook = isCsv
    ? XLSX.read(await file.text(), { type: 'string' })
    : XLSX.read(await file.arrayBuffer(), { type: 'array' });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { rows: [], skippedRowCount: 0 };

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });

  const rows: ImportedCatalogRow[] = [];
  let skippedRowCount = 0;
  for (const raw of rawRows) {
    const parsed = parseCatalogRow(raw);
    if (parsed) rows.push(parsed);
    else skippedRowCount++;
  }

  return { rows, skippedRowCount };
}
