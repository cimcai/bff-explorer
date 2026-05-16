import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { availableParallelism } from "node:os";
import { programToGlyphs, type ProgramSummary } from "../src/simulation/programSummary";
import { BffSimulator, defaultConfig } from "../src/simulation/simulator";

interface RateConfig {
  label: string;
  mutationRate: number;
}

interface VisibleSample {
  epoch: number;
  topProgramCount: number;
  dominantProgramFraction: number;
  structureScore: number;
  uniqueProgramFraction: number;
  topProgram: ProgramSummary | null;
}

interface BatchResult extends VisibleSample {
  type: "batch";
  worker: number;
  seed: number;
  rateLabel: string;
  mutationRate: number;
  detected: boolean;
  bestEpoch: number;
  maxTopProgramCount: number;
  maxDominantProgramFraction: number;
  candidateGlyphs: string | null;
  shareUrl: string;
  epochsPerSecond: number;
}

interface WorkerProgress extends VisibleSample {
  type: "progress";
  worker: number;
  seed: number;
  rateLabel: string;
  mutationRate: number;
  maxTopProgramCount: number;
  maxDominantProgramFraction: number;
  epochsPerSecond: number;
}

interface WorkerDone {
  type: "workerDone";
  worker: number;
}

type WorkerMessage = BatchResult | WorkerDone | WorkerProgress;

if (process.env.VISIBLE_REPLICATION_WORKER === "1") {
  runWorker();
} else {
  await runCoordinator();
}

async function runCoordinator(): Promise<void> {
  const workerCount = numberFromEnv(
    "VISIBLE_WORKERS",
    Math.max(1, Math.min(availableParallelism() - 2, 10))
  );
  const children: ChildProcessWithoutNullStreams[] = [];
  const exits: Array<Promise<void>> = [];
  let found = false;

  console.log(
    JSON.stringify(
      {
        test: "visible-replication-search",
        workers: workerCount,
        seedStart: numberFromEnv("VISIBLE_SEED_START", 1),
        maxBatches: numberFromEnv("VISIBLE_MAX_BATCHES", 200),
        epochBudget: epochBudget(),
        sampleInterval: sampleInterval(),
        progressInterval: progressInterval(),
        rates: rateConfigs(),
        detection: {
          topProgramCountThreshold: topProgramCountThreshold(),
          dominanceThreshold: dominanceThreshold()
        }
      },
      null,
      2
    )
  );

  for (let worker = 0; worker < workerCount; worker += 1) {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", new URL(import.meta.url).pathname],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          VISIBLE_REPLICATION_WORKER: "1",
          VISIBLE_WORKER_INDEX: String(worker),
          VISIBLE_WORKER_COUNT: String(workerCount)
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
        handleWorkerLine(line, children, (hit) => {
          found ||= hit;
        });
        newline = buffered.indexOf("\n");
      }
    });
    children.push(child);
    exits.push(waitForChild(child));
  }

  await Promise.allSettled(exits);
  if (!found) {
    console.log("\nNo visible replication candidate found in this search budget.");
    process.exitCode = 1;
  }
}

function runWorker(): void {
  const worker = numberFromEnv("VISIBLE_WORKER_INDEX", 0);
  const workerCount = numberFromEnv("VISIBLE_WORKER_COUNT", 1);
  const seedStart = numberFromEnv("VISIBLE_SEED_START", 1);
  const maxBatches = numberFromEnv("VISIBLE_MAX_BATCHES", 200);
  const rates = rateConfigs();

  for (let task = worker; task < maxBatches; task += workerCount) {
    const seed = seedStart + Math.floor(task / rates.length);
    const rate = rates[task % rates.length];
    const result = runBatch(worker, seed, rate);
    console.log(JSON.stringify(result));
    if (result.detected && boolFromEnv("VISIBLE_STOP_ON_HIT", true)) {
      return;
    }
  }

  console.log(JSON.stringify({ type: "workerDone", worker }));
}

function runBatch(
  worker: number,
  seed: number,
  rate: RateConfig
): BatchResult {
  const config = defaultConfig();
  const sim = new BffSimulator({
    ...config,
    seed,
    mutationRate: rate.mutationRate,
    checkpointInterval: epochBudget() + 1,
    metricInterval: sampleInterval()
  });
  const started = performance.now();
  let latest = sample(sim);
  let best = latest;
  let nextProgressEpoch = progressInterval();

  while (sim.epoch < epochBudget()) {
    sim.stepEpoch();
    if (sim.epoch % sampleInterval() !== 0 && sim.epoch !== epochBudget()) {
      continue;
    }

    latest = sample(sim);
    if (scoreSample(latest) > scoreSample(best)) {
      best = latest;
    }
    if (latest.epoch >= nextProgressEpoch || latest.epoch === epochBudget()) {
      console.log(
        JSON.stringify(progressResult(worker, seed, rate, latest, best, started))
      );
      nextProgressEpoch += progressInterval();
    }
    if (isVisibleCandidate(latest)) {
      return batchResult(worker, seed, rate, latest, best, started, true);
    }
  }

  return batchResult(worker, seed, rate, latest, best, started, false);
}

