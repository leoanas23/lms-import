// Client-facing HTML import report.
// Spec: import-report-design.md (2026-06-11) + REFERENCE-UPDATE_2026-06-11:
//   - NO discrepancy section (session log only)
//   - fixed-layout client tables, explicit widths, Sessions wraps at commas
//   - text-only header until a customer logo is stored (never a placeholder div)
import type { SessionResult, ClassifiedLearner } from './types';
import type { BuiltTraining } from './trainings';

const C = {
  blue: '#1b4f8a', green: '#16a34a', amber: '#d97706',
  blueBg: '#e8f0fb', greenBg: '#e6f9f0', amberBg: '#fff8e1',
  alt: '#f8fafc', ink: '#1a1a2e', muted: '#6b7280', faint: '#9ca3af', page: '#f4f6f9',
};
const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const esc = (s: string) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function shortLabel(date: string): string {
  const m = date.match(/^(\d{2})-(\d{2})/);
  return m ? `${MONTHS[+m[1] - 1]} ${+m[2]}` : date;
}
function centerBadge(center: string): string {
  const bsu = /bowie/i.test(center);
  const bg = bsu ? '#f3e8ff' : '#dbeafe', fg = bsu ? '#7e22ce' : '#1e40af';
  return `<span style="display:inline-block;padding:1px 8px;border-radius:10px;font-size:10px;font-weight:700;background:${bg};color:${fg}">${bsu ? 'BSU WBC' : 'MWBC'}</span>`;
}

