import { describe, expect, it } from "vitest";
import { certificateAccess } from "../src/modules/certificates/certificates.service";

/**
 * Invariant 7: eligibility is identical across segments; ACCESS is not.
 *
 * A retail student downloads their own certificate. A college student — who
 * earned it on exactly the same terms — does not: their institution downloads
 * it for them. That asymmetry is invisible until a college complains that its
 * students went around it, which is why it is pinned here rather than trusted
 * to a code reading.
 */
const admin = { actor: "ADMIN_USER" as const, id: "a1", collegeScope: null };
const collegeUser = { actor: "COLLEGE_USER" as const, id: "cu1", collegeScope: "college-1" };
const otherCollegeUser = { actor: "COLLEGE_USER" as const, id: "cu2", collegeScope: "college-2" };
const trainer = { actor: "TRAINER" as const, id: "t1", collegeScope: null };

const retailCert = { studentId: "s-retail", collegeId: null, enrolmentChannel: "RETAIL" as const };
const collegeCert = { studentId: "s-college", collegeId: "college-1", enrolmentChannel: "COLLEGE" as const };

describe("who may fetch a certificate", () => {
  it("an admin reaches any of them, still subject to city scope", () => {
    expect(certificateAccess(admin, retailCert)).toBe("SCOPED");
    expect(certificateAccess(admin, collegeCert)).toBe("SCOPED");
  });

  it("a college reaches its own students'", () => {
    expect(certificateAccess(collegeUser, collegeCert)).toBe("ALLOW");
  });

  it("…and no one else's", () => {
    expect(certificateAccess(otherCollegeUser, collegeCert)).toBe("DENY");
  });

  it("a college never reaches a retail student's", () => {
    // A retail student has no college, so nobody downloads on their behalf.
    expect(certificateAccess(collegeUser, retailCert)).toBe("DENY");
  });

  it("a RETAIL student fetches their own", () => {
    const self = { actor: "STUDENT" as const, id: "s-retail", collegeScope: null };
    expect(certificateAccess(self, retailCert)).toBe("ALLOW");
  });

  it("a COLLEGE student does NOT — this is the asymmetry", () => {
    const self = { actor: "STUDENT" as const, id: "s-college", collegeScope: null };
    // Same eligibility, different access. Their institution holds it.
    expect(certificateAccess(self, collegeCert)).toBe("COLLEGE_HOLDS_IT");
  });

  it("no student reaches another student's, in either segment", () => {
    const stranger = { actor: "STUDENT" as const, id: "s-someone-else", collegeScope: null };
    expect(certificateAccess(stranger, retailCert)).toBe("DENY");
    expect(certificateAccess(stranger, collegeCert)).toBe("DENY");
  });

  it("a trainer reaches none", () => {
    expect(certificateAccess(trainer, retailCert)).toBe("DENY");
    expect(certificateAccess(trainer, collegeCert)).toBe("DENY");
  });
});
