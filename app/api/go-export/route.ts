import { NextResponse } from 'next/server';
import { loadJson } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const meta = await loadJson<{ filename: string; modified: string }>('go-export/meta.json');
  if (!meta) return NextResponse.json({ cached: false });
  const ageDays = Math.floor((Date.now() - new Date(meta.modified).getTime()) / 86400000);
  return NextResponse.json({ cached: true, ...meta, ageDays, stale: ageDays > 14 });
}
