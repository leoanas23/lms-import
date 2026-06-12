// Optional AI-assist calls. Every function degrades gracefully when no API key is set.
const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-20250514';

async function ask(prompt: string, maxTokens = 1024): Promise<string | null> {
  if (!KEY) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n') || null;
  } catch { return null; }
}

/** Suggest template-field mappings for unrecognized source columns. Returns {} when AI unavailable. */
export async function suggestMappings(unmapped: string[], templateFields: string[]): Promise<Record<string, string>> {
  if (!unmapped.length) return {};
  const txt = await ask(
    `You map spreadsheet columns for a CRM import. Unrecognized source columns: ${JSON.stringify(unmapped)}. ` +
    `Available template fields: ${JSON.stringify(templateFields)}. ` +
    `Respond ONLY with a JSON object mapping each source column to the best template field, or to "" if none fits. No prose, no markdown.`);
  if (!txt) return {};
  try { return JSON.parse(txt.replace(/```json|```/g, '').trim()); } catch { return {}; }
}

/** Flag suspicious company names (placeholders, person-names, odd entries). Returns {} when AI unavailable. */
export async function flagCompanies(rows: { email: string; company: string; person: string }[]): Promise<Record<string, string>> {
  if (!rows.length) return {};
  const txt = await ask(
    `Review these company names from a business-center CRM import. For each, decide whether the "company" looks like ` +
    `a real business name or a placeholder (person's own name, blank-ish, entity-type only like "LLC", or implausible). ` +
    `Data: ${JSON.stringify(rows.slice(0, 80))}. ` +
    `Respond ONLY with a JSON object keyed by email; value = short flag string for suspicious entries only (omit fine ones). No prose.`, 2000);
  if (!txt) return {};
  try { return JSON.parse(txt.replace(/```json|```/g, '').trim()); } catch { return {}; }
}

/** Draft the session-log narrative. Falls back to a deterministic summary when AI unavailable. */
export async function draftSessionLog(summaryJson: string): Promise<string> {
  const txt = await ask(
    `Write a concise markdown session log for a GrowthWheel Online data import, based on this JSON summary. ` +
    `Sections: Date/Customer/Source files; New vs existing split (email vs fullname counts); Trainings generated ` +
    `(titles, dates, participant counts); Transformations; Issues/decisions. Plain factual tone, no preamble.\n${summaryJson}`, 1500);
  return txt || `# Import Session Log\n\n\`\`\`json\n${summaryJson}\n\`\`\`\n`;
}
