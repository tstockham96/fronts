import { hashStr, mulberry32 } from './rng';

/**
 * Static-mode duel links. The challenger's army is packed into a few bytes and
 * XOR-obfuscated with a keystream derived from a random nonce, then base64url'd.
 * Not cryptography (the client must be able to decode it), but nobody reads
 * troop counts off a link by eye, and the UI never shows them before the friend
 * commits. With a backend configured, duels are stored server-side instead.
 */
export interface DuelPayload {
  puzzle: number;
  army: number[];
  /** Random challenger id, so records ("You & Maya: 3-1") track per person. */
  id: number;
  name: string;
}

const VERSION = 1;
const KEY = hashStr('fronts-duel-v1');

function keystream(nonce: number, len: number): number[] {
  const r = mulberry32(KEY ^ Math.imul(nonce + 1, 0x9e3779b1));
  return Array.from({ length: len }, () => Math.floor(r() * 256));
}

function b64url(bytes: Uint8Array): string {
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function checksum(bytes: number[]): number {
  let h = 7;
  for (const b of bytes) h = (Math.imul(h, 31) + b) >>> 0;
  return h & 0xff;
}

export function encodeDuel(p: DuelPayload, nonce = Math.floor(Math.random() * 256)): string {
  // Truncate on code-point boundaries so emoji names never decode as garbage.
  const enc = new TextEncoder();
  let name = new Uint8Array(0);
  let acc = '';
  for (const ch of p.name) {
    const next = enc.encode(acc + ch);
    if (next.length > 24) break;
    acc += ch;
    name = next;
  }
  const plain = [
    VERSION,
    (p.puzzle >> 8) & 0xff,
    p.puzzle & 0xff,
    ...p.army,
    (p.id >>> 24) & 0xff,
    (p.id >>> 16) & 0xff,
    (p.id >>> 8) & 0xff,
    p.id & 0xff,
    name.length,
    ...name,
  ];
  const ks = keystream(nonce, plain.length + 1);
  const body = plain.map((b, i) => b ^ ks[i]);
  const sum = checksum(plain) ^ ks[plain.length];
  return b64url(Uint8Array.from([nonce, ...body, sum]));
}

export function decodeDuel(code: string): DuelPayload | null {
  try {
    const raw = unb64url(code.trim());
    if (raw.length < 15) return null;
    const nonce = raw[0];
    const body = Array.from(raw.subarray(1, raw.length - 1));
    const ks = keystream(nonce, body.length + 1);
    const plain = body.map((b, i) => b ^ ks[i]);
    if ((raw[raw.length - 1] ^ ks[body.length]) !== checksum(plain)) return null;
    if (plain[0] !== VERSION) return null;
    const puzzle = (plain[1] << 8) | plain[2];
    const army = plain.slice(3, 8);
    const id = ((plain[8] << 24) | (plain[9] << 16) | (plain[10] << 8) | plain[11]) >>> 0;
    const len = plain[12];
    const name = new TextDecoder().decode(Uint8Array.from(plain.slice(13, 13 + len)));
    if (army.reduce((a, b) => a + b, 0) !== 100) return null;
    return { puzzle, army, id, name };
  } catch {
    return null;
  }
}
