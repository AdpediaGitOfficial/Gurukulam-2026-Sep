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

/**
 * The same money at a glance: ₹1.31 Cr rather than ₹1,31,00,000.
 *
 * For TILE VALUES only. A headline number exists to be read in the second
 * somebody's eye crosses it, and eight digits with commas cannot be — you end
 * up counting groups to work out whether it is lakhs or crores, which is the
 * one thing the tile was meant to save you.
 *
 * Tables, ledgers, receipts and exports keep the exact figure. Nobody
 * reconciles against "1.31 Cr", and a rounded number in a column somebody adds
 * up is worse than a long one.
 *
 * Indian scales, because the audience reads in them: a crore is 10 million and
 * a lakh is 100 thousand, and "₹13.1M" would be a translation nobody asked
 * for. Integer arithmetic throughout — the scaling divides paise by a bigint
 * and formats the remainder as digits, so nothing here touches a float
 * (invariant 5 applies to display too).
 */
export function formatRupeesShort(minor: bigint, options: { symbol?: boolean } = {}): string {
  const { symbol = true } = options;
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const rupees = abs / 100n;

  const prefix = `${negative ? "-" : ""}${symbol ? "₹" : ""}`;

  /** `value` scaled by `unit`, to two significant decimals, trailing zeros cut. */
  const scaled = (unit: bigint, suffix: string): string => {
    const whole = rupees / unit;
    // Two decimal places, derived by integer division rather than by dividing
    // and rounding a float.
    const remainder = ((rupees % unit) * 100n) / unit;
    const decimals = remainder.toString().padStart(2, "0").replace(/0+$/, "");
    return `${prefix}${whole.toString()}${decimals === "" ? "" : `.${decimals}`} ${suffix}`;
  };

  if (rupees >= 10_000_000n) return scaled(10_000_000n, "Cr");
  if (rupees >= 100_000n) return scaled(100_000n, "L");
  // Below a lakh the exact number is short enough to read, so abbreviating it
  // would cost precision and buy nothing.
  return formatRupees(minor, { symbol, paise: false });
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen",
  "Eighteen", "Nineteen",
] as const;
const TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
] as const;

/** 0–99 in words. Anything larger is composed from the scales below. */
function underHundred(value: bigint): string {
  if (value < 20n) return ONES[Number(value)] ?? "";
  const tens = TENS[Number(value / 10n)] ?? "";
  const ones = ONES[Number(value % 10n)] ?? "";
  return ones === "" ? tens : `${tens} ${ones}`;
}

/** The Indian scales, largest first. Crore repeats for anything above 10^9. */
const SCALES = [
  { value: 10_000_000n, name: "Crore" },
  { value: 100_000n, name: "Lakh" },
  { value: 1_000n, name: "Thousand" },
  { value: 100n, name: "Hundred" },
] as const;

function wholeInWords(value: bigint): string {
  if (value === 0n) return "Zero";
  const parts: string[] = [];
  let left = value;
  for (const scale of SCALES) {
    if (left >= scale.value) {
      const count = left / scale.value;
      left %= scale.value;
      // Crore is the largest scale there is, so a hundred crore reads
      // "One Hundred Crore" — the count recurses rather than inventing a name.
      parts.push(`${scale.name === "Crore" ? wholeInWords(count) : underHundred(count)} ${scale.name}`);
    }
  }
  if (left > 0n) parts.push(underHundred(left));
  return parts.join(" ");
}

/**
 * Paise → the amount in words, as a receipt in India is expected to carry it.
 *
 * "Rupees Forty Five Thousand Eight Hundred Thirty Three and Fifty Paise only".
 *
 * A receipt states the amount twice on purpose: figures can be altered after
 * issue with a pen, and words cannot. Integer arithmetic throughout, same rule
 * as everywhere else money is touched.
 */
export function rupeesInWords(minor: bigint): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const whole = abs / 100n;
  const paise = abs % 100n;

  const body = paise === 0n
    ? `Rupees ${wholeInWords(whole)}`
    : `Rupees ${wholeInWords(whole)} and ${underHundred(paise)} Paise`;

  return `${negative ? "Minus " : ""}${body} only`;
}
