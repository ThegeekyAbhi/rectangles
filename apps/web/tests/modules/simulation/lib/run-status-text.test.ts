import { describe, expect, it } from "vitest";
import { describeDuration, describeRunEnd } from "@/modules/simulation/lib/run-status-text";
import { runToEnd } from "../../../support/run-fixtures";

describe("describeDuration", () => {
  it("names a test length in seconds or minutes", () => {
    expect(describeDuration(30)).toBe("30 seconds");
    expect(describeDuration(60)).toBe("1 minute");
    expect(describeDuration(300)).toBe("5 minutes");
  });
});

describe("describeRunEnd", () => {
  const result = runToEnd();

  it("says a run finished, and how much time it covered", () => {
    expect(describeRunEnd(result)).toBe("Finished · 4 s");
  });

  it("says where a run was stopped, and why if a limit was reached", () => {
    expect(describeRunEnd({ ...result, stopReason: null, simulatedSeconds: 1.25 })).toBe("Stopped at 1.3 s");
    expect(describeRunEnd({ ...result, stopReason: "event-limit" })).toBe(
      "Stopped at 4 s: event limit reached",
    );
  });
});
