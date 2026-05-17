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

export interface EvalScratch {
  forwardJump: Int16Array;
  backwardJump: Int16Array;
  forwardVersion: Int32Array;
  backwardVersion: Int32Array;
}

export function getOpKind(byte: number): BffOp {
  return OP_KIND_BY_BYTE[byte & 255] as BffOp;
}

export function createEvalScratch(): EvalScratch {
  return {
    forwardJump: new Int16Array(PAIR_TAPE_SIZE),
    backwardJump: new Int16Array(PAIR_TAPE_SIZE),
    forwardVersion: new Int32Array(PAIR_TAPE_SIZE),
    backwardVersion: new Int32Array(PAIR_TAPE_SIZE)
  };
}

export function evaluateTape(
  tape: Uint8Array,
  maxInstructionReads = DEFAULT_MAX_INSTRUCTION_READS,
  scratch?: EvalScratch
): EvalResult {
  const opKindByByte = OP_KIND_BY_BYTE;
  const headMask = PAIR_TAPE_SIZE - 1;
  let pc = 0;
  let head0 = 0;
  let head1 = 0;
  let activeOps = 0;
  let instructionReads = 0;
  let bracketVersion = 1;

  if (scratch) {
    scratch.forwardVersion.fill(0);
    scratch.backwardVersion.fill(0);
  }

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
        bracketVersion += writeByte(
          tape,
          head0,
          (tape[head0] + 1) & 255,
          opKindByByte
        );
        break;
      case BffOp.Minus:
        bracketVersion += writeByte(
          tape,
          head0,
          (tape[head0] - 1) & 255,
          opKindByByte
        );
        break;
      case BffOp.Copy01:
        bracketVersion += writeByte(tape, head1, tape[head0], opKindByByte);
        break;
      case BffOp.Copy10:
        bracketVersion += writeByte(tape, head0, tape[head1], opKindByByte);
        break;
      case BffOp.LoopStart:
        if (opKindByByte[tape[head0]] === BffOp.Null) {
          pc = findForwardJump(tape, pc, opKindByByte, scratch, bracketVersion);
        }
        break;
      case BffOp.LoopEnd:
        if (opKindByByte[tape[head0]] !== BffOp.Null) {
          const loopEnd = pc;
          pc = findBackwardJump(tape, pc, opKindByByte, scratch, bracketVersion);
          if (
            pc >= 0 &&
            isSideEffectFreeLoopBody(tape, pc + 1, loopEnd, opKindByByte)
          ) {
            const cycleReads = loopEnd - pc;
            const remainingReads = maxInstructionReads - instructionReads;
            const fullCycles = Math.floor(remainingReads / cycleReads);
            instructionReads += fullCycles * cycleReads;
            activeOps += fullCycles;
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

function writeByte(
  tape: Uint8Array,
  index: number,
  value: number,
  opKindByByte: Uint8Array
): number {
  const before = tape[index];
  const next = value & 255;
  if (before === next) {
    return 0;
  }
  tape[index] = next;
  return isBracketOp(opKindByByte[before]) || isBracketOp(opKindByByte[next])
    ? 1
    : 0;
}

function findForwardJump(
  tape: Uint8Array,
  pc: number,
  opKindByByte: Uint8Array,
  scratch: EvalScratch | undefined,
  bracketVersion: number
): number {
  if (scratch && scratch.forwardVersion[pc] === bracketVersion) {
    return scratch.forwardJump[pc];
  }

  const start = pc;
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

  const jump = scanClosed === 0 ? pc - 1 : PAIR_TAPE_SIZE;
  if (scratch) {
    scratch.forwardJump[start] = jump;
    scratch.forwardVersion[start] = bracketVersion;
    if (jump >= 0 && jump < PAIR_TAPE_SIZE) {
      scratch.backwardJump[jump] = start;
      scratch.backwardVersion[jump] = bracketVersion;
    }
  }
  return jump;
}

function findBackwardJump(
  tape: Uint8Array,
  pc: number,
  opKindByByte: Uint8Array,
  scratch: EvalScratch | undefined,
  bracketVersion: number
): number {
  if (scratch && scratch.backwardVersion[pc] === bracketVersion) {
    return scratch.backwardJump[pc];
  }

  const start = pc;
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

  const jump = scanOpen === 0 ? pc + 1 : -1;
  if (scratch) {
    scratch.backwardJump[start] = jump;
    scratch.backwardVersion[start] = bracketVersion;
    if (jump >= 0 && jump < PAIR_TAPE_SIZE) {
      scratch.forwardJump[jump] = start;
      scratch.forwardVersion[jump] = bracketVersion;
    }
  }
  return jump;
}

function isBracketOp(op: number): boolean {
  return op === BffOp.LoopStart || op === BffOp.LoopEnd;
}

function isSideEffectFreeLoopBody(
  tape: Uint8Array,
  start: number,
  end: number,
  opKindByByte: Uint8Array
): boolean {
  for (let index = start; index < end; index += 1) {
    if (opKindByByte[tape[index]] < BffOp.Null) {
      return false;
    }
  }
  return true;
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
