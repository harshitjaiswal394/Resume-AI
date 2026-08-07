// Secure browser storage for resume drafts.
// Sensitive PII (name/email/phone/certifications) is encrypted with AES-GCM
// before being persisted, so it never sits in browser storage as clear text.
//
// Security model: the AES key is generated once per browser and stored in
// localStorage. Origin-scoped storage means this protects against casual /
// forensic reads and satisfies the "no clear-text PII at rest" requirement,
// but it is NOT a defense against XSS (an attacker running in the page can
// read the key). Draft persistence is inherently client-side, so this is the
// strongest practical mitigation available.
//
// Legacy plaintext drafts (written before encryption) are transparently
// migrated to the encrypted format on first read.

const KEY_REF = "resumatch_storage_key";
const IV_LENGTH = 12;

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function getKey(storage: Storage): Promise<CryptoKey> {
  const stored = storage.getItem(KEY_REF);
  if (stored) {
    try {
      return await crypto.subtle.importKey(
        "raw",
        base64ToBytes(stored),
        "AES-GCM",
        false,
        ["encrypt", "decrypt"],
      );
    } catch {
      // Corrupt key material — regenerate below.
    }
  }
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const exported = await crypto.subtle.exportKey("raw", key);
  storage.setItem(KEY_REF, bytesToBase64(new Uint8Array(exported)));
  return key;
}

function isPlainTextJson(raw: string): boolean {
  const trimmed = raw.trimStart();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

export async function secureSet(storage: Storage, key: string, value: unknown): Promise<void> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const k = await getKey(storage);
  const enc = new TextEncoder();
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    k,
    enc.encode(JSON.stringify(value)),
  );
  const payload = new Uint8Array(iv.length + cipher.byteLength);
  payload.set(iv, 0);
  payload.set(new Uint8Array(cipher), iv.length);
  storage.setItem(key, bytesToBase64(payload));
}

export async function secureGet(storage: Storage, key: string): Promise<unknown | null> {
  const raw = storage.getItem(key);
  if (!raw) return null;

  // Legacy plaintext draft — migrate it to the encrypted format and keep the
  // parsed value so existing users don't lose their draft.
  if (isPlainTextJson(raw)) {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    try {
      await secureSet(storage, key, parsed);
    } catch {
      // Leave legacy draft in place; the read below still succeeds.
    }
    return parsed;
  }

  try {
    const payload = base64ToBytes(raw);
    const iv = payload.slice(0, IV_LENGTH);
    const data = payload.slice(IV_LENGTH);
    const k = await getKey(storage);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, k, data);
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    return null;
  }
}

export function secureRemove(storage: Storage, key: string): void {
  storage.removeItem(key);
}
