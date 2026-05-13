import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { availableParallelism } from "node:os";
import {
  brotliCompressSync,
  constants as brotliConstants
} from "node:zlib";
import { computeTopPrograms } from "../src/simulation/programSummary";
import { BffSimulator, defaultConfig } from "../src/simulation/simulator";

interface BatchResult {
  type: "batch";
  worker: number;
  seed: number;
  mutationRate: number;
  epoch: number;
  detected: boolean;
  highOrderEntropy: number;
  maxHighOrderEntropy: number;
  dominantProgramFraction: number;
  topProgramCount: number;
  structureScore: number;
  uniqueProgramFraction: number;
  epochsPerSecond: number;
}

interface WorkerDone {
  type: "workerDone";
  worker: number;
}

type WorkerMessage = BatchResult | WorkerDone;

if (process.env.FIND_EMERGENCE_WORKER === "1") {
  runWorker();
} else {
  runCoordinator();
}

function runCoordinator(): void {
  const workerCount = numberFromEnv(
    "FIND_WORKERS",
    Math.max(1, Math.min(availableParallelism() - 2, 8))
  );
  const children: ChildProcessWithoutNullStreams[] = [];
  let found = false;

  console.log(
    `Starting ${workerCount} exact 2D emergence workers. Set FIND_WORKERS, FIND_EPOCHS, FIND_RATES, FIND_MAX_BATCHES, or FIND_THRESHOLD to override.`
  );

  for (let worker = 0; worker < workerCount; worker += 1) {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", new URL(import.meta.url).pathname],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          FIND_EMERGENCE_WORKER: "1",
          FIND_WORKER_INDEX: String(worker),
          FIND_WORKER_COUNT: String(workerCount)
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
        handleWorkerLine(line);
        newline = buffered.indexOf("\n");
      }
    });
    children.push(child);
  }

  function handleWorkerLine(line: string): void {
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
      console.log(`worker ${message.worker} exhausted its assigned batches`);
      if (children.every((child) => child.exitCode !== null)) {
        process.exit(found ? 0 : 1);
      }
      return;
    }

    const row = [
      `worker=${message.worker}`,
      `seed=${message.seed}`,
      `rate=${message.mutationRate}`,
      `epoch=${message.epoch}`,
      `highOrder=${message.highOrderEntropy.toFixed(3)}`,
      `maxHighOrder=${message.maxHighOrderEntropy.toFixed(3)}`,
      `dominant=${(message.dominantProgramFraction * 100).toFixed(2)}%`,
      `top=${message.topProgramCount}`,
      `structure=${message.structureScore.toFixed(3)}`,
      `unique=${(message.uniqueProgramFraction * 100).toFixed(2)}%`,
      `eps=${message.epochsPerSecond.toFixed(1)}`
    ].join(" ");
    console.log(message.detected ? `HIT ${row}` : `done ${row}`);

    if (message.detected && !found) {
      found = true;
      console.log(
        `Emergence detected in exact 2D mode: seed=${message.seed}, mutationRate=${message.mutationRate}, epoch=${message.epoch}.`
      );
      for (const child of children) {
        if (child.exitCode === null) {
          child.kill("SIGTERM");
        }
      }
    }
  }
}

function runWorker(): void {
  const worker = numberFromEnv("FIND_WORKER_INDEX", 0);
  const workerCount = numberFromEnv("FIND_WORKER_COUNT", 1);
  const seedStart = numberFromEnv("FIND_SEED_START", 1);
  const maxBatches = numberFromEnv("FIND_MAX_BATCHES", 64);
  const config = defaultConfig();
  const rates = valuesFromEnv("FIND_RATES", [
    config.mutationRate,
    1 / 4096,
    1 / 2048,
    0.001
  ]);

  for (let batch = worker; batch < maxBatches; batch += workerCount) {
    const seed = seedStart + Math.floor(batch / rates.length);
    const mutationRate = rates[batch % rates.length];
    const result = runBatch(worker, seed, mutationRate);
    console.log(JSON.stringify(result));
    if (result.detected && boolFromEnv("FIND_STOP_ON_HIT", true)) {
      return;
    }
  }

  console.log(JSON.stringify({ type: "workerDone", worker }));
}

function runBatch(
  worker: number,
  seed: number,
  mutationRate: number
): BatchResult {
  const config = defaultConfig();
  const epochBudget = numberFromEnv("FIND_EPOCHS", 24576);
  const sampleInterval = numberFromEnv("FIND_SAMPLE_INTERVAL", 512);
  const highOrderThreshold = numberFromEnv("FIND_THRESHOLD", 0.75);
  const dominantThreshold = numberFromEnv("FIND_DOMINANCE_THRESHOLD", 0.01);
  const uniqueThreshold = numberFromEnv("FIND_UNIQUE_THRESHOLD", 0.98);
  const structureThreshold = numberFromEnv("FIND_STRUCTURE_THRESHOLD", 0.5);
  const sim = new BffSimulator({
    ...config,
    seed,
    mutationRate,
    checkpointInterval: epochBudget + 1,
    metricInterval: sampleInterval
  });

  const started = performance.now();
  let maxHighOrderEntropy = Number.NEGATIVE_INFINITY;
  let latest = sample(sim);
  let detected = false;

  while (sim.epoch < epochBudget && !detected) {
    sim.stepEpoch();
    if (sim.epoch % sampleInterval !== 0 && sim.epoch !== epochBudget) {
      continue;
    }
    latest = sample(sim);
    maxHighOrderEntropy = Math.max(
      maxHighOrderEntropy,
      latest.highOrderEntropy
    );
    detected =
      latest.highOrderEntropy >= highOrderThreshold ||
      (latest.dominantProgramFraction >= dominantThreshold &&
        latest.uniqueProgramFraction <= uniqueThreshold &&
        latest.structureScore >= structureThreshold);
  }

  const elapsedSeconds = (performance.now() - started) / 1000;
  return {
    type: "batch",
    worker,
    seed,
    mutationRate,
    epoch: sim.epoch,
    detected,
    highOrderEntropy: latest.highOrderEntropy,
    maxHighOrderEntropy,
    dominantProgramFraction: latest.dominantProgramFraction,
    topProgramCount: latest.topProgramCount,
    structureScore: latest.structureScore,
    uniqueProgramFraction: latest.uniqueProgramFraction,
    epochsPerSecond: sim.epoch / elapsedSeconds
  };
}

function sample(sim: BffSimulator): {
  highOrderEntropy: number;
  dominantProgramFraction: number;
  topProgramCount: number;
  structureScore: number;
  uniqueProgramFraction: number;
} {
  const status = sim.status(false);
  const top = computeTopPrograms(sim.soup, 1)[0];
  const highOrderEntropy = computeHighOrderEntropy(sim.soup);
  return {
    highOrderEntropy,
    dominantProgramFraction: status.latestMetric.dominantProgramFraction,
    topProgramCount: top?.count ?? 1,
    structureScore: status.latestMetric.structureScore,
    uniqueProgramFraction: status.latestMetric.uniqueProgramFraction
  };
}

function computeHighOrderEntropy(soup: Uint8Array): number {
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
  return byteEntropyBpb - (compressed.length * 8) / soup.length;
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

function valuesFromEnv(name: string, fallback: number[]): number[] {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }
  const parsed = value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((number) => Number.isFinite(number) && number >= 0);
  return parsed.length > 0 ? parsed : fallback;
}
