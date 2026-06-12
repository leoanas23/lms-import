import * as XLSX from 'xlsx';
import customers from '@/config/customers.json';
import { normalizeDate, normEmail } from './normalize';
import type { TrainingEvent, Learner } from './types';

const KNOWN_USERS_COLUMNS = new Set([
  'first name','last name','email','status','legal entity of your business','company name',
  'type of business','city','state','zip code','county','date business started?',
  'what are you interested in?','race','ethnicity','sex','disability','military status',
  'online business','are you 8(a) certified?','currently in business','exporting',
  'total no. of employees (full time)','total no. of employees (part time)',
  'if yes, to which countries are you exporting','employees engaged in exporting (full time & part time)',
  'completion date','progress','score','points','registration date','last login','user id','username','branch',
]);

/** All cell rows of a sheet, with the range expanded back to A1 — some LMS
 * exports declare a !ref that starts BELOW the real header row, which made
 * the first data row look like headers. */
function gridRows(ws: XLSX.WorkSheet): unknown[][] {
  const ref = ws['!ref'] || 'A1';
  const end = ref.includes(':') ? ref.split(':')[1] : ref;
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', range: `A1:${end}` });
}

/** Parse one raw TalentLMS per-course xlsx. */
export function parseRawFile(buf: Buffer | Uint8Array, filename: string): TrainingEvent {
  return parseRawWorkbook(XLSX.read(buf, { type: 'buffer', cellDates: true }), filename);
}

export function parseRawWorkbook(wb: XLSX.WorkBook, filename: string): TrainingEvent {

  // --- Overview sheet: course name, center (Category), session date ---
  const ovName = wb.SheetNames.find(n => n.toLowerCase() === 'overview');
  if (!ovName) throw new Error(`${filename}: no Overview sheet found`);
  const ov = gridRows(wb.Sheets[ovName]);
  let courseName = '', category = '', sessionDateRaw: unknown = '';
  for (const row of ov) {
    const key = String(row[0] ?? '').trim().toLowerCase();
    const val = row[1] ?? '';
    if (!key) continue;
    if (key.includes('course') && key.includes('name') && !courseName) courseName = String(val).trim();
    else if (key === 'name' && !courseName) courseName = String(val).trim();
    if (key.includes('category')) category = String(val).trim();
    if ((key.includes('start') && key.includes('date')) || key === 'date') sessionDateRaw = val;
  }
  if (!courseName) throw new Error(`${filename}: could not find course name in Overview sheet`);

  const aliases = (customers as any).centerAliases as Record<string, string>;
  const centerName = aliases[category] || category;
  const sessionDate = normalizeDate(sessionDateRaw);

  // --- Users sheet: Completed learners only ---
  const usName = wb.SheetNames.find(n => n.toLowerCase() === 'users');
  if (!usName) throw new Error(`${filename}: no Users sheet found`);
  const grid = gridRows(wb.Sheets[usName]);

  // The header row is wherever "First name" + "Email" appear, not necessarily row 1
  // (real exports can have preamble rows or a clipped sheet range above it).
  const cellStr = (c: unknown) => (c instanceof Date ? normalizeDate(c) : String(c ?? '').trim());
  const headerIdx = grid.findIndex(r => {
    const cells = r.map(c => cellStr(c).toLowerCase());
    return cells.includes('first name') && cells.includes('email');
  });
  if (headerIdx === -1) throw new Error(
    `${filename}: could not find the header row (First name / Email) in the Users sheet — is this the standard TalentLMS per-course export?`);
  const headers = grid[headerIdx].map(cellStr);
  const dataRows = grid.slice(headerIdx + 1).filter(r => r.some(c => cellStr(c) !== ''));
  const unmappedColumns = headers.filter(h => h && !KNOWN_USERS_COLUMNS.has(h.toLowerCase()));

  const lcHeaders = headers.map(h => h.toLowerCase());
  const statusCol = lcHeaders.indexOf('status');
  const learners: Learner[] = [];
  let filteredOut = 0;
  for (const r of dataRows) {
    const status = cellStr(statusCol >= 0 ? r[statusCol] : '').toLowerCase();
    if (status !== 'completed') { filteredOut++; continue; }
    const get = (name: string) => {
      const i = lcHeaders.indexOf(name);
      return i >= 0 ? cellStr(r[i]) : '';
    };
    const raw: Record<string, string> = {};
    headers.forEach((h, i) => { if (h && raw[h] === undefined) raw[h] = cellStr(r[i]); });
    learners.push({
      raw,
      firstName: get('first name'),
      lastName: get('last name'),
      email: normEmail(get('email')),
      sourceFile: filename,
    });
  }

  return { sourceFile: filename, courseName, centerName, sessionDate, learners, filteredOut, unmappedColumns };
}
