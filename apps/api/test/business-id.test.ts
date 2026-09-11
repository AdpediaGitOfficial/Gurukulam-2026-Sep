import { describe, expect, it } from "vitest";
import {
  batchCode, certificateCode, codeInitials, collegeCode, sessionCode, studentCode, transactionCode,
} from "@gurukulam/contracts";
import { parseDuration } from "../src/modules/auth/auth.service";

/**
 * Business IDs are generated on save and never typed (architecture.md §8).
 * They are also immutable once issued, so the format has to be right the first
 * time — every session, ledger, certificate and report points at one.
 */
describe("business ID generation", () => {
  it("matches the documented examples", () => {
    expect(collegeCode("Sri Narayana College", 1)).toBe("CLG-SNC-01");
    expect(studentCode(2026, 891)).toBe("STU-2026-0891");
    expect(transactionCode(981)).toBe("TXN-00981");
    expect(certificateCode(2026, 418)).toBe("GK-CERT-2026-00418");
    expect(batchCode("Data Analytics", new Date("2026-09-07T00:00:00Z"), 0)).toBe("BTC-DA-SEP-A");
  });

  it("numbers cohorts past Z without colliding", () => {
    const start = new Date("2026-09-07T00:00:00Z");
    expect(batchCode("Data Analytics", start, 1)).toBe("BTC-DA-SEP-B");
    expect(batchCode("Data Analytics", start, 25)).toBe("BTC-DA-SEP-Z");
    expect(batchCode("Data Analytics", start, 26)).toBe("BTC-DA-SEP-AA");
  });

  it("derives session codes from their batch", () => {
    expect(sessionCode("BTC-DA-SEP-A", 1)).toBe("SES-DA-SEP-A-01");
  });

  it("pads short names rather than producing a ragged code", () => {
    expect(collegeCode("X", 3)).toBe("CLG-XXX-03");
  });
});

describe("duration parsing", () => {
  it("reads the token TTL formats", () => {
    expect(parseDuration("15m")).toBe(900_000);
    expect(parseDuration("30d")).toBe(2_592_000_000);
    expect(parseDuration("3600s")).toBe(3_600_000);
    expect(parseDuration("60")).toBe(60_000);
  });

  it("refuses a malformed duration rather than defaulting silently", () => {
    expect(() => parseDuration("forever")).toThrow();
  });
});

describe("sequence keys must match the code stem", () => {
  it("two courses sharing initials produce the same stem", () => {
    // This is the bug the batch-code collision came from: keying a counter on
    // the full name gives these two independent sequences, and then both
    // claim BTC-DA-SEP-A.
    expect(codeInitials("Data Analytics", 2)).toBe(codeInitials("Digital Assurance", 2));
    expect(codeInitials("Data Analytics", 2)).toBe("DA");
  });

  it("two colleges sharing initials do too", () => {
    expect(codeInitials("Sri Narayana College", 3)).toBe("SNC");
    expect(codeInitials("Saraswati National College", 3)).toBe("SNC");
  });

  it("the stem is what the generated code carries", () => {
    const start = new Date("2026-09-07T00:00:00Z");
    expect(batchCode("Data Analytics", start, 0)).toContain(codeInitials("Data Analytics", 2));
    expect(collegeCode("Sri Narayana College", 1)).toContain(codeInitials("Sri Narayana College", 3));
  });
});
