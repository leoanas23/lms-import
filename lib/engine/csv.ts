export function toCsv(header: string[], rows: string[][]): string {
  const esc = (s: string) => /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  return [header, ...rows].map(r => r.map(c => esc(c ?? '')).join(',')).join('\r\n') + '\r\n';
}
