import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";

export interface LicencePayload {
  /** Who it was issued to. */
  licensee: string;
  edition: string;
  /** "+module,-module" overrides. */
  features?: string;
  limits?: Record<string, number>;
  /** ISO date; omitted = perpetual. */
  expiresAt?: string;
}

export type LicenceCheck =
  | { valid: true; payload: LicencePayload; expired: boolean }
  | { valid: false; reason: string };

/** Ed25519 key pair (PEM) for issuing licences. Keep the private key with Fera only. */
export function generateLicenceKeys() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

/** `base64url(payload).base64url(signature)` */
export function signLicence(payload: LicencePayload, privateKeyPem: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(null, Buffer.from(body), createPrivateKey(privateKeyPem));
  return `${body}.${signature.toString("base64url")}`;
}

export function verifyLicence(key: string, publicKeyPem: string, now = new Date()): LicenceCheck {
  const [body, signature] = key.trim().split(".");
  if (!body || !signature) return { valid: false, reason: "Malformed licence key" };
  const ok = verify(
    null,
    Buffer.from(body),
    createPublicKey(publicKeyPem),
    Buffer.from(signature, "base64url"),
  );
  if (!ok) return { valid: false, reason: "Licence signature does not match" };
  const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as LicencePayload;
  const expired = payload.expiresAt ? new Date(payload.expiresAt) < now : false;
  return { valid: true, payload, expired };
}