function sample(sim: BffSimulator): VisibleSample {
  const status = sim.status(false);
  const topProgram = status.topPrograms[0] ?? null;
  return {
    epoch: sim.epoch,
    topProgramCount: topProgram?.count ?? 1,
    dominantProgramFraction: status.latestMetric.dominantProgramFraction,
    structureScore: status.latestMetric.structureScore,
    uniqueProgramFraction: status.latestMetric.uniqueProgramFraction,
    topProgram
  };
}

function isVisibleCandidate(sampleAtEpoch: VisibleSample): boolean {
  return (
    sampleAtEpoch.topProgramCount >= topProgramCountThreshold() ||
    sampleAtEpoch.dominantProgramFraction >= dominanceThreshold()
  );
}

function scoreSample(sampleAtEpoch: VisibleSample): number {
  return Math.max(
    sampleAtEpoch.topProgramCount / topProgramCountThreshold(),
    sampleAtEpoch.dominantProgramFraction / dominanceThreshold()
  );
}

function progressResult(
  worker: number,
  seed: number,
  rate: RateConfig,
  latest: VisibleSample,
  best: VisibleSample,
  started: number
): WorkerProgress {
  return {
    type: "progress",
    worker,
    seed,
    rateLabel: rate.label,
    mutationRate: rate.mutationRate,
    ...latest,
    maxTopProgramCount: best.topProgramCount,
    maxDominantProgramFraction: best.dominantProgramFraction,
    epochsPerSecond: latest.epoch / elapsedSeconds(started)
  };
}

function batchResult(
  worker: number,
  seed: number,
  rate: RateConfig,
  latest: VisibleSample,
  best: VisibleSample,
  started: number,
  detected: boolean
): BatchResult {
  return {
    type: "batch",
    worker,
    seed,
    rateLabel: rate.label,
    mutationRate: rate.mutationRate,
    detected,
    ...latest,
    bestEpoch: best.epoch,
    maxTopProgramCount: best.topProgramCount,
    maxDominantProgramFraction: best.dominantProgramFraction,
    candidateGlyphs: best.topProgram ? programToGlyphs(best.topProgram.bytes) : null,
    shareUrl: shareUrl(seed, rate.mutationRate),
    epochsPerSecond: latest.epoch / elapsedSeconds(started)
  };
}

function handleWorkerLine(
  line: string,
  children: ChildProcessWithoutNullStreams[],
  setFound: (hit: boolean) => void
): void {
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

  const row = [
    `worker=${message.worker}`,
    `rate=${message.rateLabel}`,
    `seed=${message.seed}`,
    `epoch=${message.epoch}`,
    `top=${message.topProgramCount}`,
    `dominant=${(message.dominantProgramFraction * 100).toFixed(3)}%`,
    `maxTop=${message.maxTopProgramCount}`,
    `maxDominant=${(message.maxDominantProgramFraction * 100).toFixed(3)}%`,
    `structure=${message.structureScore.toFixed(3)}`,
    `eps=${message.epochsPerSecond.toFixed(1)}`
  ].join(" ");

  if (message.type === "progress") {
    console.log(`progress ${row}`);
    return;
  }

  console.log(message.detected ? `HIT ${row}` : `done ${row}`);
  if (message.detected) {
    console.log(
      JSON.stringify(
        {
          seed: message.seed,
          mutationRate: message.mutationRate,
          epoch: message.epoch,
          topProgramCount: message.topProgramCount,
          dominantProgramFraction: message.dominantProgramFraction,
          candidateGlyphs: message.candidateGlyphs,
          shareUrl: message.shareUrl
        },
        null,
        2
      )
    );
    setFound(true);
    if (boolFromEnv("VISIBLE_STOP_ON_HIT", true)) {
      for (const child of children) {
        if (child.exitCode === null) {
          child.kill("SIGTERM");
        }
      }
    }
  }
}

function waitForChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0 || signal === "SIGTERM") {
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

function rateConfigs(): RateConfig[] {
  const config = defaultConfig();
  const values = valuesFromEnv("VISIBLE_RATES", [
    config.mutationRate,
    1 / 16384,
    1 / 4096,
    1 / 32768,
    1 / 2048
  ]);
  return values.map((mutationRate) => ({
    label: mutationRate.toPrecision(6),
    mutationRate
  }));
}

function shareUrl(seed: number, mutationRate: number): string {
  const params = new URLSearchParams({
    fixedSeed: "1",
    seed: String(seed),
    mutationRate: String(mutationRate),
    metricInterval: String(sampleInterval()),
    checkpointInterval: "512",
    timeBudgetMs: "32"
  });
  return `https://dangirsh.org/bff/?${params.toString()}`;
}

function epochBudget(): number {
  return numberFromEnv("VISIBLE_EPOCHS", 32768);
}

function sampleInterval(): number {
  return numberFromEnv("VISIBLE_SAMPLE_INTERVAL", 512);
}

function progressInterval(): number {
  return numberFromEnv("VISIBLE_PROGRESS_INTERVAL", 4096);
}

function topProgramCountThreshold(): number {
  return numberFromEnv("VISIBLE_TOP_COUNT_THRESHOLD", 500);
}

function dominanceThreshold(): number {
  return numberFromEnv("VISIBLE_DOMINANCE_THRESHOLD", 0.01);
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
