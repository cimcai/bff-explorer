import {
  brotliCompressSync,
  constants as brotliConstants
} from "node:zlib";
import { evaluateTape } from "../src/simulation/bff";
import { PAIR_TAPE_SIZE, TAPE_SIZE } from "../src/simulation/constants";
import { knownReplicatorBytes } from "../src/simulation/knownReplicator";
import { computeTopPrograms } from "../src/simulation/programSummary";
import { BffSimulator, defaultConfig } from "../src/simulation/simulator";

type Preset = "quick" | "strict";

interface PaperMetric {
  byteEntropyBpb: number;
  brotliBpb: number;
  highOrderEntropy: number;
}

interface EmergenceSample extends PaperMetric {
  epoch: number;
  structureScore: number;
  dominantProgramFraction: number;
  uniqueProgramFraction: number;
  topProgramCount: number;
}

interface BatchResult {
  seed: number;
  mutationRate: number;
  detected: boolean;
  firstDetectedEpoch: number | null;
  maxHighOrderEntropy: number;
  maxDominantProgramFraction: number;
  final: EmergenceSample;
  epochsPerSecond: number;
}

const preset = stringFromEnv("EMERGENCE_PRESET", "quick") as Preset;
const config = defaultConfig();

if (preset !== "quick" && preset !== "strict") {
  throw new Error("EMERGENCE_PRESET must be quick or strict");
}

const spontaneousEpochs = numberFromEnv(
  "EMERGENCE_EPOCHS",
  preset === "strict" ? 32768 : 512
);
const spontaneousBatchCount = numberFromEnv(
  "EMERGENCE_BATCHES",
  preset === "strict" ? 8 : 1
);
const spontaneousSampleInterval = numberFromEnv(
  "EMERGENCE_SAMPLE_INTERVAL",
  preset === "strict" ? 512 : 256
);
const spontaneousMutationRate = numberFromEnv(
  "EMERGENCE_MUTATION_RATE",
  config.mutationRate
);
const highOrderEntropyThreshold = numberFromEnv(
  "EMERGENCE_HIGH_ORDER_THRESHOLD",
  0.75
);
const dominanceThreshold = numberFromEnv("EMERGENCE_DOMINANCE_THRESHOLD", 0.01);
const uniqueFractionThreshold = numberFromEnv(
  "EMERGENCE_UNIQUE_FRACTION_THRESHOLD",
  0.98
);
const structureThreshold = numberFromEnv("EMERGENCE_STRUCTURE_THRESHOLD", 0.5);

console.log(
  JSON.stringify(
    {
      preset,
      exactScheduler: true,
      spontaneousEpochs,
      spontaneousBatchCount,
      spontaneousSampleInterval,
      spontaneousMutationRate,
      detection: {
        highOrderEntropyThreshold,
        dominanceThreshold,
        uniqueFractionThreshold,
        structureThreshold
      }
    },
    null,
    2
  )
);

runPairControl();
runSeededPatchControl();
const spontaneousResults = runSpontaneousBatches();

const spontaneousDetections = spontaneousResults.filter(
  (result) => result.detected
).length;
const strictSpontaneousPassed =
  preset !== "strict" || spontaneousDetections > 0;

console.log("\nSpontaneous batch summary:");
console.table(
  spontaneousResults.map((result) => ({
    seed: result.seed,
    mutationRate: result.mutationRate,
    detected: result.detected,
    firstDetectedEpoch: result.firstDetectedEpoch ?? "-",
    maxHighOrderEntropy: result.maxHighOrderEntropy.toFixed(3),
    maxDominantPct: (result.maxDominantProgramFraction * 100).toFixed(2),
    finalHighOrderEntropy: result.final.highOrderEntropy.toFixed(3),
    finalDominantPct: (result.final.dominantProgramFraction * 100).toFixed(2),
    eps: result.epochsPerSecond.toFixed(1)
  }))
);

