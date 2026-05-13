import { describe, expect, it } from "vitest";
import { RollingCaptureBuffer } from "../src/ui/movieCapture/captureBuffer";

describe("RollingCaptureBuffer", () => {
  it("keeps the recorder header when old video chunks are pruned", async () => {
    const buffer = new RollingCaptureBuffer();
    const header = new Blob(["webm-header"]);
    const oldChunk = new Blob(["old"]);
    const keptChunk = new Blob(["kept"]);

    buffer.add(header, 0);
    buffer.add(oldChunk, 1_000);
    buffer.add(keptChunk, 40_000);
    buffer.pruneBefore(30_000);

    const saved = buffer.chunksForSave();
    expect(saved.map((chunk) => chunk.blob)).toEqual([header, keptChunk]);
    await expect(saved[0].blob.text()).resolves.toBe("webm-header");
  });

  it("can reset rolling chunks without dropping the active recorder header", () => {
    const buffer = new RollingCaptureBuffer();
    const header = new Blob(["webm-header"]);

    buffer.add(header, 0);
    buffer.add(new Blob(["old"]), 1_000);
    buffer.clear({ preserveHeader: true });
    buffer.add(new Blob(["new"]), 2_000);

    expect(buffer.chunksForSave().map((chunk) => chunk.blob)).toEqual([
      header,
      expect.any(Blob)
    ]);
  });

  it("builds a playable WebM blob from a header and normalized cluster chunks", async () => {
    const buffer = new RollingCaptureBuffer();
    const ebmlHeader = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01]);
    const partialFirstCluster = new Uint8Array([0x1f, 0x43, 0xb6, 0x75, 0x02]);
    const laterChunkMissingSplitByte = new Uint8Array([
      0x43, 0xb6, 0x75, 0x03, 0x04
    ]);

    buffer.add(new Blob([ebmlHeader, partialFirstCluster]), 0);
    buffer.add(new Blob([laterChunkMissingSplitByte]), 1_000);

    const playable = new Uint8Array(
      await (await buffer.toPlayableBlob("video/webm")).arrayBuffer()
    );

    expect([...playable]).toEqual([
      ...ebmlHeader,
      0x1f,
      ...laterChunkMissingSplitByte
    ]);
  });

  it("keeps mp4 chunks unchanged", async () => {
    const buffer = new RollingCaptureBuffer();
    buffer.add(new Blob(["one"]), 0);
    buffer.add(new Blob(["two"]), 1_000);

    await expect(buffer.toPlayableBlob("video/mp4").then((blob) => blob.text()))
      .resolves.toBe("onetwo");
  });
});
