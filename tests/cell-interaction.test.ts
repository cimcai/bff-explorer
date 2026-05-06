import { describe, expect, it } from "vitest";
import { parseCellInput, encodeCellBytes } from "../src/simulation/cellEncoding";
import { evaluatePairInteraction } from "../src/simulation/interaction";
import { TAPE_SIZE } from "../src/simulation/constants";

const code = (char: string) => char.charCodeAt(0);

describe("cell input encoding", () => {
  it("parses text, null bytes, and hex escapes into a padded 64-byte cell", () => {
    const parsed = parseCellInput("+\\0\\x2d\\\\");

    expect(parsed.error).toBeNull();
    expect(parsed.decodedByteLength).toBe(4);
    expect(parsed.bytes[0]).toBe(code("+"));
    expect(parsed.bytes[1]).toBe(0);
    expect(parsed.bytes[2]).toBe(code("-"));
    expect(parsed.bytes[3]).toBe(code("\\"));
    expect(parsed.bytes[TAPE_SIZE - 1]).toBe(0);
  });

  it("reports invalid escapes without throwing", () => {
    const parsed = parseCellInput("\\xqz");

    expect(parsed.error).toContain("Hex escapes");
  });

  it("round-trips exact bytes through editable text", () => {
    const bytes = Uint8Array.from([0, code("+"), 7, code("\\"), code("A")]);
    const parsed = parseCellInput(encodeCellBytes(bytes));

    expect(Array.from(parsed.bytes.slice(0, bytes.length))).toEqual(
      Array.from(bytes)
    );
  });

  it("tracks inputs longer than one cell as truncated", () => {
    const parsed = parseCellInput("A".repeat(TAPE_SIZE + 3));

    expect(parsed.error).toBeNull();
    expect(parsed.decodedByteLength).toBe(TAPE_SIZE + 3);
    expect(parsed.truncated).toBe(true);
    expect(parsed.bytes.every((byte) => byte === code("A"))).toBe(true);
  });
});

describe("pair interaction evaluator", () => {
  it("runs the same two-cell buffer semantics as the soup without mutation", () => {
    const result = evaluatePairInteraction([code("+")], [], 1);

    expect(result.instructionReads).toBe(1);
    expect(result.activeOps).toBe(1);
    expect(result.beforeA[0]).toBe(code("+"));
    expect(result.afterA[0]).toBe(code(","));
    expect(result.changedA).toBe(1);
    expect(result.changedB).toBe(0);
    expect(result.haltedByStepLimit).toBe(true);
  });

  it("copies into the second cell when head1 is moved across the 64-byte boundary", () => {
    const cellA = new Uint8Array(TAPE_SIZE);
    cellA.fill(code("}"), 0, TAPE_SIZE);
    const cellB = Uint8Array.from([code(".")]);
    const result = evaluatePairInteraction(cellA, cellB, TAPE_SIZE + 1);

    expect(result.afterB[0]).toBe(code("}"));
    expect(result.changedB).toBe(1);
  });
});
