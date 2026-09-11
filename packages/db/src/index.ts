import { PrismaClient } from "@prisma/client";

export * from "@prisma/client";

/**
 * A single client per process. Next.js dev and NestJS hot-reload both
 * re-evaluate modules, and a fresh PrismaClient per reload exhausts the
 * connection pool within a few saves.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * The soft-delete predicate (ADR 0002). Operational reads exclude removed
 * rows; financial and historical reports deliberately opt out of it, because
 * the events they record still happened.
 *
 * Spread it into a `where` rather than repeating the literal, so a search for
 * callers finds every query that made the choice:
 *
 *     prisma.student.findMany({ where: { ...live, cityId } })
 */
export const live = { deletedAt: null } as const;

/**
 * Marks a row deleted instead of removing it. Repositories use this rather
 * than issuing DELETE, which is never correct against a business table.
 */
export function softDelete(actorId: string) {
  return { deletedAt: new Date(), deletedBy: actorId };
}