if (!strictSpontaneousPassed) {
  throw new Error(
    "No spontaneous emergence was detected. This can still be bad luck, but it failed the strict aggregate check."
  );
}

console.log(
  preset === "strict"
    ? "\nStrict emergence check passed."
    : "\nQuick emergence check passed. Run with EMERGENCE_PRESET=strict for the long aggregate spontaneous check."
);

function runPairControl(): void {
  const tape = new Uint8Array(PAIR_TAPE_SIZE);
  const replicator = knownReplicatorBytes();
  tape.set(replicator, 0);
  const result = evaluateTape(tape, config.maxInstructionReads);
  const copied = bytesEqual(tape, TAPE_SIZE, replicator);
  if (!result.haltedByStepLimit || !copied) {
    throw new Error(
      `Known-replicator pair control failed: ${JSON.stringify(result)}`
    );
  }
  console.log("\nKnown-replicator pair control passed.");
}

function runSeededPatchControl(): void {
  const gridWidth = numberFromEnv("EMERGENCE_CONTROL_GRID_WIDTH", 40);
  const gridHeight = numberFromEnv("EMERGENCE_CONTROL_GRID_HEIGHT", 24);
  const seedCount = numberFromEnv("EMERGENCE_CONTROL_SEEDS", 5);
  const epochBudget = numberFromEnv("EMERGENCE_CONTROL_EPOCHS", 128);
  const patchRadius = numberFromEnv("EMERGENCE_CONTROL_PATCH_RADIUS", 2);
  const minTopCount = numberFromEnv("EMERGENCE_CONTROL_MIN_TOP_COUNT", 200);
  const replicator = knownReplicatorBytes();
  const rows: Array<Record<string, string | number | boolean>> = [];

  for (let seed = 1; seed <= seedCount; seed += 1) {
    const sim = new BffSimulator({
      ...config,
      gridWidth,
      gridHeight,
      seed,
      fastMode: false,
      mutationRate: 0,
      checkpointInterval: epochBudget + 1,
      metricInterval: 32
    });
    seedReplicatorPatch(sim, replicator, patchRadius);
    for (let epoch = 0; epoch < epochBudget; epoch += 1) {
      sim.stepEpoch();
    }
    const top = computeTopPrograms(sim.soup, 1)[0];
    const isReplicator = bytesEqual(
      Uint8Array.from(top.bytes),
      0,
      replicator
    );
    const passed = top.count >= minTopCount && isReplicator;
    rows.push({
      seed,
      topCount: top.count,
      topPct: `${(top.fraction * 100).toFixed(1)}%`,
      isReplicator,
      passed
    });
    if (!passed) {
      console.table(rows);
      throw new Error(
        `Seeded known-replicator control failed for seed ${seed}`
      );
    }
  }

  console.log("\nSeeded known-replicator growth control passed.");
  console.table(rows);
}

function runSpontaneousBatches(): BatchResult[] {
  const results: BatchResult[] = [];
  for (let batch = 0; batch < spontaneousBatchCount; batch += 1) {
    const seed = numberFromEnv("EMERGENCE_SEED_START", 1) + batch;
    const result = runSpontaneousBatch(seed);
    results.push(result);
    console.log(
      `spontaneous seed=${seed} detected=${result.detected} maxHighOrder=${result.maxHighOrderEntropy.toFixed(3)} maxDominant=${(result.maxDominantProgramFraction * 100).toFixed(2)}% eps=${result.epochsPerSecond.toFixed(1)}`
    );
  }
  return results;
}

