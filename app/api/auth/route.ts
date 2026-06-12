import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { password } = await req.json();
  if (!process.env.APP_PASSWORD || password !== process.env.APP_PASSWORD) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const pw = process.env.APP_PASSWORD;
  let h = 0; for (let i = 0; i < pw.length; i++) { h = (h * 31 + pw.charCodeAt(i)) >>> 0; }
  const res = NextResponse.json({ ok: true });
  res.cookies.set('lms_auth', `v1.${h.toString(36)}`, { httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30, path: '/' });
  return res;
}
