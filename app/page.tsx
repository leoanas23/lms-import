'use client';
import { useEffect, useRef, useState } from 'react';

type Step = 'upload' | 'review' | 'verify' | 'done';
const STEPS: { id: Step; label: string }[] = [
  { id: 'upload', label: '1 · Upload' },
  { id: 'review', label: '2 · Review matches' },
  { id: 'verify', label: '3 · Verify companies' },
  { id: 'done', label: '4 · Download' },
];

export default function Wizard() {
  const [step, setStep] = useState<Step>('upload');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [rawFiles, setRawFiles] = useState<File[]>([]);
  const [goFile, setGoFile] = useState<File | null>(null);
  const [goCache, setGoCache] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [verify, setVerify] = useState<any[]>([]);
  const [ambiguousPicks, setAmbiguousPicks] = useState<Record<string, number>>({});
  const [corrections, setCorrections] = useState<Record<string, string>>({});
  const [outputs, setOutputs] = useState<any>(null);
  const [archive, setArchive] = useState<any>(null);
  const rawInput = useRef<HTMLInputElement>(null);
  const goInput = useRef<HTMLInputElement>(null);

  useEffect(() => { fetch('/api/go-export').then(r => r.json()).then(setGoCache).catch(() => {}); }, []);

  // Route any dropped/selected files to the right slot: .xlsx -> raw, .csv -> GO export.
  function addFiles(files: File[]) {
    const xlsx = files.filter(f => /\.xlsx$/i.test(f.name));
    const csv = files.filter(f => /\.csv$/i.test(f.name));
    if (xlsx.length) setRawFiles(prev => [...prev, ...xlsx]);
    if (csv.length) setGoFile(csv[csv.length - 1]);
    const ignored = files.length - xlsx.length - csv.length;
    setErr(ignored > 0 ? `${ignored} file(s) ignored — only .xlsx (TalentLMS) and .csv (GO export) are accepted.` : '');
  }

  async function process() {
    setBusy(true); setErr('');
    try {
      const fd = new FormData();
      rawFiles.forEach(f => fd.append('raw', f));
      if (goFile) fd.append('goExport', goFile);
      const res = await fetch('/api/process', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSession(data.session); setVerify(data.verify);
      setStep('review');
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  async function finalize() {
    setBusy(true); setErr('');
    try {
      const decisions = { ambiguous: ambiguousPicks, companyCorrections: corrections };
      const res = await fetch('/api/finalize', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id, decisions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOutputs(data); setStep('done');
      fetch('/api/archive', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id, files: data.files, report: data.report }),
      }).then(r => r.json()).then(setArchive).catch(() => setArchive({ drive: false }));
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  const download = (name: string, csv: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = name; a.click();
  };
  const verifyTable = (rows: any[]) => (
    <table><thead><tr><th>#</th><th>Person</th><th>LMS field</th><th>Company in import</th><th>Flag</th></tr></thead>
      <tbody>{rows.map((v: any) => (
        <tr key={v.row} className="row-edit">
          <td style={{ color: 'var(--faint)' }}>{v.row}</td>
          <td><b>{v.firstName} {v.lastName}</b><br /><span className="note">{v.email}</span></td>
          <td>{v.lmsCompanyField || <i>—</i>}</td>
          <td><input type="text" defaultValue={corrections[v.email] ?? v.companyInImport}
            onBlur={e => { if (e.target.value !== v.companyInImport) setCorrections({ ...corrections, [v.email]: e.target.value }); }} /></td>
          <td className="flag">{v.flag}</td>
        </tr>
      ))}</tbody></table>
  );

  const badge = (center: string) =>
    <span className={`badge ${center.includes('Bowie') ? 'bsu' : 'mwbc'}`}>{center.includes('Bowie') ? 'BSU WBC' : 'MWBC'}</span>;
  const stepIdx = STEPS.findIndex(s => s.id === step);
  const unresolved = session?.ambiguous?.filter((a: any) => ambiguousPicks[a.key] === undefined).length ?? 0;

  return (
    <div className="shell">
      <div className="masthead">
        <h1>GO Import</h1>
        <span className="sub">TalentLMS → GrowthWheel Online</span>
      </div>
      <div className="rail">
        {STEPS.map((s, i) => (
          <div key={s.id} className={`stop ${i === stepIdx ? 'active' : i < stepIdx ? 'done' : ''}`}>{s.label}</div>
        ))}
      </div>
      {err && <div className="error">{err}</div>}
      {goCache?.storageWarning && (
        <div className="error">
          ⚠ <b>Persistent storage is not configured</b> — sessions will be lost between steps.
          In Vercel: Storage → Create → Blob → connect it to this project, then redeploy.
        </div>
      )}

      {step === 'upload' && (
        <>
          <div className="card">
            <h2>Raw TalentLMS files</h2>
            <div className="drop" onClick={() => rawInput.current?.click()}
              onDragOver={e => e.preventDefault()} onDragEnter={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); addFiles(Array.from(e.dataTransfer.files)); }}>
              Drop the per-course .xlsx exports here, or click to choose. One file per training event; multiple files become one batch.
              <input ref={rawInput} type="file" multiple accept=".xlsx"
                onChange={e => { addFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
            </div>
            {rawFiles.length > 0 && <ul className="filelist">{rawFiles.map((f, i) =>
              <li key={i}>📄 {f.name} <a style={{ color: 'var(--red)', cursor: 'pointer' }}
                onClick={() => setRawFiles(rawFiles.filter((_, j) => j !== i))}>remove</a></li>)}</ul>}
          </div>
          <div className="card"
            onDragOver={e => e.preventDefault()} onDragEnter={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); addFiles(Array.from(e.dataTransfer.files)); }}>
            <h2>GO client export</h2>
            {goCache?.cached && !goFile && (
              <p className="note" style={{ marginBottom: 10 }}>
                Using cached export <b>{goCache.filename}</b> from {new Date(goCache.modified).toLocaleDateString()} ({goCache.ageDays} days old).
                {goCache.stale && <span className="flag"> ⚠ Older than 14 days — consider uploading a fresh export.</span>}
              </p>
            )}
            {!goCache?.cached && !goFile && <p className="note" style={{ marginBottom: 10 }}>No cached export yet — upload the current "Maryland Network Clients in GO.csv".</p>}
            {goFile && <p className="note" style={{ marginBottom: 10 }}>New export selected: <b>{goFile.name}</b> (will replace the cache).</p>}
            <button className="btn ghost" onClick={() => goInput.current?.click()}>
              {goCache?.cached ? 'Replace GO export' : 'Upload GO export'}
            </button>
            <input ref={goInput} type="file" accept=".csv" style={{ display: 'none' }}
              onChange={e => setGoFile(e.target.files?.[0] || null)} />
          </div>
          <div className="actions">
            <button className="btn" disabled={busy || !rawFiles.length || (!goFile && !goCache?.cached)} onClick={process}>
              {busy ? 'Processing…' : 'Process files'}
            </button>
          </div>
        </>
      )}

      {step === 'review' && session && (
        <>
          <div className="stats">
            <div className="stat"><div className="n">{session.trainings.length}</div><div className="l">Training sessions</div></div>
            <div className="stat"><div className="n">{session.summary.totalCompleted}</div><div className="l">Completed rows</div></div>
            <div className="stat green"><div className="n">{session.summary.newCount}</div><div className="l">New clients</div></div>
            <div className="stat amber"><div className="n">{session.summary.existingCount}</div><div className="l">Existing clients</div></div>
          </div>
          <div className="card">
            <h2>Training events detected</h2>
            <table><thead><tr><th>Date</th><th>Course</th><th>Center</th><th style={{textAlign:'right'}}>Completed</th><th style={{textAlign:'right'}}>Filtered out</th></tr></thead>
              <tbody>{session.trainings.map((t: any, i: number) => (
                <tr key={i}><td>{t.sessionDate}</td><td>{t.courseName}</td><td>{badge(t.centerName)}</td>
                  <td style={{textAlign:'right'}}>{t.learnerCount}</td><td style={{textAlign:'right'}}>{t.filteredOut}</td></tr>
              ))}</tbody></table>
            <p className="note" style={{ marginTop: 10 }}>
              Matches: {session.summary.emailMatches} by email, {session.summary.fullnameMatches} by full name.
              {session.trainings.some((t: any) => t.unmappedColumns?.length > 0) &&
                <span className="flag"> Unrecognized columns found: {[...new Set(session.trainings.flatMap((t: any) => t.unmappedColumns))].join(', ')} (ignored — tell Leo if they should map).</span>}
            </p>
          </div>
          {session.ambiguous.length > 0 && (
            <div className="card">
              <h2>Ambiguous matches — pick the right GO record</h2>
              {session.ambiguous.map((a: any) => (
                <div key={a.key} style={{ marginBottom: 14 }}>
                  <b>{a.firstName} {a.lastName}</b> <span className="note">({a.email})</span>
                  <table style={{ marginTop: 6 }}><tbody>
                    {a.candidates.map((c: any, i: number) => (
                      <tr key={i}><td><input type="radio" name={a.key} checked={ambiguousPicks[a.key] === i}
                        onChange={() => setAmbiguousPicks({ ...ambiguousPicks, [a.key]: i })} /></td>
                        <td>{c.business || <i>no business</i>}</td><td>{c.email}</td><td>{badge(c.center || '')}</td><td>{c.advisorEmail}</td></tr>
                    ))}
                    <tr><td><input type="radio" name={a.key} checked={ambiguousPicks[a.key] === -1}
                      onChange={() => setAmbiguousPicks({ ...ambiguousPicks, [a.key]: -1 })} /></td>
                      <td colSpan={4}><i>None of these — treat as a new client</i></td></tr>
                  </tbody></table>
                </div>
              ))}
            </div>
          )}
          <div className="actions">
            <button className="btn ghost" onClick={() => setStep('upload')}>Back</button>
            <button className="btn" disabled={unresolved > 0} onClick={() => setStep('verify')}>
              {unresolved > 0 ? `Resolve ${unresolved} ambiguous first` : 'Continue to company verify'}
            </button>
          </div>
        </>
      )}

      {step === 'verify' && (
        <>
          <div className="card">
            <h2>Company verify</h2>
            {verify.filter((v: any) => v.flag).length === 0 ? (
              <p className="note" style={{ marginBottom: 10 }}>
                ✓ Nothing needs review — every company resolved deterministically
                (existing clients keep their GO company; new clients use the LMS company, or their name when none exists).
              </p>
            ) : (
              <>
                <p className="note" style={{ marginBottom: 10 }}>
                  Only the {verify.filter((v: any) => v.flag).length} row(s) below need your attention — everything else resolved deterministically.
                  Edit the company if it's wrong; legal entity re-derives automatically.
                </p>
                {verifyTable(verify.filter((v: any) => v.flag))}
              </>
            )}
            <details style={{ marginTop: 14 }}>
              <summary className="note" style={{ cursor: 'pointer' }}>
                Auto-resolved rows ({verify.filter((v: any) => !v.flag).length}) — view or edit anyway
              </summary>
              {verifyTable(verify.filter((v: any) => !v.flag))}
            </details>
          </div>
          <div className="actions">
            <button className="btn ghost" onClick={() => setStep('review')}>Back</button>
            <button className="btn" disabled={busy} onClick={finalize}>{busy ? 'Generating…' : 'Generate the four files'}</button>
          </div>
        </>
      )}

      {step === 'done' && outputs && (
        <>
          {outputs.validation.length > 0 && (
            <div className="error"><b>Validation found {outputs.validation.length} issue(s):</b>
              <ul style={{ marginLeft: 18 }}>{outputs.validation.map((v: string, i: number) => <li key={i}>{v}</li>)}</ul></div>
          )}
          {outputs.validation.length === 0 && (
            <div className="warn" style={{ background: 'var(--green-bg)', borderColor: '#86efac' }}>
              ✓ All validation checks passed — {outputs.stats.trainings} training(s), {outputs.stats.participants} participant rows
              {outputs.stats.droppedDupes > 0 && <> ({outputs.stats.droppedDupes} within-training duplicate(s) dropped)</>}.
            </div>
          )}
          <div className="card">
            <h2>Download import files (import in this order)</h2>
            {outputs.files.map((f: any, i: number) => (
              <a key={f.name} className="dl" onClick={() => download(f.name, f.csv)} style={{ cursor: 'pointer' }}>
                {i + 1}. {f.name}<small>{f.rows} rows</small>
              </a>
            ))}
            {outputs.report && (
              <a className="dl" style={{ cursor: 'pointer', borderColor: 'var(--blue)' }}
                onClick={() => { const a = document.createElement('a');
                  a.href = URL.createObjectURL(new Blob([outputs.report.html], { type: 'text/html' }));
                  a.download = outputs.report.name; a.click(); }}>
                ★ {outputs.report.name}<small>Client-facing HTML report — open in a browser to view</small>
              </a>
            )}
          </div>
          <div className="card">
            <h2>Archive & session log</h2>
            {!archive && <p className="note">Archiving to Drive…</p>}
            {archive && !archive.drive && <p className="note">Drive archival is not configured — files are download-only this session. The session log is generated below.</p>}
            {archive?.drive && <p className="note">✓ Outputs, raw files, and session log uploaded to Drive.</p>}
            {archive?.log && <pre style={{ fontSize: 11.5, background: 'var(--alt)', padding: 12, borderRadius: 8, marginTop: 10, whiteSpace: 'pre-wrap' }}>{archive.log}</pre>}
          </div>
          <div className="actions"><button className="btn ghost" onClick={() => location.reload()}>Start a new session</button></div>
        </>
      )}
    </div>
  );
}
