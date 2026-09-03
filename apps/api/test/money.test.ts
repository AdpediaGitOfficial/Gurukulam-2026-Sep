import { describe, expect, it } from "vitest";
import { formatRupees, fromWire, parseRupees, rupees, toWire } from "@gurukulam/contracts";

/**
 * Money is never a float, at any layer, including display formatting
 * (invariant 5). These are the cases where a float implementation looks fine
 * in a demo and is wrong in a ledger.
 */
describe("parsing operator input", () => {
  it("parses whole rupees", () => {
    expect(parseRupees("40000")).toBe(4_000_000n);
  });

  it("parses the grouped form an operator actually types", () => {
    expect(parseRupees("₹1,20,000.50")).toBe(12_000_050n);
  });

  it("does not lose a paisa to binary floating point", () => {
    // parseFloat("0.29") * 100 is 28.999999999999996. Rounding that is how a
    // ledger ends up one paisa short, on one row, months later.
    expect(parseRupees("0.29")).toBe(29n);
    expect(parseRupees("1.15")).toBe(115n);
    expect(parseRupees("8.13")).toBe(813n);
  });

  it("pads a single decimal place", () => {
    expect(parseRupees("10.5")).toBe(1050n);
  });

  it("refuses input that is not an amount", () => {
    expect(() => parseRupees("twelve")).toThrow();
    expect(() => parseRupees("")).toThrow();
  });
});

describe("the wire format", () => {
  it("round-trips exactly at values that break Number", () => {
    // 2^53 paise is about ₹90,07,19,925 — inside the range a large college
    // contract can reach, and the point where Number silently stops counting.
    const huge = 9_007_199_254_740_993n;
    expect(fromWire(toWire(huge))).toBe(huge);
    expect(Number(huge).toString()).not.toBe(huge.toString());
  });

  it("is a string, because JSON has no bigint", () => {
    expect(typeof toWire(1n)).toBe("string");
    expect(() => JSON.stringify({ amount: 1n })).toThrow();
    expect(JSON.stringify({ amount: toWire(1n) })).toBe('{"amount":"1"}');
  });
});

describe("display formatting", () => {
  it("groups in the Indian convention", () => {
    expect(formatRupees(rupees(1_234_567))).toBe("₹12,34,567.00");
    expect(formatRupees(rupees(999))).toBe("₹999.00");
    expect(formatRupees(rupees(1_000))).toBe("₹1,000.00");
    expect(formatRupees(rupees(100_000))).toBe("₹1,00,000.00");
  });

  it("keeps both paise digits", () => {
    expect(formatRupees(4_000_005n)).toBe("₹40,000.05");
  });

  it("handles negatives and the options", () => {
    expect(formatRupees(-4_000_000n)).toBe("-₹40,000.00");
    expect(formatRupees(4_000_000n, { symbol: false, paise: false })).toBe("40,000");
  });
});
