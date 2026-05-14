import type { MetricSnapshot } from "./metrics";
import type { ProgramSummary } from "./programSummary";
import type { SimulationStatus } from "./simulator";

export interface ReplicationDetection {
  detected: boolean;
  confidence: number;
  epoch: number;
  reason: string;
  metric: MetricSnapshot | null;
  topProgram: ProgramSummary | null;
}

interface ReplicationSample {
  epoch: number;
  structureScore: number;
  phaseTransitionScore: number;
  phaseTransitionDetected: boolean;
  dominantProgramFraction: number;
  uniqueProgramFraction: number;
  topProgramId: string;
  topProgramCount: number;
  metric: MetricSnapshot;
  topProgram: ProgramSummary;
}

export interface ReplicationDetectorOptions {
  minTopProgramCount: number;
  minTopProgramGrowth: number;
  minStructureGain: number;
  minInjectedStructureGain: number;
  minDominantGrowth: number;
  minUniqueDrop: number;
}

const DEFAULT_OPTIONS: ReplicationDetectorOptions = {
  minTopProgramCount: 8,
  minTopProgramGrowth: 4,
  minStructureGain: 0.05,
  minInjectedStructureGain: 0.5,
  minDominantGrowth: 0.00005,
  minUniqueDrop: 0.00005
};

const MAX_SAMPLES = 48;
const BASELINE_SAMPLES = 8;

export class ReplicationDetector {
  private samples: ReplicationSample[] = [];
  private lastEpoch: number | null = null;
  private injectedCountFloor = 0;
  private options: ReplicationDetectorOptions;

