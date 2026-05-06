import { describe, expect, it } from "vitest";
import { XorShift32, splitMix32 } from "../src/simulation/rng";

describe("deterministic randomness", () => {
  it("normalizes and advances reproducibly", () => {
    const a = new XorShift32(splitMix32(42));
    const b = new XorShift32(splitMix32(42));

    expect(Array.from({ length: 8 }, () => a.nextUint32())).toEqual(
      Array.from({ length: 8 }, () => b.nextUint32())
    );
  });

  it("can restore its state", () => {
    const rng = new XorShift32(7);
    rng.nextUint32();
    const state = rng.getState();
    const expected = rng.nextUint32();
    rng.setState(state);

    expect(rng.nextUint32()).toBe(expected);
  });
});
