import { describe, expect, it } from "vitest";
import {
  buildRadius2NeighborTable,
  buildRadius2Neighbors,
  initializeOrder,
  selectFastPairsInto,
  selectPairsFromTableInto,
  selectPairsInto
} from "../src/simulation/grid";
import { XorShift32 } from "../src/simulation/rng";

describe("2D radius-2 grid", () => {
  it("generates exact non-wrapping neighborhood sizes", () => {
    const width = 8;
    const neighbors = buildRadius2Neighbors(width, 8);
    const table = buildRadius2NeighborTable(width, 8);

    expect(neighbors[3 * width + 3].length).toBe(24);
    expect(neighbors[0].length).toBe(8);
    expect(neighbors[2].length).toBe(14);
    expect(table.counts[3 * width + 3]).toBe(24);
    expect(table.counts[0]).toBe(8);
    expect(table.counts[2]).toBe(14);
  });

  it("selects each program at most once per epoch", () => {
    const width = 12;
    const height = 10;
    const count = width * height;
    const neighbors = buildRadius2Neighbors(width, height);
    const order = new Uint32Array(count);
    const used = new Uint8Array(count);
    const pairsA = new Uint32Array(Math.ceil(count / 2));
    const pairsB = new Uint32Array(Math.ceil(count / 2));
    initializeOrder(order);

    const pairCount = selectPairsInto(
      order,
      used,
      neighbors,
      new XorShift32(123),
      pairsA,
      pairsB
    );
    const seen = new Set<number>();

    for (let i = 0; i < pairCount; i += 1) {
      expect(seen.has(pairsA[i])).toBe(false);
      expect(seen.has(pairsB[i])).toBe(false);
      seen.add(pairsA[i]);
      seen.add(pairsB[i]);
    }
  });

  it("only selects radius-2 non-wrapping neighbors", () => {
    const width = 16;
    const height = 12;
    const count = width * height;
    const neighbors = buildRadius2Neighbors(width, height);
    const order = new Uint32Array(count);
    const used = new Uint8Array(count);
    const pairsA = new Uint32Array(Math.ceil(count / 2));
    const pairsB = new Uint32Array(Math.ceil(count / 2));
    initializeOrder(order);

    const pairCount = selectPairsInto(
      order,
      used,
      neighbors,
      new XorShift32(456),
      pairsA,
      pairsB
    );

    for (let i = 0; i < pairCount; i += 1) {
      const ax = pairsA[i] % width;
      const ay = Math.floor(pairsA[i] / width);
      const bx = pairsB[i] % width;
      const by = Math.floor(pairsB[i] / width);
      expect(Math.abs(ax - bx)).toBeLessThanOrEqual(2);
      expect(Math.abs(ay - by)).toBeLessThanOrEqual(2);
      expect(pairsA[i]).not.toBe(pairsB[i]);
    }
  });

  it("selects the same pairs from packed neighbor tables", () => {
    const width = 16;
    const height = 12;
    const count = width * height;
    const neighbors = buildRadius2Neighbors(width, height);
    const table = buildRadius2NeighborTable(width, height);
    const orderA = new Uint32Array(count);
    const orderB = new Uint32Array(count);
    const usedA = new Uint8Array(count);
    const usedB = new Uint8Array(count);
    const pairsA0 = new Uint32Array(Math.ceil(count / 2));
    const pairsB0 = new Uint32Array(Math.ceil(count / 2));
    const pairsA1 = new Uint32Array(Math.ceil(count / 2));
    const pairsB1 = new Uint32Array(Math.ceil(count / 2));
    initializeOrder(orderA);
    initializeOrder(orderB);

    const countA = selectPairsInto(
      orderA,
      usedA,
      neighbors,
      new XorShift32(789),
      pairsA0,
      pairsB0
    );
    const countB = selectPairsFromTableInto(
      orderB,
      usedB,
      table,
      new XorShift32(789),
      pairsA1,
      pairsB1
    );

    expect(countB).toBe(countA);
    expect(Array.from(pairsA1.slice(0, countB))).toEqual(
      Array.from(pairsA0.slice(0, countA))
    );
    expect(Array.from(pairsB1.slice(0, countB))).toEqual(
      Array.from(pairsB0.slice(0, countA))
    );
  });

  it("fast schedule selects non-overlapping radius-2 local pairs", () => {
    const width = 16;
    const height = 12;
    const count = width * height;
    const used = new Uint8Array(count);
    const pairsA = new Uint32Array(Math.ceil(count / 2));
    const pairsB = new Uint32Array(Math.ceil(count / 2));

    let maxPairCount = 0;
    for (let epoch = 0; epoch < 20; epoch += 1) {
      const pairCount = selectFastPairsInto(
        width,
        height,
        epoch,
        123,
        used,
        pairsA,
        pairsB
      );
      maxPairCount = Math.max(maxPairCount, pairCount);
      const seen = new Set<number>();

      for (let i = 0; i < pairCount; i += 1) {
        const a = pairsA[i];
        const b = pairsB[i];
        const ax = a % width;
        const ay = Math.floor(a / width);
        const bx = b % width;
        const by = Math.floor(b / width);
        expect(seen.has(a)).toBe(false);
        expect(seen.has(b)).toBe(false);
        expect(Math.abs(ax - bx)).toBeLessThanOrEqual(2);
        expect(Math.abs(ay - by)).toBeLessThanOrEqual(2);
        expect(a).not.toBe(b);
        seen.add(a);
        seen.add(b);
      }
    }

    expect(maxPairCount).toBeGreaterThanOrEqual(90);
  });
});
