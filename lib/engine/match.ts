import { normEmail, normName, fullnameKey, normalizeCounty } from './normalize';
import { resolveCompany } from './company';
import customers from '@/config/customers.json';
import type { GoRecord, Learner, ClassifiedLearner, TrainingEvent, SessionDecisions } from './types';

const REQUIRED_GO_HEADERS = ['Email', 'FirstName', 'LastName', 'Business', 'Primary Advisor Email', 'Center'];

/** Parse the GO export CSV text into records. Throws if required headers missing. */
export function parseGoExport(csvText: string): GoRecord[] {
  const rows = parseCsv(csvText.replace(/^\uFEFF/, ''));
  if (!rows.length) throw new Error('GO export is empty');
  const header = rows[0];
  const idx: Record<string, number> = {};
  for (const h of REQUIRED_GO_HEADERS) {
    const i = header.findIndex(c => c.trim() === h);
    if (i === -1) throw new Error(`GO export is missing required column "${h}". Found: ${header.join(', ')}`);
    idx[h] = i;
  }
  return rows.slice(1).filter(r => r.some(c => c.trim())).map(r => ({
    email: normEmail(r[idx['Email']] || ''),
    firstName: (r[idx['FirstName']] || '').trim(),
    lastName: (r[idx['LastName']] || '').trim(),
    business: (r[idx['Business']] || '').trim(),
    advisorEmail: (r[idx['Primary Advisor Email']] || '').trim(),
    center: (r[idx['Center']] || '').trim(),
  }));
}

/** RFC-4180-ish CSV parser (quotes, embedded commas/newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cur = ''; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i+1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i+1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

interface Lookups {
  byEmail: Map<string, GoRecord[]>;
  byName: Map<string, GoRecord[]>;
}
export function buildLookups(records: GoRecord[]): Lookups {
  const byEmail = new Map<string, GoRecord[]>(), byName = new Map<string, GoRecord[]>();
  for (const r of records) {
    if (r.email) push(byEmail, r.email, r);
    const fk = fullnameKey(r.firstName, r.lastName);
    if (fk.trim()) push(byName, fk, r);
  }
  return { byEmail, byName };
}
const push = (m: Map<string, GoRecord[]>, k: string, v: GoRecord) => m.set(k, [...(m.get(k) || []), v]);

function advisorForNewClient(rawCounty: string, fileCenter: string): string {
  const centers = (customers as any).centers as Record<string, any>;
  const probe = (rawCounty || '').trim().toLowerCase();
  if (probe) {
    for (const cfg of Object.values(centers)) {
      if ((cfg.territory as string[]).includes(probe)) return cfg.advisorEmail;
    }
  }
  return centers[fileCenter]?.advisorEmail || Object.values(centers)[0].advisorEmail;
}

/** Classify every unique learner across all trainings (dedupe by email; fullname if no email). */
export function classifyLearners(
  trainings: TrainingEvent[],
  go: GoRecord[],
  decisions: SessionDecisions = { ambiguous: {}, companyCorrections: {} },
): ClassifiedLearner[] {
  const { byEmail, byName } = buildLookups(go);
  const centers = (customers as any).centers as Record<string, any>;

  // unique learners keyed by email (or name key)
  const uniq = new Map<string, { learner: Learner; titles: Set<string>; fileCenter: string }>();
  for (const t of trainings) {
    for (const l of t.learners) {
      const key = l.email || fullnameKey(l.firstName, l.lastName);
      if (!uniq.has(key)) uniq.set(key, { learner: l, titles: new Set(), fileCenter: t.centerName });
      uniq.get(key)!.titles.add(t.courseName);
    }
  }

  const out: ClassifiedLearner[] = [];
  for (const { learner: l, titles, fileCenter } of uniq.values()) {
    let candidates = l.email ? (byEmail.get(l.email) || []) : [];
    let matchType: 'email' | 'fullname' | 'new' = candidates.length ? 'email' : 'new';
    if (!candidates.length) {
      const nameHits = byName.get(fullnameKey(l.firstName, l.lastName)) || [];
      if (nameHits.length) { candidates = nameHits; matchType = 'fullname'; }
    }

    let goRecord: GoRecord | undefined;
    let ambiguousCandidates: GoRecord[] | undefined;
    if (candidates.length === 1) goRecord = candidates[0];
    else if (candidates.length > 1) {
      const pick = decisions.ambiguous[l.email || fullnameKey(l.firstName, l.lastName)];
      if (pick === -1) { matchType = 'new'; }
      else if (pick !== undefined && candidates[pick]) goRecord = candidates[pick];
      else ambiguousCandidates = candidates;
    }
    if (matchType !== 'new' && !goRecord && !ambiguousCandidates) matchType = 'new';

    const lmsCompany = l.raw['Company Name'] ?? l.raw['company name'] ?? l.raw['Legal entity of your business'] ?? '';
    const isExisting = !!goRecord;
    let { company, usedNameFallback, lmsOverwrotePlaceholder } = resolveCompany({
      isExisting, goBusiness: goRecord?.business || '', lmsCompany, first: l.firstName, last: l.lastName,
    });
    const corrKey = l.email || fullnameKey(l.firstName, l.lastName);
    if (decisions.companyCorrections[corrKey]) {
      company = decisions.companyCorrections[corrKey];
      usedNameFallback = false;
    }

    const rawCounty = l.raw['County'] ?? '';
    const resolvedCenter = isExisting && goRecord!.center ? goRecord!.center : fileCenter;
    const resolvedAdvisor = isExisting && goRecord!.advisorEmail
      ? goRecord!.advisorEmail
      : advisorForNewClient(rawCounty, fileCenter);

    out.push({
      ...l,
      matchType: goRecord ? matchType : (ambiguousCandidates ? matchType : 'new'),
      goRecord, ambiguousCandidates,
      resolvedCompany: company, usedNameFallback, lmsOverwrotePlaceholder,
      resolvedCenter, resolvedAdvisor,
      trainingTitles: [...titles],
      county: normalizeCounty(rawCounty),
    });
  }
  return out;
}
