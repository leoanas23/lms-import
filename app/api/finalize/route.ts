import { NextResponse } from 'next/server';
import { generateOutputs } from '@/lib/engine/pipeline';
import { loadJson, saveJson } from '@/lib/store';
import type { SessionResult, SessionDecisions } from '@/lib/engine/types';
import { runAnalysisFromStored } from './rebuild';

export const maxDuration = 60;

/** POST { sessionId, decisions } -> regenerates with decisions applied, returns the four files. */
export async function POST(req: Request) {
  try {
    const { sessionId, decisions } = await req.json() as { sessionId: string; decisions: SessionDecisions };
    const stored = await loadJson<SessionResult>(`sessions/${sessionId}.json`);
    if (!stored) return NextResponse.json({ error: 'Session not found (it may have expired).' }, { status: 404 });

    const session = await runAnalysisFromStored(stored, decisions);
    const remaining = session.classified.filter(c => c.ambiguousCandidates).length;
    if (remaining > 0) {
      return NextResponse.json({ error: `${remaining} ambiguous match(es) still unresolved.` }, { status: 400 });
    }
    const outputs = generateOutputs(session);
    await saveJson(`sessions/${sessionId}.final.json`, { session, decisions, stats: outputs.stats });
    return NextResponse.json(outputs);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Finalize failed' }, { status: 500 });
  }
}
