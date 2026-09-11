import { Prisma } from "@gurukulam/db";

/**
 * Retries a create whose business ID collided.
 *
 * A business ID comes from a counter, and a counter can fall behind the rows
 * it names — a restored backup, a migration that renumbered a key, or two
 * requests landing in the same instant. When that happens the insert fails on
 * the unique index, and a 500 is the wrong answer: the next number is free, so
 * the operation can simply take it.
 *
 * Each attempt is its own transaction, because a failed insert aborts the one
 * it was in — retrying inside would replay a dead transaction.
 *
 * Bounded, and deliberately small: if five consecutive numbers are taken, the
 * counter is not merely stale and a human should look.
 */
export async function withBusinessIdRetry<T>(run: () => Promise<T>, tries = 5): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (!isBusinessIdCollision(error)) throw error;
      last = error;
      // The next call allocates the next number, so simply going round again
      // makes progress.
    }
  }
  throw last;
}

/** A unique-constraint violation on a generated business-ID column. */
function isBusinessIdCollision(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2002") return false;

  const target = error.meta?.target;
  const fields = Array.isArray(target) ? target.map(String) : typeof target === "string" ? [target] : [];
  // Only codes we generate. A duplicate email is the caller's problem and must
  // keep surfacing as a 409, not be retried into a different error.
  return fields.some((f) => /_code$|^certificate_number$|^verification_code$/.test(f));
}
