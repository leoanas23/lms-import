import { NextResponse } from 'next/server';
import { loadJson, loadText, saveText } from '@/lib/store';
import { driveConfigured, uploadCsvAsSheet, uploadFile } from '@/lib/drive';
import { draftSessionLog } from '@/lib/claude';

export const maxDuration = 60;

/** POST { sessionId, files:[{name,csv}] } -> Drive archival + session log. Best-effort. */
export async function POST(req: Request) {
  const { sessionId, files, report } = await req.json();
  const final = await loadJson<any>(`sessions/${sessionId}.final.json`);
  if (!final) return NextResponse.json({ error: 'Session not finalized' }, { status: 404 });

  const log = await draftSessionLog(JSON.stringify({
    date: new Date().toISOString().slice(0, 10),
    customer: final.session.customerShort,
    sources: final.session.trainings.map((t: any) => t.sourceFile),
    summary: final.session.summary,
    trainings: final.session.trainings.map((t: any) => ({ course: t.courseName, date: t.sessionDate, participants: t.learners?.length })),
    stats: final.stats,
  }, null, 2));
  await saveText(`sessions/${sessionId}/session-log.md`, log);

  if (!driveConfigured()) {
    return NextResponse.json({ drive: false, log, note: 'Drive not configured — outputs available as downloads only.' });
  }
  const out = process.env.DRIVE_FOLDER_OUTPUT || '';
  const arch = process.env.DRIVE_FOLDER_ARCHIVE || '';
  const logs = process.env.DRIVE_FOLDER_LOGS || '';
  const results: Record<string, string | null> = {};
  for (const f of files || []) results[f.name] = await uploadCsvAsSheet(f.name, f.csv, out);
  if (report?.html && out) results[report.name] = await uploadFile(report.name, Buffer.from(report.html), 'text/html', out);
  for (const t of final.session.trainings) {
    const b64 = await loadText(`sessions/${sessionId}/raw/${t.sourceFile}`);
    if (b64 && arch) results[`archive:${t.sourceFile}`] =
      await uploadFile(t.sourceFile, Buffer.from(b64, 'base64'),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', arch);
  }
  if (logs) results['session-log'] = await uploadFile(
    `${new Date().toISOString().slice(0,10)}_${final.session.customerShort}_client-data_TalentLMS-raw.md`,
    Buffer.from(log), 'text/markdown', logs);
  return NextResponse.json({ drive: true, results, log });
}
