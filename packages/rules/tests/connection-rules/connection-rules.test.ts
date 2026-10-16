import { describe, expect, it } from "vitest";
import { checkConnection } from "../../src/ports/check-connection.ts";
import { board, connection } from "../support/board.ts";

describe("blocked connections", () => {
  it("refuses a component connected to itself", () => {
    expect(checkConnection(connection("lb", "out", "lb", "in"), board())).toMatchObject({
      kind: "block",
      ruleId: "self-connection",
    });
  });

  it("refuses a second copy of an existing connection, naming both ends", () => {
    const clientToApi = connection("client", "out", "api", "in");
    const verdict = checkConnection(clientToApi, board(clientToApi));
    expect(verdict).toMatchObject({ kind: "block", ruleId: "duplicate-connection" });
    expect(verdict.kind === "block" && verdict.body).toContain("Client already sends to API server");
  });

  it("allows a second target from the same port", () => {
    const clientToApi = connection("client", "out", "api", "in");
    expect(checkConnection(connection("client", "out", "api-2", "in"), board(clientToApi)).kind).toBe("ok");
  });

  it("refuses an API server's database port wired to a load balancer", () => {
    const verdict = checkConnection(connection("api", "database", "lb", "in"), board());
    expect(verdict).toMatchObject({ kind: "block", ruleId: "query-port-to-service" });
    expect(verdict.kind === "block" && verdict.title).toBe("API server's database port only sends queries");
  });

  it("refuses a connection that closes a loop", () => {
    const existing = [connection("client", "out", "lb", "in"), connection("lb", "out", "api", "in")];
    // The API server's only out port is for queries, so close the loop through a second load balancer.
    const graph = {
      nodes: [...board().nodes, { id: "lb-2", type: "load-balancer", label: "Load balancer 2" }],
      connections: [...existing, connection("lb", "out", "lb-2", "in")],
    };
    expect(checkConnection(connection("lb-2", "out", "lb", "in"), graph)).toMatchObject({
      kind: "block",
      ruleId: "creates-cycle",
    });
  });
});

describe("discouraged connections", () => {
  it("warns about a client querying a database directly, and suggests an API server", () => {
    const verdict = checkConnection(connection("client", "out", "db", "in"), board());
    expect(verdict).toMatchObject({
      kind: "warn",
      ruleId: "direct-database-access",
      title: "Clients rarely talk to a database directly",
    });
    expect(verdict.kind === "warn" && verdict.fix).toBe("Put an API server between Client and Database.");
  });

  it("warns about a load balancer in front of a database", () => {
    const verdict = checkConnection(connection("lb", "out", "db", "in"), board());
    expect(verdict).toMatchObject({
      kind: "warn",
      ruleId: "router-to-database",
      title: "Load balancer rarely sits in front of a database",
    });
  });
});
