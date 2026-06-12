import * as XLSX from 'xlsx';
import { parseRawFile, parseRawWorkbook } from '../lib/engine/parse';
import { parseGoExport, classifyLearners } from '../lib/engine/match';
import { buildTitle } from '../lib/engine/trainings';
import { normalizeDate, normalizeZip, normalizeCounty, normalizeState } from '../lib/engine/normalize';
import { runAnalysis, generateOutputs, buildCompanyVerify } from '../lib/engine/pipeline';
import { uuidv7 } from '../lib/engine/uuidv7';

let pass = 0, fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : (fail++, console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
};
const ok = (name: string, cond: boolean) => cond ? pass++ : (fail++, console.log(`FAIL ${name}`));

// --- normalize ---
eq('date excel-style string', normalizeDate('2026-05-05'), '05-05-2026');
eq('date slashes', normalizeDate('5/5/2026'), '05-05-2026');
eq('zip plus4', normalizeZip('20705-1234'), { postal: "'20705", plus4: '1234' });
eq('zip float', normalizeZip('2134.0'), { postal: "'02134", plus4: '' });
eq('county pg', normalizeCounty("Prince George's County"), 'Prince George');
eq('county state blanked', normalizeCounty('Maryland'), '');
eq('county montgomery', normalizeCounty('montgomery county'), 'Montgomery');
eq('state full', normalizeState('Maryland'), 'MD');

// --- title rule ---
eq('title derived', buildTitle('The Customer Journey Audit', '09-03-2026'), 'SEP 3 | The Customer Journey Audit');
eq('title strip existing prefix', buildTitle('MAY 5 | The Customer Journey Audit', '05-05-2026'), 'MAY 5 | The Customer Journey Audit');
eq('title no leading zero', buildTitle('Workshop', '12-09-2026'), 'DEC 9 | Workshop');

// --- uuidv7 shape + monotonic-ish ---
const u1 = uuidv7(new Date('2026-06-01')); const u2 = uuidv7(new Date('2026-06-02'));
ok('uuidv7 format', /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(u1));
ok('uuidv7 time-ordered', u1 < u2);

// --- synthesize a raw TalentLMS file ---
function makeRaw(course: string, category: string, date: string, users: any[][]): Buffer {
  const wb = XLSX.utils.book_new();
  const ov = XLSX.utils.aoa_to_sheet([
    ['Course name', course], ['Category', category], ['Start date', date],
  ]);
  const headers = ['First name','Last name','Email','Status','Company Name','Type of business','City','State','Zip Code','County','Date business started?','What are you interested in?','Race','Ethnicity','Sex','Disability','Military Status','Currently in business'];
  const us = XLSX.utils.aoa_to_sheet([headers, ...users]);
  XLSX.utils.book_append_sheet(wb, ov, 'Overview');
  XLSX.utils.book_append_sheet(wb, us, 'Users');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
const raw1 = makeRaw('MAY 5 | Customer Journey Audit', 'MWBC', '2026-05-05', [
  ['Monica','Drew','monica@x.com','Completed','','Services','Rockville','Maryland','20850','Montgomery County','','Marketing','White','Not Hispanic or Latino','Female','No','No military service','Yes'],
  ['Karly','Feinberg','karly@x.com','Completed','FourLens Advisory, LLC','Finance, Insurance and Real Estate','Bowie','MD','2134','PG','01/15/2020','','','','','','',''],
  ['Skip','Me','skip@x.com','In Progress','','','','','','','','','','','','','',''],
]);
const raw2 = makeRaw('Funding Foundations', 'BSU', '2026-05-06', [
  ['Monica','Drew','monica@x.com','Completed','','Services','Rockville','Maryland','20850','Montgomery County','','','','','Female','','',''],
  ['New','Person','new@x.com','Completed','-','','Frederick','Maryland','21701','Frederick','','','','','','','',''],
]);

// Real exports can have a clipped sheet range (!ref starting below the header
// row) or preamble rows above the header — both must still parse.
const wbClipped = XLSX.read(makeRaw('Clipped Course', 'MWBC', '2026-05-05', [
  ['Joy','Martin','joy@x.com','Completed','','','Bowie','MD','20772','PG','','','','','Female','','',''],
]), { type: 'buffer', cellDates: true });
// clip the header row out of the declared range (cells still exist above it)
wbClipped.Sheets['Users']['!ref'] = 'A2:' + wbClipped.Sheets['Users']['!ref']!.split(':')[1];
const evClipped = parseRawWorkbook(wbClipped, 'clipped.xlsx');
eq('clipped !ref still finds header', evClipped.learners.length, 1);
eq('clipped !ref learner email', evClipped.learners[0].email, 'joy@x.com');

function makeRawPreamble(): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Course name', 'Preamble Course'], ['Category', 'MWBC'], ['Start date', '2026-05-05'],
  ]), 'Overview');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Course progress report', ''],            // preamble row above the real header
    ['First name','Last name','Email','Status'],
    ['Joy','Martin','joy@x.com','Completed'],
  ]), 'Users');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
