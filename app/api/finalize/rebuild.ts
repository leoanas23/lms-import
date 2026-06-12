import { classifyLearners } from '@/lib/engine/match';
import { loadText } from '@/lib/store';
import { parseGoExport } from '@/lib/engine/match';
import type { SessionResult, SessionDecisions } from '@/lib/engine/types';

/** Re-classify the stored trainings with user decisions applied (GO csv comes from cache). */
export async function runAnalysisFromStored(stored: SessionResult, decisions: SessionDecisions): Promise<SessionResult> {
  const goText = await loadText('go-export/latest.csv');
  if (!goText) throw new Error('GO export cache missing');
  const go = parseGoExport(goText);
  const classified = classifyLearners(stored.trainings, go, decisions);
  const existing = classified.filter(c => c.goRecord);
  return {
    ...stored,
    classified,
    summary: {
      ...stored.summary,
      newCount: classified.filter(c => c.matchType === 'new' && !c.ambiguousCandidates).length,
      existingCount: existing.length,
      emailMatches: existing.filter(c => c.matchType === 'email').length,
      fullnameMatches: existing.filter(c => c.matchType === 'fullname').length,
      ambiguousCount: classified.filter(c => c.ambiguousCandidates).length,
    },
  };
}
