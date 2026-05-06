import { describe, expect, it } from "vitest";
import { TAPE_SIZE } from "../src/simulation/constants";
import {
  computeTopPrograms,
  programToGlyphs
} from "../src/simulation/programSummary";

describe("program summaries", () => {
  it("returns the most common programs with per-program stats", () => {
    const a = new Uint8Array(TAPE_SIZE).fill("A".charCodeAt(0));
    a[0] = "[".charCodeAt(0);
    a[1] = 0;
    const b = new Uint8Array(TAPE_SIZE).fill("B".charCodeAt(0));
    const soup = new Uint8Array(TAPE_SIZE * 5);
    soup.set(a, 0);
    soup.set(b, TAPE_SIZE);
    soup.set(a, TAPE_SIZE * 2);
    soup.set(a, TAPE_SIZE * 3);
    soup.set(b, TAPE_SIZE * 4);

    const [top, second] = computeTopPrograms(soup, 2);

    expect(top.count).toBe(3);
    expect(top.fraction).toBe(3 / 5);
    expect(top.activeBytes).toBe(1);
    expect(top.nullBytes).toBe(1);
    expect(top.bytes).toHaveLength(TAPE_SIZE);
    expect(second.count).toBe(2);
  });

  it("groups top programs by exact 64-byte contents", () => {
    const a = new Uint8Array(TAPE_SIZE).fill(1);
    const b = new Uint8Array(TAPE_SIZE).fill(1);
    b[TAPE_SIZE - 1] = 2;
    const soup = new Uint8Array(TAPE_SIZE * 4);
    soup.set(a, 0);
    soup.set(b, TAPE_SIZE);
    soup.set(a, TAPE_SIZE * 2);
    soup.set(b, TAPE_SIZE * 3);

    const summaries = computeTopPrograms(soup, 10);

    expect(summaries).toHaveLength(2);
    expect(summaries.map((program) => program.count)).toEqual([2, 2]);
    expect(summaries[0].bytes).not.toEqual(summaries[1].bytes);
  });


  it("renders BFF instructions and data glyphs", () => {
    const bytes = "[].,+-<>{}\0X".split("").map((char) => char.charCodeAt(0));

    expect(programToGlyphs(bytes)).toBe("[].,+-<>{}0.");
  });
});