function runSpontaneousBatch(seed: number): BatchResult {
  const sim = new BffSimulator({
    ...config,
    seed,
    fastMode: false,
    mutationRate: spontaneousMutationRate,
    checkpointInterval: spontaneousEpochs + 1,
    metricInterval: spontaneousSampleInterval
  });
  const started = performance.now();
  let detected = false;
  let firstDetectedEpoch: number | null = null;
  let maxHighOrderEntropy = Number.NEGATIVE_INFINITY;
  let maxDominantProgramFraction = 0;
  let final = sampleEmergence(sim);

  for (let epoch = 1; epoch <= spontaneousEpochs; epoch += 1) {
    sim.stepEpoch();
    if (epoch % spontaneousSampleInterval !== 0 && epoch !== spontaneousEpochs) {
      continue;
    }
    final = sampleEmergence(sim);
    maxHighOrderEntropy = Math.max(
      maxHighOrderEntropy,
      final.highOrderEntropy
    );
    maxDominantProgramFraction = Math.max(
      maxDominantProgramFraction,
      final.dominantProgramFraction
    );
    if (!detected && isEmergenceDetected(final)) {
      detected = true;
      firstDetectedEpoch = final.epoch;
      if (preset === "quick") {
        break;
      }
    }
  }

  const elapsedSeconds = (performance.now() - started) / 1000;
  return {
    seed,
    mutationRate: spontaneousMutationRate,
    detected,
    firstDetectedEpoch,
    maxHighOrderEntropy,
    maxDominantProgramFraction,
    final,
    epochsPerSecond: sim.epoch / elapsedSeconds
  };
}

function isEmergenceDetected(sample: EmergenceSample): boolean {
  return (
    sample.highOrderEntropy >= highOrderEntropyThreshold ||
    (sample.dominantProgramFraction >= dominanceThreshold &&
      sample.uniqueProgramFraction <= uniqueFractionThreshold &&
      sample.structureScore >= structureThreshold)
  );
}

function sampleEmergence(sim: BffSimulator): EmergenceSample {
  const status = sim.status(false);
  const topProgramCount = status.topPrograms[0]?.count ?? 1;
  return {
    epoch: sim.epoch,
    ...computePaperHighOrderEntropy(sim.soup),
    structureScore: status.latestMetric.structureScore,
    dominantProgramFraction: status.latestMetric.dominantProgramFraction,
    uniqueProgramFraction: status.latestMetric.uniqueProgramFraction,
    topProgramCount
  };
}

function computePaperHighOrderEntropy(soup: Uint8Array): PaperMetric {
  const byteCounts = new Uint32Array(256);
  for (let i = 0; i < soup.length; i += 1) {
    byteCounts[soup[i]] += 1;
  }

  let byteEntropyBpb = 0;
  for (const count of byteCounts) {
    if (count === 0) {
      continue;
    }
    const probability = count / soup.length;
    byteEntropyBpb -= probability * Math.log2(probability);
  }

  const compressed = brotliCompressSync(soup, {
    params: {
      [brotliConstants.BROTLI_PARAM_QUALITY]: 2,
      [brotliConstants.BROTLI_PARAM_LGWIN]: 24
    }
  });
  const brotliBpb = (compressed.length * 8) / soup.length;
  return {
    byteEntropyBpb,
    brotliBpb,
    highOrderEntropy: byteEntropyBpb - brotliBpb
  };
}

function seedReplicatorPatch(
  sim: BffSimulator,
  replicator: Uint8Array,
  radius: number
): void {
  const centerX = Math.floor(sim.config.gridWidth / 2);
  const centerY = Math.floor(sim.config.gridHeight / 2);
  for (let y = centerY - radius; y <= centerY + radius; y += 1) {
    for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      if (
        x < 0 ||
        y < 0 ||
        x >= sim.config.gridWidth ||
        y >= sim.config.gridHeight
      ) {
        continue;
      }
      sim.soup.set(replicator, (y * sim.config.gridWidth + x) * TAPE_SIZE);
    }
  }
}

function bytesEqual(
  bytes: Uint8Array,
  offset: number,
  expected: Uint8Array
): boolean {
  for (let i = 0; i < expected.length; i += 1) {
    if (bytes[offset + i] !== expected[i]) {
      return false;
    }
  }
  return true;
}

function stringFromEnv(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function numberFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
