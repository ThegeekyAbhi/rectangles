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

/** The name for a duplicate: `Name copy`, then `Name copy 2`, and so on. */
export function copyName(originalName: string, takenNames: readonly string[]): string {
  return uniqueName(`${originalName} copy`, takenNames);
}
