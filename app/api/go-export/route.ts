import { NextResponse } from 'next/server';
import { loadJson, storageIsEphemeral } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  // diag: what the running server actually sees (booleans only, no secrets)
  const diag = {
    blobToken: !!process.env.BLOB_READ_WRITE_TOKEN,
    blobStoreId: !!process.env.BLOB_STORE_ID,
    vercel: !!process.env.VERCEL,
    vercelEnv: process.env.VERCEL_ENV || 'local',
  };
  const meta = await loadJson<{ filename: string; modified: string }>('go-export/meta.json');
  if (!meta) return NextResponse.json({ cached: false, storageWarning: storageIsEphemeral, diag });
  const ageDays = Math.floor((Date.now() - new Date(meta.modified).getTime()) / 86400000);
  return NextResponse.json({ cached: true, ...meta, ageDays, stale: ageDays > 14, storageWarning: storageIsEphemeral, diag });
}
