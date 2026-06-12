import trainingsColumns from '@/config/trainings-columns.json';
import participantsColumns from '@/config/participants-columns.json';
import defaults from '@/config/trainings-defaults.json';
import customers from '@/config/customers.json';
import { uuidv7 } from './uuidv7';
import type { TrainingEvent, ClassifiedLearner } from './types';

const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
// "MAY 5 | ", "MAY 5 ", "SEPT. 12 - " … — month-word + day prefix, separator optional
// (real TalentLMS course names carry the date prefix without a pipe).
const PREFIX_RE = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*[|:\-]?\s*/;

/** Title = "MMM D | Course Name" — prefix DERIVED from start date (spec §3). */
export function buildTitle(courseName: string, startDate: string): string {
  const pm = courseName.match(PREFIX_RE);
  const stripped = (pm && MONTHS.includes(pm[1].slice(0, 3).toUpperCase())
    ? courseName.slice(pm[0].length) : courseName).trim();
  const m = startDate.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return stripped;
  const month = MONTHS[parseInt(m[1], 10) - 1];
  const day = parseInt(m[2], 10);
  return `${month} ${day} | ${stripped}`;
}

export interface BuiltTraining {
  uid: string; title: string; center: string; date: string; sourceFile: string;
}

/** One trainings row per raw file. Returns rows (51 cols) + metadata for linking. */
export function buildTrainingsFile(trainings: TrainingEvent[]): { rows: string[][]; meta: BuiltTraining[] } {
  const centers = (customers as any).centers as Record<string, any>;
  const cols = trainingsColumns as string[];
  const fb = (defaults as any).fallbacks as Record<string, string>;
  const ov = (defaults as any).overrides as Record<string, string>;

  const rows: string[][] = []; const meta: BuiltTraining[] = [];
  for (const t of trainings) {
    const uid = uuidv7();
    const title = buildTitle(t.courseName, t.sessionDate);
    const center = centers[t.centerName] || Object.values(centers)[0];
    const v: Record<string, string> = {
      'UID': uid,
      'Center name': t.centerName,
      'Training title': title,
      'Advisor Email': center?.advisorEmail || '',
      'Training Start Date': t.sessionDate,
      'City': center?.city || '',
      'State': center?.state || '',
      'Zip Code': center?.zip || '',
    };
    for (const [k, val] of Object.entries(fb)) if (!v[k]) v[k] = val;
    for (const [k, val] of Object.entries(ov)) v[k] = val;          // forced, always
    rows.push(cols.map(c => v[c.trim()] ?? v[c] ?? ''));
    meta.push({ uid, title, center: t.centerName, date: t.sessionDate, sourceFile: t.sourceFile });
  }
  return { rows, meta };
}

/** Participants: one row per Completed learner per training; dedupe within a training. */
export function buildParticipantsFile(
  trainings: TrainingEvent[], meta: BuiltTraining[], classified: ClassifiedLearner[],
): { rows: string[][]; droppedDupes: number; orphans: string[] } {
  const cols = participantsColumns as string[];
  const byKey = new Map<string, ClassifiedLearner>();
  for (const c of classified) byKey.set(c.email || `${c.firstName} ${c.lastName}`.toLowerCase(), c);

  const rows: string[][] = []; const seen = new Set<string>(); const orphans: string[] = [];
  let droppedDupes = 0;
  for (const t of trainings) {
    const m = meta.find(x => x.sourceFile === t.sourceFile);
    if (!m) continue;
    for (const l of t.learners) {
      const ck = l.email || `${l.firstName} ${l.lastName}`.toLowerCase();
      const c = byKey.get(ck);
      if (!c) { orphans.push(`${l.firstName} ${l.lastName} (${l.email})`); continue; }
      const dedupeKey = `${m.uid}|${c.resolvedCenter}|${c.resolvedCompany}`.toLowerCase();
      if (seen.has(dedupeKey)) { droppedDupes++; continue; }
      seen.add(dedupeKey);
      const v: Record<string, string> = {
        'UID': uuidv7(),
        'Training UID': m.uid,
        'Center name': c.resolvedCenter,       // from finalised CLIENT record, not the event's center
        'Training title': m.title,
        'Client company': c.resolvedCompany,   // byte-identical to client import output
      };
      rows.push(cols.map(col => (col ? (v[col] ?? '') : '')));
    }
  }
  return { rows, droppedDupes, orphans };
}
