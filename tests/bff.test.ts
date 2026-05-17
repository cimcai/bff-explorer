import { describe, expect, it } from "vitest";
import {
  createEvalScratch,
  evaluateTape,
  type EvalResult
} from "../src/simulation/bff";
import { PAIR_TAPE_SIZE, TAPE_SIZE } from "../src/simulation/constants";
import { knownReplicatorBytes } from "../src/simulation/knownReplicator";

const code = (char: string) => char.charCodeAt(0);

describe("BFF interpreter", () => {
  it("copies between heads after mutation-like arithmetic and head movement", () => {
    const tape = new Uint8Array(PAIR_TAPE_SIZE);
    tape[0] = code("+");
    tape[1] = code("}");
    tape[2] = code(".");

    const result = evaluateTape(tape, 3);

    expect(result.instructionReads).toBe(3);
    expect(result.activeOps).toBe(3);
    expect(tape[0]).toBe(code(","));
    expect(tape[1]).toBe(code(","));
  });

  it("moves head0 before arithmetic", () => {
    const tape = new Uint8Array(PAIR_TAPE_SIZE);
    tape[0] = code(">");
    tape[1] = code("+");

    evaluateTape(tape, 2);

    expect(tape[1]).toBe(code(","));
  });

  it("skips loops when head0 points at the null byte", () => {
    const tape = new Uint8Array(PAIR_TAPE_SIZE);
    tape[0] = code("<");
    tape[1] = code("[");
    tape[2] = code("+");
    tape[3] = code("]");

    const result = evaluateTape(tape, 140);

    expect(result.haltedByStepLimit).toBe(false);
    expect(tape[127]).toBe(0);
    expect(tape[0]).toBe(code("<"));
  });

  it("loops until the instruction-read cap when the condition is non-null", () => {
    const tape = new Uint8Array(PAIR_TAPE_SIZE);
    tape[0] = code("[");
    tape[1] = code("]");

    const result = evaluateTape(tape, 10);

    expect(result.instructionReads).toBe(10);
    expect(result.haltedByStepLimit).toBe(true);
  });

  it("counts non-instruction data as no-op reads", () => {
    const tape = new Uint8Array(PAIR_TAPE_SIZE);
    tape[0] = 200;
    tape[1] = code("+");

    const result = evaluateTape(tape, 2);

    expect(result.instructionReads).toBe(2);
    expect(result.activeOps).toBe(1);
    expect(tape[0]).toBe(201);
  });

  it("counts skipped inert bytes against the instruction-read cap", () => {
    const tape = new Uint8Array(PAIR_TAPE_SIZE);
    tape.fill(200);
    tape[10] = code("+");

    const capped = evaluateTape(tape.slice(), 10);
    const uncapped = evaluateTape(tape.slice(), 11);

    expect(capped.instructionReads).toBe(10);
    expect(capped.activeOps).toBe(0);
    expect(capped.haltedByStepLimit).toBe(true);
    expect(uncapped.instructionReads).toBe(11);
    expect(uncapped.activeOps).toBe(1);
  });

  it("matches a slow reference interpreter on deterministic random tapes", () => {
    let state = 0x12345678;
    for (let sample = 0; sample < 500; sample += 1) {
      const tape = new Uint8Array(PAIR_TAPE_SIZE);
      for (let i = 0; i < tape.length; i += 1) {
        state = nextState(state);
        tape[i] = state & 255;
      }
      const optimized = tape.slice();
      const reference = tape.slice();
      const maxReads = 1 + (sample % 257);

      expect(evaluateTape(optimized, maxReads)).toEqual(
        referenceEvaluateTape(reference, maxReads)
      );
      expect(Array.from(optimized)).toEqual(Array.from(reference));
    }
  });

  it("matches the reference interpreter with reusable loop-jump scratch", () => {
    const scratch = createEvalScratch();
    let state = 0x87654321;
    for (let sample = 0; sample < 500; sample += 1) {
      const tape = new Uint8Array(PAIR_TAPE_SIZE);
      for (let i = 0; i < tape.length; i += 1) {
        state = nextState(state);
        tape[i] = state & 255;
      }
      const optimized = tape.slice();
      const reference = tape.slice();
      const maxReads = 1 + (sample % 257);

      expect(evaluateTape(optimized, maxReads, scratch)).toEqual(
        referenceEvaluateTape(reference, maxReads)
      );
      expect(Array.from(optimized)).toEqual(Array.from(reference));
    }
  });

  it("invalidates cached jumps when execution rewrites bracket bytes", () => {
    const tape = new Uint8Array(PAIR_TAPE_SIZE);
    tape[0] = code("[");
    tape[1] = code(">");
    tape[2] = code("+");
    tape[3] = code("]");
    tape[4] = code("]");
    const optimized = tape.slice();
    const reference = tape.slice();

    expect(evaluateTape(optimized, 32, createEvalScratch())).toEqual(
      referenceEvaluateTape(reference, 32)
    );
    expect(Array.from(optimized)).toEqual(Array.from(reference));
  });

  it("fast-forwards inert loop bodies without changing semantics", () => {
    const tape = new Uint8Array(PAIR_TAPE_SIZE);
    tape[0] = code("[");
    tape[1] = 200;
    tape[2] = 201;
    tape[3] = code("]");
    const optimized = tape.slice();
    const reference = tape.slice();

    expect(evaluateTape(optimized, 257, createEvalScratch())).toEqual(
      referenceEvaluateTape(reference, 257)
    );
    expect(Array.from(optimized)).toEqual(Array.from(reference));
  });

  it("runs the paper example replicator as a positive semantic control", () => {
    const tape = new Uint8Array(PAIR_TAPE_SIZE);
    const replicator = knownReplicatorBytes();
    tape.set(replicator, 0);

    const result = evaluateTape(tape, 8192);

    expect(result.haltedByStepLimit).toBe(true);
    expect(Array.from(tape.slice(TAPE_SIZE))).toEqual(Array.from(replicator));
  });
});