export function generateReport(
  session: SessionResult,
  ready: ClassifiedLearner[],
  meta: BuiltTraining[],
): { name: string; html: string } {
  const now = new Date();
  const period = meta.length
    ? new Date(`${meta[0].date.slice(6)}-${meta[0].date.slice(0, 2)}-01`).toLocaleString('en-US', { month: 'long', year: 'numeric' })
    : now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const importDate = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const customer = session.customerShort;
  const orgName = customer.includes('MWBC') || customer.includes('BSU')
    ? "Maryland Women's Business Center Network" : customer;

  // Session labels per training, disambiguating same-date events with a short title word
  const byDate = new Map<string, BuiltTraining[]>();
  for (const m of meta) byDate.set(m.date, [...(byDate.get(m.date) || []), m]);
  const labelOf = new Map<string, string>(); // sourceFile -> label
  for (const [date, ms] of byDate) {
    for (const m of ms) {
      const base = shortLabel(date);
      labelOf.set(m.sourceFile, ms.length === 1 ? base
        : `${base} (${m.title.split('|')[1]?.trim().split(/\s+/).slice(0, 1).join(' ') || '?'})`);
    }
  }
  const titleToLabel = new Map(meta.map(m => [m.title, labelOf.get(m.sourceFile) || shortLabel(m.date)]));

  const isNew = (c: ClassifiedLearner) => c.matchType === 'new';
  const newClients = ready.filter(isNew), existing = ready.filter(c => !!c.goRecord);

  // Per-training new/existing attendance counts (from training learner lists, classified status)
  const byKey = new Map(ready.map(c => [c.email || `${c.firstName} ${c.lastName}`.toLowerCase(), c]));
  const perTraining = session.trainings.map(t => {
    const m = meta.find(x => x.sourceFile === t.sourceFile)!;
    let n = 0, e = 0;
    const seen = new Set<string>();
    for (const l of t.learners) {
      const k = l.email || `${l.firstName} ${l.lastName}`.toLowerCase();
      if (seen.has(k)) continue; seen.add(k);
      const c = byKey.get(k); if (!c) continue;
      isNew(c) ? n++ : e++;
    }
    return { date: t.sessionDate, title: m?.title || t.courseName, center: t.centerName, n, e };
  });
  const attTotal = perTraining.reduce((s, t) => s + t.n + t.e, 0);

  // Center & Advisor assignments
  const caMap = new Map<string, { center: string; advisor: string; n: number; e: number }>();
  for (const c of ready) {
    const k = `${c.resolvedCenter}|${c.resolvedAdvisor}`;
    const cur = caMap.get(k) || { center: c.resolvedCenter, advisor: c.resolvedAdvisor, n: 0, e: 0 };
    isNew(c) ? cur.n++ : cur.e++;
    caMap.set(k, cur);
  }
  const caRows = [...caMap.values()].sort((a, b) =>
    a.center.localeCompare(b.center) || (b.n + b.e) - (a.n + a.e));

  // Clients by County (Not specified last)
  const countyMap = new Map<string, { n: number; e: number }>();
  for (const c of ready) {
    const k = c.county || 'Not specified';
    const cur = countyMap.get(k) || { n: 0, e: 0 };
    isNew(c) ? cur.n++ : cur.e++;
    countyMap.set(k, cur);
  }
  const countyRows = [...countyMap.entries()]
    .map(([county, v]) => ({ county, ...v, total: v.n + v.e }))
    .sort((a, b) => (a.county === 'Not specified' ? 1 : b.county === 'Not specified' ? -1 : b.total - a.total));

  const sessionsCell = (c: ClassifiedLearner) =>
    c.trainingTitles.map(t => titleToLabel.get(t) || t).sort().join(', ');
  const sortClients = (arr: ClassifiedLearner[]) => [...arr].sort((a, b) =>
    a.resolvedCenter.localeCompare(b.resolvedCenter) ||
    (a.resolvedCompany || `${a.firstName} ${a.lastName}`).toLowerCase()
      .localeCompare((b.resolvedCompany || `${b.firstName} ${b.lastName}`).toLowerCase()));

  const advisorShort = (e: string) => e.replace(/@marylandwbc\.org$/i, '@…');
  const singleAdvisorDomain = ready.every(c => /@marylandwbc\.org$/i.test(c.resolvedAdvisor));

  const header = (label: string) => `
  <div class="page-header">
    <div class="header-left">
      <div class="org">${esc(orgName)}</div>
      <div class="title">Data Import Report</div>
      <div class="subtitle">${esc(period)} training imports — clients, trainings &amp; participants</div>
    </div>
    <div class="header-right">
      <div class="plabel">${esc(label)}</div>
      <div class="meta">Import date: ${esc(importDate)}</div>
      <div class="meta">Period: ${esc(period)}</div>
      <div class="meta">Prepared by: GrowthWheel</div>
    </div>
  </div>`;
  const footer = (p: number, total: number) => `
  <div class="page-footer">
    <span>GrowthWheel Online — Data Import Report</span>
    <span>Page ${p} of ${total} · ${esc(period)} · ${esc(customer)}</span>
  </div>`;

  const clientTable = (arr: ClassifiedLearner[], withCounty: boolean) => {
    // REFERENCE-UPDATE §2: fixed layout, explicit widths (~186mm printable), Sessions wraps at commas
    const widths = withCounty
      ? ['24px', '92px', '118px', '138px', '62px', '64px', '86px', 'auto']
      : ['24px', '98px', '140px', '150px', '64px', '118px', 'auto'];
    const heads = withCounty
      ? ['#', 'Name', 'Company', 'Email', 'Center', 'Advisor', 'County', 'Sessions']
      : ['#', 'Name', 'Company', 'Email', 'Center', 'Advisor', 'Sessions'];
    const rows = sortClients(arr).map((c, i) => {
      const adv = singleAdvisorDomain ? advisorShort(c.resolvedAdvisor) : c.resolvedAdvisor;
      const cells = [
        `<td class="num">${i + 1}</td>`,
        `<td class="wrapword"><b>${esc(c.firstName)} ${esc(c.lastName)}</b></td>`,
        `<td class="wrapword">${esc(c.resolvedCompany)}</td>`,
        `<td class="breakall">${esc(c.email)}</td>`,
        `<td>${centerBadge(c.resolvedCenter)}</td>`,
        `<td class="breakall adv">${esc(adv)}</td>`,
        ...(withCounty ? [`<td>${esc(c.county || '—')}</td>`] : []),
        `<td class="sess">${esc(sessionsCell(c))}</td>`,
      ];
      return `<tr>${cells.join('')}</tr>`;
    }).join('\n');
    return `<table class="clients">
      <colgroup>${widths.map(w => `<col style="width:${w}">`).join('')}</colgroup>
      <thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody></table>`;
  };

  const donutData = JSON.stringify({ n: newClients.length, e: existing.length });
  const barData = JSON.stringify(perTraining.map(t => ({ l: shortLabel(t.date), n: t.n, e: t.e })));
  const countyChart = JSON.stringify(countyRows.slice(0, 12).map(r => ({ c: r.county, t: r.total })));
  const note = singleAdvisorDomain ? ' <span style="font-weight:400;color:#6b7280;text-transform:none;letter-spacing:0">(advisor domain: marylandwbc.org)</span>' : '';

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(customer)} Import Report — ${esc(period)}</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<style>
  * { box-sizing: border-box; margin: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: ${C.ink}; background: ${C.page}; }
  .page { width: 210mm; min-height: 297mm; margin: 16px auto; background: #fff; padding: 14mm 12mm 18mm; position: relative; page-break-after: always; }
  .page-header { display: flex; justify-content: space-between; margin-bottom: 18px; }
  .org { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: ${C.muted}; }
  .title { font-size: 22px; font-weight: 700; color: ${C.blue}; }
  .subtitle { font-size: 13px; color: ${C.muted}; }
  .header-right { text-align: right; }
  .plabel { display: inline-block; background: ${C.blue}; color: #fff; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; padding: 3px 10px; border-radius: 10px; margin-bottom: 6px; }
  .meta { font-size: 11px; color: ${C.muted}; }
  .page-footer { position: absolute; bottom: 8mm; left: 12mm; right: 12mm; display: flex; justify-content: space-between; font-size: 10px; color: ${C.faint}; }
  .section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: ${C.blue}; margin: 18px 0 8px; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .stat { border-radius: 8px; padding: 12px 14px; }
  .stat .n { font-size: 32px; font-weight: 700; } .stat .l { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: ${C.muted}; }
  .charts { display: grid; grid-template-columns: 190px 1fr; gap: 16px; margin-top: 6px; }
  .chartbox { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; }
  .chartbox h4 { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: ${C.muted}; margin-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: ${C.blue}; color: #fff; text-align: left; padding: 6px 8px; font-weight: 600; }
  td { padding: 6px 8px; border-bottom: 1px solid #eef1f5; vertical-align: top; }
  tr:nth-child(even) td { background: ${C.alt}; }
  td.r, th.r { text-align: right; } tr.totals td { font-weight: 700; background: ${C.blueBg}; }
  .clients { table-layout: fixed; }
  .clients td { font-size: 11.5px; }
  .num { color: ${C.faint}; font-size: 11px; }
  .breakall { word-break: break-all; } .wrapword { overflow-wrap: break-word; }
  .adv { font-size: 11px; color: #374151; }
  .sess { white-space: normal; font-size: 11px; color: #374151; }
  .county-grid { display: grid; grid-template-columns: 1fr 280px; gap: 16px; }
  @media print { body { background: #fff; } .page { margin: 0; } }
</style></head><body>

<div class="page">
  ${header('Summary')}
  <div class="stats">
    <div class="stat" style="background:${C.blueBg}"><div class="n">${perTraining.length}</div><div class="l">Training Sessions</div></div>
    <div class="stat" style="background:${C.blueBg}"><div class="n">${attTotal}</div><div class="l">Total Attendances</div></div>
    <div class="stat" style="background:${C.greenBg}"><div class="n" style="color:${C.green}">${newClients.length}</div><div class="l">New Clients Added</div></div>
    <div class="stat" style="background:${C.amberBg}"><div class="n" style="color:${C.amber}">${existing.length}</div><div class="l">Existing Clients</div></div>
  </div>
  <div class="charts">
    <div class="chartbox"><h4>Client Breakdown</h4><canvas id="donut" height="170"></canvas></div>
    <div class="chartbox"><h4>New vs Existing Clients per Session</h4><canvas id="bars" height="92"></canvas></div>
  </div>
  <div class="section-title">Trainings</div>
  <table>
    <thead><tr><th style="width:78px">Date</th><th>Training</th><th style="width:80px">Center</th><th class="r" style="width:46px">New</th><th class="r" style="width:60px">Existing</th><th class="r" style="width:48px">Total</th></tr></thead>
    <tbody>
      ${perTraining.map(t => `<tr><td>${esc(t.date)}</td><td>${esc(t.title)}</td><td>${centerBadge(t.center)}</td><td class="r">${t.n}</td><td class="r">${t.e}</td><td class="r"><b>${t.n + t.e}</b></td></tr>`).join('\n')}
      <tr class="totals"><td colspan="3">All sessions</td><td class="r">${perTraining.reduce((s, t) => s + t.n, 0)}</td><td class="r">${perTraining.reduce((s, t) => s + t.e, 0)}</td><td class="r">${attTotal}</td></tr>
    </tbody>
  </table>
  <div class="section-title">Center &amp; Advisor Assignments${note}</div>
  <table>
    <thead><tr><th style="width:130px">Center</th><th>Advisor Email</th><th class="r" style="width:46px">New</th><th class="r" style="width:60px">Existing</th><th class="r" style="width:48px">Total</th></tr></thead>
    <tbody>${caRows.map(r => `<tr><td>${centerBadge(r.center)}</td><td>${esc(r.advisor)}</td><td class="r">${r.n}</td><td class="r">${r.e}</td><td class="r"><b>${r.n + r.e}</b></td></tr>`).join('\n')}</tbody>
  </table>
  <div class="section-title">Clients by County</div>
  <div class="county-grid">
    <div class="chartbox"><canvas id="counties" height="${Math.max(90, countyRows.length * 26)}"></canvas></div>
    <table>
      <thead><tr><th>County</th><th class="r">New</th><th class="r">Existing</th><th class="r">Total</th></tr></thead>
      <tbody>${countyRows.map(r => `<tr><td${r.county === 'Not specified' ? ` style="color:${C.muted}"` : ''}>${esc(r.county)}</td><td class="r">${r.n}</td><td class="r">${r.e}</td><td class="r"><b>${r.total}</b></td></tr>`).join('\n')}</tbody>
    </table>
  </div>
  ${footer(1, 3)}
</div>

<div class="page">
  ${header('New Clients')}
  <div class="section-title">New clients added (${newClients.length})</div>
  ${clientTable(newClients, true)}
  ${footer(2, 3)}
</div>

<div class="page">
  ${header('Existing Clients')}
  <div class="section-title">Existing clients linked (${existing.length})</div>
  ${clientTable(existing, false)}
  ${footer(3, 3)}
</div>

<script>
const P = ${JSON.stringify({ blue: C.blue, green: C.green, faint: C.faint })};
const donut = ${donutData}, bars = ${barData}, counties = ${countyChart};
new Chart(document.getElementById('donut'), { type: 'doughnut',
  data: { labels: ['New Clients', 'Existing Clients'], datasets: [{ data: [donut.n, donut.e], backgroundColor: [P.green, P.blue], borderWidth: 0 }] },
  options: { cutout: '62%', plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } } } });
new Chart(document.getElementById('bars'), { type: 'bar',
  data: { labels: bars.map(b => b.l), datasets: [
    { label: 'New', data: bars.map(b => b.n), backgroundColor: P.green, stack: 's' },
    { label: 'Existing', data: bars.map(b => b.e), backgroundColor: P.blue, stack: 's' }] },
  options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } },
    scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { precision: 0 } } } } });
new Chart(document.getElementById('counties'), { type: 'bar',
  data: { labels: counties.map(c => c.c), datasets: [{ data: counties.map(c => c.t),
    backgroundColor: counties.map(c => c.c === 'Not specified' ? P.faint : P.blue) }] },
  options: { indexAxis: 'y', plugins: { legend: { display: false } },
    scales: { x: { ticks: { precision: 0 } }, y: { grid: { display: false } } } } });
</script>
</body></html>`;

  const ym = meta.length ? `${meta[0].date.slice(6)}-${meta[0].date.slice(0, 2)}` : now.toISOString().slice(0, 7);
  return { name: `${ym}_${customer}_import-report.html`, html };
}
