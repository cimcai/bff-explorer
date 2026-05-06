import { evaluateTape, type EvalResult } from "./bff";
import {
  DEFAULT_MAX_INSTRUCTION_READS,
  PAIR_TAPE_SIZE,
  TAPE_SIZE
} from "./constants";

export interface PairInteractionResult extends EvalResult {
  beforeA: Uint8Array;
  beforeB: Uint8Array;
  afterA: Uint8Array;
  afterB: Uint8Array;
  changedA: number;
  changedB: number;
}

export function evaluatePairInteraction(
  cellA: ArrayLike<number>,
  cellB: ArrayLike<number>,
  maxInstructionReads = DEFAULT_MAX_INSTRUCTION_READS
): PairInteractionResult {
  const beforeA = normalizeCell(cellA);
  const beforeB = normalizeCell(cellB);
  const tape = new Uint8Array(PAIR_TAPE_SIZE);
  tape.set(beforeA, 0);
  tape.set(beforeB, TAPE_SIZE);

  const evalResult = evaluateTape(tape, maxInstructionReads);
  const afterA = tape.slice(0, TAPE_SIZE);
  const afterB = tape.slice(TAPE_SIZE, PAIR_TAPE_SIZE);

  return {
    ...evalResult,
    beforeA,
    beforeB,
    afterA,
    afterB,
    changedA: countByteChanges(beforeA, afterA),
    changedB: countByteChanges(beforeB, afterB)
  };
}

function normalizeCell(cell: ArrayLike<number>): Uint8Array {
  const normalized = new Uint8Array(TAPE_SIZE);
  const length = Math.min(TAPE_SIZE, cell.length);
  for (let i = 0; i < length; i += 1) {
    normalized[i] = cell[i] & 255;
  }
  return normalized;
}

function countByteChanges(before: Uint8Array, after: Uint8Array): number {
  let changes = 0;
  for (let i = 0; i < TAPE_SIZE; i += 1) {
    if (before[i] !== after[i]) {
      changes += 1;
    }
  }
  return changes;
}
