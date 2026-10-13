import { describe, expect, it } from "vitest";
import { defaultConfigFor, summariseConfig } from "@/modules/whiteboard/lib/component-catalog";

describe("summariseConfig", () => {
  it("gives a component's key settings in one line", () => {
    expect(summariseConfig("client", defaultConfigFor("client"))).toBe("100 req/s · steady");
    expect(summariseConfig("api-server", defaultConfigFor("api-server"))).toBe("2 × 50 slots · 20 ms");
  });

  it("fills in defaults for settings a saved config lacks", () => {
    expect(summariseConfig("client", { ratePerSecond: 250 })).toBe("250 req/s · steady");
  });

  it("gives nothing for settings that are not valid", () => {
    expect(summariseConfig("api-server", { instances: 0 })).toBeNull();
  });

  it("gives nothing for a component this version does not know", () => {
    expect(summariseConfig("mainframe", {})).toBeNull();
  });
});
