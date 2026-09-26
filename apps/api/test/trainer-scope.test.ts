import { describe, expect, it } from "vitest";
import { TRAINER_PERMISSIONS, TRAINER_READ_ONLY, can, type Principal } from "@gurukulam/contracts";
import { trainerMayRead, trainerMayWrite } from "../src/common/scope/scope";

/**
 * The trainer axis, pinned.
 *
 * Reading and writing are deliberately different sets, and the session is
 * deliberately more precise than the batch. Both are the kind of rule that is
 * invisible until a trainer marks a register for a day they did not teach, or
 * a released trainer finds they can still write against a cohort that is no
 * longer theirs — which is why they are asserted here rather than trusted to a
 * code reading.
 */
const trainer = (id: string, permissions = TRAINER_PERMISSIONS): Principal => ({
  id,
  name: "A trainer",
  actor: "TRAINER",
  roleId: null,
  roleName: "Trainer",
  cityScope: null,
  collegeScope: null,
  trainerScope: id,
  permissions,
});

const admin: Principal = {
  id: "a1", name: "An admin", actor: "ADMIN_USER", roleId: "r1", roleName: "Ops",
  cityScope: null, collegeScope: null, trainerScope: null,
  permissions: { batches: { read: true, edit: true, delete: true } },
};

const session = (
  sessionTrainer: string | null,
  batch: { primary?: string | null; confirmed?: string[]; released?: string[] } = {},
) => ({
  trainerId: sessionTrainer,
  batch: {
    primaryTrainerId: batch.primary ?? null,
    trainerAssignments: [
      ...(batch.confirmed ?? []).map((t) => ({ trainerId: t, status: "CONFIRMED", deletedAt: null })),
      // A released assignment is soft-deleted, which is what makes the history
      // readable and the write impossible.
      ...(batch.released ?? []).map((t) => ({ trainerId: t, status: "CONFIRMED", deletedAt: new Date() })),
    ],
  },
});

describe("who may write against a session", () => {
  it("the trainer whose session it is, on a batch that is theirs", () => {
    expect(trainerMayWrite(trainer("t1"), session("t1", { primary: "t1" }))).toBe(true);
    expect(trainerMayWrite(trainer("t1"), session("t1", { confirmed: ["t1"] }))).toBe(true);
  });

  it("NOT a colleague on the same cohort — the session is more precise than the batch", () => {
    // t2 is confirmed on the batch but t1 taught this particular day. A
    // substitute for one session is a thing the schema models, and the other
    // trainer must not write the register for a day they were not in.
    expect(trainerMayWrite(trainer("t2"), session("t1", { confirmed: ["t1", "t2"] }))).toBe(false);
  });

  it("NOT a released trainer, even on a session they delivered", () => {
    // This is the half that keeps history readable and stops the writing: the
    // session still records that t1 taught it, and the assignment is gone.
    expect(trainerMayWrite(trainer("t1"), session("t1", { released: ["t1"] }))).toBe(false);
  });

  it("NOT a trainer with no relationship to the batch at all", () => {
    expect(trainerMayWrite(trainer("t3"), session("t1", { confirmed: ["t1"] }))).toBe(false);
  });

  it("NOT a session with no trainer, even on their own batch", () => {
    // An unassigned session is nobody's to write against until somebody is put
    // on it. Silently letting the batch's primary trainer take it would make
    // `trainer_id` decorative.
    expect(trainerMayWrite(trainer("t1"), session(null, { primary: "t1" }))).toBe(false);
  });

  it("an admin passes — their authority is the permission plus city scope", () => {
    expect(trainerMayWrite(admin, session("t1", { confirmed: ["t1"] }))).toBe(true);
  });
});

describe("who may read a session", () => {
  /*
   * The asymmetry, from the read side.
   *
   * These exist because the read gate used to be written as "not their session
   * AND not writable", which made READING depend on the WRITE rule: breaking
   * `trainerMayWrite` in a fault-injection run opened a foreign cohort's
   * register as well. The two rules now differ by one clause, and these pin
   * which clause.
   */
  it("keeps the history of a session they delivered after release", () => {
    const released = session("t1", { released: ["t1"] });
    expect(trainerMayRead(trainer("t1"), released)).toBe(true);
    expect(trainerMayWrite(trainer("t1"), released)).toBe(false);
  });

  it("lets a colleague on the cohort read a day they did not teach", () => {
    // Wider than the write on purpose: a substitute needs to see what the
    // cohort has covered. Writing that day's register is still not theirs.
    const theirs = session("t1", { confirmed: ["t1", "t2"] });
    expect(trainerMayRead(trainer("t2"), theirs)).toBe(true);
    expect(trainerMayWrite(trainer("t2"), theirs)).toBe(false);
  });

  it("refuses a trainer with no relationship to the batch", () => {
    expect(trainerMayRead(trainer("t3"), session("t1", { confirmed: ["t1"] }))).toBe(false);
  });

  it("refuses a batch they were only PROPOSED for — an invitation is not a cohort", () => {
    const proposed = {
      trainerId: "t1",
      batch: {
        primaryTrainerId: null,
        trainerAssignments: [{ trainerId: "t2", status: "PROPOSED", deletedAt: null }],
      },
    };
    expect(trainerMayRead(trainer("t2"), proposed)).toBe(false);
  });

  it("an admin passes, as they do on the write", () => {
    expect(trainerMayRead(admin, session("t1", { confirmed: ["t1"] }))).toBe(true);
  });
});

describe("what a trainer may touch at all", () => {
  it("has no reach into money, hiring, colleges, reports or settings", () => {
    for (const module of ["feeLedger", "hiring", "colleges", "reports", "settings"] as const) {
      expect(can(trainer("t1"), module, "read")).toBe(false);
      expect(can(trainer("t1"), module, "edit")).toBe(false);
    }
  });

  it("can never delete anything", () => {
    for (const module of Object.keys(TRAINER_PERMISSIONS)) {
      expect(TRAINER_PERMISSIONS[module]?.delete).toBe(false);
    }
  });

  it("reads certificates and cannot issue one", () => {
    expect(can(trainer("t1"), "certificates", "read")).toBe(true);
    expect(can(trainer("t1"), "certificates", "edit")).toBe(false);
  });

  it("a SUSPENDED trainer reads everything they could before and writes nothing", () => {
    const suspended = trainer("t1", TRAINER_READ_ONLY);
    // They keep their confirmed batches — pulling somebody off live delivery
    // as a side effect of a status change would strand the cohort — so they
    // must still be able to SEE the sessions they are nominally teaching.
    expect(can(suspended, "batches", "read")).toBe(true);
    expect(can(suspended, "batches", "edit")).toBe(false);
    expect(can(suspended, "trainers", "edit")).toBe(false);
  });
});
