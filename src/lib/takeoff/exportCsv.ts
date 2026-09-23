import type { UnitSystem } from '../units';
import { formatSizeMm, formatQuantity } from '../units';
import type { BomRow } from './bomRow';
import { computeLineTotal } from './bomRow';

function csvEscape(value: string): string {
  let safe = value;
  if (/^[=+\-@]/.test(safe)) safe = "'" + safe;
  if (/[",\n]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}
export function buildBomCsv(rows: BomRow[], system: UnitSystem): string {
  const header=['Item','Size','Qty','Unit','Unit Cost','Markup %','Total'];
  const lines=rows.map((row)=>{const qty=formatQuantity(row.quantity,row.unitLabel,system);return[
    csvEscape(row.itemLabel),csvEscape(formatSizeMm(row.sizeMm,system)),qty.value.toFixed(2),qty.unit,row.unitCost.toFixed(2),row.marginPercent.toFixed(1),computeLineTotal(row).toFixed(2)
  ].join(',');});
  const grand=rows.reduce((s,r)=>s+computeLineTotal(r),0);
  return '\uFEFF'+[header.join(','),...lines,['Grand Total','','','','','',grand.toFixed(2)].join(',')].join('\n');
}
export function downloadCsv(filename:string,csv:string):void{
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); const url=URL.createObjectURL(blob); const a=document.createElement('a');
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}
