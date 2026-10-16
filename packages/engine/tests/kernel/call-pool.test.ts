import { describe, expect, it } from "vitest";
import { CallPool, NO_CALL } from "../../src/kernel/call-pool.ts";

describe("call pool", () => {
  it("gives each live call its own slot", () => {
    const pool = new CallPool();
    const first = pool.acquire();
    const second = pool.acquire();
    expect(first.slot).not.toBe(second.slot);
    expect(pool.callAt(first.slot)).toBe(first);
    expect(pool.callAt(second.slot)).toBe(second);
  });

  it("reuses a released record instead of creating another", () => {
    const pool = new CallPool();
    const first = pool.acquire();
    first.isLive = true;
    first.parent = pool.acquire();
    pool.release(first);

    expect(first.isLive).toBe(false);
    expect(first.parent).toBeNull();
    expect(pool.acquire()).toBe(first);
  });

  it("finds no call for NO_CALL or an unknown slot", () => {
    const pool = new CallPool();
    expect(pool.callAt(NO_CALL)).toBeNull();
    expect(pool.callAt(42)).toBeNull();
  });
});
