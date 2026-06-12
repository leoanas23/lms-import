// Debug helper: dump sheet structure of a raw xlsx. Usage: npx tsx test/inspect.ts <path>
import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';

const file = process.argv[2];
const wb = XLSX.read(readFileSync(file), { type: 'buffer', cellDates: true });
console.log('Sheets:', JSON.stringify(wb.SheetNames));
for (const n of wb.SheetNames) {
  const ws = wb.Sheets[n];
  console.log(`\n--- sheet "${n}"  !ref=${ws['!ref']}`);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
  console.log(`rows: ${rows.length}`);
  rows.slice(0, 5).forEach((r, i) =>
    console.log(`row${i} (${r.length} cells):`, JSON.stringify(r.slice(0, 14))));
}
