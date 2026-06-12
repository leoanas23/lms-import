// Dump complete Overview + Users content of a raw export. Usage: npx tsx test/inspect2.ts <path>
import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';

const wb = XLSX.read(readFileSync(process.argv[2]), { type: 'buffer', cellDates: true });
for (const n of ['Overview', 'Users']) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '' }) as unknown[][];
  console.log(`\n=== ${n} (${rows.length} rows) ===`);
  rows.forEach((r, i) => {
    const cells = r.map(c => c instanceof Date ? c.toISOString() : String(c));
    if (cells.some(c => c.trim() !== '')) console.log(`row${i}: ${JSON.stringify(cells)}`);
  });
}
