export interface CaptureChunk {
  blob: Blob;
  recordedAt: number;
}

export class RollingCaptureBuffer {
  private headerChunk: CaptureChunk | null = null;
  private chunks: CaptureChunk[] = [];

  add(blob: Blob, recordedAt: number): void {
    const chunk = { blob, recordedAt };
    if (!this.headerChunk) {
      this.headerChunk = chunk;
      return;
    }
    this.chunks.push(chunk);
  }

  clear(options: { preserveHeader: boolean } = { preserveHeader: false }): void {
    this.chunks = [];
    if (!options.preserveHeader) {
      this.headerChunk = null;
    }
  }

  pruneBefore(firstKeptAt: number): void {
    while (
      this.chunks.length > 0 &&
      this.chunks[0].recordedAt < firstKeptAt
    ) {
      this.chunks.shift();
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

  chunksForSave(): CaptureChunk[] {
    return this.headerChunk ? [this.headerChunk, ...this.chunks] : [...this.chunks];
  }
}
