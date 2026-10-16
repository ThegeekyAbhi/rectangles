import { beforeEach, describe, expect, it } from "vitest";
import type { RuleAdvice } from "@/modules/whiteboard/lib/connection-check";
import { useCanvasViewStore } from "@/modules/whiteboard/store/canvas-view-store";
import { useConnectionAdviceStore } from "@/modules/whiteboard/store/connection-advice-store";

const warning: RuleAdvice = { kind: "warn", ruleId: "direct-database-access", title: "Warned", body: "" };

beforeEach(() => {
  useConnectionAdviceStore.setState({ advice: null });
  useCanvasViewStore.setState({ mutedConnectionRules: [] });
});

describe("connection advice", () => {
  it("shows advice and closes it", () => {
    useConnectionAdviceStore.getState().show(warning);
    expect(useConnectionAdviceStore.getState().advice).toBe(warning);
    useConnectionAdviceStore.getState().close();
    expect(useConnectionAdviceStore.getState().advice).toBeNull();
  });

  it("closes and remembers the rule when muted", () => {
    useConnectionAdviceStore.getState().show(warning);
    useConnectionAdviceStore.getState().muteAndClose();
    expect(useConnectionAdviceStore.getState().advice).toBeNull();
    expect(useCanvasViewStore.getState().mutedConnectionRules).toEqual(["direct-database-access"]);
  });

  it("mutes a rule only once", () => {
    useCanvasViewStore.getState().muteConnectionRule("direct-database-access");
    useCanvasViewStore.getState().muteConnectionRule("direct-database-access");
    expect(useCanvasViewStore.getState().mutedConnectionRules).toEqual(["direct-database-access"]);
  });
});
