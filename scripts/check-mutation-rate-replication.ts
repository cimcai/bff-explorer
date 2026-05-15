import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { availableParallelism } from "node:os";
import { TAPE_SIZE } from "../src/simulation/constants";
import { knownReplicatorBytes } from "../src/simulation/knownReplicator";
import {
  computeTopPrograms,
  programToGlyphs,
  type ProgramSummary
} from "../src/simulation/programSummary";
import { BffSimulator, defaultConfig } from "../src/simulation/simulator";

interface RateConfig {
  label: string;
  mutationRate: number;
}

interface BatchResult {
  type: "batch";
  worker: number;
  label: string;
  seed: number;
  mutationRate: number;
  epoch: number;
  detected: boolean;
  candidateEpoch: number | null;
  candidateId: string | null;
  candidateGlyphs: string | null;
  candidateTopCount: number;
  candidateDominantFraction: number;
  candidateStructureScore: number;
  candidatePhaseTransitionDetected: boolean;
  assayPasses: number;
  assayRuns: number;
  assayMaxFinalCount: number;
  epochsPerSecond: number;
}

interface WorkerDone {
  type: "workerDone";
  worker: number;
}

type WorkerMessage = BatchResult | WorkerDone;

interface Sample {
  epoch: number;
  top: ProgramSummary | null;
  structureScore: number;
  dominantProgramFraction: number;
  phaseTransitionDetected: boolean;
}

interface AssayResult {
  passed: boolean;
  passes: number;
  runs: number;
  maxFinalCount: number;
}

const workerMode = process.env.MUTATION_REPLICATION_WORKER === "1";

if (workerMode) {
  runWorker();
} else {
  await runCoordinator();
}

async function runCoordinator(): Promise<void> {
  runAssayControls();

  const seedCount = numberFromEnv("REPLICATION_SEEDS", 12);
  const epochBudget = numberFromEnv("REPLICATION_EPOCHS", 16_000);
  const sampleInterval = numberFromEnv("REPLICATION_SAMPLE_INTERVAL", 256);
  const workerCount = numberFromEnv(
    "REPLICATION_WORKERS",
    Math.max(1, Math.min(availableParallelism() - 2, 4))
  );
  const minCurrentHits = numberFromEnv("REPLICATION_MIN_CURRENT_HITS", 1);
  const requireCurrentBeatsOld = boolFromEnv(
    "REPLICATION_REQUIRE_CURRENT_BEATS_OLD",
    true
  );
  const rates = rateConfigs();
  const results: BatchResult[] = [];

  console.log(
    JSON.stringify(
      {
        test: "mutation-rate-replication",
        seedCount,
        epochBudget,
        sampleInterval,
        workerCount,
        rates,
        detection: {
          candidateMinTopCount: candidateMinTopCount(),
          assaySeeds: assaySeeds(),
          assayEpochs: assayEpochs(),
          assayPatchRadius: assayPatchRadius(),
          assayMinFinalCount: assayMinFinalCount(),
          assayMinGrowth: assayMinGrowth(),
          assayMinPasses: assayMinPasses()
        }
      },
      null,
      2
    )
  );

  const children: ChildProcessWithoutNullStreams[] = [];
  const exits: Array<Promise<void>> = [];
  for (let worker = 0; worker < workerCount; worker += 1) {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", new URL(import.meta.url).pathname],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          MUTATION_REPLICATION_WORKER: "1",
          MUTATION_REPLICATION_WORKER_INDEX: String(worker),
          MUTATION_REPLICATION_WORKER_COUNT: String(workerCount)
        }
      }
    );
    child.stderr.pipe(process.stderr);
    child.stdout.setEncoding("utf8");
    let buffered = "";
    child.stdout.on("data", (chunk: string) => {
      buffered += chunk;
      let newline = buffered.indexOf("\n");
      while (newline >= 0) {
        const line = buffered.slice(0, newline).trim();
        buffered = buffered.slice(newline + 1);
        handleWorkerLine(line, results);
        newline = buffered.indexOf("\n");
      }
    });
    children.push(child);
    exits.push(waitForChild(child));
  }

  await Promise.all(exits);
  printSummary(results, rates);

  const oldHits = hitCount(results, rates[0].label);
  const currentHits = hitCount(results, rates[1].label);
  if (currentHits < minCurrentHits) {
    throw new Error(
      `Current mutation rate produced ${currentHits} confirmed replication hits; expected at least ${minCurrentHits}.`
    );
  }
  if (requireCurrentBeatsOld && currentHits <= oldHits) {
    throw new Error(
      `Current mutation rate did not beat the old rate: current=${currentHits}, old=${oldHits}.`
    );
  }

  console.log("\nMutation-rate replication integration check passed.");
}

