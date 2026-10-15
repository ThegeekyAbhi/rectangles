import type { ProjectDocument } from "@rectangles/schema";
import { parseProjectDocument } from "@rectangles/schema";
import type { Metadata } from "next";
import clientAndServers from "@/content/diagrams/client-and-servers.json";
import scaledWebApp from "@/content/diagrams/scaled-web-app.json";
import { OpenInWhiteboardButton } from "@/modules/projects/open-in-whiteboard";
import { diagramProblems, StaticDiagram } from "@/modules/whiteboard/diagrams";

export const metadata: Metadata = { title: "Diagram preview" };

/** A diagram file that is not a valid document fails the build, so it is caught while authoring. */
function load(name: string, value: unknown): ProjectDocument {
  const parsed = parseProjectDocument(value);
  if (!parsed.ok) {
    throw new Error(`Diagram "${name}": ${parsed.message}`);
  }
  return parsed.document;
}

const DIAGRAMS = [
  { title: "Clients and API servers", document: load("client-and-servers", clientAndServers) },
  { title: "A scaled web app", document: load("scaled-web-app", scaledWebApp) },
];

/** Every lesson diagram, drawn as lessons will show it, for checking while writing them. */
export default function DiagramPreviewPage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-12 px-4 py-10">
      <h1 className="text-lg font-medium">Diagram preview</h1>
      {DIAGRAMS.map(({ title, document }) => {
        const problems = diagramProblems(document);
        return (
          <section key={title} className="flex flex-col gap-3">
            <h2 className="text-sm font-medium">{title}</h2>
            <StaticDiagram document={document} />
            <OpenInWhiteboardButton
              document={document}
              name={`Lesson: ${title}`}
              unavailableReason={problems.length === 0 ? undefined : "Can't be simulated yet. See the notes below."}
            />
            {problems.length > 0 && (
              <ul className="list-disc pl-5 text-xs text-muted-foreground">
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </main>
  );
}
