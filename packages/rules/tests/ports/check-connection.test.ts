import { describe, expect, it } from "vitest";
import { checkConnection, checkExistingConnection, isConnectable } from "../../src/ports/check-connection.ts";
import type { ConnectionRule } from "../../src/types.ts";
import { board, connection } from "../support/board.ts";

describe("checkConnection", () => {
  it("allows the usual shape silently", () => {
    expect(checkConnection(connection("client", "out", "lb", "in"), board()).kind).toBe("ok");
    expect(checkConnection(connection("lb", "out", "api", "in"), board()).kind).toBe("ok");
    expect(checkConnection(connection("api", "database", "db", "in"), board()).kind).toBe("ok");
  });

  it("refuses without a message anything that is not a connection", () => {
    expect(checkConnection(connection("ghost", "out", "api", "in"), board())).toEqual({ kind: "invalid" });
    expect(checkConnection(connection("client", "exit", "api", "in"), board())).toEqual({ kind: "invalid" });
    // From an in port, or into an out port.
    expect(checkConnection(connection("api", "in", "api-2", "in"), board())).toEqual({ kind: "invalid" });
    expect(checkConnection(connection("client", "out", "lb", "out"), board())).toEqual({ kind: "invalid" });
  });

  it("lets a block win over a warning, whatever the order", () => {
    const warn: ConnectionRule = { id: "w", severity: "warn", applies: () => true, copy: () => ({ title: "w", body: "" }) };
    const block: ConnectionRule = { id: "b", severity: "block", applies: () => true, copy: () => ({ title: "b", body: "" }) };
    const verdict = checkConnection(connection("client", "out", "api", "in"), board(), [warn, block]);
    expect(verdict).toMatchObject({ kind: "block", ruleId: "b" });
  });

  it("reports the first applicable rule of a severity", () => {
    const first: ConnectionRule = { id: "first", severity: "warn", applies: () => true, copy: () => ({ title: "", body: "" }) };
    const second: ConnectionRule = { ...first, id: "second" };
    const verdict = checkConnection(connection("client", "out", "api", "in"), board(), [first, second]);
    expect(verdict).toMatchObject({ kind: "warn", ruleId: "first" });
  });

  it("connects on ok and warn, never on block or invalid", () => {
    expect(isConnectable({ kind: "ok" })).toBe(true);
    expect(isConnectable({ kind: "warn", ruleId: "r", title: "", body: "" })).toBe(true);
    expect(isConnectable({ kind: "block", ruleId: "r", title: "", body: "" })).toBe(false);
    expect(isConnectable({ kind: "invalid" })).toBe(false);
  });
});

describe("checkExistingConnection", () => {
  it("finds nothing to judge at an index past the end", () => {
    expect(checkExistingConnection(board(), 0)).toEqual({ kind: "invalid" });
  });

  it("judges a connection on the board without counting it as its own duplicate", () => {
    expect(checkExistingConnection(board(connection("client", "out", "api", "in")), 0).kind).toBe("ok");
  });

  it("still warns about a discouraged connection already on the board", () => {
    expect(checkExistingConnection(board(connection("client", "out", "db", "in")), 0)).toMatchObject({
      kind: "warn",
      ruleId: "direct-database-access",
    });
  });
});
