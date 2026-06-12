import counties from '@/config/counties-md.json';

const STATE_MAP: Record<string, string> = {
  alabama:'AL',alaska:'AK',arizona:'AZ',arkansas:'AR',california:'CA',colorado:'CO',connecticut:'CT',
  delaware:'DE',florida:'FL',georgia:'GA',hawaii:'HI',idaho:'ID',illinois:'IL',indiana:'IN',iowa:'IA',
  kansas:'KS',kentucky:'KY',louisiana:'LA',maine:'ME',maryland:'MD',massachusetts:'MA',michigan:'MI',
  minnesota:'MN',mississippi:'MS',missouri:'MO',montana:'MT',nebraska:'NE',nevada:'NV',
  'new hampshire':'NH','new jersey':'NJ','new mexico':'NM','new york':'NY','north carolina':'NC',
  'north dakota':'ND',ohio:'OH',oklahoma:'OK',oregon:'OR',pennsylvania:'PA','rhode island':'RI',
  'south carolina':'SC','south dakota':'SD',tennessee:'TN',texas:'TX',utah:'UT',vermont:'VT',
  virginia:'VA',washington:'WA','west virginia':'WV',wisconsin:'WI',wyoming:'WY',
  'district of columbia':'DC','washington dc':'DC','washington d.c.':'DC',
};

export function normalizeState(v: string): string {
  const s = (v || '').trim();
  if (!s) return '';
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  return STATE_MAP[s.toLowerCase()] || s;
}

/** Any date input -> MM-DD-YYYY (hyphens). Returns '' when unparseable. */
export function normalizeDate(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date && !isNaN(v.getTime())) return fmt(v);
  if (typeof v === 'number') { // Excel serial
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? '' : fmtUTC(d);
  }
  const s = String(v).trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);                 // YYYY-MM-DD
  if (m) return `${p(m[2])}-${p(m[3])}-${m[1]}`;
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);           // MM/DD/YYYY or MM-DD-YYYY
  if (m) return `${p(m[1])}-${p(m[2])}-${m[3]}`;
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);          // MM/DD/YY
  if (m) return `${p(m[1])}-${p(m[2])}-20${m[3]}`;
  const d = new Date(s);                                            // "May 5, 2026" etc.
  return isNaN(d.getTime()) ? '' : fmt(d);
}
const p = (x: string) => x.padStart(2, '0');
const fmt = (d: Date) => `${p(String(d.getMonth()+1))}-${p(String(d.getDate()))}-${d.getFullYear()}`;
const fmtUTC = (d: Date) => `${p(String(d.getUTCMonth()+1))}-${p(String(d.getUTCDate()))}-${d.getUTCFullYear()}`;

/** ZIP -> { postal (5, zero-padded, apostrophe-prefixed), plus4 } */
export function normalizeZip(v: unknown): { postal: string; plus4: string } {
  let s = String(v ?? '').trim();
  if (!s) return { postal: '', plus4: '' };
  s = s.replace(/\.0+$/, '');                  // float reads "20705.0"
  const m = s.match(/^(\d{1,5})-(\d{4})$/);
  if (m) return { postal: `'${m[1].padStart(5,'0')}`, plus4: m[2] };
  if (/^\d+$/.test(s)) return { postal: `'${s.padStart(5,'0').slice(0,5)}`, plus4: s.length === 9 ? s.slice(5) : '' };
  return { postal: `'${s}`, plus4: '' };
}

const COUNTY_VARIANTS: Record<string, string> = {
  'pg': 'Prince George', "prince george's": 'Prince George', 'prince georges': 'Prince George',
  "st. mary's": 'St. Mary', "st mary's": 'St. Mary', 'st marys': 'St. Mary', 'saint mary': 'St. Mary',
  "queen anne's": 'Queen Anne', 'queen annes': 'Queen Anne',
};
const NON_COUNTY = new Set(['maryland','virginia','md','va','dc','us','usa','united states','district of columbia']);

/** County -> canonical MD county name or '' (blank is safer than guessing). */
export function normalizeCounty(v: string): string {
  let s = (v || '').trim();
  if (!s) return '';
  const lower = s.toLowerCase().replace(/\s+county$/i, '').trim();
  if (NON_COUNTY.has(lower)) return '';
  if (COUNTY_VARIANTS[lower]) return COUNTY_VARIANTS[lower];
  const hit = (counties as string[]).find(c => c.toLowerCase() === lower);
  return hit || '';
}

export function normEmail(v: string): string { return (v || '').trim().toLowerCase(); }

export function normName(v: string): string {
  return (v || '').normalize('NFKC').trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
}
export function fullnameKey(first: string, last: string): string {
  return `${normName(first)} ${normName(last)}`;
}