function nextState(state: number): number {
  let next = state;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  return next >>> 0;
}

function referenceEvaluateTape(
  tape: Uint8Array,
  maxInstructionReads: number
): EvalResult {
  let pc = 0;
  let head0 = PAIR_TAPE_SIZE;
  let head1 = PAIR_TAPE_SIZE;
  let activeOps = 0;
  let instructionReads = 0;

  for (; instructionReads < maxInstructionReads; instructionReads += 1) {
    head0 &= PAIR_TAPE_SIZE - 1;
    head1 &= PAIR_TAPE_SIZE - 1;
    const op = referenceOp(tape[pc]);
    if (op !== "null" && op !== "noop") {
      activeOps += 1;
    }

    switch (op) {
      case "<":
        head0 -= 1;
        break;
      case ">":
        head0 += 1;
        break;
      case "{":
        head1 -= 1;
        break;
      case "}":
        head1 += 1;
        break;
      case "+":
        tape[head0] = (tape[head0] + 1) & 255;
        break;
      case "-":
        tape[head0] = (tape[head0] - 1) & 255;
        break;
      case ".":
        tape[head1] = tape[head0];
        break;
      case ",":
        tape[head0] = tape[head1];
        break;
      case "[":
        if (referenceOp(tape[head0]) === "null") {
          let scanClosed = 1;
          pc += 1;
          for (; pc < PAIR_TAPE_SIZE && scanClosed > 0; pc += 1) {
            const scanned = referenceOp(tape[pc]);
            if (scanned === "]") {
              scanClosed -= 1;
            } else if (scanned === "[") {
              scanClosed += 1;
            }
          }
          pc -= 1;
          if (scanClosed !== 0) {
            pc = PAIR_TAPE_SIZE;
          }
        }
        break;
      case "]":
        if (referenceOp(tape[head0]) !== "null") {
          let scanOpen = 1;
          pc -= 1;
          for (; pc >= 0 && scanOpen > 0; pc -= 1) {
            const scanned = referenceOp(tape[pc]);
            if (scanned === "]") {
              scanOpen += 1;
            } else if (scanned === "[") {
              scanOpen -= 1;
            }
          }
          pc += 1;
          if (scanOpen !== 0) {
            pc = -1;
          }
        }
        break;
      case "null":
      case "noop":
        break;
    }

    if (pc < 0) {
      instructionReads += 1;
      return { instructionReads, activeOps, haltedByStepLimit: false };
    }
    pc += 1;
    if (pc >= PAIR_TAPE_SIZE) {
      instructionReads += 1;
      return { instructionReads, activeOps, haltedByStepLimit: false };
    }
  }

  return { instructionReads, activeOps, haltedByStepLimit: true };
}

function referenceOp(byte: number): string {
  if (byte === 0) {
    return "null";
  }
  return "[]+-.,<>{}".includes(String.fromCharCode(byte))
    ? String.fromCharCode(byte)
    : "noop";
}
