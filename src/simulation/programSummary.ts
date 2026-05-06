import { TAPE_SIZE } from "./constants";
import { BffOp, getOpKind } from "./bff";
import { byteSequenceKey } from "./byteKey";

export interface ProgramSummary {
  id: string;
  count: number;
  fraction: number;
  activeBytes: number;
  nullBytes: number;
  byteEntropyBpb: number;
  bytes: number[];
}

interface ProgramBucket {
  count: number;
  offset: number;
}

export function computeTopPrograms(
  soup: Uint8Array,
  limit = 10
): ProgramSummary[] {
  const programCount = Math.floor(soup.length / TAPE_SIZE);
  if (programCount === 0 || limit <= 0) {
    return [];
  }

  const buckets = new Map<string, ProgramBucket>();
  for (let offset = 0; offset <= soup.length - TAPE_SIZE; offset += TAPE_SIZE) {
    const key = byteSequenceKey(soup, offset, TAPE_SIZE);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.count += 1;
    } else {
      buckets.set(key, { count: 1, offset });
    }
  }

  return [...buckets.entries()]
    .sort((a, b) => b[1].count - a[1].count || compareKeys(a[0], b[0]))
    .slice(0, limit)
    .map(([, bucket]) =>
      summarizeProgram(
        hashProgramId(soup, bucket.offset),
        soup,
        bucket.offset,
        bucket.count,
        programCount
      )
    );
}

export function programToGlyphs(bytes: readonly number[]): string {
  return bytes.map(byteToGlyph).join("");
}

function compareKeys(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function summarizeProgram(
  id: string,
  soup: Uint8Array,
  offset: number,
  count: number,
  programCount: number
): ProgramSummary {
  const byteCounts = new Uint8Array(256);
  let activeBytes = 0;
  let nullBytes = 0;
  const bytes: number[] = [];

  for (let i = 0; i < TAPE_SIZE; i += 1) {
    const byte = soup[offset + i];
    const op = getOpKind(byte);
    byteCounts[byte] += 1;
    bytes.push(byte);
    if (op < BffOp.Null) {
      activeBytes += 1;
    } else if (op === BffOp.Null) {
      nullBytes += 1;
    }
  }

  let byteEntropyBpb = 0;
  for (let i = 0; i < byteCounts.length; i += 1) {
    const byteCount = byteCounts[i];
    if (byteCount === 0) {
      continue;
    }
    const probability = byteCount / TAPE_SIZE;
    byteEntropyBpb -= probability * Math.log2(probability);
  }

  return {
    id,
    count,
    fraction: count / programCount,
    activeBytes,
    nullBytes,
    byteEntropyBpb,
    bytes
  };
}

function hashProgramId(soup: Uint8Array, offset: number): string {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let i = 0; i < TAPE_SIZE; i += 1) {
    const byte = soup[offset + i];
    a ^= byte;
    a = Math.imul(a, 0x01000193) >>> 0;
    b ^= byte + i;
    b = Math.imul(b, 0x85ebca6b) >>> 0;
  }
  return `${a.toString(16).padStart(8, "0")}${b
    .toString(16)
    .padStart(8, "0")}`;
}

function byteToGlyph(byte: number): string {
  switch (getOpKind(byte)) {
    case BffOp.LoopStart:
      return "[";
    case BffOp.LoopEnd:
      return "]";
    case BffOp.Plus:
      return "+";
    case BffOp.Minus:
      return "-";
    case BffOp.Copy01:
      return ".";
    case BffOp.Copy10:
      return ",";
    case BffOp.Dec0:
      return "<";
    case BffOp.Inc0:
      return ">";
    case BffOp.Dec1:
      return "{";
    case BffOp.Inc1:
      return "}";
    case BffOp.Null:
      return "0";
    default:
      return ".";
  }
}
