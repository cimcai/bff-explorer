import { TILE_SIZE } from "../simulation/constants";
import { buildPalette, darkenU32 } from "../simulation/palette";
import type { ProgramSummary } from "../simulation/programSummary";

const programPalette = buildPalette();

export function drawProgramCanvas(
  target: HTMLCanvasElement,
  program: ProgramSummary
): void {
  drawProgramBytes(target, program.bytes);
}

export function drawProgramBytes(
  target: HTMLCanvasElement,
  bytes: ArrayLike<number>
): void {
  const context = target.getContext("2d", { alpha: false });
  if (!context) {
    return;
  }
  const cellSize = target.width / TILE_SIZE;
  context.clearRect(0, 0, target.width, target.height);
  for (let y = 0; y < TILE_SIZE; y += 1) {
    for (let x = 0; x < TILE_SIZE; x += 1) {
      const color = programPalette[bytes[y * TILE_SIZE + x] ?? 0];
      const displayColor = x === 0 || y === 0 ? darkenU32(color, 28) : color;
      context.fillStyle = u32ToCss(displayColor);
      context.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    }
  }
}

export function clearCanvas(target: HTMLCanvasElement): void {
  const context = target.getContext("2d");
  context?.clearRect(0, 0, target.width, target.height);
}

export function shortProgramId(id: string): string {
  return id.slice(0, 8);
}

function u32ToCss(color: number): string {
  const red = color & 255;
  const green = (color >>> 8) & 255;
  const blue = (color >>> 16) & 255;
  return `rgb(${red} ${green} ${blue})`;
}
