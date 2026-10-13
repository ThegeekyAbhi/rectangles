import type { Metadata } from "next";
import { Suspense } from "react";
import { WhiteboardSkeleton } from "@/modules/whiteboard";
import { ProjectWorkspace } from "./project-workspace";

export const metadata: Metadata = { title: "Board" };

async function Board({ params }: Pick<PageProps<"/projects/[projectId]">, "params">) {
  const { projectId } = await params;
  return <ProjectWorkspace projectId={projectId} />;
}

export default function ProjectPage({ params }: PageProps<"/projects/[projectId]">) {
  // The project id is only known at request time, so reading it must sit under Suspense.
  return (
    <Suspense fallback={<WhiteboardSkeleton />}>
      <Board params={params} />
    </Suspense>
  );
}