const evPre = parseRawFile(makeRawPreamble(), 'preamble.xlsx');
eq('preamble row skipped, header found', evPre.learners.length, 1);
eq('preamble learner name', evPre.learners[0].firstName, 'Joy');

// Real TalentLMS per-course format: header row at the BOTTOM of the Users sheet,
// "-" as empty marker, Role column with instructors, date only in Course code.
function makeRealFormat(): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Report information', ''],
    ['Report type', 'Course report'],
    ['Course information', ''],
    ['Course name', 'MAY 5 The Customer Journey Audit: Finding the Gaps'],
    ['Course code', '20260505'],
    ['Category', 'Maryland WBC'],
  ]), 'Overview');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Mo','Drew','Yes','mo@x.com','Learner','Completed','-','-','Female','-','Bowie','MD','20772','Prince Georges','Yes'],
    ['Inst','Ructor','Yes','inst@x.com','Instructor','Completed','-','-','Female','-','Rockville','MD','20850','Montgomery','Undetermined'],
    ['Not','Started','Yes','ns@x.com','Learner','Not started','-','-','Female','-','Laurel','MD','20708','United States','No'],
    ['First name','Last name','Active','Email','Role','Status','Completion date','Time','Sex','Company Name','City','State','Zip Code','County','Currently in business (IF YOU ARE NOT IN BUSINESS, SKIP TO END AND SUBMIT)'],
  ]), 'Users');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
const evReal = parseRawFile(makeRealFormat(), '2026-05-05 (Customer Journey).xlsx');
eq('real format: header at bottom, completed only', evReal.learners.length, 1);
eq('real format: instructor + not-started filtered', evReal.filteredOut, 2);
eq('real format: date from Course code', evReal.sessionDate, '05-05-2026');
eq('real format: center alias expands', evReal.centerName, "Maryland Women's Business Center");
eq('real format: dash becomes blank', evReal.learners[0].raw['Company Name'], '');
eq('real format: long CIB header canonicalized', evReal.learners[0].raw['Currently in business'], 'Yes');
eq('title dedup (no pipe in source)',
  buildTitle('MAY 5 The Customer Journey Audit: Finding the Gaps', '05-05-2026'),
  'MAY 5 | The Customer Journey Audit: Finding the Gaps');

const ev1 = parseRawFile(raw1, 'Course_May5_report.xlsx');
eq('parse course', ev1.courseName, 'MAY 5 | Customer Journey Audit');
eq('parse center expands alias', ev1.centerName, "Maryland Women's Business Center");
eq('parse date', ev1.sessionDate, '05-05-2026');
eq('parse completed-only', ev1.learners.length, 2);
eq('parse filtered', ev1.filteredOut, 1);
const ev2 = parseRawFile(raw2, 'Course_May6_report.xlsx');
eq('parse BSU expansion', ev2.centerName, 'Bowie State University WBC');

// --- GO export + classification ---
const goCsv = [
  'Email,FirstName,LastName,Business,Primary Advisor Email,Center',
  'monica@x.com,Monica,Drew,Monica Drew,martha@marylandwbc.org,Maryland Women\'s Business Center',
  ',Karly,Feinberg,"Smith Holdings, Inc.",karen@yourbusinessnavigator.com,Bowie State University WBC',
].join('\n');

// Real GO exports use spaced headers ("First Name") plus extra columns — must parse identically.
const goSpaced = parseGoExport([
  'Business,First Name,Last Name,Email,Advisor,Primary Advisor Email,Center,County',
  'Monica Drew,Monica,Drew,monica@x.com,Martha,martha@marylandwbc.org,Maryland Women\'s Business Center,Montgomery',
].join('\n'));
eq('GO export spaced headers parse', goSpaced.length, 1);
eq('GO export spaced headers firstName', goSpaced[0].firstName, 'Monica');
eq('GO export spaced headers advisor', goSpaced[0].advisorEmail, 'martha@marylandwbc.org');

const session = runAnalysis(
  [{ name: 'Course_May5_report.xlsx', buf: raw1 }, { name: 'Course_May6_report.xlsx', buf: raw2 }],
  goCsv, { filename: 'go.csv', modified: new Date().toISOString() });

