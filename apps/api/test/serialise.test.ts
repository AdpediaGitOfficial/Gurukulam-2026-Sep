import { describe, expect, it } from "vitest";
import { serialise } from "../src/common/interceptors/serialise.interceptor";

describe("response serialisation", () => {
  it("renders bigint as a string, never a number", () => {
    // Number(bigint) compiles and runs, and loses precision above 2^53. A
    // string is the only lossless JSON representation.
    const big = 9_007_199_254_740_993n;
    expect(serialise({ amountMinor: big })).toEqual({ amountMinor: "9007199254740993" });
  });

  it("reaches into nested structures", () => {
    expect(
      serialise({ rows: [{ ledger: { balancePendingMinor: 3_000_000n } }] }),
    ).toEqual({ rows: [{ ledger: { balancePendingMinor: "3000000" } }] });
  });

  it("renders dates as ISO strings so clients parse one format", () => {
    expect(serialise({ at: new Date("2026-09-03T10:00:00.000Z") })).toEqual({
      at: "2026-09-03T10:00:00.000Z",
    });
  });

  it("leaves nulls and primitives alone", () => {
    expect(serialise({ a: null, b: undefined, c: 1, d: "x", e: true })).toEqual({
      a: null, b: undefined, c: 1, d: "x", e: true,
    });
  });

  it("does not rewrite class instances a handler meant to return as-is", () => {
    class Passthrough { constructor(readonly value = 1n) {} }
    const instance = new Passthrough();
    expect(serialise(instance)).toBe(instance);
  });

  it("produces output JSON.stringify accepts", () => {
    expect(() => JSON.stringify(serialise({ total: 1n, at: new Date() }))).not.toThrow();
  });
});
