const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** A number short enough for a component's summary line: `100`, `2.5K`, `1M`. */
export function formatCompactNumber(value: number): string {
  return compactNumber.format(value);
}
