import { Injectable } from "@nestjs/common";
import { Prisma } from "@gurukulam/db";
import * as ids from "@gurukulam/contracts";
import { PrismaService } from "../prisma/prisma.module";

/**
 * Allocates business IDs.
 *
 * Business IDs are generated on save and never typed (architecture.md §8), so
 * something has to hand out the running number without racing. Two operators
 * onboarding a student in the same second must not both be given
 * STU-2026-0891 — the second insert would fail on the unique index, but the
 * operator would see a save error rather than the next number.
 *
 * The allocation is a single atomic statement. It is deliberately NOT a
 * read-then-write, which is exactly the race it exists to avoid.
 */
@Injectable()
export class IdService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Atomically claims the next number for a key.
   *
   * Call this OUTSIDE the transaction that inserts the row. Allocating inside
   * one means a failed insert rolls the counter back too, so a retry asks for
   * the same number and can never make progress — see
   * `common/business-id-retry.ts`. Gaps are harmless: an unused STU- number
   * costs nothing, while a collision loop costs the write.
   *
   * `tx` remains available for the rare case where an ID must not survive a
   * rollback and no retry is wanted.
   */
  async next(key: string, tx?: Prisma.TransactionClient): Promise<number> {
    const client = tx ?? this.prisma;
    const rows = await client.$queryRaw<{ next_value: bigint }[]>`
      INSERT INTO id_sequences (key, next_value, updated_at)
      VALUES (${key}, 1, NOW())
      ON CONFLICT (key) DO UPDATE SET
        next_value = id_sequences.next_value + 1,
        updated_at = NOW()
      RETURNING next_value
    `;
    const value = rows[0]?.next_value;
    if (value === undefined) throw new Error(`Failed to allocate a sequence for ${key}`);
    return Number(value);
  }

  // ── Per-entity allocation ───────────────────────────────────────────────
  // Each names the sequence key it uses. Year-scoped entities restart every
  // January, which is what makes STU-2026-0001 meaningful.

  async studentCode(tx?: Prisma.TransactionClient, year = new Date().getUTCFullYear()) {
    return ids.studentCode(year, await this.next(`student:${year}`, tx));
  }

  async trainerCode(tx?: Prisma.TransactionClient) {
    return ids.trainerCode(await this.next("trainer", tx));
  }

  async collegeCode(name: string, tx?: Prisma.TransactionClient) {
    // Keyed on the INITIALS, not the name — those are what the code carries.
    // Keying on the name would give "Sri Narayana College" and "Saraswati
    // National College" separate counters and then the same CLG-SNC-01.
    const stem = ids.codeInitials(name, 3);
    return ids.collegeCode(name, await this.next(`college:${stem}`, tx));
  }

  async courseCode(name: string, tx?: Prisma.TransactionClient, year = new Date().getUTCFullYear()) {
    const base = ids.courseCode(name, year);
    // courseCode has no sequence component, so a second course with the same
    // initials in the same year would collide. Suffix only from the second.
    const n = await this.next(`course:${base}`, tx);
    return n === 1 ? base : `${base}-${n}`;
  }

  async batchCode(courseName: string, startDate: Date, tx?: Prisma.TransactionClient) {
    const month = startDate.getUTCMonth();
    const year = startDate.getUTCFullYear();
    // Keyed on the initials the code actually carries, so two courses sharing
    // them ("Data Analytics", "Digital Assurance") take successive cohort
    // letters instead of both claiming BTC-DA-SEP-A.
    const stem = ids.codeInitials(courseName, 2);
    const cohort = (await this.next(`batch:${stem}:${year}-${month}`, tx)) - 1;
    return ids.batchCode(courseName, startDate, cohort);
  }

  async sessionCode(batchCodeValue: string, sequence: number) {
    return ids.sessionCode(batchCodeValue, sequence);
  }

  async requirementCode(tx?: Prisma.TransactionClient, year = new Date().getUTCFullYear()) {
    return ids.requirementCode(year, await this.next(`requirement:${year}`, tx));
  }

  async contractCode(tx?: Prisma.TransactionClient, year = new Date().getUTCFullYear()) {
    return ids.contractCode(year, await this.next(`contract:${year}`, tx));
  }

  async transactionCode(tx?: Prisma.TransactionClient) {
    return ids.transactionCode(await this.next("transaction", tx));
  }

  async assignmentCode(tx?: Prisma.TransactionClient) {
    return ids.assignmentCode(await this.next("assignment", tx));
  }

  async certificateCode(tx?: Prisma.TransactionClient, year = new Date().getUTCFullYear()) {
    return ids.certificateCode(year, await this.next(`certificate:${year}`, tx));
  }

  async jobCode(tx?: Prisma.TransactionClient, year = new Date().getUTCFullYear()) {
    return ids.jobCode(year, await this.next(`job:${year}`, tx));
  }
}