function runWorker(): void {
  const worker = numberFromEnv("MUTATION_REPLICATION_WORKER_INDEX", 0);
  const workerCount = numberFromEnv("MUTATION_REPLICATION_WORKER_COUNT", 1);
  const seedStart = numberFromEnv("REPLICATION_SEED_START", 1);
  const seedCount = numberFromEnv("REPLICATION_SEEDS", 12);
  const rates = rateConfigs();
  const taskCount = seedCount * rates.length;

  for (let task = worker; task < taskCount; task += workerCount) {
    const seedIndex = Math.floor(task / rates.length);
    const rate = rates[task % rates.length];
    const seed = seedStart + seedIndex;
    console.log(JSON.stringify(runBatch(worker, seed, rate)));
  }

  console.log(JSON.stringify({ type: "workerDone", worker }));
}

function runBatch(
  worker: number,
  seed: number,
  rate: RateConfig
): BatchResult {
  const config = defaultConfig();
  const epochBudget = numberFromEnv("REPLICATION_EPOCHS", 16_000);
  const sampleInterval = numberFromEnv("REPLICATION_SAMPLE_INTERVAL", 256);
  const stopOnDetection = boolFromEnv("REPLICATION_STOP_ON_DETECTION", true);
  const sim = new BffSimulator({
    ...config,
    seed,
    mutationRate: rate.mutationRate,
    checkpointInterval: epochBudget + 1,
    metricInterval: sampleInterval
  });
  const assayed = new Set<string>();
  const started = performance.now();
  let detected: BatchResult | null = null;
  let latest = sample(sim);

  while (sim.epoch < epochBudget && (!detected || !stopOnDetection)) {
    sim.stepEpoch();
    if (sim.epoch % sampleInterval !== 0 && sim.epoch !== epochBudget) {
      continue;
    }
    latest = sample(sim);
    const top = latest.top;
    if (!top || top.count < candidateMinTopCount() || assayed.has(top.id)) {
      continue;
    }
    assayed.add(top.id);
    const assay = assayReplicator(Uint8Array.from(top.bytes));
    if (assay.passed) {
      detected = batchResult(worker, rate, seed, latest, assay, started, true);
    }
  }

  return (
    detected ??
    batchResult(
      worker,
      rate,
      seed,
      latest,
      { passed: false, passes: 0, runs: 0, maxFinalCount: 0 },
      started,
      false
    )
  );
}

function sample(sim: BffSimulator): Sample {
  const status = sim.status(false);
  return {
    epoch: sim.epoch,
    top: status.topPrograms[0] ?? computeTopPrograms(sim.soup, 1)[0] ?? null,
    structureScore: status.latestMetric.structureScore,
    dominantProgramFraction: status.latestMetric.dominantProgramFraction,
    phaseTransitionDetected: status.latestMetric.phaseTransitionDetected
  };
}

