import { DEFAULT_MAX_INSTRUCTION_READS, PAIR_TAPE_SIZE } from "./constants";

export const enum BffOp {
  LoopStart,
  LoopEnd,
  Plus,
  Minus,
  Copy01,
  Copy10,
  Dec0,
  Inc0,
  Dec1,
  Inc1,
  Null,
  Noop
}

const OP_KIND_BY_BYTE = buildOpKindLookup();

export interface EvalResult {
  instructionReads: number;
  activeOps: number;
  haltedByStepLimit: boolean;
}

export function getOpKind(byte: number): BffOp {
  return OP_KIND_BY_BYTE[byte & 255] as BffOp;
}

export function evaluateTape(
  tape: Uint8Array,
  maxInstructionReads = DEFAULT_MAX_INSTRUCTION_READS
): EvalResult {
  const opKindByByte = OP_KIND_BY_BYTE;
  const headMask = PAIR_TAPE_SIZE - 1;
  let pc = 0;
  let head0 = 0;
  let head1 = 0;
  let activeOps = 0;
  let instructionReads = 0;

  while (instructionReads < maxInstructionReads) {
    let op = opKindByByte[tape[pc]];
    if (op >= BffOp.Null) {
      const start = pc;
      const unreadLimit = pc + maxInstructionReads - instructionReads;
      const scanLimit = Math.min(PAIR_TAPE_SIZE, unreadLimit);
      do {
        pc += 1;
      } while (pc < scanLimit && opKindByByte[tape[pc]] >= BffOp.Null);

      instructionReads += pc - start;
      if (pc >= PAIR_TAPE_SIZE) {
        return { instructionReads, activeOps, haltedByStepLimit: false };
      }
      if (instructionReads >= maxInstructionReads) {
        return { instructionReads, activeOps, haltedByStepLimit: true };
      }
      op = opKindByByte[tape[pc]];
    }

    instructionReads += 1;
    activeOps += 1;
    switch (op) {
      case BffOp.Dec0:
        head0 = (head0 - 1) & headMask;
        break;
      case BffOp.Inc0:
        head0 = (head0 + 1) & headMask;
        break;
      case BffOp.Dec1:
        head1 = (head1 - 1) & headMask;
        break;
      case BffOp.Inc1:
        head1 = (head1 + 1) & headMask;
        break;
      case BffOp.Plus:
        tape[head0] = (tape[head0] + 1) & 255;
        break;
      case BffOp.Minus:
        tape[head0] = (tape[head0] - 1) & 255;
        break;
      case BffOp.Copy01:
        tape[head1] = tape[head0];
        break;
      case BffOp.Copy10:
        tape[head0] = tape[head1];
        break;
      case BffOp.LoopStart:
        if (opKindByByte[tape[head0]] === BffOp.Null) {
          let scanClosed = 1;
          pc += 1;
          for (; pc < PAIR_TAPE_SIZE && scanClosed > 0; pc += 1) {
            const scanned = opKindByByte[tape[pc]];
            if (scanned === BffOp.LoopEnd) {
              scanClosed -= 1;
            } else if (scanned === BffOp.LoopStart) {
              scanClosed += 1;
            }
          }
          pc -= 1;
          if (scanClosed !== 0) {
            pc = PAIR_TAPE_SIZE;
          }
        }
        break;
      case BffOp.LoopEnd:
        if (opKindByByte[tape[head0]] !== BffOp.Null) {
          let scanOpen = 1;
          pc -= 1;
          for (; pc >= 0 && scanOpen > 0; pc -= 1) {
            const scanned = opKindByByte[tape[pc]];
            if (scanned === BffOp.LoopEnd) {
              scanOpen += 1;
            } else if (scanned === BffOp.LoopStart) {
              scanOpen -= 1;
            }
          }
          pc += 1;
          if (scanOpen !== 0) {
            pc = -1;
          }
        }
        break;
    }

    if (pc < 0) {
      return { instructionReads, activeOps, haltedByStepLimit: false };
    }
    pc += 1;
    if (pc >= PAIR_TAPE_SIZE) {
      return { instructionReads, activeOps, haltedByStepLimit: false };
    }
  }

  return { instructionReads, activeOps, haltedByStepLimit: true };
}

function buildOpKindLookup(): Uint8Array {
  const lookup = new Uint8Array(256);
  lookup.fill(BffOp.Noop);
  lookup[91] = BffOp.LoopStart;
  lookup[93] = BffOp.LoopEnd;
  lookup[43] = BffOp.Plus;
  lookup[45] = BffOp.Minus;
  lookup[46] = BffOp.Copy01;
  lookup[44] = BffOp.Copy10;
  lookup[60] = BffOp.Dec0;
  lookup[62] = BffOp.Inc0;
  lookup[123] = BffOp.Dec1;
  lookup[125] = BffOp.Inc1;
  lookup[0] = BffOp.Null;
  return lookup;
}
