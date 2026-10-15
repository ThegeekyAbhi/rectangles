/**
 * Public API for read-only diagrams, for pages that show designs without the board.
 * Kept apart from `index.ts` so importing it pulls in none of the board's client
 * components: a page that shows diagrams ships no board code.
 */
export { StaticDiagram } from "./components/static-diagram";
export { diagramProblems } from "./lib/diagram-geometry";