  constructor(options: Partial<ReplicationDetectorOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  reset(): void {
    this.samples = [];
    this.lastEpoch = null;
    this.injectedCountFloor = 0;
  }

  noteInjectedProgram(insertedCount: number): void {
    this.samples = [];
    this.lastEpoch = null;
    this.injectedCountFloor = Math.max(0, Math.floor(insertedCount));
  }

  observe(status: SimulationStatus): ReplicationDetection {
    if (!status.running || status.isViewingCheckpoint) {
      return noDetection();
    }
    if (this.lastEpoch === status.latestMetric.epoch) {
      return noDetection();
    }

    const sample = sampleStatus(status);
    if (!sample) {
      return noDetection();
    }

    this.lastEpoch = sample.epoch;
    this.samples.push(sample);
    if (this.samples.length > MAX_SAMPLES) {
      this.samples.shift();
    }

    return this.detect(sample);
  }

  private detect(latest: ReplicationSample): ReplicationDetection {
    if (this.injectedCountFloor > 0) {
      const injectedDetection = this.detectAfterInjection(latest);
      if (injectedDetection.detected) {
        return injectedDetection;
      }
    }

    if (this.samples.length < 4) {
      return noDetection();
    }

    const sameProgramSamples = this.samples
      .filter((sample) => sample.topProgramId === latest.topProgramId)
      .slice(-6);
    if (sameProgramSamples.length < 3) {
      return noDetection();
    }

    const first = sameProgramSamples[0];
    const previousMax = Math.max(
      ...sameProgramSamples.slice(0, -1).map((sample) => sample.topProgramCount)
    );
    const topProgramGrowth = latest.topProgramCount - first.topProgramCount;
    const newGrowth = latest.topProgramCount - previousMax;
    const requiredCount = this.requiredTopProgramCount();
    const countSignal =
      latest.topProgramCount >= requiredCount &&
      topProgramGrowth >= this.options.minTopProgramGrowth &&
      (newGrowth > 0 || topProgramGrowth >= this.options.minTopProgramGrowth * 2);

    if (!countSignal) {
      return noDetection();
    }

    const baseline = this.samples.slice(
      0,
      Math.min(BASELINE_SAMPLES, Math.max(1, this.samples.length - 1))
    );
    const baselineStructure =
      baseline.reduce((sum, sample) => sum + sample.structureScore, 0) /
      baseline.length;
    const structureGain = latest.structureScore - baselineStructure;
    const dominantGrowth =
      latest.dominantProgramFraction - first.dominantProgramFraction;
    const uniqueDrop = first.uniqueProgramFraction - latest.uniqueProgramFraction;
    const metricSignal =
      latest.phaseTransitionDetected ||
      latest.phaseTransitionScore >= 0.08 ||
      structureGain >= this.options.minStructureGain ||
      (dominantGrowth >= this.options.minDominantGrowth &&
        uniqueDrop >= this.options.minUniqueDrop);

    if (!metricSignal) {
      return noDetection();
    }

    const confidence = clamp01(
      0.35 +
        Math.min(0.3, topProgramGrowth / Math.max(16, requiredCount) / 2) +
        Math.min(0.2, Math.max(0, structureGain) / 0.4) +
        (latest.phaseTransitionDetected ? 0.15 : 0)
    );

    return {
      detected: true,
      confidence,
      epoch: latest.epoch,
      reason: `top program ${latest.topProgramId} grew from ${first.topProgramCount} to ${latest.topProgramCount} cells`,
      metric: latest.metric,
      topProgram: latest.topProgram
    };
  }

  private requiredTopProgramCount(): number {
    if (this.injectedCountFloor <= 0) {
      return this.options.minTopProgramCount;
    }
    return (
      this.injectedCountFloor +
      Math.max(4, Math.ceil(this.injectedCountFloor * 0.5))
    );
  }

  private detectAfterInjection(
    latest: ReplicationSample
  ): ReplicationDetection {
    if (this.samples.length < 2) {
      return noDetection();
    }

    const baseline = this.samples[0];
    if (latest.epoch <= baseline.epoch) {
      return noDetection();
    }

    const structureGain = latest.structureScore - baseline.structureScore;
    const dominantGrowth =
      latest.dominantProgramFraction - baseline.dominantProgramFraction;
    const uniqueDrop =
      baseline.uniqueProgramFraction - latest.uniqueProgramFraction;
    const topProgramGrowth = latest.topProgramCount - baseline.topProgramCount;
    const repeatedProgramSignal =
      latest.topProgramCount >=
      Math.max(
        this.options.minTopProgramCount,
        Math.ceil(this.injectedCountFloor * 0.5)
      );
    const exactGrowthSignal =
      latest.topProgramId === baseline.topProgramId &&
      topProgramGrowth >= this.options.minTopProgramGrowth;
    const strongMetricSignal =
      structureGain >= this.options.minInjectedStructureGain;
    const sustainedMetricSignal =
      this.samples.length >= 3 &&
      (latest.phaseTransitionDetected ||
        latest.phaseTransitionScore >= 0.08 ||
        structureGain >= this.options.minStructureGain ||
        (dominantGrowth >= this.options.minDominantGrowth &&
          uniqueDrop >= this.options.minUniqueDrop));

    if (
      !repeatedProgramSignal ||
      (!strongMetricSignal && !(sustainedMetricSignal && exactGrowthSignal))
    ) {
      return noDetection();
    }

    const confidence = clamp01(
      0.4 +
        Math.min(0.35, Math.max(0, structureGain) / 4) +
        Math.min(0.15, Math.max(0, topProgramGrowth) / 64) +
        (latest.phaseTransitionDetected ? 0.1 : 0)
    );

    const reason =
      `structure score rose from ${baseline.structureScore.toFixed(3)} ` +
      `to ${latest.structureScore.toFixed(3)} after injection; ` +
      `top repeated program has ${latest.topProgramCount} cells`;

    return {
      detected: true,
      confidence,
      epoch: latest.epoch,
      reason,
      metric: latest.metric,
      topProgram: latest.topProgram
    };
  }
}

function sampleStatus(status: SimulationStatus): ReplicationSample | null {
  const topProgram = status.topPrograms[0];
  if (!topProgram || topProgram.count <= 1) {
    return null;
  }
  const metric = status.latestMetric;
  return {
    epoch: metric.epoch,
    structureScore: metric.structureScore,
    phaseTransitionScore: metric.phaseTransitionScore,
    phaseTransitionDetected: metric.phaseTransitionDetected,
    dominantProgramFraction: metric.dominantProgramFraction,
    uniqueProgramFraction: metric.uniqueProgramFraction,
    topProgramId: topProgram.id,
    topProgramCount: topProgram.count,
    metric,
    topProgram
  };
}

function noDetection(): ReplicationDetection {
  return {
    detected: false,
    confidence: 0,
    epoch: 0,
    reason: "",
    metric: null,
    topProgram: null
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
