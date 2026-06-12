/** Company name + legal entity logic (import-process-steps.md, June 2026 rules). */

export function isNamePlaceholder(company: string, first: string, last: string): boolean {
  if (!company) return true;
  const c = company.trim().toLowerCase();
  if (c === `${first} ${last}`.trim().toLowerCase()) return true;
  if (c === `${last}, ${first}`.trim().toLowerCase()) return true;
  // GO sometimes stores the center name when no business exists
  if (c === "maryland women's business center" || c === 'bowie state university wbc') return true;
  return false;
}

export function isRealLmsCompany(v: string): boolean {
  const s = (v || '').trim();
  return !!s && s !== '-' && s.toLowerCase() !== 'llc' && s.toLowerCase() !== 'n/a';
}

export function resolveCompany(opts: {
  isExisting: boolean; goBusiness: string; lmsCompany: string; first: string; last: string;
}): { company: string; usedNameFallback: boolean; lmsOverwrotePlaceholder: boolean } {
  const { isExisting, goBusiness, lmsCompany, first, last } = opts;
  const fallback = `${first} ${last}`.trim();
  const lmsReal = isRealLmsCompany(lmsCompany);

  if (isExisting) {
    if (!isNamePlaceholder(goBusiness, first, last)) {
      return { company: goBusiness.trim(), usedNameFallback: false, lmsOverwrotePlaceholder: false };
    }
    if (lmsReal) return { company: lmsCompany.trim(), usedNameFallback: false, lmsOverwrotePlaceholder: true };
    return { company: fallback, usedNameFallback: true, lmsOverwrotePlaceholder: false };
  }
  if (lmsReal) return { company: lmsCompany.trim(), usedNameFallback: false, lmsOverwrotePlaceholder: false };
  return { company: fallback, usedNameFallback: true, lmsOverwrotePlaceholder: false };
}

/** "LLC" | "Corporation" | "Other" (Other pairs with 641 Legal entity (Other) = Undetermined). */
export function deriveLegalEntity(company: string): { legal: string; legalOther: string } {
  const c = (company || '').toLowerCase();
  if (/\bl\.?l\.?c\.?\b/.test(c)) return { legal: 'LLC', legalOther: '' };
  if (/\binc\.?\b|\bcorp\.?\b|corporation/.test(c)) return { legal: 'Corporation', legalOther: '' };
  return { legal: 'Other', legalOther: 'Undetermined' };
}
