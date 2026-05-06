import { BffOp, getOpKind } from "./bff";

export function buildPalette(): Uint32Array {
  const palette = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    const op = getOpKind(i);
    switch (op) {
      case BffOp.LoopStart:
      case BffOp.LoopEnd:
        palette[i] = rgbaToU32(18, 206, 114);
        break;
      case BffOp.Plus:
      case BffOp.Minus:
      case BffOp.Copy01:
      case BffOp.Copy10:
        palette[i] = rgbaToU32(236, 72, 153);
        break;
      case BffOp.Dec0:
      case BffOp.Inc0:
      case BffOp.Dec1:
      case BffOp.Inc1:
        palette[i] = rgbaToU32(168, 85, 247);
        break;
      case BffOp.Null:
        palette[i] = rgbaToU32(239, 68, 68);
        break;
      default: {
        const cool = 38 + Math.floor(i * 0.48);
        const warm = 28 + Math.floor(i * 0.18);
        palette[i] = rgbaToU32(warm, cool, Math.min(170, cool + 30));
      }
    }
  }
  return palette;
}

export function rgbaToU32(r: number, g: number, b: number, a = 255): number {
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

export function darkenU32(color: number, amount: number): number {
  const r = Math.max(0, (color & 255) - amount);
  const g = Math.max(0, ((color >>> 8) & 255) - amount);
  const b = Math.max(0, ((color >>> 16) & 255) - amount);
  return rgbaToU32(r, g, b, 255);
}
