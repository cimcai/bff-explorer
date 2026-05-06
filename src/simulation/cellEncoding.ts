import { TAPE_SIZE } from "./constants";

const HEX_BYTE = /^[0-9a-fA-F]{2}$/;

export interface ParsedCellInput {
  bytes: Uint8Array;
  decodedByteLength: number;
  truncated: boolean;
  error: string | null;
}

export function parseCellInput(input: string): ParsedCellInput {
  const bytes = new Uint8Array(TAPE_SIZE);
  let decodedByteLength = 0;
  let cursor = 0;

  while (cursor < input.length) {
    const parsed = parseNextByte(input, cursor);
    if (parsed.error) {
      return {
        bytes,
        decodedByteLength,
        truncated: decodedByteLength > TAPE_SIZE,
        error: parsed.error
      };
    }

    if (decodedByteLength < TAPE_SIZE) {
      bytes[decodedByteLength] = parsed.byte;
    }
    decodedByteLength += 1;
    cursor = parsed.nextCursor;
  }

  return {
    bytes,
    decodedByteLength,
    truncated: decodedByteLength > TAPE_SIZE,
    error: null
  };
}

export function encodeCellBytes(bytes: ArrayLike<number>): string {
  const encoded: string[] = [];
  const length = Math.min(TAPE_SIZE, bytes.length);

  for (let i = 0; i < length; i += 1) {
    encoded.push(encodeByte(bytes[i] & 255));
  }

  return encoded.join("");
}

interface ParsedByte {
  byte: number;
  nextCursor: number;
  error: string | null;
}

function parseNextByte(input: string, cursor: number): ParsedByte {
  const char = input[cursor];
  if (char !== "\\") {
    return {
      byte: input.charCodeAt(cursor) & 255,
      nextCursor: cursor + 1,
      error: null
    };
  }

  const escaped = input[cursor + 1];
  if (escaped === undefined) {
    return {
      byte: 0,
      nextCursor: cursor + 1,
      error: "Dangling backslash escape at the end of the cell input."
    };
  }

  if (escaped === "0") {
    return { byte: 0, nextCursor: cursor + 2, error: null };
  }
  if (escaped === "n") {
    return { byte: 10, nextCursor: cursor + 2, error: null };
  }
  if (escaped === "r") {
    return { byte: 13, nextCursor: cursor + 2, error: null };
  }
  if (escaped === "t") {
    return { byte: 9, nextCursor: cursor + 2, error: null };
  }
  if (escaped === "\\") {
    return { byte: 92, nextCursor: cursor + 2, error: null };
  }
  if (escaped === "x") {
    const hex = input.slice(cursor + 2, cursor + 4);
    if (!HEX_BYTE.test(hex)) {
      return {
        byte: 0,
        nextCursor: cursor + 2,
        error: "Hex escapes must use exactly two hex digits, like \\x2b."
      };
    }
    return {
      byte: Number.parseInt(hex, 16),
      nextCursor: cursor + 4,
      error: null
    };
  }

  return {
    byte: 0,
    nextCursor: cursor + 2,
    error: `Unsupported escape \\${escaped}. Use \\0, \\xNN, \\n, \\r, \\t, or \\\\.`
  };
}

function encodeByte(byte: number): string {
  if (byte === 0) {
    return "\\0";
  }
  if (byte === 10) {
    return "\\n";
  }
  if (byte === 13) {
    return "\\r";
  }
  if (byte === 9) {
    return "\\t";
  }
  if (byte === 92) {
    return "\\\\";
  }
  if (byte >= 32 && byte <= 126) {
    return String.fromCharCode(byte);
  }
  return `\\x${byte.toString(16).padStart(2, "0")}`;
}
