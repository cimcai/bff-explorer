const BYTE_CHARS = Array.from({ length: 256 }, (_, byte) =>
  String.fromCharCode(byte)
);

export function byteSequenceKey(
  bytes: Uint8Array,
  offset: number,
  length: number
): string {
  let key = "";
  for (let i = 0; i < length; i += 1) {
    key += BYTE_CHARS[bytes[offset + i]];
  }
  return key;
}
