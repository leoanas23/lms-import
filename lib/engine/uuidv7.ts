// UUIDv7: 48-bit ms timestamp + version/variant bits + random.
export function uuidv7(date: Date = new Date()): string {
  const ts = BigInt(date.getTime());
  const bytes = new Uint8Array(16);
  // timestamp (48 bits, big-endian)
  for (let i = 0; i < 6; i++) bytes[i] = Number((ts >> BigInt(8 * (5 - i))) & 0xffn);
  const rand = globalThis.crypto.getRandomValues(new Uint8Array(10));
  bytes.set(rand, 6);
  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
