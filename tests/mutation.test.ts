import { describe, expect, it } from "vitest";
import {
  mutateBytes,
  mutateBytesWithCachedRate,
  mutationLogKeep
} from "../src/simulation/mutation";
import { XorShift32 } from "../src/simulation/rng";

describe("mutation helper", () => {
  it("leaves bytes unchanged when the rate is zero", () => {
    const bytes = Uint8Array.from([1, 2, 3, 4, 5]);

    mutateBytes(bytes, 1, 3, 0, new XorShift32(1));

    expect(Array.from(bytes)).toEqual([1, 2, 3, 4, 5]);
  });

  it("mutates only the requested range", () => {
    const bytes = Uint8Array.from([10, 20, 30, 40, 50, 60]);

    mutateBytes(bytes, 2, 3, 1, new XorShift32(123));

    expect(bytes[0]).toBe(10);
    expect(bytes[1]).toBe(20);
    expect(bytes[5]).toBe(60);
    expect(Array.from(bytes.slice(2, 5))).not.toEqual([30, 40, 50]);
  });

  it("is deterministic for the same seed and range", () => {
    const a = new Uint8Array(32);
    const b = new Uint8Array(32);

    mutateBytes(a, 4, 20, 0.2, new XorShift32(7));
    mutateBytes(b, 4, 20, 0.2, new XorShift32(7));

    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("matches the uncached skip-sampling formula with cached rate math", () => {
    const actual = new Uint8Array(256);
    const expected = new Uint8Array(256);
    for (let i = 0; i < actual.length; i += 1) {
      actual[i] = i & 255;
      expected[i] = i & 255;
    }

    mutateBytesWithCachedRate(
      actual,
      19,
      173,
      0.007,
      mutationLogKeep(0.007),
      new XorShift32(91)
    );
    referenceMutateBytes(expected, 19, 173, 0.007, new XorShift32(91));

    expect(Array.from(actual)).toEqual(Array.from(expected));
  });
});

function referenceMutateBytes(
  bytes: Uint8Array,
  start: number,
  length: number,
  mutationRate: number,
  rng: XorShift32
): void {
  const logKeep = Math.log1p(-mutationRate);
  let position = -1;
  for (;;) {
    const u = (rng.nextUint32() + 1) / 0x1_0000_0001;
    const gap = Math.floor(Math.log(u) / logKeep);
    position += gap + 1;
    if (position >= length) {
      break;
    }
    bytes[start + position] = rng.nextUint32() & 255;
  }
}