function batchResult(
  worker: number,
  rate: RateConfig,
  seed: number,
  sampleAtDetection: Sample,
  assay: AssayResult,
  started: number,
  detected: boolean
): BatchResult {
  const top = sampleAtDetection.top;
  return {
    type: "batch",
    worker,
    label: rate.label,
    seed,
    mutationRate: rate.mutationRate,
    epoch: sampleAtDetection.epoch,
    detected,
    candidateEpoch: detected ? sampleAtDetection.epoch : null,
    candidateId: detected && top ? top.id : null,
    candidateGlyphs: detected && top ? programToGlyphs(top.bytes) : null,
    candidateTopCount: top?.count ?? 0,
    candidateDominantFraction: sampleAtDetection.dominantProgramFraction,
    candidateStructureScore: sampleAtDetection.structureScore,
    candidatePhaseTransitionDetected:
      sampleAtDetection.phaseTransitionDetected,
    assayPasses: assay.passes,
    assayRuns: assay.runs,
    assayMaxFinalCount: assay.maxFinalCount,
    epochsPerSecond: sampleAtDetection.epoch / elapsedSeconds(started)
  };
}

function runAssayControls(): void {
  const positive = assayReplicator(knownReplicatorBytes());
  if (!positive.passed) {
    throw new Error(
      `Known-replicator assay control failed: ${JSON.stringify(positive)}`
    );
  }

  const inert = new Uint8Array(TAPE_SIZE);
  const negative = assayReplicator(inert);
  if (negative.passed) {
    throw new Error(
      `Inert-program assay control unexpectedly passed: ${JSON.stringify(
        negative
      )}`
    );
  }

  console.log(
    `Replication assay controls passed: known=${positive.passes}/${positive.runs}, inert=${negative.passes}/${negative.runs}.`
  );
}

function assayReplicator(program: Uint8Array): AssayResult {
  const config = defaultConfig();
  const width = numberFromEnv("REPLICATION_ASSAY_GRID_WIDTH", 40);
  const height = numberFromEnv("REPLICATION_ASSAY_GRID_HEIGHT", 24);
  const runs = assaySeeds();
  const epochs = assayEpochs();
  const radius = assayPatchRadius();
  const minFinal = assayMinFinalCount();
  const minGrowth = assayMinGrowth();
  const minPasses = assayMinPasses();
  const seedStart = numberFromEnv("REPLICATION_ASSAY_SEED_START", 10_000);
  let passes = 0;
  let maxFinalCount = 0;

  for (let run = 0; run < runs; run += 1) {
    const sim = new BffSimulator({
      ...config,
      gridWidth: width,
      gridHeight: height,
      seed: seedStart + run,
      mutationRate: 0,
      checkpointInterval: epochs + 1,
      metricInterval: epochs + 1
    });
    seedProgramPatch(sim, program, radius);
    const initialCount = countExactProgram(sim.soup, program);
    for (let epoch = 0; epoch < epochs; epoch += 1) {
      sim.stepEpoch();
    }
    const finalCount = countExactProgram(sim.soup, program);
    maxFinalCount = Math.max(maxFinalCount, finalCount);
    if (finalCount >= minFinal && finalCount >= initialCount * minGrowth) {
      passes += 1;
    }
  }

  return {
    passed: passes >= minPasses,
    passes,
    runs,
    maxFinalCount
  };
}

function seedProgramPatch(
  sim: BffSimulator,
  program: Uint8Array,
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
      sim.soup.set(program, (y * sim.config.gridWidth + x) * TAPE_SIZE);
    }
  }
}

function countExactProgram(soup: Uint8Array, program: Uint8Array): number {
  let count = 0;
  for (let offset = 0; offset <= soup.length - TAPE_SIZE; offset += TAPE_SIZE) {
    let equal = true;
    for (let i = 0; i < TAPE_SIZE; i += 1) {
      if (soup[offset + i] !== program[i]) {
        equal = false;
        break;
      }
    }
    if (equal) {
      count += 1;
    }
  }
  return count;
}

