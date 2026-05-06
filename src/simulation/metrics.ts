import { TAPE_SIZE } from "./constants";
import { BffOp, getOpKind } from "./bff";
import { byteSequenceKey } from "./byteKey";

export interface MetricSnapshot {
  epoch: number;
  byteEntropyBpb: number;
  compressedBpb: number;
  structureScore: number;
  compressionGain: number;
  activeInstructionFraction: number;
  instructionEnrichmentScore: number;
  dominantProgramFraction: number;
  uniqueProgramFraction: number;
  phaseTransitionScore: number;
  phaseTransitionDetected: boolean;
}

interface RawMetricSnapshot {
  epoch: number;
  byteEntropyBpb: number;
  compressedBpb: number;
  structureScore: number;
  compressionGain: number;
  activeInstructionFraction: number;
  instructionEnrichmentScore: number;
  dominantProgramFraction: number;
  uniqueProgramFraction: number;
}

export function computeEmergenceMetric(
  soup: Uint8Array,
  epoch: number,
  history: readonly MetricSnapshot[]
): MetricSnapshot {
  const raw = computeRawMetric(soup, epoch);
  const baselineCount = Math.min(8, history.length);
  if (baselineCount < 8) {
    return {
      ...raw,
      phaseTransitionScore: 0,
      phaseTransitionDetected: false
    };
  }

  const baseline = history.slice(0, baselineCount);
  const baselineMean =
    baseline.reduce((sum, sample) => sum + sample.structureScore, 0) /
    baseline.length;
  const baselineVariance =
    baseline.reduce(
      (sum, sample) =>
        sum + (sample.structureScore - baselineMean) ** 2,
      0
    ) / baseline.length;
  const threshold = Math.max(0.08, Math.sqrt(baselineVariance) * 3);
  const phaseTransitionScore = raw.structureScore - baselineMean;
  const recent = history.slice(-2);
  const sustained =
    recent.length === 2 &&
    recent.every(
      (sample) => sample.structureScore - baselineMean > threshold
    );

  return {
    ...raw,
    phaseTransitionScore,
    phaseTransitionDetected: phaseTransitionScore > threshold && sustained
  };
}

export function computeRawMetric(
  soup: Uint8Array,
  epoch: number
): RawMetricSnapshot {
  const byteCounts = new Uint32Array(256);
  let activeInstructionCount = 0;
  for (let i = 0; i < soup.length; i += 1) {
    const byte = soup[i];
    byteCounts[byte] += 1;
    if (getOpKind(byte) < BffOp.Null) {
      activeInstructionCount += 1;
    }
  }

  let byteEntropyBpb = 0;
  for (let i = 0; i < byteCounts.length; i += 1) {
    const count = byteCounts[i];
    if (count === 0) {
      continue;
    }
    const probability = count / soup.length;
    byteEntropyBpb -= probability * Math.log2(probability);
  }

  const programCount = soup.length / TAPE_SIZE;
  const programCounts = new Map<string, number>();
  let dominantCount = 0;
  for (let offset = 0; offset < soup.length; offset += TAPE_SIZE) {
    const key = byteSequenceKey(soup, offset, TAPE_SIZE);
    const count = (programCounts.get(key) ?? 0) + 1;
    programCounts.set(key, count);
    if (count > dominantCount) {
      dominantCount = count;
    }
  }

  const uniqueCount = programCounts.size;
  const programCompressedBpb = estimateProgramCompressedBpb(
    uniqueCount,
    programCount,
    byteEntropyBpb,
    soup.length
  );
  const blockCompressedBpb = estimateBlockCompressedBpb(soup);
  const compressedBpb = Math.min(
    byteEntropyBpb,
    programCompressedBpb,
    blockCompressedBpb
  );
  const compressionGain = Math.max(0, byteEntropyBpb - compressedBpb);
  const activeInstructionFraction = activeInstructionCount / soup.length;
  const randomInstructionFraction = 10 / 256;
  const instructionEnrichmentScore = Math.max(
    0,
    activeInstructionFraction / randomInstructionFraction - 1
  );
  const structureScore = compressionGain + instructionEnrichmentScore * 0.25;

  return {
    epoch,
    byteEntropyBpb,
    compressedBpb,
    structureScore,
    compressionGain,
    activeInstructionFraction,
    instructionEnrichmentScore,
    dominantProgramFraction: dominantCount / programCount,
    uniqueProgramFraction: uniqueCount / programCount
  };
}

function estimateProgramCompressedBpb(
  uniqueProgramCount: number,
  programCount: number,
  byteEntropyBpb: number,
  totalBytes: number
): number {
  const dictionaryBits = uniqueProgramCount * TAPE_SIZE * byteEntropyBpb;
  const indexBits =
    programCount * Math.max(1, Math.log2(uniqueProgramCount || 1));
  return (dictionaryBits + indexBits) / totalBytes;
}

function estimateBlockCompressedBpb(soup: Uint8Array): number {
  const blockBytes = 8;
  const blockCount = Math.floor(soup.length / blockBytes);
  if (blockCount === 0) {
    return 8;
  }

  const blocks = new Map<string, number>();
  for (let offset = 0; offset <= soup.length - blockBytes; offset += blockBytes) {
    const key = byteSequenceKey(soup, offset, blockBytes);
    blocks.set(key, (blocks.get(key) ?? 0) + 1);
  }

  const uniqueBlocks = blocks.size;
  const dictionaryBits = uniqueBlocks * blockBytes * 8;
  const indexBits = blockCount * Math.max(1, Math.log2(uniqueBlocks || 1));
  return (dictionaryBits + indexBits) / soup.length;
}
