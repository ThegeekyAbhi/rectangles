import { describe, expect, it } from "vitest";
import { copyName, nextNumberedName, uniqueName } from "@/lib/unique-name";

describe("uniqueName", () => {
  it("keeps a name that is free", () => {
    expect(uniqueName("Untitled project", ["Checkout"])).toBe("Untitled project");
  });

  it("adds the first free number to a taken name", () => {
    expect(uniqueName("Untitled project", ["Untitled project"])).toBe("Untitled project 2");
    expect(
      uniqueName("Untitled project", ["Untitled project", "Untitled project 2", "Untitled project 4"]),
    ).toBe("Untitled project 3");
  });
});

describe("copyName", () => {
  it("appends copy, then numbers further copies", () => {
    expect(copyName("Checkout", ["Checkout"])).toBe("Checkout copy");
    expect(copyName("Checkout", ["Checkout", "Checkout copy"])).toBe("Checkout copy 2");
  });
});

describe("nextNumberedName", () => {
  it("numbers the next in a series, never stacking numbers", () => {
    expect(nextNumberedName("API server", ["API server"])).toBe("API server 2");
    expect(nextNumberedName("API server 2", ["API server", "API server 2"])).toBe("API server 3");
    expect(nextNumberedName("API server", ["API server", "API server 2", "API server 3"])).toBe("API server 4");
  });
});
