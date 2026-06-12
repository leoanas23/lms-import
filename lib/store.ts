// Session + GO-export storage. Uses Vercel Blob when configured, /tmp locally.
import { put, get } from '@vercel/blob';
import { promises as fs } from 'fs';
import path from 'path';

const hasBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
const TMP = '/tmp/lms-import';
// Matches the store's access setting. Ours is private (sessions hold client PII);
// set BLOB_ACCESS=public only if the connected store was created as public.
const ACCESS = (process.env.BLOB_ACCESS as 'private' | 'public') || 'private';

/** True when sessions only live in /tmp on a serverless host — i.e. they will NOT
 * survive between requests. The UI warns about this. */
export const storageIsEphemeral = !hasBlob && !!process.env.VERCEL;

async function blobRead(key: string): Promise<string | null> {
  const res = await get(key, { access: ACCESS, useCache: false });
  if (!res || res.statusCode !== 200) return null;
  return await new Response(res.stream).text();
}
async function blobWrite(key: string, body: string, contentType: string): Promise<void> {
  await put(key, body, { access: ACCESS, addRandomSuffix: false, allowOverwrite: true, contentType });
}

export async function saveJson(key: string, data: unknown): Promise<void> {
  const body = JSON.stringify(data);
  if (hasBlob) { await blobWrite(key, body, 'application/json'); return; }
  await fs.mkdir(TMP, { recursive: true });
  await fs.writeFile(path.join(TMP, key.replace(/\//g, '__')), body);
}

export async function loadJson<T>(key: string): Promise<T | null> {
  try {
    if (hasBlob) {
      const txt = await blobRead(key);
      return txt === null ? null : JSON.parse(txt) as T;
    }
    const txt = await fs.readFile(path.join(TMP, key.replace(/\//g, '__')), 'utf8');
    return JSON.parse(txt) as T;
  } catch { return null; }
}

export async function saveText(key: string, text: string): Promise<void> {
  if (hasBlob) { await blobWrite(key, text, 'text/plain'); return; }
  await fs.mkdir(TMP, { recursive: true });
  await fs.writeFile(path.join(TMP, key.replace(/\//g, '__')), text);
}
export async function loadText(key: string): Promise<string | null> {
  try {
    if (hasBlob) return await blobRead(key);
    return await fs.readFile(path.join(TMP, key.replace(/\//g, '__')), 'utf8');
  } catch { return null; }
}
