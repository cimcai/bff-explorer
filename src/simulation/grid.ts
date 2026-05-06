import type { XorShift32 } from "./rng";

const MAX_RADIUS2_NEIGHBORS = 24;

export interface NeighborTable {
  neighbors: Uint32Array;
  counts: Uint8Array;
  stride: number;
}

export function buildRadius2Neighbors(
  gridWidth: number,
  gridHeight: number
): Uint32Array[] {
  const neighbors: Uint32Array[] = [];
  for (let y = 0; y < gridHeight; y += 1) {
    for (let x = 0; x < gridWidth; x += 1) {
      const local: number[] = [];
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          if (dx === 0 && dy === 0) {
            continue;
          }
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < gridWidth && ny < gridHeight) {
            local.push(ny * gridWidth + nx);
          }
        }
      }
      neighbors.push(new Uint32Array(local));
    }
  }
  return neighbors;
}

export function buildRadius2NeighborTable(
  gridWidth: number,
  gridHeight: number
): NeighborTable {
  const programCount = gridWidth * gridHeight;
  const neighbors = new Uint32Array(programCount * MAX_RADIUS2_NEIGHBORS);
  const counts = new Uint8Array(programCount);

  for (let y = 0; y < gridHeight; y += 1) {
    for (let x = 0; x < gridWidth; x += 1) {
      const program = y * gridWidth + x;
      const offset = program * MAX_RADIUS2_NEIGHBORS;
      let count = 0;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          if (dx === 0 && dy === 0) {
            continue;
          }
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < gridWidth && ny < gridHeight) {
            neighbors[offset + count] = ny * gridWidth + nx;
            count += 1;
          }
        }
      }
      counts[program] = count;
    }
  }

  return { neighbors, counts, stride: MAX_RADIUS2_NEIGHBORS };
}

export function initializeOrder(order: Uint32Array): void {
  for (let i = 0; i < order.length; i += 1) {
    order[i] = i;
  }
}

export function shuffleOrder(order: Uint32Array, rng: XorShift32): void {
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = rng.nextInt(i + 1);
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
}

export function selectPairsInto(
  order: Uint32Array,
  used: Uint8Array,
  neighbors: Uint32Array[],
  rng: XorShift32,
  pairsA: Uint32Array,
  pairsB: Uint32Array
): number {
  used.fill(0);
  shuffleOrder(order, rng);
  let count = 0;

  for (let i = 0; i < order.length; i += 1) {
    const program = order[i];
    if (used[program]) {
      continue;
    }
    const localNeighbors = neighbors[program];
    if (localNeighbors.length === 0) {
      continue;
    }
    const neighbor = localNeighbors[rng.nextInt(localNeighbors.length)];
    if (used[neighbor]) {
      continue;
    }
    used[program] = 1;
    used[neighbor] = 1;
    pairsA[count] = program;
    pairsB[count] = neighbor;
    count += 1;
  }

  return count;
}

export function selectPairsFromTableInto(
  order: Uint32Array,
  used: Uint8Array,
  table: NeighborTable,
  rng: XorShift32,
  pairsA: Uint32Array,
  pairsB: Uint32Array
): number {
  used.fill(0);
  shuffleOrder(order, rng);
  let count = 0;

  for (let i = 0; i < order.length; i += 1) {
    const program = order[i];
    if (used[program]) {
      continue;
    }
    const neighborCount = table.counts[program];
    if (neighborCount === 0) {
      continue;
    }
    const neighbor =
      table.neighbors[
        program * table.stride + (rng.nextUint32() % neighborCount)
      ];
    if (used[neighbor]) {
      continue;
    }
    used[program] = 1;
    used[neighbor] = 1;
    pairsA[count] = program;
    pairsB[count] = neighbor;
    count += 1;
  }

  return count;
}
