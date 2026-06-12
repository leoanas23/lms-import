// Google Drive archival via service account. All functions no-op when not configured.
import { google } from 'googleapis';
import { Readable } from 'stream';

function client() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const creds = JSON.parse(raw);
    const auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    return google.drive({ version: 'v3', auth });
  } catch { return null; }
}

export function driveConfigured(): boolean { return !!client(); }

/** Upload a CSV as a converted Google Sheet (matches the skill's OUTPUT behavior). */
export async function uploadCsvAsSheet(name: string, csv: string, folderId: string): Promise<string | null> {
  const drive = client();
  if (!drive || !folderId) return null;
  const res = await drive.files.create({
    requestBody: { name: name.replace(/\.csv$/, ''), parents: [folderId], mimeType: 'application/vnd.google-apps.spreadsheet' },
    media: { mimeType: 'text/csv', body: Readable.from([csv]) },
    fields: 'id',
  });
  return res.data.id || null;
}

/** Upload an arbitrary file (raw xlsx archive, session log md, html report). */
export async function uploadFile(name: string, buf: Buffer, mime: string, folderId: string): Promise<string | null> {
  const drive = client();
  if (!drive || !folderId) return null;
  const res = await drive.files.create({
    requestBody: { name, parents: [folderId] },
    media: { mimeType: mime, body: Readable.from([buf]) },
    fields: 'id',
  });
  return res.data.id || null;
}
