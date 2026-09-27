import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Password hashing with scrypt from Node's standard library.
 *
 * scrypt is memory-hard and is what Node ships, so there is no native module
 * to rebuild per platform and nothing to keep patched. Parameters are stored
 * inside the hash, so raising them later re-verifies old hashes correctly and
 * `needsRehash` says which ones to upgrade on next login.
 *
 * Format: scrypt$N$r$p$keylen$salt$hash
 */
const CURRENT = { N: 2 ** 15, r: 8, p: 1, keylen: 64 } as const;

export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const { N, r, p, keylen } = CURRENT;
  const derived = scryptSync(plain.normalize("NFKC"), salt, keylen, { N, r, p, maxmem: 256 * 1024 * 1024 });
  return ["scrypt", N, r, p, keylen, salt.toString("hex"), derived.toString("hex")].join("$");
}

export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split("$");

  // The seed writes a simpler scrypt$salt$hash form. Accept it so seeded
  // accounts can sign in, and let needsRehash upgrade them on first login.
  if (parts.length === 3 && parts[0] === "scrypt") {
    const [, salt, hash] = parts as [string, string, string];
    const derived = scryptSync(plain.normalize("NFKC"), salt, 64);
    return safeEqual(derived, Buffer.from(hash, "hex"));
  }

  if (parts.length !== 7 || parts[0] !== "scrypt") return false;
  const [, N, r, p, keylen, salt, hash] = parts as [string, string, string, string, string, string, string];

  const derived = scryptSync(plain.normalize("NFKC"), Buffer.from(salt, "hex"), Number(keylen), {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: 256 * 1024 * 1024,
  });
  return safeEqual(derived, Buffer.from(hash, "hex"));
}

/** True when a stored hash uses weaker parameters than the current policy. */
export function needsRehash(stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 7) return true;
  return Number(parts[1]) < CURRENT.N || Number(parts[4]) < CURRENT.keylen;
}

/**
 * Constant-time comparison. `a === b` on secrets leaks their contents through
 * how long the comparison takes.
 */
function safeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Hashes a refresh token for storage. Fast on purpose — this is a 256-bit
 *  random value, not a guessable password, so a KDF would only add latency. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const newOpaqueToken = (): string => randomBytes(32).toString("base64url");
