/**
 * Returns `baseName`, or `baseName 2`, `baseName 3`… — the first that is not taken.
 */
export function uniqueName(baseName: string, takenNames: readonly string[]): string {
  const taken = new Set(takenNames);
  if (!taken.has(baseName)) {
    return baseName;
  }
  for (let suffix = 2; ; suffix++) {
    const candidate = `${baseName} ${suffix}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
}

/**
 * The next numbered name in a series: `API server 2` after `API server`, and `API server 3`
 * after `API server 2`, never `API server 2 2`.
 */
export function nextNumberedName(name: string, takenNames: readonly string[]): string {
  const base = name.replace(/ \d+$/, "");
  const taken = new Set(takenNames);
  for (let suffix = 2; ; suffix++) {
    const candidate = `${base} ${suffix}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
}

/** The name for a duplicate: `Name copy`, then `Name copy 2`, and so on. */
export function copyName(originalName: string, takenNames: readonly string[]): string {
  return uniqueName(`${originalName} copy`, takenNames);
}
