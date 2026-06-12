export interface Learner {
  raw: Record<string, string>;     // original Users-sheet row (header -> value)
  firstName: string;
  lastName: string;
  email: string;                   // normalized lowercase
  sourceFile: string;              // which raw file this learner came from
}

export interface TrainingEvent {
  sourceFile: string;
  courseName: string;              // raw course name from Overview
  centerName: string;              // expanded center name
  sessionDate: string;             // MM-DD-YYYY
  learners: Learner[];             // Completed only
  filteredOut: number;             // non-Completed rows dropped
  unmappedColumns: string[];       // Users-sheet headers not in mapping
}

export interface GoRecord {
  email: string; firstName: string; lastName: string;
  business: string; advisorEmail: string; center: string;
}

export type MatchType = 'email' | 'fullname' | 'new';

export interface ClassifiedLearner extends Learner {
  matchType: MatchType;
  goRecord?: GoRecord;
  ambiguousCandidates?: GoRecord[]; // >1 GO records share the key; user must pick
  resolvedCompany: string;
  usedNameFallback: boolean;
  lmsOverwrotePlaceholder: boolean;
  resolvedCenter: string;
  resolvedAdvisor: string;
  trainingTitles: string[];        // titles (final form) of trainings attended this session
  county: string;                  // normalized county or ''
}

export interface CompanyVerifyRow {
  row: number; firstName: string; lastName: string; email: string;
  lmsCompanyField: string; companyInImport: string; usedNameFallback: boolean;
  flag: string;                    // AI or rule-based note, '' if none
}

export interface SessionDecisions {
  // email -> chosen GO record index in ambiguousCandidates, or -1 for "treat as new"
  ambiguous: Record<string, number>;
  // email -> corrected company name (from company-verify review)
  companyCorrections: Record<string, string>;
}

export interface SessionResult {
  id: string;
  createdAt: string;
  customerShort: string;
  eventCode: string;
  trainings: TrainingEvent[];
  classified: ClassifiedLearner[];
  goExportInfo: { filename: string; modified: string; rowCount: number; ageDays: number };
  summary: {
    totalCompleted: number; totalFiltered: number;
    newCount: number; existingCount: number;
    emailMatches: number; fullnameMatches: number; ambiguousCount: number;
  };
}
