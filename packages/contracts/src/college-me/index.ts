import { z } from "zod";
import { moneyMinor } from "../common/money.js";
import { batchSessionSchema } from "../batches/index.js";

/**
 * The institution's own surface.
 *
 * ── Why this exists when `collegeScope` already works ──────────────────
 *
 * The college portal is the one the architecture always said would be built by
 * NARROWING rather than by duplicating: `collegeScope` sits on the principal
 * beside `cityScope`, every list service spreads it, and driving the real API
 * as a real college user confirmed the rows come back correctly scoped. The
 * cohort, roster, requirement and certificate reads therefore go through the
 * shared services, exactly as the trainer's cohort reads do.
 *
 * What could NOT be narrowed is the summary. `GET /dashboard` scopes every
 * figure that is derived from a row — and then reports several that are not:
 * how many trainers we have, how big the question bank is, how many courses are
 * in the catalogue, the bench-to-stretched spread, the names of the trainers
 * carrying the most delivery, and an operator queue. Scope has nothing to
 * filter those BY. A projection would strip them once and rot at the next
 * figure somebody adds, so the institution gets its own home, computed from its
 * own rows only.
 *
 * The other half is billing, and that one is a positive case rather than a
 * refusal: in this segment the COLLEGE is the payer (invariant 3), so the money
 * genuinely is theirs to read — it is simply not in `feeLedger`, which is the
 * per-student ledger a college student does not have.
 */

export const meCollegeSchema = z.object({
  collegeId: z.string(),
  collegeCode: z.string(),
  name: z.string(),
  partnershipType: z.string().nullable(),
  cityName: z.string().nullable(),
  stateName: z.string().nullable().optional(),
  website: z.string().nullable(),
  /**
   * Who is signed in, as distinct from the institution they act for.
   *
   * Both are needed on one screen: a POC reads their own name to know which
   * account they are using, and the college's to know they are in the right
   * institution's portal at all. `loginEmail` is derived from the college code,
   * so it is never the address they would guess — which is exactly why it is
   * shown rather than assumed.
   */
  user: z.object({
    collegeUserId: z.string(),
    name: z.string(),
    email: z.string(),
    loginEmail: z.string().nullable(),
    phone: z.string().nullable(),
    designation: z.string().nullable(),
    lastLoginAt: z.string().nullable(),
  }),
});

export type MeCollege = z.infer<typeof meCollegeSchema>;

/**
 * What the institution owes, under one contract.
 *
 * The basis is carried rather than resolved into a single "price", because a
 * per-student contract and a flat cohort price answer different questions when
 * the headcount moves — and the college is the party that will ask.
 */
export const meContractSchema = z.object({
  contractId: z.string(),
  contractCode: z.string(),
  courseName: z.string().nullable(),
  batchCode: z.string().nullable(),
  commercialBasis: z.enum(["PER_STUDENT", "FLAT_COHORT"]),
  perStudentRateMinor: moneyMinor.nullable(),
  billableHeadcount: z.number().int(),
  totalValueMinor: moneyMinor.nullable(),
  paidMinor: moneyMinor,
  balanceMinor: moneyMinor,
  status: z.string(),
  signedAt: z.string().nullable(),
  installments: z.array(
    z.object({
      installmentId: z.string(),
      installmentNumber: z.number().int(),
      amountMinor: moneyMinor,
      paidAmountMinor: moneyMinor,
      dueDate: z.string(),
      status: z.string(),
      paidAt: z.string().nullable(),
      /** Past its due date with something still on it. Decided by the API. */
      overdue: z.boolean(),
    }),
  ),
});

export type MeContract = z.infer<typeof meContractSchema>;

/**
 * Billing, summed across every contract.
 *
 * Summed in `bigint` on the server. Nothing on the screen adds money —
 * the portal formats what it is given, the way the student portal does.
 */
export const meCollegeBillingSchema = z.object({
  billedMinor: moneyMinor,
  paidMinor: moneyMinor,
  outstandingMinor: moneyMinor,
  overdueMinor: moneyMinor,
  nextDue: z
    .object({ dueDate: z.string(), amountMinor: moneyMinor, contractCode: z.string() })
    .nullable(),
  contracts: z.array(meContractSchema),
});

export type MeCollegeBilling = z.infer<typeof meCollegeBillingSchema>;

/**
 * How the engagement is going, from the institution's side.
 *
 * Every figure here is either something they can act on or something they are
 * waiting on US for — and the difference is stated rather than left for them to
 * infer, because "13 requirements" reads as a backlog of theirs when in fact it
 * is a queue of ours.
 */
export const meCollegeDashboardSchema = z.object({
  studentsEnrolled: z.number().int(),
  /** Their students carrying no live batch mapping — theirs to act on. */
  studentsNotOnACohort: z.number().int(),
  batchesRunning: z.number().int(),
  sessionsThisWeek: z.number().int(),
  nextSession: batchSessionSchema.nullable(),
  /** Requirements they have raised that we have not yet answered. */
  requirementsWithUs: z.number().int(),
  /** Submissions of theirs still under review. Ours to answer. */
  submissionsWithUs: z.number().int(),
  /** Issued certificates for their students — the college's to download. */
  certificatesReady: z.number().int(),
  billing: z.object({
    billedMinor: moneyMinor,
    paidMinor: moneyMinor,
    outstandingMinor: moneyMinor,
    overdueMinor: moneyMinor,
  }),
});

export type MeCollegeDashboard = z.infer<typeof meCollegeDashboardSchema>;

/**
 * A course, as an institution may see it.
 *
 * ── Why this shape exists at all ────────────────────────────────────────
 *
 * A college has to be able to NAME the course it is asking for, so unlike a
 * trainer — who needs no catalogue, because the course name rides on every batch
 * — it genuinely needs a list. What it must not see is
 * `courses.standardMarketValueMinor`: that is the standard price we quote from,
 * and this segment's price is the negotiated contract, not that figure.
 *
 * So the money is not projected out of a wider response — this shape has no
 * field for it. A projection is one `if` away from being wrong; a type with
 * nowhere to put the number cannot carry it.
 */
export const campusCourseSchema = z.object({
  courseId: z.string(),
  courseCode: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  durationHours: z.number().int().nullable(),
  durationWeeks: z.number().int().nullable(),
  /** What a cohort must attend to earn a certificate. Theirs to plan around. */
  attendanceFloorPct: z.number().int().nullable(),
});

export type CampusCourse = z.infer<typeof campusCourseSchema>;
