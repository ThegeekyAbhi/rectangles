import { describe, expect, it } from "vitest";
import type { Protocol } from "@rectangles/engine";
import { registry } from "@rectangles/engine";
import { compatibilityOf } from "../../src/ports/protocol-compatibility.ts";

const PROTOCOLS: readonly Protocol[] = ["sync-request", "database-query", "async-publish", "async-delivery"];

describe("protocol compatibility", () => {
  it("decides every pair of protocols", () => {
    for (const from of PROTOCOLS) {
      for (const to of PROTOCOLS) {
        expect(["compatible", "discouraged", "incompatible"]).toContain(compatibilityOf(from, to));
      }
    }
  });

  it("finds every protocol a registered component uses in the list above", () => {
    for (const { definition } of registry.values()) {
      for (const port of definition.ports) {
        expect(PROTOCOLS).toContain(port.protocol);
      }
    }
  });

  it("treats a protocol as compatible with itself only", () => {
    for (const from of PROTOCOLS) {
      for (const to of PROTOCOLS) {
        expect(compatibilityOf(from, to) === "compatible").toBe(from === to);
      }
    }
  });

  it("runs a request sent to a database, but discourages it", () => {
    expect(compatibilityOf("sync-request", "database-query")).toBe("discouraged");
    expect(compatibilityOf("database-query", "sync-request")).toBe("incompatible");
  });
});
