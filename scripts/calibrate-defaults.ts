import { BffSimulator, defaultConfig } from "../src/simulation/simulator";

const fullSeedCount = numberFromEnv("CALIBRATE_SEEDS", 8);
const epochBudget = numberFromEnv("CALIBRATE_EPOCHS", 1024);
const gridWidth = numberFromEnv("CALIBRATE_GRID_WIDTH", defaultConfig().gridWidth);
const gridHeight = numberFromEnv("CALIBRATE_GRID_HEIGHT", defaultConfig().gridHeight);
const metricInterval = numberFromEnv("CALIBRATE_METRIC_INTERVAL", 128);
const rates = valuesFromEnv("CALIBRATE_MUTATION_RATES", [
  1 / 8192,
  1 / 4096,
  1 / 2048,
  0.001
]);

interface CalibrationResult {
  seed: number;
  mutationRate: number;
  score: number;
  maxStructureScore: number;
  finalStructureScore: number;
  finalDominantProgramFraction: number;
  finalUniqueProgramFraction: number;
  epochsPerSecond: number;
}

const results: CalibrationResult[] = [];

for (let seed = 1; seed <= fullSeedCount; seed += 1) {
  for (const mutationRate of rates) {
    const result = runCandidate(seed, mutationRate);
    results.push(result);
    console.log(
      `${formatSeed(seed)} rate=${mutationRate.toPrecision(5)} score=${result.score.toFixed(4)} maxStructure=${result.maxStructureScore.toFixed(4)} eps=${result.epochsPerSecond.toFixed(1)}`
    );
  }
}

results.sort((a, b) => b.score - a.score);
console.log("\nRecommended candidates:");
console.log(JSON.stringify(results.slice(0, 10), null, 2));

function runCandidate(seed: number, mutationRate: number): CalibrationResult {
  const sim = new BffSimulator({
    gridWidth,
    gridHeight,
    seed,
    mutationRate,
    checkpointInterval: Math.max(epochBudget + 1, 1),
    metricInterval,
    timeBudgetMs: 10,
    maxInstructionReads: defaultConfig().maxInstructionReads
  });
  const started = performance.now();
  while (sim.epoch < epochBudget) {
    sim.stepEpoch();
  }
  const elapsedSeconds = (performance.now() - started) / 1000;
  const history = sim.status(false).metricHistory;
  const maxStructureScore = Math.max(
    0,
    ...history.map((sample) => sample.structureScore)
  );
  const final = history.at(-1) ?? sim.status(false).latestMetric;
  const baseline = history.slice(0, Math.min(8, history.length));
  const baselineScore =
    baseline.length > 0
      ? baseline.reduce((sum, sample) => sum + sample.structureScore, 0) /
        baseline.length
      : 0;
  const sustainedGain =
    history
      .slice(-3)
      .reduce(
        (sum, sample) => sum + Math.max(0, sample.structureScore - baselineScore),
        0
      ) / Math.max(1, Math.min(3, history.length));
  const score =
    maxStructureScore * 0.45 +
    sustainedGain * 0.35 +
    final.dominantProgramFraction * 0.15 +
    (1 - final.uniqueProgramFraction) * 0.05;

  return {
    seed,
    mutationRate,
    score,
    maxStructureScore,
    finalStructureScore: final.structureScore,
    finalDominantProgramFraction: final.dominantProgramFraction,
    finalUniqueProgramFraction: final.uniqueProgramFraction,
    epochsPerSecond: sim.epoch / elapsedSeconds
  };
}

function numberFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
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

function formatSeed(seed: number): string {
  return `seed=${String(seed).padStart(3, " ")}`;
}