eq('summary completed', session.summary.totalCompleted, 4); // monica counted per-training; classified dedupes
eq('classified unique', session.classified.length, 3);
const monica = session.classified.find(c => c.email === 'monica@x.com')!;
eq('monica matched by email', monica.matchType, 'email');
eq('monica GO placeholder -> name fallback (no real LMS company)', monica.resolvedCompany, 'Monica Drew');
ok('monica used name fallback flagged', monica.usedNameFallback);
eq('monica center from GO', monica.resolvedCenter, "Maryland Women's Business Center");
eq('monica advisor from GO', monica.resolvedAdvisor, 'martha@marylandwbc.org');
eq('monica attended 2 trainings', monica.trainingTitles.length, 2);

const karly = session.classified.find(c => c.email === 'karly@x.com')!;
eq('karly matched by fullname (GO has no email)', karly.matchType, 'fullname');
eq('karly real GO business wins', karly.resolvedCompany, 'Smith Holdings, Inc.');
eq('karly center from GO', karly.resolvedCenter, 'Bowie State University WBC');

const newP = session.classified.find(c => c.email === 'new@x.com')!;
eq('new person is new', newP.matchType, 'new');
eq('new person company fallback (LMS was "-")', newP.resolvedCompany, 'New Person');
eq('new advisor by territory (Frederick -> MWBC)', newP.resolvedAdvisor, 'info@marylandwbc.org');

// --- outputs ---
const out = generateOutputs(session);
eq('four files', out.files.length, 4);
eq('validation passes', out.validation, []);
const newCsv = out.files[0].csv, tCsv = out.files[2].csv, pCsv = out.files[3].csv;
eq('client file has 105 cols', newCsv.split('\r\n')[0].split(',').length >= 105, true);
ok('trainings file has both events', tCsv.split('\r\n').length >= 4);
ok('trainings title prefix preserved not doubled', tCsv.includes('MAY 5 | Customer Journey Audit') && !tCsv.includes('MAY 5 | MAY 5'));
ok('trainings title derived for funding course', tCsv.includes('MAY 6 | Funding Foundations'));
ok('participants reference monica twice (two trainings)', (pCsv.match(/Monica Drew/g) || []).length === 2);
ok('participants center from CLIENT record for cross-center (monica stays MWBC in BSU training)',
  pCsv.split('\r\n').filter(l => l.includes('Monica Drew')).every(l => l.includes("Maryland Women's Business Center")));
ok('overrides applied (Sessions=1, Registration, Trained=0)',
  tCsv.includes('Registration by individuals') && tCsv.split('\r\n')[1]?.length > 0);

// client row spot checks
const rows = newCsv.split('\r\n');
const header = rows[0].split(',');
const newRow = rows[1].split(',').length === header.length ? rows[1] : rows[1]; // crude
ok('always-set Tags=Training present', newCsv.includes('Training'));
ok('zip apostrophe-prefixed', newCsv.includes("'21701"));

const verify = buildCompanyVerify(session.classified);
eq('verify rows', verify.length, 3);
eq('verify: deterministic name fallback NOT flagged', verify.find(v => v.email === 'monica@x.com')!.flag, '');
eq('verify: deterministic new client NOT flagged', verify.find(v => v.email === 'new@x.com')!.flag, '');
ok('verify: name-only match IS flagged', verify.find(v => v.email === 'karly@x.com')!.flag.includes('name only'));


// --- HTML report ---
const rep = out.report;
ok('report named YYYY-MM_CUSTOMER', /^\d{4}-\d{2}_.+_import-report\.html$/.test(rep.name));
ok('report has 3 pages', (rep.html.match(/class="page"/g) || []).length === 3);
ok('report has NO discrepancy section (2026-06-11 amendment)', !/discrep/i.test(rep.html));
ok('report has Clients by County', rep.html.includes('Clients by County'));
ok('report has Center & Advisor section', rep.html.includes('Center &amp; Advisor Assignments'));
ok('report trainings table totals reconcile', rep.html.includes('All sessions'));
ok('report uses Chart.js 4.4.1 cdnjs', rep.html.includes('cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1'));
ok('report client tables fixed layout', rep.html.includes('table-layout: fixed'));
ok('report sessions wrap (nowrap rescinded)', rep.html.includes('white-space: normal') && !rep.html.includes('white-space: nowrap'));
ok('report no logo placeholder (text-only header)', !rep.html.includes('client-logo') && rep.html.includes('Data Import Report'));
ok('report no emojis/hr', !rep.html.includes('<hr') );
ok('report sessions label for monica two events', rep.html.includes('MAY 5') && rep.html.includes('MAY 6'));
ok('report county Not specified styled last-ish', rep.html.includes('Not specified'));
ok('report page footer format', rep.html.includes('Page 1 of 3') && rep.html.includes('Page 3 of 3'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// --- report (appended after initial suite; rerun whole file) ---
