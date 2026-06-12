import { NextResponse, type NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth') || pathname.startsWith('/_next')) {
    return NextResponse.next();
  }
  const ok = req.cookies.get('lms_auth')?.value === expected();
  if (!ok) {
    if (pathname.startsWith('/api/')) return new NextResponse('Unauthorized', { status: 401 });
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.next();
}
function expected(): string {
  // cheap HMAC-less token: hash of password; fine for an internal tool behind HTTPS
  const pw = process.env.APP_PASSWORD || '';
  let h = 0; for (let i = 0; i < pw.length; i++) { h = (h * 31 + pw.charCodeAt(i)) >>> 0; }
  return `v1.${h.toString(36)}`;
}
export const config = { matcher: ['/((?!favicon.ico).*)'] };
