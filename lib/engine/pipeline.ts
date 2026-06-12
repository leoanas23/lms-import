import clientColumns from '@/config/client-columns.json';
import trainingsColumns from '@/config/trainings-columns.json';
import participantsColumns from '@/config/participants-columns.json';
import customers from '@/config/customers.json';
import { parseRawFile } from './parse';
import { parseGoExport, classifyLearners } from './match';
import { buildClientRow } from './clientRow';
import { buildTrainingsFile, buildParticipantsFile } from './trainings';
import { toCsv } from './csv';
import { generateReport } from './report';
import type { SessionResult, SessionDecisions, ClassifiedLearner, TrainingEvent, CompanyVerifyRow } from './types';

export function runAnalysis(
  rawFiles: { name: string; buf: Buffer | Uint8Array }[],
  goCsvText: string,
  goInfo: { filename: string; modified: string },
  decisions?: SessionDecisions,
): SessionResult {
  const trainings: TrainingEvent[] = rawFiles.map(f => parseRawFile(f.buf, f.name));
  const go = parseGoExport(goCsvText);
  const classified = classifyLearners(trainings, go, decisions);

  const newOnes = classified.filter(c => c.matchType === 'new' && !c.ambiguousCandidates);
  const existing = classified.filter(c => c.goRecord);
  const ambiguous = classified.filter(c => c.ambiguousCandidates);
  const ageDays = Math.floor((Date.now() - new Date(goInfo.modified).getTime()) / 86400000);

  const shortCodes = [...new Set(trainings.map(t =>
    ((customers as any).centers[t.centerName]?.shortCode) || 'UNK'))];
  const customerShort = shortCodes.join('+');
  const eventCode = trainings.length === 1
    ? (trainings[0].sessionDate ? monthCode(trainings[0].sessionDate) : 'EVENT')
    : `${batchMonth(trainings)}-batch`;

  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    customerShort, eventCode,
    trainings, classified,
    goExportInfo: { ...goInfo, rowCount: go.length, ageDays },
    summary: {
      totalCompleted: trainings.reduce((s, t) => s + t.learners.length, 0),
      totalFiltered: trainings.reduce((s, t) => s + t.filteredOut, 0),
      newCount: newOnes.length, existingCount: existing.length,
      emailMatches: existing.filter(c => c.matchType === 'email').length,
      fullnameMatches: existing.filter(c => c.matchType === 'fullname').length,
      ambiguousCount: ambiguous.length,
    },
  };
}
const monthCode = (d: string) => { // "MM-DD-YYYY" -> e.g. MAY5
  const M = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const m = d.match(/^(\d{2})-(\d{2})/); return m ? `${M[+m[1]-1]}${+m[2]}` : 'EVENT';
};
const batchMonth = (ts: TrainingEvent[]) => {
  const d = ts[0]?.sessionDate?.match(/^(\d{2})-\d{2}-(\d{4})/);
  return d ? `${d[2]}-${d[1]}` : 'batch';
};

/** Flag ONLY genuine uncertainty. Deterministic outcomes (company from GO,
 * real LMS company, name fallback when no company exists anywhere) are
 * auto-resolved and need no human review. */
export function buildCompanyVerify(classified: ClassifiedLearner[]): CompanyVerifyRow[] {
  return classified.map((c, i) => ({
    row: i + 1, firstName: c.firstName, lastName: c.lastName, email: c.email,
    lmsCompanyField: c.raw['Company Name'] ?? c.raw['Legal entity of your business'] ?? '',
    companyInImport: c.resolvedCompany,
    usedNameFallback: c.usedNameFallback,
    flag: c.matchType === 'fullname'
      ? `Matched to GO by name only (GO email: ${c.goRecord?.email || 'blank'}) — confirm same person`
      : c.lmsOverwrotePlaceholder
        ? 'LMS company replaces the placeholder on the existing GO record — confirm'
        : '',
  }));
}

export interface OutputFiles {
  files: { name: string; csv: string; rows: number }[];
  report: { name: string; html: string };
  validation: string[];   // failures; empty = pass
  stats: { trainings: number; participants: number; droppedDupes: number };
}

export function generateOutputs(session: SessionResult): OutputFiles {
  const date = new Date().toISOString().slice(0, 10);
  const base = `${date}_${session.customerShort}_${session.eventCode}`;
  const ready = session.classified.filter(c => !c.ambiguousCandidates);

  const newRows = ready.filter(c => c.matchType === 'new')
    .map((c, i) => buildClientRow(c, i + 1, session.trainings));
  const existRows = ready.filter(c => c.goRecord)
    .map((c, i) => buildClientRow(c, i + 1, session.trainings));

  const { rows: tRows, meta } = buildTrainingsFile(session.trainings);
  const { rows: pRows, droppedDupes, orphans } = buildParticipantsFile(session.trainings, meta, ready);

  // Pre-output validation (spec §8)
  const validation: string[] = [];
  const clientKeys = new Set(ready.map(c => `${c.resolvedCenter}|${c.resolvedCompany}`.toLowerCase()));
  const pCols = participantsColumns as string[];
  const ci = pCols.indexOf('Center name'), gi = pCols.indexOf('Client company'), ti = pCols.indexOf('Training UID');
  const tUids = new Set(meta.map(m => m.uid));
  for (const r of pRows) {
    if (!clientKeys.has(`${r[ci]}|${r[gi]}`.toLowerCase()))
      validation.push(`Participant "${r[gi]}" (${r[ci]}) has no matching client record`);
    if (!tUids.has(r[ti])) validation.push(`Participant references unknown Training UID ${r[ti]}`);
  }
  for (const m of meta) {
    const M = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const dm = m.date.match(/^(\d{2})-(\d{2})/);
    if (dm && !m.title.startsWith(`${M[+dm[1]-1]} ${+dm[2]} | `))
      validation.push(`Title "${m.title}" prefix does not parse back to ${m.date}`);
  }
  for (const o of orphans) validation.push(`Learner not in client output: ${o}`);

  const report = generateReport(session, ready, meta);

  return {
    report,
    files: [
      { name: `${base}_client-data_new_import.csv`, csv: toCsv(clientColumns as string[], newRows), rows: newRows.length },
      { name: `${base}_client-data_existing_import.csv`, csv: toCsv(clientColumns as string[], existRows), rows: existRows.length },
      { name: `${base}_trainings_import.csv`, csv: toCsv((trainingsColumns as string[]), tRows), rows: tRows.length },
      { name: `${base}_training-participants_import.csv`, csv: toCsv(pCols, pRows), rows: pRows.length },
    ],
    validation,
    stats: { trainings: tRows.length, participants: pRows.length, droppedDupes },
  };
}
