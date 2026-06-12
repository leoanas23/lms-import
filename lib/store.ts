// Session + GO-export storage. Uses Vercel Blob when configured, /tmp locally.
import { put, list } from '@vercel/blob';
import { promises as fs } from 'fs';
import path from 'path';

const hasBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
const TMP = '/tmp/lms-import';

export async function saveJson(key: string, data: unknown): Promise<void> {
  const body = JSON.stringify(data);
  if (hasBlob) { await put(key, body, { access: 'public', addRandomSuffix: false, contentType: 'application/json' }); return; }
  await fs.mkdir(TMP, { recursive: true });
  await fs.writeFile(path.join(TMP, key.replace(/\//g, '__')), body);
}

export async function loadJson<T>(key: string): Promise<T | null> {
  try {
    if (hasBlob) {
      const { blobs } = await list({ prefix: key });
      const hit = blobs.find(b => b.pathname === key);
      if (!hit) return null;
      const res = await fetch(hit.url, { cache: 'no-store' });
      return await res.json() as T;
    }
    const txt = await fs.readFile(path.join(TMP, key.replace(/\//g, '__')), 'utf8');
    return JSON.parse(txt) as T;
  } catch { return null; }
}

export async function saveText(key: string, text: string): Promise<void> {
  if (hasBlob) { await put(key, text, { access: 'public', addRandomSuffix: false, contentType: 'text/plain' }); return; }
  await fs.mkdir(TMP, { recursive: true });
  await fs.writeFile(path.join(TMP, key.replace(/\//g, '__')), text);
}
export async function loadText(key: string): Promise<string | null> {
  try {
    if (hasBlob) {
      const { blobs } = await list({ prefix: key });
      const hit = blobs.find(b => b.pathname === key);
      if (!hit) return null;
      const res = await fetch(hit.url, { cache: 'no-store' });
      return await res.text();
    }
    return await fs.readFile(path.join(TMP, key.replace(/\//g, '__')), 'utf8');
  } catch { return null; }
}
