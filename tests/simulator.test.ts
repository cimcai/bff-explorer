import { describe, expect, it } from "vitest";
import { checksumBytes } from "../src/simulation/checksum";
import {
  MAX_CHECKPOINT_MEMORY_BYTES,
  MAX_CHECKPOINTS,
  MAX_INSTRUCTION_READS,
  MAX_TIME_BUDGET_MS,
  TAPE_SIZE
} from "../src/simulation/constants";
import { knownReplicatorBytes } from "../src/simulation/knownReplicator";
import { replicatorPresetBytes } from "../src/simulation/replicatorPresets";
import { computeTopPrograms } from "../src/simulation/programSummary";
import {
  BffSimulator,
  defaultConfig,
  maxCheckpointCountForBytes,
  sanitizeConfig
} from "../src/simulation/simulator";

describe("BffSimulator checkpoints", () => {
  it("defaults to low nonzero mutation for autonomous exploration", () => {
    expect(defaultConfig().mutationRate).toBe(1 / 8192);
  });

  it("sanitizes runtime inputs to tab-safe upper bounds", () => {
    const defaults = defaultConfig();
    const config = sanitizeConfig({
      ...defaults,
      gridWidth: 10_000,
      gridHeight: 10_000,
      timeBudgetMs: 1_000,
      maxInstructionReads: 1_000_000
    });

    expect(config.gridWidth * config.gridHeight).toBeLessThanOrEqual(
      defaults.gridWidth * defaults.gridHeight
    );
    expect(config.timeBudgetMs).toBe(MAX_TIME_BUDGET_MS);
    expect(config.maxInstructionReads).toBe(MAX_INSTRUCTION_READS);
  });

  it("is exactly reproducible for identical seeds and configs", () => {
    const config = {
      gridWidth: 12,
      gridHeight: 9,
      seed: 1234,
      mutationRate: 1 / 1024,
      checkpointInterval: 3,
      metricInterval: 2,
      timeBudgetMs: 1,
      maxInstructionReads: 96
    };
    const a = new BffSimulator(config);
    const b = new BffSimulator(config);

    for (let i = 0; i < 12; i += 1) {
      expect(a.stepEpoch()).toEqual(b.stepEpoch());
    }

    expect(a.epoch).toBe(b.epoch);
    expect(checksumBytes(a.soup)).toBe(checksumBytes(b.soup));
    expect(a.status(false).latestMetric).toEqual(b.status(false).latestMetric);
    expect(a.getCheckpointSummaries()).toEqual(b.getCheckpointSummaries());
  });

  it("restores a checkpoint and reproduces the same future", () => {
    const sim = new BffSimulator({
      gridWidth: 10,
      gridHeight: 8,
      seed: 99,
      mutationRate: 1 / 512,
      checkpointInterval: 2,
      metricInterval: 2,
      timeBudgetMs: 5,
      maxInstructionReads: 128
    });

    sim.stepEpoch();
    sim.stepEpoch();
    const checkpointId = sim.getCheckpointSummaries().at(-1)?.id;
    expect(checkpointId).toBeDefined();
    sim.stepEpoch();
    sim.stepEpoch();
    sim.stepEpoch();
    const futureChecksum = checksumBytes(sim.soup);

    expect(sim.previewCheckpoint(checkpointId!)).toBe(true);
    sim.stepEpoch();
    sim.stepEpoch();
    sim.stepEpoch();

    expect(checksumBytes(sim.soup)).toBe(futureChecksum);
  });

  it("previews old checkpoints without discarding future checkpoints", () => {
    const sim = new BffSimulator({
      gridWidth: 8,
      gridHeight: 8,
      seed: 5,
      mutationRate: 0,
      checkpointInterval: 1,
      metricInterval: 1,
      timeBudgetMs: 1,
      maxInstructionReads: 64
    });

    sim.stepEpoch();
    sim.stepEpoch();
    sim.stepEpoch();
    const summaries = sim.getCheckpointSummaries();
    const firstCheckpoint = summaries[1];
    const lastCheckpoint = summaries.at(-1);

    expect(sim.previewCheckpoint(firstCheckpoint.id)).toBe(true);

    const previewStatus = sim.status(false);
    expect(previewStatus.isViewingCheckpoint).toBe(true);
    expect(previewStatus.activeCheckpointId).toBe(firstCheckpoint.id);
    expect(previewStatus.checkpoints.at(-1)?.id).toBe(lastCheckpoint?.id);
  });

  it("returns checkpoint view copies without mutating simulation state", () => {
    const sim = new BffSimulator({
      gridWidth: 8,
      gridHeight: 8,
      seed: 13,
      mutationRate: 0,
      checkpointInterval: 1,
      metricInterval: 1,
      timeBudgetMs: 1,
      maxInstructionReads: 64
    });
    sim.stepEpoch();
    const before = checksumBytes(sim.soup);
    const checkpointId = sim.getCheckpointSummaries().at(-1)!.id;

    const view = sim.getCheckpointView(checkpointId);
    expect(view).not.toBeNull();
    view!.soup.fill(0);
    view!.metricHistory.length = 0;

    expect(checksumBytes(sim.soup)).toBe(before);
    expect(sim.status(false).metricHistory.length).toBeGreaterThan(0);
  });

  it("leaves state untouched when a checkpoint id is missing", () => {
    const sim = new BffSimulator({
      gridWidth: 8,
      gridHeight: 8,
      seed: 7,
      mutationRate: 1 / 512,
      checkpointInterval: 2,
      metricInterval: 2,
      timeBudgetMs: 1,
      maxInstructionReads: 64
    });
    sim.stepEpoch();
    sim.stepEpoch();
    const beforeChecksum = checksumBytes(sim.soup);
    const beforeStatus = sim.status(false);

    expect(sim.previewCheckpoint(999)).toBe(false);

    const afterStatus = sim.status(false);
    expect(checksumBytes(sim.soup)).toBe(beforeChecksum);
    expect(afterStatus.epoch).toBe(beforeStatus.epoch);
    expect(afterStatus.isViewingCheckpoint).toBe(false);
    expect(afterStatus.activeCheckpointId).toBe(beforeStatus.activeCheckpointId);
    expect(afterStatus.checkpoints).toEqual(beforeStatus.checkpoints);
  });

  it("branches from the previewed checkpoint when simulation resumes", () => {
    const sim = new BffSimulator({
      gridWidth: 8,
      gridHeight: 8,
      seed: 6,
      mutationRate: 0,
      checkpointInterval: 1,
      metricInterval: 1,
      timeBudgetMs: 1,
      maxInstructionReads: 64
    });

    sim.stepEpoch();
    sim.stepEpoch();
    sim.stepEpoch();
    const branchId = sim.getCheckpointSummaries()[1].id;
    expect(sim.previewCheckpoint(branchId)).toBe(true);

    sim.stepEpoch();

    const summaries = sim.getCheckpointSummaries();
    expect(summaries.some((checkpoint) => checkpoint.id === branchId)).toBe(true);
    expect(summaries.length).toBe(3);
    expect(sim.status(false).isViewingCheckpoint).toBe(false);
  });

  it("runs at least one epoch even under a small time budget", () => {
    const sim = new BffSimulator({
      gridWidth: 8,
      gridHeight: 8,
      seed: 1,
      mutationRate: 0,
      checkpointInterval: 1,
      metricInterval: 1,
      timeBudgetMs: 1,
      maxInstructionReads: 64
    });

    const batch = sim.runForBudget(1);

    expect(batch.epochsRun).toBeGreaterThanOrEqual(1);
    expect(sim.epoch).toBe(batch.epochsRun);
  });

  it("bounds checkpoint retention by count and soup memory", () => {
    const defaultSoupBytes =
      defaultConfig().gridWidth * defaultConfig().gridHeight * TAPE_SIZE;
    expect(maxCheckpointCountForBytes(defaultSoupBytes)).toBe(MAX_CHECKPOINTS);
    expect(
      maxCheckpointCountForBytes(Math.floor(MAX_CHECKPOINT_MEMORY_BYTES / 2) + 1)
    ).toBe(1);

    const sim = new BffSimulator({
      gridWidth: 8,
      gridHeight: 8,
      seed: 4,
      mutationRate: 0,
      checkpointInterval: 1,
      metricInterval: 99,
      timeBudgetMs: 1,
      maxInstructionReads: 64
    });
    for (let i = 0; i < MAX_CHECKPOINTS + 4; i += 1) {
      sim.stepEpoch();
    }

    expect(sim.getCheckpointSummaries()).toHaveLength(MAX_CHECKPOINTS);
  });

  it("updates runtime controls without resetting the soup", () => {
    const sim = new BffSimulator({
      gridWidth: 8,
      gridHeight: 8,
      seed: 11,
      mutationRate: 0,
      checkpointInterval: 8,
      metricInterval: 8,
      timeBudgetMs: 4,
      maxInstructionReads: 64
    });
    const before = checksumBytes(sim.soup);

    sim.updateRuntimeConfig({
      mutationRate: 2,
      checkpointInterval: 0.5,
      metricInterval: 3.8,
      timeBudgetMs: 200
    });

    expect(checksumBytes(sim.soup)).toBe(before);
    expect(sim.config.mutationRate).toBe(1);
    expect(sim.config.checkpointInterval).toBe(1);
    expect(sim.config.metricInterval).toBe(3);
    expect(sim.config.timeBudgetMs).toBe(MAX_TIME_BUDGET_MS);
  });

  it("clears stale throughput stats after reset", () => {
    const sim = new BffSimulator({
      gridWidth: 8,
      gridHeight: 8,
      seed: 12,
      mutationRate: 0,
      checkpointInterval: 8,
      metricInterval: 8,
      timeBudgetMs: 1,
      maxInstructionReads: 64
    });

    sim.runForBudget(1);
    expect(sim.status(false).epochsPerSecond).toBeGreaterThan(0);

    sim.reset();

    const status = sim.status(false);
    expect(status.epochsPerSecond).toBe(0);
    expect(status.pairsPerEpoch).toBe(0);
    expect(status.avgInstructionReadsPerPair).toBe(0);
  });

  it("mutates programs that are not selected for execution", () => {
    const gridWidth = 4;
    const gridHeight = 4;
    const sim = new BffSimulator({
      gridWidth,
      gridHeight,
      seed: 2,
      mutationRate: 1,
      checkpointInterval: 99,
      metricInterval: 99,
      timeBudgetMs: 1,
      maxInstructionReads: 1
    });
    const before = sim.soup.slice();

    const stats = sim.stepEpoch();

    expect(stats.pairs).toBeLessThan((gridWidth * gridHeight) / 2);

    let changedPrograms = 0;
    for (let program = 0; program < gridWidth * gridHeight; program += 1) {
      const offset = program * TAPE_SIZE;
      for (let i = 0; i < TAPE_SIZE; i += 1) {
        if (before[offset + i] !== sim.soup[offset + i]) {
          changedPrograms += 1;
          break;
        }
      }
    }

    expect(changedPrograms).toBe(gridWidth * gridHeight);
  });

  it("lets the known BFF replicator expand in exact local scheduling", () => {
    const gridWidth = 40;
    const gridHeight = 24;
    const sim = new BffSimulator({
      gridWidth,
      gridHeight,
      seed: 3,
      mutationRate: 0,
      checkpointInterval: 9999,
      metricInterval: 32,
      timeBudgetMs: 1,
      maxInstructionReads: 8192
    });
    const replicator = knownReplicatorBytes();
    const centerX = Math.floor(gridWidth / 2);
    const centerY = Math.floor(gridHeight / 2);
    for (let y = centerY - 1; y <= centerY + 1; y += 1) {
      for (let x = centerX - 1; x <= centerX + 1; x += 1) {
        sim.soup.set(replicator, (y * gridWidth + x) * TAPE_SIZE);
      }
    }

    for (let i = 0; i < 128; i += 1) {
      sim.stepEpoch();
    }

    const top = computeTopPrograms(sim.soup, 1)[0];
    expect(top.count).toBeGreaterThan(100);
    expect(top.bytes).toEqual([...replicator]);
  });

  it("injects preset programs into random cells without duplicate positions", () => {
    const sim = new BffSimulator({
      gridWidth: 10,
      gridHeight: 10,
      seed: 44,
      mutationRate: 0,
      checkpointInterval: 9999,
      metricInterval: 16,
      timeBudgetMs: 1,
      maxInstructionReads: 8192
    });
    sim.soup.fill(0);
    const preset = replicatorPresetBytes("paper-tilde");

    const inserted = sim.injectProgramRandomly(preset, 12);

    expect(inserted).toBe(12);
    expect(countProgramMatches(sim.soup, preset)).toBe(12);
    expect(
      sim
        .status(false)
        .topPrograms.some(
          (program) =>
            program.count === 12 &&
            program.bytes.every((byte, index) => byte === preset[index])
        )
    ).toBe(true);
  });

  it("uses deterministic intervention placement without disturbing future execution", () => {
    const makeSim = () => {
      const sim = new BffSimulator({
        gridWidth: 16,
        gridHeight: 10,
        seed: 91,
        mutationRate: 0,
        checkpointInterval: 9999,
        metricInterval: 16,
        timeBudgetMs: 1,
        maxInstructionReads: 8192
      });
      sim.injectProgramRandomly(replicatorPresetBytes("paper-a"), 8);
      for (let i = 0; i < 20; i += 1) {
        sim.stepEpoch();
      }
      return checksumBytes(sim.soup);
    };

    expect(makeSim()).toBe(makeSim());
  });
});

function countProgramMatches(soup: Uint8Array, expected: Uint8Array): number {
  let matches = 0;
  for (let offset = 0; offset < soup.length; offset += TAPE_SIZE) {
    let isMatch = true;
    for (let i = 0; i < TAPE_SIZE; i += 1) {
      if (soup[offset + i] !== expected[i]) {
        isMatch = false;
        break;
      }
    }
    if (isMatch) {
      matches += 1;
    }
  }
  return matches;
}
