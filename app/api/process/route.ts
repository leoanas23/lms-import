import { NextResponse } from 'next/server';
import { runAnalysis, buildCompanyVerify } from '@/lib/engine/pipeline';
import { saveJson, saveText, loadText, loadJson } from '@/lib/store';
import { flagCompanies } from '@/lib/claude';
import type { SessionDecisions, SessionResult } from '@/lib/engine/types';

export const maxDuration = 60;

/** POST multipart: raw[] xlsx files (+ optional goExport csv). Runs analysis, stores session. */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const rawFiles: { name: string; buf: Buffer }[] = [];
    for (const f of form.getAll('raw')) {
      if (f instanceof File) rawFiles.push({ name: f.name, buf: Buffer.from(await f.arrayBuffer()) });
    }
    if (!rawFiles.length) return NextResponse.json({ error: 'No raw TalentLMS files uploaded.' }, { status: 400 });

    // GO export: fresh upload replaces the cache; otherwise use cached
    const goFile = form.get('goExport');
    let goText: string | null, goInfo: { filename: string; modified: string };
    if (goFile instanceof File && goFile.size > 0) {
      goText = Buffer.from(await goFile.arrayBuffer()).toString('utf8');
      goInfo = { filename: goFile.name, modified: new Date().toISOString() };
      await saveText('go-export/latest.csv', goText);
      await saveJson('go-export/meta.json', goInfo);
    } else {
      goText = await loadText('go-export/latest.csv');
      goInfo = (await loadJson<{ filename: string; modified: string }>('go-export/meta.json'))
        || { filename: 'unknown', modified: new Date(0).toISOString() };
      if (!goText) return NextResponse.json({ error: 'No GO client export available. Upload one with this session.' }, { status: 400 });
    }

    const decisions = JSON.parse(String(form.get('decisions') || '{"ambiguous":{},"companyCorrections":{}}')) as SessionDecisions;
    const session = runAnalysis(rawFiles, goText, goInfo, decisions);
    const verify = buildCompanyVerify(session.classified.filter(c => !c.ambiguousCandidates));

    // AI assist (optional): flag suspicious companies
    const aiFlags = await flagCompanies(verify.filter(v => !v.flag).map(v =>
      ({ email: v.email, company: v.companyInImport, person: `${v.firstName} ${v.lastName}` })));
    for (const v of verify) if (!v.flag && aiFlags[v.email]) v.flag = aiFlags[v.email];

    await saveJson(`sessions/${session.id}.json`, session);
    // raw files stored for the finalize/archive step
    for (const f of rawFiles) await saveText(`sessions/${session.id}/raw/${f.name}`, f.buf.toString('base64'));

    return NextResponse.json({ session: publicView(session), verify });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Processing failed' }, { status: 500 });
  }
}

function publicView(s: SessionResult) {
  return {
    id: s.id, customerShort: s.customerShort, eventCode: s.eventCode,
    goExportInfo: s.goExportInfo, summary: s.summary,
    trainings: s.trainings.map(t => ({
      sourceFile: t.sourceFile, courseName: t.courseName, centerName: t.centerName,
      sessionDate: t.sessionDate, learnerCount: t.learners.length,
      filteredOut: t.filteredOut, unmappedColumns: t.unmappedColumns,
    })),
    ambiguous: s.classified.filter(c => c.ambiguousCandidates).map(c => ({
      key: c.email || `${c.firstName} ${c.lastName}`.toLowerCase(),
      firstName: c.firstName, lastName: c.lastName, email: c.email,
      candidates: c.ambiguousCandidates,
    })),
  };
}
