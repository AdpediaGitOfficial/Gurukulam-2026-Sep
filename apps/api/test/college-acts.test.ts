import { describe, expect, it } from "vitest";
import { COLLEGE_PERMISSIONS, can, type Principal } from "@gurukulam/contracts";
import { assertOursToDecide, isCollegeUser } from "../src/common/scope/scope";

/**
 * Which ACTS belong to the institution, pinned.
 *
 * `collegeScope` decides which ROWS a college user reaches, and it was right
 * everywhere. What nothing decided was which acts are theirs: every row a
 * college portal user can see is legitimately their own, so scope has nothing
 * left to say about whether they may revoke their student's certificate or
 * suspend that student's account. Driving the real API as a real college user
 * found three that answered success.
 *
 * These are unit tests over the rule rather than the routes, because the rule
 * is the thing that has to be the same in all fourteen places it is called.
 */
const collegeUser: Principal = {
  id: "cu1",
  name: "A POC",
  actor: "COLLEGE_USER",
  roleId: null,
  roleName: "College user",
  cityScope: null,
  collegeScope: "clg1",
  trainerScope: null,
  permissions: COLLEGE_PERMISSIONS,
};

const admin: Principal = {
  id: "a1", name: "An admin", actor: "ADMIN_USER", roleId: "r1", roleName: "Ops",
  cityScope: null, collegeScope: null, trainerScope: null,
  permissions: { students: { read: true, edit: true, delete: true } },
};

const regional: Principal = { ...admin, id: "a2", cityScope: ["city-1"] };

const trainer: Principal = {
  ...admin, id: "t1", actor: "TRAINER", cityScope: null, trainerScope: "t1", permissions: {},
};

describe("who is acting for one institution", () => {
  it("a college user is, by either half of the test", () => {
    expect(isCollegeUser(collegeUser)).toBe(true);
    // An API client scoped to one college is the same authorisation concept as
    // a portal user, which is why the actor alone does not decide it.
    expect(isCollegeUser({ ...admin, actor: "API_CLIENT", collegeScope: "clg1" })).toBe(true);
  });

  it("nobody else is — including a city-scoped sub-admin and a trainer", () => {
    expect(isCollegeUser(admin)).toBe(false);
    expect(isCollegeUser(regional)).toBe(false);
    expect(isCollegeUser(trainer)).toBe(false);
  });
});

describe("acts that are ours to decide", () => {
  it("refuses a college user, and says which decision is not theirs", () => {
    expect(() => assertOursToDecide(collegeUser, "revoke a certificate")).toThrowError(
      /Only Gurukulam can revoke a certificate/,
    );
  });

  it("refuses with 403 rather than 404 — the record is their own", () => {
    // `assertInScope` hides an out-of-region row behind a 404 because a 403
    // would confirm it exists. Here the college is looking at their own
    // student; pretending the row is absent would read as a bug, not a rule.
    try {
      assertOursToDecide(collegeUser, "suspend a student's account");
      throw new Error("should have refused");
    } catch (error) {
      expect((error as { status?: number }).status).toBe(403);
    }
  });

  it("is silent for an operator, a regional sub-admin and the cron", () => {
    expect(() => assertOursToDecide(admin, "issue a certificate")).not.toThrow();
    expect(() => assertOursToDecide(regional, "issue a certificate")).not.toThrow();
    expect(() => assertOursToDecide({ ...admin, actor: "SYSTEM" }, "send a reminder")).not.toThrow();
  });
});

describe("what a college portal login may touch", () => {
  it("has no reach into the operator dashboard, money, hiring, courses or settings", () => {
    for (const module of ["dashboard", "feeLedger", "hiring", "courses", "trainers", "reports", "settings"] as const) {
      expect(can(collegeUser, module, "read")).toBe(false);
    }
  });

  it("reads its own institution and cannot edit it", () => {
    expect(can(collegeUser, "colleges", "read")).toBe(true);
    expect(can(collegeUser, "colleges", "edit")).toBe(false);
  });

  it("adds its own students and never deletes one", () => {
    expect(can(collegeUser, "students", "edit")).toBe(true);
    expect(can(collegeUser, "students", "delete")).toBe(false);
  });

  it("can never delete anything at all", () => {
    for (const module of Object.keys(COLLEGE_PERMISSIONS)) {
      expect(COLLEGE_PERMISSIONS[module]?.delete).toBe(false);
    }
  });
});
