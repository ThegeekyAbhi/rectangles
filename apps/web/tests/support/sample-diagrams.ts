import type { ProjectDocument } from "@rectangles/schema";
import { parseProjectDocument } from "@rectangles/schema";
import clientAndServers from "@/content/diagrams/client-and-servers.json";
import scaledWebApp from "@/content/diagrams/scaled-web-app.json";

function load(value: unknown): ProjectDocument {
  const parsed = parseProjectDocument(value);
  if (!parsed.ok) {
    throw new Error(parsed.message);
  }
  return parsed.document;
}

/** The screenshot design: two clients, two API servers, three connections. */
export const clientAndServersDiagram = load(clientAndServers);

/** Load balancer, API tier, cache, search, queue and workers, and a replicated database. */
export const scaledWebAppDiagram = load(scaledWebApp);
