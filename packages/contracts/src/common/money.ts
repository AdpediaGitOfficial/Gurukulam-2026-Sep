import { z } from "zod";

/**
 * Money crosses the wire as a STRING of integer minor units (paise).
 *
 * Two separate reasons, both fatal on their own:
 *   · JSON has no bigint. `JSON.stringify(1n)` throws.
 *   · JavaScript numbers lose integer precision above 2^53, and a rupee value
 *     in paise reaches that at about ₹90,07,19,925 — well inside the range a
 *     college contract can hit.
 *
 * So the wire format is a decimal string, parsed back to `bigint` at both
 * ends. Money is never a float at any layer, including display formatting
 * (invariant 5).
 */
export const moneyMinor = z
  .string()
  .regex(/^-?\d+$/, "must be a whole number of paise, as a string")
  .describe("Integer minor units (paise), as a decimal string");

export type MoneyMinor = z.infer<typeof moneyMinor>;

/** Serialises a bigint amount for a JSON payload. */
export const toWire = (amount: bigint): MoneyMinor => amount.toString();

/** Parses a wire amount back to the only type arithmetic may use. */
export function fromWire(amount: MoneyMinor): bigint {
  if (!/^-?\d+$/.test(amount)) {
    throw new TypeError(`Not a minor-unit amount: ${amount}`);
  }
  return BigInt(amount);
}

/** Rupees → paise. For fixtures and tests; user input is parsed, not built. */
export const rupees = (amount: number): bigint => BigInt(Math.round(amount * 100));

/**
 * Parses operator-typed rupees ("40000", "40,000.50") into paise WITHOUT
 * touching a float. `parseFloat("0.29") * 100` is 28.999999999999996, and
 * rounding that is how a ledger ends up a paisa short.
 */
export function parseRupees(input: string): bigint {
  const cleaned = input.replace(/[,\s₹]/g, "");
  const match = /^(-?)(\d*)(?:\.(\d{0,2})\d*)?$/.exec(cleaned);
  if (!match || (match[2] === "" && match[3] === undefined)) {
    throw new TypeError(`Not a rupee amount: ${input}`);
  }
  const [, sign, whole = "0", fraction = ""] = match;
  const paise = BigInt(whole || "0") * 100n + BigInt(fraction.padEnd(2, "0") || "0");
  return sign === "-" ? -paise : paise;
}

/**
 * Formats paise for display. Integer arithmetic throughout — the string is
 * assembled digit by digit rather than divided.
 */
export function formatRupees(
  minor: bigint,
  options: { symbol?: boolean; paise?: boolean } = {},
): string {
  const { symbol = true, paise = true } = options;
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const whole = abs / 100n;
  const fraction = abs % 100n;

  // Indian grouping: last three digits, then pairs (12,34,567).
  const digits = whole.toString();
  let grouped: string;
  if (digits.length <= 3) {
    grouped = digits;
  } else {
    const head = digits.slice(0, -3);
    const tail = digits.slice(-3);
    grouped = `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${tail}`;
  }

  const body = paise ? `${grouped}.${fraction.toString().padStart(2, "0")}` : grouped;
  return `${negative ? "-" : ""}${symbol ? "₹" : ""}${body}`;
}
