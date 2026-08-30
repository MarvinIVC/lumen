/**
 * Encrypting a student's own API key at rest.
 *
 * **Deviation from the spec, recorded deliberately.** 02-ARCHITECTURE.md §6 describes
 * `BYOK_ENC_KEY` as "a libsodium secretbox key". This uses Web Crypto's AES-256-GCM instead, and
 * the reason is the runtime: libsodium in Deno means an npm package and a WebAssembly module in
 * the one code path where a load failure means a student's key cannot be decrypted at all. AES-GCM
 * is authenticated encryption of the same strength, it is built into the runtime, and the key
 * material is identical — 32 random bytes, still generated with `openssl rand -base64 32`. The
 * ciphertext carries a version tag so a later move to secretbox can read what this wrote.
 *
 * What the student's browser holds is this ciphertext, never the key: phase-06 will move the same
 * blob into `profile.byok` when accounts exist, without anyone re-entering anything.
 */
const VERSION = 'v1';

function keyBytes(): Uint8Array {
  const raw = Deno.env.get('BYOK_ENC_KEY') ?? '';
  if (!raw) throw new Error('BYOK_ENC_KEY is not set');
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  if (bytes.length !== 32) throw new Error('BYOK_ENC_KEY must be 32 bytes, base64-encoded');
  return bytes;
}

async function subtleKey(): Promise<CryptoKey> {
  return await crypto.subtle.importKey('raw', keyBytes(), { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function encryptSecret(plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await subtleKey(),
    new TextEncoder().encode(plaintext),
  );
  return `${VERSION}.${toBase64(iv)}.${toBase64(new Uint8Array(sealed))}`;
}

export async function decryptSecret(ciphertext: string): Promise<string | null> {
  const [version, iv, body] = ciphertext.split('.');
  if (version !== VERSION || !iv || !body) return null;
  try {
    const opened = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(iv) },
      await subtleKey(),
      fromBase64(body),
    );
    return new TextDecoder().decode(opened);
  } catch {
    // A key rotation, a tampered blob, or a ciphertext from another deployment. All the same
    // answer: we cannot use it, and the student is asked for their key again.
    return null;
  }
}

/** HMAC-SHA-256, hex. Used for the anon id signature and for hashing an IP before storing it. */
export async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison, so a signature cannot be discovered a byte at a time. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
