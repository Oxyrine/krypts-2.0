/**
 * Client-side end-to-end encryption helpers, built on WebCrypto.
 *
 * Everything here runs in the renderer. Private key material and file
 * plaintext never leave this process unencrypted — the server only ever
 * receives ciphertext and wrapped (encrypted) keys it cannot open.
 *
 * Crypto choices:
 *  - Keypair: RSA-OAEP-2048 / SHA-256 (wraps/unwraps per-file DEKs)
 *  - Private key at rest: AES-GCM, key derived via PBKDF2(password, salt, 310k, SHA-256)
 *  - File content: AES-GCM-256, random 12-byte IV
 */

const PBKDF2_ITERATIONS = 310_000;

// ---------------------------------------------------------------------------
// base64 helpers
// ---------------------------------------------------------------------------

export function bufToBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function base64ToBuf(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ---------------------------------------------------------------------------
// Keypair generation (RSA-OAEP-2048)
// ---------------------------------------------------------------------------

export interface KeyPairBundle {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  publicKeyB64: string; // SPKI, base64
  privateKeyB64: string; // PKCS8, base64 (plaintext — encrypt before sending anywhere)
}

export async function generateKeyPair(): Promise<KeyPairBundle> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["wrapKey", "unwrapKey", "encrypt", "decrypt"]
  );

  const spki = await crypto.subtle.exportKey("spki", keyPair.publicKey);
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
    publicKeyB64: bufToBase64(spki),
    privateKeyB64: bufToBase64(pkcs8),
  };
}

export async function importPublicKey(publicKeyB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "spki",
    base64ToBuf(publicKeyB64),
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt", "wrapKey"]
  );
}

export async function importPrivateKey(privateKeyB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8",
    base64ToBuf(privateKeyB64),
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["decrypt", "unwrapKey"]
  );
}

// ---------------------------------------------------------------------------
// Password-derived encryption of the private key (at rest)
// ---------------------------------------------------------------------------

export function generateSalt(): string {
  return bufToBase64(crypto.getRandomValues(new Uint8Array(16)));
}

async function deriveKekFromPassword(password: string, saltB64: string): Promise<CryptoKey> {
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: base64ToBuf(saltB64), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** Encrypt a PKCS8 private key (base64) with a password-derived key. Returns base64 `iv:ciphertext`. */
export async function encryptPrivateKey(privateKeyB64: string, password: string, saltB64: string): Promise<string> {
  const kek = await deriveKekFromPassword(password, saltB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    kek,
    base64ToBuf(privateKeyB64)
  );
  return `${bufToBase64(iv)}:${bufToBase64(ciphertext)}`;
}

/** Decrypt a private key blob produced by encryptPrivateKey. Returns the PKCS8 base64 private key. */
export async function decryptPrivateKey(encryptedB64: string, password: string, saltB64: string): Promise<string> {
  const [ivB64, ctB64] = encryptedB64.split(":");
  const kek = await deriveKekFromPassword(password, saltB64);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBuf(ivB64) },
    kek,
    base64ToBuf(ctB64)
  );
  return bufToBase64(plaintext);
}

// ---------------------------------------------------------------------------
// File encryption (AES-GCM-256)
// ---------------------------------------------------------------------------

export interface EncryptedFile {
  ciphertext: ArrayBuffer;
  ivB64: string;
  dek: CryptoKey;
}

export async function generateDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

export async function encryptFileBytes(data: ArrayBuffer, dek: CryptoKey): Promise<EncryptedFile> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, dek, data);
  return { ciphertext, ivB64: bufToBase64(iv), dek };
}

export async function decryptFileBytes(ciphertext: ArrayBuffer, dek: CryptoKey, ivB64: string): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBuf(ivB64) }, dek, ciphertext);
}

// ---------------------------------------------------------------------------
// DEK wrapping (RSA-OAEP) — how a file's key gets delivered to a recipient
// ---------------------------------------------------------------------------

export async function wrapDek(dek: CryptoKey, recipientPublicKey: CryptoKey): Promise<string> {
  const wrapped = await crypto.subtle.wrapKey("raw", dek, recipientPublicKey, { name: "RSA-OAEP" });
  return bufToBase64(wrapped);
}

export async function unwrapDek(wrappedDekB64: string, ownPrivateKey: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    "raw",
    base64ToBuf(wrappedDekB64),
    ownPrivateKey,
    { name: "RSA-OAEP" },
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}
