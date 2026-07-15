interface PasswordEnvelope {
  v: 1;
  alg: "AES-GCM";
  iv: string;
  ciphertext: string;
}

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

export class PasswordCrypto {
  constructor(private readonly keyBase64: string | undefined) {}

  async encrypt(password: string): Promise<string> {
    const key = await this.importKey(["encrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, ENCODER.encode(password));
    const envelope: PasswordEnvelope = {
      v: 1,
      alg: "AES-GCM",
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(encrypted))
    };
    return JSON.stringify(envelope);
  }

  async decrypt(value: string): Promise<string> {
    const key = await this.importKey(["decrypt"]);
    const envelope = parseEnvelope(value);
    let decrypted: ArrayBuffer;
    try {
      decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: ciphertextBase64ToBytes(envelope.iv) },
        key,
        ciphertextBase64ToBytes(envelope.ciphertext)
      );
    } catch {
      throw new Error("password_ciphertext_invalid");
    }
    return DECODER.decode(decrypted);
  }

  async decryptForTest(value: string): Promise<string> {
    return this.decrypt(value);
  }

  private async importKey(usages: KeyUsage[]): Promise<CryptoKey> {
    if (!this.keyBase64) throw new Error("password_key_missing");
    const raw = base64ToBytes(this.keyBase64);
    if (raw.byteLength !== 32) throw new Error("password_key_invalid");
    return crypto.subtle.importKey("raw", raw, "AES-GCM", false, usages);
  }
}

function parseEnvelope(value: string): PasswordEnvelope {
  let parsed: Partial<PasswordEnvelope>;
  try {
    parsed = JSON.parse(value) as Partial<PasswordEnvelope>;
  } catch {
    throw new Error("password_ciphertext_invalid");
  }
  if (parsed.v !== 1 || parsed.alg !== "AES-GCM" || typeof parsed.iv !== "string" || typeof parsed.ciphertext !== "string") {
    throw new Error("password_ciphertext_invalid");
  }
  return parsed as PasswordEnvelope;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    throw new Error("password_key_invalid");
  }
}

function ciphertextBase64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  try {
    return base64ToBytes(value);
  } catch {
    throw new Error("password_ciphertext_invalid");
  }
}
