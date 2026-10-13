import type { ProjectDocument } from "@rectangles/schema";

/** What the project list needs to know about a project, without its board. */
export interface ProjectSummary {
  readonly id: string;
  readonly name: string;
  /** Milliseconds since the Unix epoch. */
  readonly createdAt: number;
  readonly updatedAt: number;
  /** Raised by one on every save; a server uses it to spot stale writes. */
  readonly revision: number;
  /** Set while the project is deleted but can still be restored. */
  readonly deletedAt: number | null;
}

export type LoadedProject =
  | { readonly status: "ready"; readonly project: ProjectSummary; readonly document: ProjectDocument }
  | { readonly status: "not-found" }
  | { readonly status: "damaged"; readonly project: ProjectSummary; readonly message: string };
