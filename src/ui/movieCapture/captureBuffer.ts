export interface CaptureChunk {
  blob: Blob;
  recordedAt: number;
}

export class RollingCaptureBuffer {
  private headerChunk: CaptureChunk | null = null;
  private chunks: CaptureChunk[] = [];
  private byteSize = 0;

  add(blob: Blob, recordedAt: number): void {
    const chunk = { blob, recordedAt };
    if (!this.headerChunk) {
      this.headerChunk = chunk;
      this.byteSize += blob.size;
      return;
    }
    this.chunks.push(chunk);
    this.byteSize += blob.size;
  }

  clear(options: { preserveHeader: boolean } = { preserveHeader: false }): void {
    this.chunks = [];
    if (!options.preserveHeader) {
      this.headerChunk = null;
    }
    this.byteSize =
      options.preserveHeader && this.headerChunk ? this.headerChunk.blob.size : 0;
  }

  pruneBefore(firstKeptAt: number): void {
    while (
      this.chunks.length > 0 &&
      this.chunks[0].recordedAt < firstKeptAt
    ) {
      const removed = this.chunks.shift();
      this.byteSize -= removed?.blob.size ?? 0;
    }
  }

  pruneToMaxBytes(maxBytes: number): void {
    while (this.byteSize > maxBytes && this.chunks.length > 0) {
      const removed = this.chunks.shift();
      this.byteSize -= removed?.blob.size ?? 0;
    }
  }

  bufferedMs(): number {
    if (this.chunks.length < 2) {
      return 0;
    }
    return (
      this.chunks[this.chunks.length - 1].recordedAt -
      this.chunks[0].recordedAt
    );
  }

  durationMs(timesliceMs: number): number {
    if (this.chunks.length === 0) {
      return timesliceMs;
    }
    return Math.max(
      timesliceMs,
      this.chunks[this.chunks.length - 1].recordedAt -
        this.chunks[0].recordedAt +
        timesliceMs
    );
  }

  chunksForSave(): CaptureChunk[] {
    return this.headerChunk ? [this.headerChunk, ...this.chunks] : [...this.chunks];
  }

  totalBytes(): number {
    return this.byteSize;
  }

  async toPlayableBlob(mimeType: string): Promise<Blob> {
    if (!mimeType.includes("webm") || !this.headerChunk) {
      return new Blob(
        this.chunksForSave().map((chunk) => chunk.blob),
        { type: mimeType }
      );
    }

    const headerBytes = new Uint8Array(await this.headerChunk.blob.arrayBuffer());
    const firstClusterOffset = findByteSequence(headerBytes, CLUSTER_ID);
    const headerEnd =
      firstClusterOffset >= 0 ? firstClusterOffset : headerBytes.length;
    const parts: BlobPart[] = [bytesToArrayBuffer(headerBytes.slice(0, headerEnd))];

    for (const chunk of this.chunks) {
      const bytes = new Uint8Array(await chunk.blob.arrayBuffer());
      if (bytes.length === 0) {
        continue;
      }
      parts.push(normalizeWebmClusterStart(bytes));
    }

    if (parts.length === 1 && firstClusterOffset >= 0) {
      parts.push(bytesToArrayBuffer(headerBytes.slice(firstClusterOffset)));
    }

    return new Blob(parts, { type: mimeType });
  }
}

const CLUSTER_ID = [0x1f, 0x43, 0xb6, 0x75];
const CLUSTER_ID_WITHOUT_LEADING_BYTE = [0x43, 0xb6, 0x75];

function normalizeWebmClusterStart(bytes: Uint8Array): BlobPart {
  if (startsWith(bytes, CLUSTER_ID)) {
    return bytesToArrayBuffer(bytes);
  }
  if (startsWith(bytes, CLUSTER_ID_WITHOUT_LEADING_BYTE)) {
    return new Blob([
      bytesToArrayBuffer(new Uint8Array([CLUSTER_ID[0]])),
      bytesToArrayBuffer(bytes)
    ]);
  }
  return bytesToArrayBuffer(bytes);
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  if (bytes.length < prefix.length) {
    return false;
  }
  return prefix.every((byte, index) => bytes[index] === byte);
}

function findByteSequence(
  bytes: Uint8Array,
  needle: readonly number[]
): number {
  for (let index = 0; index <= bytes.length - needle.length; index += 1) {
    if (startsWith(bytes.subarray(index), needle)) {
      return index;
    }
  }
  return -1;
}
