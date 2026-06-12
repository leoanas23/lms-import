'use client';
import { useState } from 'react';

export default function Login() {
  const [pw, setPw] = useState(''); const [err, setErr] = useState('');
  async function go() {
    const res = await fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: pw }) });
    if (res.ok) location.href = '/';
    else setErr('That password is not correct.');
  }
  return (
    <div className="shell" style={{ maxWidth: 380, paddingTop: 100 }}>
      <div className="card">
        <h2>GO Import — sign in</h2>
        {err && <div className="error">{err}</div>}
        <input type="password" placeholder="Team password" value={pw}
          onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && go()} autoFocus />
        <div className="actions"><button className="btn" onClick={go}>Sign in</button></div>
      </div>
    </div>
  );
}
