import { TAPE_SIZE, TILE_SIZE } from "./constants";
import { darkenU32 } from "./palette";

export function renderSoupToImageData(
  soup: Uint8Array,
  gridWidth: number,
  gridHeight: number,
  palette: Uint32Array,
  imageData: ImageData
): void {
  const imageWidth = gridWidth * TILE_SIZE;
  const pixels = new Uint32Array(imageData.data.buffer);

  for (let cell = 0; cell < gridWidth * gridHeight; cell += 1) {
    const cellX = cell % gridWidth;
    const cellY = Math.floor(cell / gridWidth);
    const tapeOffset = cell * TAPE_SIZE;
    const pixelX = cellX * TILE_SIZE;
    const pixelY = cellY * TILE_SIZE;

    for (let ty = 0; ty < TILE_SIZE; ty += 1) {
      let pixelOffset = (pixelY + ty) * imageWidth + pixelX;
      const byteOffset = tapeOffset + ty * TILE_SIZE;
      for (let tx = 0; tx < TILE_SIZE; tx += 1) {
        const color = palette[soup[byteOffset + tx]];
        pixels[pixelOffset + tx] =
          tx === 0 || ty === 0 ? darkenU32(color, 28) : color;
      }
    }
  }
}
