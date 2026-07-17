import {
  OIDC_JWT_ALGORITHM,
  OIDC_PUBLIC_KEY_USE,
} from "./constants";
import type { OidcJwtHeader, OidcJwtPayload } from "./types";

const textEncoder = new TextEncoder();

const bytesToBinary = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return binary;
};

const binaryToBytes = (binary: string): Uint8Array => {
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const normalizeBase64 = (value: string): string => {
  const remainder = value.length % 4;
  const padding = remainder === 0 ? "" : "=".repeat(4 - remainder);
  return `${value.replace(/-/g, "+").replace(/_/g, "/")}${padding}`;
};

export const base64UrlEncode = (
  value: string | Uint8Array | ArrayBuffer,
): string => {
  const bytes =
    typeof value === "string"
      ? textEncoder.encode(value)
      : value instanceof Uint8Array
        ? value
        : new Uint8Array(value);

  return btoa(bytesToBinary(bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

export const base64UrlDecodeJson = <T = unknown>(value: string): T => {
  const json = new TextDecoder().decode(
    binaryToBytes(atob(normalizeBase64(value))),
  );
  return JSON.parse(json) as T;
};

const pemToArrayBuffer = (pem: string): ArrayBuffer => {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");

  const bytes = binaryToBytes(atob(base64));
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer as ArrayBuffer;
};

export const importPkcs8PrivateKey = (pem: string): Promise<CryptoKey> =>
  crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(pem),
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    true,
    ["sign"],
  );

export const exportPublicJwk = async (
  privateKey: CryptoKey,
  keyId: string,
): Promise<JsonWebKey> => {
  const privateJwk = (await crypto.subtle.exportKey(
    "jwk",
    privateKey,
  )) as JsonWebKey;

  if (privateJwk.kty !== "RSA" || !privateJwk.n || !privateJwk.e) {
    throw new Error("Signing key is not an RSA private key");
  }

  return {
    alg: OIDC_JWT_ALGORITHM,
    e: privateJwk.e,
    kid: keyId,
    kty: privateJwk.kty,
    n: privateJwk.n,
    use: OIDC_PUBLIC_KEY_USE,
  } as JsonWebKey;
};

export const signJwt = async (
  header: OidcJwtHeader,
  payload: OidcJwtPayload,
  privateKey: CryptoKey,
): Promise<string> => {
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    textEncoder.encode(signingInput),
  );

  return `${signingInput}.${base64UrlEncode(signature)}`;
};
