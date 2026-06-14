/**
 * Cryptographic utilities using the browser's native Web Crypto API.
 */

// --- HASHING ---
export async function sha256(data) {
  const buffer = data instanceof ArrayBuffer ? data : await data.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateRoomId() {
  const arr = new Uint8Array(4);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// --- ZERO-KNOWLEDGE ENCRYPTION (AES-GCM) ---

/** Generates a random 256-bit AES-GCM key */
export async function generateKey() {
  return await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/** Exports the key to a URL-safe Base64 string to put in the share link */
export async function exportKeyToUrl(key) {
  const raw = await crypto.subtle.exportKey('raw', key);
  return btoa(String.fromCharCode(...new Uint8Array(raw)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Imports the URL-safe Base64 string back into a CryptoKey */
export async function importKeyFromUrl(base64url) {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
  const raw = Uint8Array.from(atob(base64 + pad), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'AES-GCM' },
    true,
    ['encrypt', 'decrypt']
  );
}

/** * Encrypts a chunk. Prepends the 12-byte IV to the ciphertext payload.
 */
export async function encryptChunk(chunkBuffer, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    chunkBuffer
  );
  
  // Package IV + Ciphertext together
  const payload = new Uint8Array(12 + ciphertext.byteLength);
  payload.set(iv, 0);
  payload.set(new Uint8Array(ciphertext), 12);
  return payload.buffer;
}

/** * Decrypts a chunk by separating the 12-byte IV from the ciphertext.
 */
export async function decryptChunk(payloadBuffer, key) {
  const iv = new Uint8Array(payloadBuffer, 0, 12);
  const ciphertext = new Uint8Array(payloadBuffer, 12);
  return await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
}