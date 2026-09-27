const LOCALE = "en-IN";

/** `3420` -> `"3,420"` */
export function formatCount(value: number): string {
  return new Intl.NumberFormat(LOCALE).format(value);
}

/** `88.4` -> `"88.4%"`, `94` -> `"94%"` */
export function formatPercent(value: number, fractionDigits = 0): string {
  return `${value.toFixed(fractionDigits)}%`;
}
