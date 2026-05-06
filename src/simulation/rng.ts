export class XorShift32 {
  private state: number;

  constructor(seed: number) {
    this.state = normalizeSeed(seed);
  }

  getState(): number {
    return this.state >>> 0;
  }

  setState(state: number): void {
    this.state = normalizeSeed(state);
  }

  nextUint32(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = normalizeSeed(x);
    return this.state;
  }

  nextFloat(): number {
    return this.nextUint32() / 0x1_0000_0000;
  }

  nextInt(maxExclusive: number): number {
    if (maxExclusive <= 0 || !Number.isFinite(maxExclusive)) {
      throw new Error(`Invalid random bound ${maxExclusive}`);
    }
    return this.nextUint32() % maxExclusive;
  }
}

export function normalizeSeed(seed: number): number {
  const normalized = seed >>> 0;
  return normalized === 0 ? 0x9e3779b9 : normalized;
}

export function splitMix32(input: number): number {
  let z = (input + 0x9e3779b9) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  return (z ^ (z >>> 16)) >>> 0;
}
