import { randomBytes } from "node:crypto";

/** A UUIDv7: time-ordered, so primary-key indexes stay compact. */
export function newId(now = Date.now()): string {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(now, 0, 6);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** A random URL-safe token (sessions, invitations, signed links). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
