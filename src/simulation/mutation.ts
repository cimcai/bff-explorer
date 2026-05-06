import type { XorShift32 } from "./rng";

export function mutateBytes(
  bytes: Uint8Array,
  start: number,
  length: number,
  mutationRate: number,
  rng: XorShift32
): void {
  mutateBytesWithCachedRate(
    bytes,
    start,
    length,
    mutationRate,
    mutationLogKeep(mutationRate),
    rng
  );
}

export function mutationLogKeep(mutationRate: number): number {
  return mutationRate > 0 && mutationRate < 1 ? Math.log1p(-mutationRate) : 0;
}

export function mutateBytesWithCachedRate(
  bytes: Uint8Array,
  start: number,
  length: number,
  mutationRate: number,
  logKeep: number,
  rng: XorShift32
): void {
  if (mutationRate <= 0 || length <= 0) {
    return;
  }

  const end = start + length;
  if (mutationRate >= 1) {
    for (let i = start; i < end; i += 1) {
      bytes[i] = rng.nextUint32() & 255;
    }
    return;
  }

  let position = -1;
  for (;;) {
    const u = (rng.nextUint32() + 1) / 0x1_0000_0001;
    const gap = Math.floor(Math.log(u) / logKeep);
    position += gap + 1;
    if (position >= length) {
      break;
    }
    bytes[start + position] = rng.nextUint32() & 255;
  }
}
