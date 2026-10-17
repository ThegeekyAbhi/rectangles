import { describe, expect, it } from "vitest";
import {
  defaultConfigFor,
  findConnectionFields,
  summariseConfig,
  summariseConnection,
} from "@/modules/whiteboard/lib/component-catalog";

describe("summariseConfig", () => {
  it("gives a component's key settings in one line", () => {
    expect(summariseConfig("client", defaultConfigFor("client"))).toBe("100 req/s · steady");
    expect(summariseConfig("api-server", defaultConfigFor("api-server"))).toBe("4 vCPU · 50 workers · 20 ms");
  });

  it("fills in defaults for settings a saved config lacks", () => {
    expect(summariseConfig("client", { ratePerSecond: 250 })).toBe("250 req/s · steady");
  });

  it("gives nothing for settings that are not valid", () => {
    expect(summariseConfig("api-server", { workers: 0 })).toBeNull();
  });

  it("gives nothing for a component this version does not know", () => {
    expect(summariseConfig("mainframe", {})).toBeNull();
  });
});

describe("connection settings", () => {
  it("finds the settings a port's connections carry, and none for other ports", () => {
    expect(Object.keys(findConnectionFields("load-balancer", "out"))).toEqual(["weight"]);
    expect(findConnectionFields("client", "out")).toEqual({});
    expect(findConnectionFields("mainframe", "out")).toEqual({});
  });

  it("summarises only the settings that differ from their defaults", () => {
    expect(summariseConnection("load-balancer", "out", { weight: 25 })).toBe("weight 25");
    expect(summariseConnection("load-balancer", "out", { weight: 1 })).toBeNull();
    expect(summariseConnection("client", "out", {})).toBeNull();
  });
});
