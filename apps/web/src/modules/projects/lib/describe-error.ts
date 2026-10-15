/** A failure's message, fit for a toast. */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
