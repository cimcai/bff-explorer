import { describe, expect, it } from "vitest";
import { ReplicationDetector } from "../src/simulation/replicationDetector";
import type { MetricSnapshot } from "../src/simulation/metrics";
import type { ProgramSummary } from "../src/simulation/programSummary";
import type { SimulationStatus } from "../src/simulation/simulator";

describe("ReplicationDetector", () => {
  it("does not trigger on singleton random soup", () => {
    const detector = new ReplicationDetector();
    let detection = detector.observe(status(1, metric(1, 0.01), []));

    for (let epoch = 2; epoch < 12; epoch += 1) {
      detection = detector.observe(status(epoch, metric(epoch, 0.02), [
        program("random", 1)
      ]));
    }

    expect(detection.detected).toBe(false);
  });

  it("does not trigger on a metric spike without repeated-program growth", () => {
    const detector = new ReplicationDetector();
    let detection = detector.observe(status(1, metric(1, 0.01), [
      program("same", 2)
    ]));

    for (let epoch = 2; epoch < 12; epoch += 1) {
      detection = detector.observe(status(epoch, metric(epoch, 0.4, true), [
        program("same", 2)
      ]));
    }

    expect(detection.detected).toBe(false);
  });

  it("triggers on sustained dominant-program growth with metric support", () => {
    const detector = new ReplicationDetector();
    let detection = detector.observe(status(1, metric(1, 0.01), [
      program("rep", 2)
    ]));

    [3, 4, 6, 8, 11, 14].forEach((count, index) => {
      const epoch = index + 2;
      detection = detector.observe(
        status(epoch, metric(epoch, 0.02 + index * 0.025, index > 3), [
          program("rep", count)
        ])
      );
    });

    expect(detection.detected).toBe(true);
    expect(detection.reason).toContain("grew");
    expect(detection.topProgram?.id).toBe("rep");
  });

  it("does not trigger immediately after preset injection", () => {
    const detector = new ReplicationDetector();
    detector.noteInjectedProgram(10);

    let detection = detector.observe(status(1, metric(1, 0.2, true), [
      program("preset", 10)
    ]));
    detection = detector.observe(status(2, metric(2, 0.22, true), [
      program("preset", 12)
    ]));

    expect(detection.detected).toBe(false);
  });

  it("triggers after an injected program grows beyond the injected floor", () => {
    const detector = new ReplicationDetector();
    detector.noteInjectedProgram(10);
    let detection = detector.observe(status(1, metric(1, 0.2), [
      program("preset", 10)
    ]));

    [12, 14, 16, 19].forEach((count, index) => {
      const epoch = index + 2;
      detection = detector.observe(status(epoch, metric(epoch, 0.25, true), [
        program("preset", count)
      ]));
    });

    expect(detection.detected).toBe(true);
  });
});

function status(
  epoch: number,
  latestMetric: MetricSnapshot,
  topPrograms: ProgramSummary[]
): SimulationStatus {
  return {
    running: true,
    epoch,
    gridWidth: 20,
    gridHeight: 20,
    renderWidth: 160,
    renderHeight: 160,
    epochsPerSecond: 100,
    renderFps: 60,
    pairsPerEpoch: 100,
    avgInstructionReadsPerPair: 1,
    activeOpsPerEpoch: 10,
    checkpoints: [],
    isViewingCheckpoint: false,
    activeCheckpointId: null,
    latestMetric,
    metricHistory: [latestMetric],
    topPrograms
  };
}

function metric(
  epoch: number,
  structureScore: number,
  phaseTransitionDetected = false
): MetricSnapshot {
  return {
    epoch,
    byteEntropyBpb: 7.8,
    compressedBpb: 7.7,
    structureScore,
    compressionGain: structureScore,
    activeInstructionFraction: 0.04,
    instructionEnrichmentScore: 0,
    dominantProgramFraction: 0.01 + epoch * 0.001,
    uniqueProgramFraction: 0.99 - epoch * 0.001,
    phaseTransitionScore: phaseTransitionDetected ? 0.1 : 0,
    phaseTransitionDetected
  };
}

function program(id: string, count: number): ProgramSummary {
  return {
    id,
    count,
    fraction: count / 400,
    activeBytes: 8,
    nullBytes: 0,
    byteEntropyBpb: 2,
    bytes: new Array(64).fill(43)
  };
}
