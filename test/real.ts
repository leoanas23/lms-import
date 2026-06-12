// Run the full engine against real local files (no server needed).
// Usage: npx tsx test/real.ts <go-export.csv> <raw1.xlsx> [raw2.xlsx ...]
import { readFileSync } from 'fs';
import { basename } from 'path';
import { runAnalysis, generateOutputs, buildCompanyVerify } from '../lib/engine/pipeline';

const [goPath, ...rawPaths] = process.argv.slice(2);
const rawFiles = rawPaths.map(p => ({ name: basename(p), buf: readFileSync(p) }));
const goText = readFileSync(goPath, 'utf8');

const session = runAnalysis(rawFiles, goText, { filename: basename(goPath), modified: new Date().toISOString() });

console.log(`GO export: ${session.goExportInfo.rowCount} records`);
console.log(`customerShort=${session.customerShort} eventCode=${session.eventCode}\n`);
for (const t of session.trainings) {
  console.log(`${t.sessionDate}  [${t.centerName}]  completed=${t.learners.length} filtered=${t.filteredOut}  ${t.courseName}`);
  if (t.unmappedColumns.length) console.log(`   unmapped: ${t.unmappedColumns.join(' | ')}`);
}
console.log('\nsummary:', JSON.stringify(session.summary));

const ambiguous = session.classified.filter(c => c.ambiguousCandidates);
for (const a of ambiguous) {
  console.log(`AMBIGUOUS: ${a.firstName} ${a.lastName} (${a.email}) -> ${a.ambiguousCandidates!.length} GO candidates`);
}

const verify = buildCompanyVerify(session.classified.filter(c => !c.ambiguousCandidates));
console.log('\ncompany verify (flagged rows only):');
for (const v of verify.filter(v => v.flag)) {
  console.log(`  ${v.firstName} ${v.lastName}: LMS="${v.lmsCompanyField}" -> import="${v.companyInImport}"  [${v.flag}]`);
}

const out = generateOutputs(session);
const tcsv = out.files[2].csv.split('\n');
const tcols = tcsv[0].split(',');
const ti = tcols.indexOf('Training title');
console.log('\ntraining titles:');
for (const line of tcsv.slice(1).filter(l => l.trim())) {
  console.log('  ' + (line.match(/("([^"]|"")*"|[^,])*/g) || [])[ti * 2]); // crude but fine for eyeballing
}
console.log('\noutputs:');
for (const f of out.files) console.log(`  ${f.name}  (${f.rows} data rows)`);
console.log('stats:', JSON.stringify(out.stats));
console.log(out.validation.length ? `VALIDATION FAILURES:\n  ${out.validation.join('\n  ')}` : 'validation: ALL PASS');
