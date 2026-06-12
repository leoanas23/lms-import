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

/** Parse one raw TalentLMS per-course xlsx. */
export function parseRawFile(buf: Buffer | Uint8Array, filename: string): TrainingEvent {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });

  // --- Overview sheet: course name, center (Category), session date ---
  const ovName = wb.SheetNames.find(n => n.toLowerCase() === 'overview');
  if (!ovName) throw new Error(`${filename}: no Overview sheet found`);
  const ov: (string | number | Date)[][] = XLSX.utils.sheet_to_json(wb.Sheets[ovName], { header: 1, defval: '' });
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
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(wb.Sheets[usName], { defval: '' });

  const headers = rows.length ? Object.keys(rows[0]) : [];
  const unmappedColumns = headers.filter(h => !KNOWN_USERS_COLUMNS.has(h.trim().toLowerCase()));

  const learners: Learner[] = [];
  let filteredOut = 0;
  for (const r of rows) {
    const statusKey = headers.find(h => h.trim().toLowerCase() === 'status');
    const status = String(statusKey ? r[statusKey] : '').trim().toLowerCase();
    if (status !== 'completed') { filteredOut++; continue; }
    const get = (name: string) => {
      const k = headers.find(h => h.trim().toLowerCase() === name);
      return k ? String(r[k] ?? '').trim() : '';
    };
    const raw: Record<string, string> = {};
    for (const h of headers) {
      const v = r[h];
      raw[h.trim()] = v instanceof Date ? normalizeDate(v) : String(v ?? '').trim();
    }
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