function handleWorkerLine(line: string, results: BatchResult[]): void {
  if (!line) {
    return;
  }

  let message: WorkerMessage;
  try {
    message = JSON.parse(line) as WorkerMessage;
  } catch {
    console.log(line);
    return;
  }

  if (message.type === "workerDone") {
    console.log(`worker ${message.worker} exhausted assigned batches`);
    return;
  }

  results.push(message);
  const label = message.detected ? "HIT" : "miss";
  console.log(
    [
      label,
      `worker=${message.worker}`,
      `rate=${message.label}`,
      `seed=${message.seed}`,
      `epoch=${message.epoch}`,
      `top=${message.candidateTopCount}`,
      `dominant=${(message.candidateDominantFraction * 100).toFixed(3)}%`,
      `structure=${message.candidateStructureScore.toFixed(3)}`,
      `assay=${message.assayPasses}/${message.assayRuns}`,
      `maxFinal=${message.assayMaxFinalCount}`,
      `eps=${message.epochsPerSecond.toFixed(1)}`
    ].join(" ")
  );
}

function waitForChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `Worker exited with ${code === null ? `signal ${signal}` : code}`
          )
        );
      }
    });
  });
}

function printSummary(results: BatchResult[], rates: RateConfig[]): void {
  console.log("\nPer-rate summary:");
  console.table(
    rates.map((rate) => {
      const rateResults = results.filter((result) => result.label === rate.label);
      const hits = rateResults.filter((result) => result.detected);
      return {
        rate: rate.label,
        mutationRate: rate.mutationRate,
        batches: rateResults.length,
        hits: hits.length,
        firstHitEpoch:
          hits.length > 0
            ? Math.min(...hits.map((result) => result.epoch))
            : "-",
        maxAssayFinal:
          rateResults.length > 0
            ? Math.max(...rateResults.map((result) => result.assayMaxFinalCount))
            : 0
      };
    })
  );

  const hits = results.filter((result) => result.detected);
  if (hits.length === 0) {
    return;
  }

  console.log("\nConfirmed replication hits:");
  console.table(
    hits.map((result) => ({
      rate: result.label,
      seed: result.seed,
      epoch: result.epoch,
      topCount: result.candidateTopCount,
      assay: `${result.assayPasses}/${result.assayRuns}`,
      maxFinal: result.assayMaxFinalCount,
      glyphs: result.candidateGlyphs
    }))
  );
}

function hitCount(results: BatchResult[], label: string): number {
  return results.filter((result) => result.label === label && result.detected)
    .length;
}

function rateConfigs(): RateConfig[] {
  const config = defaultConfig();
  return [
    {
      label: "old-1/8192",
      mutationRate: numberFromEnv("REPLICATION_OLD_RATE", 1 / 8192)
    },
    {
      label: "current-default",
      mutationRate: numberFromEnv(
        "REPLICATION_CURRENT_RATE",
        config.mutationRate
      )
    }
  ];
}

function candidateMinTopCount(): number {
  return numberFromEnv("REPLICATION_CANDIDATE_MIN_TOP_COUNT", 3);
}

function assaySeeds(): number {
  return numberFromEnv("REPLICATION_ASSAY_SEEDS", 3);
}

function assayEpochs(): number {
  return numberFromEnv("REPLICATION_ASSAY_EPOCHS", 128);
}

function assayPatchRadius(): number {
  return numberFromEnv("REPLICATION_ASSAY_PATCH_RADIUS", 2);
}

function assayMinFinalCount(): number {
  return numberFromEnv("REPLICATION_ASSAY_MIN_FINAL_COUNT", 96);
}

function assayMinGrowth(): number {
  return numberFromEnv("REPLICATION_ASSAY_MIN_GROWTH", 4);
}

function assayMinPasses(): number {
  return numberFromEnv("REPLICATION_ASSAY_MIN_PASSES", 2);
}

function elapsedSeconds(started: number): number {
  return Math.max((performance.now() - started) / 1000, 0.001);
}

function boolFromEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) {
    return fallback;
  }
  return value !== "0" && value.toLowerCase() !== "false";
}

function numberFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
