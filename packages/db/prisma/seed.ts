/**
 * Seed data for local development.
 *
 * Deliberately covers BOTH acquisition segments end to end, because the
 * difference between them runs through the whole schema and a seed that only
 * exercises one hides the interesting failures:
 *
 *   Retail  — a student with NO college, their own fee ledger, a hand-authored
 *             installment schedule, and a recorded payment.
 *   College — a requirement confirmed into a dedicated batch, a trainer
 *             proposed and confirmed, the college's students on the roster with
 *             NO individual ledger, and a contract carrying the money.
 *
 * It also seeds a regional sub-admin scoped to one city, so scope filtering can
 * be tested the moment the services exist.
 */
import { randomBytes, scryptSync } from "node:crypto";
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

/** Dev-only password for every seeded account. Real hashing lands with auth. */
const DEV_PASSWORD = "Gurukulam@2026";

function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plain, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

/** Rupees → paise. Money is integer minor units everywhere (invariant 5). */
const rupees = (amount: number): bigint => BigInt(Math.round(amount * 100));

const date = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const time = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00.000Z`);

const FULL_ACCESS = { read: true, edit: true, delete: true };
const READ_EDIT = { read: true, edit: true, delete: false };
const MODULES = [
  "dashboard", "colleges", "students", "courses", "batches",
  "trainers", "feeLedger", "hiring", "reports", "settings",
];

async function main() {
  console.log("Seeding…");

  // ── Localisation ────────────────────────────────────────────────────────
  const india = await prisma.country.create({
    data: {
      countryCode: "CTRY-IN", name: "India", iso2: "IN", iso3: "IND",
      dialCode: "+91", currency: "INR", timezone: "Asia/Kolkata",
    },
  });

  const [bengaluru, hyderabad] = await Promise.all([
    prisma.city.create({
      data: { cityCode: "CITY-BLR", countryId: india.countryId, name: "Bengaluru", state: "Karnataka", timezone: "Asia/Kolkata" },
    }),
    prisma.city.create({
      data: { cityCode: "CITY-HYD", countryId: india.countryId, name: "Hyderabad", state: "Telangana", timezone: "Asia/Kolkata" },
    }),
  ]);

  // ── Roles and operators ─────────────────────────────────────────────────
  const superAdminRole = await prisma.role.create({
    data: {
      name: "Super Admin",
      description: "Unrestricted access. The only role that may edit another operator's role or scope.",
      isSystem: true,
      permissions: Object.fromEntries(MODULES.map((m) => [m, FULL_ACCESS])),
    },
  });

  const regionalRole = await prisma.role.create({
    data: {
      name: "Regional Sub-Admin",
      description: "Scoped to one or more cities. Sees only their region, on every screen including the dashboard.",
      isSystem: true,
      permissions: Object.fromEntries(MODULES.map((m) => [m, READ_EDIT])),
    },
  });

  const superAdmin = await prisma.adminUser.create({
    data: {
      roleId: superAdminRole.roleId, name: "Priya Raghavan",
      email: "priya@gurukulam.test", phone: "+919800000001",
      passwordHash: hashPassword(DEV_PASSWORD), mustReset: false,
      cityScope: [], // empty = global (null semantics carried by an empty list)
    },
  });

  // Scoped to Bengaluru only. Every query this operator makes must come back
  // filtered — the fastest way to catch a service that forgot invariant 11.
  await prisma.adminUser.create({
    data: {
      roleId: regionalRole.roleId, name: "Arun Menon",
      email: "arun@gurukulam.test", phone: "+919800000002",
      passwordHash: hashPassword(DEV_PASSWORD), mustReset: false,
      cityScope: [bengaluru.cityId],
      createdBy: superAdmin.adminUserId,
    },
  });

  const by = { createdBy: superAdmin.adminUserId };

  // ── Catalog ─────────────────────────────────────────────────────────────
  const course = await prisma.course.create({
    data: {
      ...by,
      courseCode: "CRS-DA-2026", name: "Data Analytics", shortName: "Data Analytics",
      description: "SQL, Python and visualisation for analyst roles.",
      category: "Analytics", durationHours: 120, durationWeeks: 12,
      standardMarketValueMinor: rupees(45_000),
      attendanceFloorPct: 75,
      topics: {
        create: [
          { ...by, title: "SQL foundations", sequence: 1, durationHours: 24 },
          { ...by, title: "Python for analysts", sequence: 2, durationHours: 32 },
          { ...by, title: "Statistics and inference", sequence: 3, durationHours: 28 },
          { ...by, title: "Visualisation and storytelling", sequence: 4, durationHours: 36 },
        ],
      },
    },
    include: { topics: { orderBy: { sequence: "asc" } } },
  });

  // ── Trainers, and the courses they are APPROVED for ─────────────────────
  // A batch cannot be assigned a trainer who is not approved for its course
  // (invariant 15). Approval is a relationship, not a skill-tag string match.
  const trainer = await prisma.trainer.create({
    data: {
      ...by,
      trainerCode: "TRN-0042", name: "Kavitha Iyer", email: "kavitha@gurukulam.test",
      phone: "+919800000101", qualification: "M.Sc. Statistics", experienceYears: 9,
      skillTags: ["SQL", "Python", "Power BI"], payModel: "PER_SESSION",
      payRateMinor: rupees(4_500), maxWeeklyHours: 24, cityId: bengaluru.cityId,
      passwordHash: hashPassword(DEV_PASSWORD),
      courses: { create: [{ ...by, courseId: course.courseId, approvedBy: superAdmin.adminUserId, approvedAt: new Date() }] },
    },
  });

  const secondTrainer = await prisma.trainer.create({
    data: {
      ...by,
      trainerCode: "TRN-0043", name: "Rahul Deshpande", email: "rahul@gurukulam.test",
      phone: "+919800000102", qualification: "B.Tech CSE", experienceYears: 6,
      skillTags: ["Python", "Excel"], payModel: "PER_SESSION",
      payRateMinor: rupees(3_800), maxWeeklyHours: 20, cityId: hyderabad.cityId,
      passwordHash: hashPassword(DEV_PASSWORD),
      courses: { create: [{ ...by, courseId: course.courseId, approvedBy: superAdmin.adminUserId, approvedAt: new Date() }] },
    },
  });

  await seedRetail({ course, trainer, city: bengaluru, country: india, superAdmin });
  await seedCollege({ course, trainer: secondTrainer, city: hyderabad, country: india, superAdmin });
  await seedHiring({ course, superAdmin });

  console.log("Seed complete.");
}

// ═══════════════════════════════════════════════════════════════════════════
//  Retail — no college exists anywhere in this path
// ═══════════════════════════════════════════════════════════════════════════
async function seedRetail(ctx: {
  course: { courseId: string; topics: { topicId: string; title: string }[]; standardMarketValueMinor: bigint };
  trainer: { trainerId: string };
  city: { cityId: string };
  country: { countryId: string };
  superAdmin: { adminUserId: string };
}) {
  const { course, trainer, city, country, superAdmin } = ctx;
  const by = { createdBy: superAdmin.adminUserId };

  // college_id is NULL — an open retail batch. Retail and college rosters
  // never mix (invariant 2).
  const batch = await prisma.batch.create({
    data: {
      ...by,
      batchCode: "BTC-DA-SEP-A", name: "Data Analytics — September, Cohort A",
      courseId: course.courseId, collegeId: null, cityId: city.cityId,
      primaryTrainerId: trainer.trainerId, mode: "OFFLINE",
      startDate: date("2026-09-07"), endDate: date("2026-11-30"),
      maxCapacity: 30, venue: "Gurukulam Campus, Indiranagar",
      status: "IN_PROGRESS",
      trainerAssignments: {
        create: [{
          ...by, trainerId: trainer.trainerId, status: "CONFIRMED",
          proposedBy: superAdmin.adminUserId, respondedAt: date("2026-08-20"),
        }],
      },
    },
  });

  await prisma.batchSession.createMany({
    data: course.topics.map((topic, i) => ({
      sessionCode: `SES-DA-SEP-A-${String(i + 1).padStart(2, "0")}`,
      batchId: batch.batchId, topicId: topic.topicId, trainerId: trainer.trainerId,
      title: topic.title, sequence: i + 1,
      scheduledDate: date(`2026-09-${String(7 + i * 7).padStart(2, "0")}`),
      startTime: time("10:00"), endTime: time("13:00"),
      mode: "OFFLINE" as const, venue: "Room 2",
      // Only the first is complete — assignments can be set against that one
      // and no other (invariant 17).
      status: i === 0 ? ("COMPLETED" as const) : ("SCHEDULED" as const),
      completedAt: i === 0 ? date("2026-09-07") : null,
      completedBy: i === 0 ? superAdmin.adminUserId : null,
      createdBy: superAdmin.adminUserId,
    })),
  });

  const student = await prisma.student.create({
    data: {
      ...by,
      studentCode: "STU-2026-0891", firstName: "Meera", lastName: "Nair",
      email: "meera.nair@example.test", phone: "+919812345678",
      dateOfBirth: date("2002-04-11"), gender: "Female",
      // No college. None will ever be set (invariant 1).
      collegeId: null, enrolmentChannel: "RETAIL", createdByType: "ADMIN_USER",
      countryId: country.countryId, cityId: city.cityId,
      discipline: "B.Com", passoutYear: 2024, qualification: "B.Com",
      passwordHash: hashPassword(DEV_PASSWORD), credentialsIssuedAt: new Date(),
      batchMappings: { create: [{ ...by, batchId: batch.batchId, enrolledBy: superAdmin.adminUserId }] },
    },
  });

  // Retail bills the STUDENT (invariant 3). A pitched price of ₹40,000
  // against a ₹45,000 standard value — discount_amount_minor is a GENERATED
  // column and is never written here.
  const ledger = await prisma.studentFeeLedger.create({
    data: {
      ...by,
      studentId: student.studentId, courseId: course.courseId, batchId: batch.batchId,
      courseValueMinor: course.standardMarketValueMinor,
      enrolmentValueMinor: rupees(40_000),
      advancePaidMinor: rupees(10_000),
      totalPaidMinor: rupees(10_000),
      balancePendingMinor: rupees(30_000),
      status: "PARTIALLY_PAID",
    },
  });

  // Hand-authored schedule: advance plus three installments.
  const schedule = [
    { n: 1, amount: rupees(10_000), due: date("2026-09-05"), paid: rupees(10_000), status: "PAID" as const },
    { n: 2, amount: rupees(10_000), due: date("2026-10-05"), paid: 0n, status: "PENDING" as const },
    { n: 3, amount: rupees(10_000), due: date("2026-11-05"), paid: 0n, status: "PENDING" as const },
    { n: 4, amount: rupees(10_000), due: date("2026-12-05"), paid: 0n, status: "PENDING" as const },
  ];

  for (const row of schedule) {
    const installment = await prisma.feeInstallment.create({
      data: {
        ...by,
        // Exactly one parent — the ledger. contract_id stays null (invariant 4).
        ledgerId: ledger.ledgerId, contractId: null,
        installmentNumber: row.n, amountMinor: row.amount, paidAmountMinor: row.paid,
        dueDate: row.due, status: row.status,
        paidAt: row.status === "PAID" ? row.due : null,
      },
    });

    if (row.status === "PAID") {
      await prisma.paymentTransaction.create({
        data: {
          ...by,
          transactionCode: "TXN-00981", installmentId: installment.installmentId,
          amountMinor: row.amount, paymentMode: "UPI",
          externalTransactionId: "UPI-2026090512345", // required for every mode except cash
          paidAt: row.due, bankOrHandle: "meera@okhdfcbank",
          receiptNumber: "RCP-2026-0001", recordedBy: superAdmin.adminUserId,
        },
      });
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  College — the institution is billed, and its students have no ledger
// ═══════════════════════════════════════════════════════════════════════════
async function seedCollege(ctx: {
  course: { courseId: string; topics: { topicId: string; title: string }[] };
  trainer: { trainerId: string };
  city: { cityId: string };
  country: { countryId: string };
  superAdmin: { adminUserId: string };
}) {
  const { course, trainer, city, country, superAdmin } = ctx;
  const by = { createdBy: superAdmin.adminUserId };

  const college = await prisma.college.create({
    data: {
      ...by,
      collegeCode: "CLG-SNC-01", name: "Sri Narayana College of Engineering",
      shortName: "SNC", countryId: country.countryId, cityId: city.cityId,
      addressLine1: "Survey No. 42, Gachibowli", postalCode: "500032",
      website: "https://snc.example.test", affiliation: "JNTU Hyderabad",
      disciplines: ["CSE", "ECE", "IT"],
      pocs: {
        create: [{
          ...by, name: "Dr. S. Ramakrishnan", designation: "Head, Training & Placement",
          department: "T&P Cell", email: "tpo@snc.example.test",
          phone: "+919845000111", isPrimary: true,
        }],
      },
    },
    include: { pocs: true },
  });

  // The college portal's server side exists and is testable even though its
  // UI does not.
  const collegeUser = await prisma.collegeUser.create({
    data: {
      ...by,
      collegeId: college.collegeId, pocId: college.pocs[0]!.pocId,
      name: "Dr. S. Ramakrishnan", email: "tpo@snc.example.test", phone: "+919845000111",
      passwordHash: hashPassword(DEV_PASSWORD),
      accessStatus: "GRANTED", grantedAt: new Date(),
      // A college portal user reads their OWN institution's profile, adds
      // their students, and reviews certificates. Scope narrows every one of
      // those to their college; these flags decide which modules they reach
      // at all.
      permissions: {
        colleges: { read: true, edit: false, delete: false },
        students: READ_EDIT,
        certificates: { read: true, edit: false, delete: false },
      },
    },
  });

  // A dedicated batch — college_id is SET. Created from the confirmed
  // requirement, which keeps a link back to it (invariant 14).
  const batch = await prisma.batch.create({
    data: {
      ...by,
      batchCode: "BTC-DA-SNC-01", name: "Data Analytics — SNC CSE 2026",
      courseId: course.courseId, collegeId: college.collegeId, cityId: city.cityId,
      primaryTrainerId: trainer.trainerId, mode: "OFFLINE",
      startDate: date("2026-09-14"), endDate: date("2026-12-14"),
      maxCapacity: 40, venue: "SNC Seminar Hall B", status: "SCHEDULED",
      trainerAssignments: {
        create: [{
          ...by, trainerId: trainer.trainerId, status: "CONFIRMED",
          proposedBy: superAdmin.adminUserId, respondedAt: date("2026-08-28"),
        }],
      },
    },
  });

  const requirement = await prisma.collegeRequirement.create({
    data: {
      ...by,
      requirementCode: "REQ-2026-014", collegeId: college.collegeId,
      courseId: course.courseId, expectedHeadcount: 40, preferredMode: "OFFLINE",
      preferredWindowStart: date("2026-09-01"), preferredWindowEnd: date("2026-12-31"),
      discipline: "CSE", source: "T&P Cell email",
      status: "CONFIRMED",
      confirmedBy: superAdmin.adminUserId, confirmedAt: date("2026-08-25"),
      batchId: batch.batchId,
    },
  });

  await prisma.batchSession.createMany({
    data: course.topics.map((topic, i) => ({
      sessionCode: `SES-DA-SNC-01-${String(i + 1).padStart(2, "0")}`,
      batchId: batch.batchId, topicId: topic.topicId, trainerId: trainer.trainerId,
      title: topic.title, sequence: i + 1,
      scheduledDate: date(`2026-09-${String(14 + i * 5).padStart(2, "0")}`),
      startTime: time("09:30"), endTime: time("12:30"),
      mode: "OFFLINE" as const, venue: "Seminar Hall B",
      status: "SCHEDULED" as const, createdBy: superAdmin.adminUserId,
    })),
  });

  // The college adds its own students. created_by is the COLLEGE USER — that
  // is what makes institutional intake auditable.
  const cohort = [
    { code: "STU-2026-0901", first: "Anil", last: "Kumar", email: "anil.kumar@snc.example.test" },
    { code: "STU-2026-0902", first: "Divya", last: "Reddy", email: "divya.reddy@snc.example.test" },
    { code: "STU-2026-0903", first: "Faisal", last: "Ahmed", email: "faisal.ahmed@snc.example.test" },
  ];

  for (const s of cohort) {
    await prisma.student.create({
      data: {
        studentCode: s.code, firstName: s.first, lastName: s.last, email: s.email,
        collegeId: college.collegeId, enrolmentChannel: "COLLEGE",
        createdByCollegeId: college.collegeId, createdByType: "COLLEGE_USER",
        createdBy: collegeUser.collegeUserId,
        countryId: country.countryId, cityId: city.cityId,
        discipline: "CSE", passoutYear: 2027,
        passwordHash: hashPassword(DEV_PASSWORD), credentialsIssuedAt: new Date(),
        // Credentials are issued, session access granted — but NO fee ledger.
        // The college is billed under the contract below (invariant 3).
        batchMappings: { create: [{ createdBy: collegeUser.collegeUserId, batchId: batch.batchId, enrolledBy: collegeUser.collegeUserId }] },
      },
    });
  }

  // ADR 0003 — a PER_STUDENT contract. computed_total_minor and
  // total_value_minor are GENERATED and never written.
  const contract = await prisma.collegeContract.create({
    data: {
      ...by,
      contractCode: "CON-2026-007", collegeId: college.collegeId,
      requirementId: requirement.requirementId, batchId: batch.batchId,
      courseId: course.courseId,
      commercialBasis: "PER_STUDENT",
      perStudentRateMinor: rupees(12_000),
      billableHeadcount: 40,
      headcountBasis: "REQUIREMENT", // bills on the requirement figure, not enrolment
      advanceCollectedMinor: rupees(120_000),
      totalPaidMinor: rupees(120_000),
      balancePendingMinor: rupees(360_000),
      status: "ACTIVE", signedAt: date("2026-08-26"),
    },
  });

  // Same installment engine, other parent. ledger_id stays null (invariant 4).
  // Reminders on these resolve to the COLLEGE, never to its students
  // (invariant 6).
  const contractSchedule = [
    { n: 1, amount: rupees(120_000), due: date("2026-08-26"), paid: rupees(120_000), status: "PAID" as const },
    { n: 2, amount: rupees(180_000), due: date("2026-10-15"), paid: 0n, status: "PENDING" as const },
    { n: 3, amount: rupees(180_000), due: date("2026-12-15"), paid: 0n, status: "PENDING" as const },
  ];

  for (const row of contractSchedule) {
    const installment = await prisma.feeInstallment.create({
      data: {
        ...by,
        ledgerId: null, contractId: contract.contractId,
        installmentNumber: row.n, amountMinor: row.amount, paidAmountMinor: row.paid,
        dueDate: row.due, status: row.status,
        paidAt: row.status === "PAID" ? row.due : null,
      },
    });

    if (row.status === "PAID") {
      await prisma.paymentTransaction.create({
        data: {
          ...by,
          transactionCode: "TXN-00982", installmentId: installment.installmentId,
          amountMinor: row.amount, paymentMode: "OTHER",
          externalTransactionId: "NEFT-SNC-20260826-0001",
          paidAt: row.due, bankOrHandle: "SNC Trust · HDFC 0042",
          receiptNumber: "RCP-2026-0002", recordedBy: superAdmin.adminUserId,
        },
      });
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Hiring — audience resolved at read time, never materialised
// ═══════════════════════════════════════════════════════════════════════════
async function seedHiring(ctx: {
  course: { courseId: string };
  superAdmin: { adminUserId: string };
}) {
  const { course, superAdmin } = ctx;
  const by = { createdBy: superAdmin.adminUserId };

  await prisma.jobPosting.create({
    data: {
      ...by,
      jobCode: "JOB-2026-0031", roleTitle: "Junior Data Analyst",
      companyName: "Meridian Analytics", location: "Bengaluru",
      workMode: "HYBRID", experienceMinYears: 0, experienceMaxYears: 2,
      compensationMinMinor: rupees(450_000), compensationMaxMinor: rupees(650_000),
      compensationPeriod: "ANNUAL",
      skills: ["SQL", "Python", "Power BI"],
      description: "Reporting and dashboard work for a mid-market analytics team.",
      applyUrl: "https://meridian.example.test/careers/jda-2026",
      closingDate: date("2026-10-31"),
      status: "PUBLISHED", publishedAt: new Date(), postedBy: superAdmin.adminUserId,
      source: "INTERNAL",
      // Course is the primary axis; everything else narrows it.
      audienceRules: { create: [{ ...by, courseId: course.courseId, completedOnly: false }] },
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
