import { describe, expect, it } from "vitest";
import { formatRupees, formatRupeesShort, fromWire, parseRupees, rupees, toWire } from "@gurukulam/contracts";

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

/**
 * Tile-scale money.
 *
 * The cases that matter are the boundaries and the rounding, because a
 * headline number that reads ₹1.31 Cr when it is ₹1.39 Cr is worse than the
 * long form it replaced — it is confidently wrong at a glance.
 */
describe("abbreviating for a tile", () => {
  it("reads crores the way the audience does", () => {
    expect(formatRupeesShort(rupees(13_100_000))).toBe("₹1.31 Cr");
    expect(formatRupeesShort(rupees(23_230_000))).toBe("₹2.32 Cr");
  });

  it("reads lakhs", () => {
    expect(formatRupeesShort(rupees(4_840_000))).toBe("₹48.4 L");
    expect(formatRupeesShort(rupees(100_000))).toBe("₹1 L");
  });

  it("cuts trailing zeros rather than padding them", () => {
    // "₹2 Cr", not "₹2.00 Cr" — the decimals are there to carry information.
    expect(formatRupeesShort(rupees(20_000_000))).toBe("₹2 Cr");
    expect(formatRupeesShort(rupees(15_000_000))).toBe("₹1.5 Cr");
  });

  it("switches scale exactly at the boundary, not near it", () => {
    expect(formatRupeesShort(rupees(9_999_999))).toBe("₹99.99 L");
    expect(formatRupeesShort(rupees(10_000_000))).toBe("₹1 Cr");
    expect(formatRupeesShort(rupees(99_999))).toBe("₹99,999");
    expect(formatRupeesShort(rupees(100_000))).toBe("₹1 L");
  });

  it("leaves small amounts exact, because abbreviating them buys nothing", () => {
    expect(formatRupeesShort(rupees(40_000))).toBe("₹40,000");
    expect(formatRupeesShort(0n)).toBe("₹0");
  });

  it("truncates rather than rounds up, so a tile never overstates", () => {
    // 1.3199 Cr reads as 1.31, not 1.32. A headline that rounds money UP is
    // the one direction nobody forgives.
    expect(formatRupeesShort(rupees(13_199_000))).toBe("₹1.31 Cr");
  });

  it("keeps the sign", () => {
    expect(formatRupeesShort(rupees(-13_100_000))).toBe("-₹1.31 Cr");
  });

  it("drops the symbol when asked", () => {
    expect(formatRupeesShort(rupees(13_100_000), { symbol: false })).toBe("1.31 Cr");
  });
});
