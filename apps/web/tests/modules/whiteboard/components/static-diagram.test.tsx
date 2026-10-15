import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StaticDiagram } from "@/modules/whiteboard/components/static-diagram";
import { clientAndServersDiagram, scaledWebAppDiagram } from "../../../support/sample-diagrams";

describe("StaticDiagram", () => {
  it("draws a tile, label and summary per component and a path per connection", () => {
    const document = clientAndServersDiagram;
    const { container } = render(<StaticDiagram document={document} />);

    const diagram = screen.getByRole("img", { name: /Client 2 sends to API server/ });
    expect(container.querySelectorAll("[data-slot=node-label]")).toHaveLength(4);
    expect(container.querySelectorAll("path[marker-end]")).toHaveLength(3);
    expect(screen.getByText("Client 2")).toBeInTheDocument();
    expect(diagram.getAttribute("viewBox")).toMatch(/^-?\d+ -?\d+ \d+ \d+$/);
  });

  it("draws types the engine does not simulate yet, under their type name", () => {
    const document = scaledWebAppDiagram;
    const { container } = render(<StaticDiagram document={document} />);

    expect(container.querySelectorAll("[data-slot=node-label]")).toHaveLength(12);
    expect(container.querySelectorAll("path[marker-end]")).toHaveLength(document.edges.length);
    expect(screen.getByText("Job queue").nextElementSibling).toHaveTextContent("queue");
  });
});
