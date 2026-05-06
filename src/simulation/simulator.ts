import {
  DEFAULT_CHECKPOINT_INTERVAL,
  DEFAULT_GRID_HEIGHT,
  DEFAULT_GRID_WIDTH,
  DEFAULT_MAX_INSTRUCTION_READS,
  DEFAULT_METRIC_INTERVAL,
  DEFAULT_MUTATION_RATE,
  DEFAULT_TIME_BUDGET_MS,
  MAX_CHECKPOINTS,
  METRIC_HISTORY_LIMIT,
  PAIR_TAPE_SIZE,
  TAPE_SIZE,
  TILE_SIZE
} from "./constants";
import { evaluateTape } from "./bff";
import {
  buildRadius2NeighborTable,
  initializeOrder,
  selectPairsFromTableInto,
  type NeighborTable
} from "./grid";
import {
  computeEmergenceMetric,
  type MetricSnapshot
} from "./metrics";
import {
  mutateBytesWithCachedRate,
  mutationLogKeep
} from "./mutation";
import {
  computeTopPrograms,
  type ProgramSummary
} from "./programSummary";
import { XorShift32, splitMix32 } from "./rng";

export interface SimulationConfig {
  gridWidth: number;
  gridHeight: number;
  seed: number;
  mutationRate: number;
  checkpointInterval: number;
  metricInterval: number;
  timeBudgetMs: number;
  maxInstructionReads: number;
}

export interface EpochStats {
  epoch: number;
  pairs: number;
  instructionReads: number;
  activeOps: number;
}

export interface BatchStats {
  epochsRun: number;
  elapsedMs: number;
  pairs: number;
  instructionReads: number;
  activeOps: number;
}

export type RuntimeConfigUpdate = Partial<
  Pick<
    SimulationConfig,
    | "mutationRate"
    | "checkpointInterval"
    | "metricInterval"
    | "timeBudgetMs"
  >
>;

export interface CheckpointSummary {
  id: number;
  epoch: number;
  isActive: boolean;
}

interface Checkpoint {
  id: number;
  epoch: number;
  scheduleRngState: number;
  mutationRngState: number;
  interventionRngState: number;
  soup: Uint8Array;
  metricHistory: MetricSnapshot[];
}

export interface CheckpointView {
  id: number;
  epoch: number;
  soup: Uint8Array;
  metricHistory: MetricSnapshot[];
}

export interface SimulationStatus {
  running: boolean;
  epoch: number;
  gridWidth: number;
  gridHeight: number;
  renderWidth: number;
  renderHeight: number;
  epochsPerSecond: number;
  renderFps: number;
  pairsPerEpoch: number;
  avgInstructionReadsPerPair: number;
  activeOpsPerEpoch: number;
  checkpoints: CheckpointSummary[];
  isViewingCheckpoint: boolean;
  activeCheckpointId: number | null;
  latestMetric: MetricSnapshot;
  metricHistory: MetricSnapshot[];
  topPrograms: ProgramSummary[];
}

export function defaultConfig(): SimulationConfig {
  return {
    gridWidth: DEFAULT_GRID_WIDTH,
    gridHeight: DEFAULT_GRID_HEIGHT,
    seed: 0,
    mutationRate: DEFAULT_MUTATION_RATE,
    checkpointInterval: DEFAULT_CHECKPOINT_INTERVAL,
    metricInterval: DEFAULT_METRIC_INTERVAL,
    timeBudgetMs: DEFAULT_TIME_BUDGET_MS,
    maxInstructionReads: DEFAULT_MAX_INSTRUCTION_READS
  };
}

export class BffSimulator {
  config: SimulationConfig;
  soup: Uint8Array;
  epoch = 0;
  private scheduleRng: XorShift32;
  private mutationRng: XorShift32;
  private interventionRng: XorShift32;
  private neighbors: NeighborTable;
  private order: Uint32Array;
  private used: Uint8Array;
  private pairsA: Uint32Array;
  private pairsB: Uint32Array;
  private pairTape = new Uint8Array(PAIR_TAPE_SIZE);
  private checkpoints: Checkpoint[] = [];
  private nextCheckpointId = 1;
  private isViewingCheckpoint = false;
  private activeCheckpointId: number | null = null;
  private metricHistory: MetricSnapshot[] = [];
  private topPrograms: ProgramSummary[] = [];
  private lastBatch: BatchStats = emptyBatchStats();
  private lastRenderFps = 0;
  private mutationLogKeep = 0;

  constructor(config: Partial<SimulationConfig> = {}) {
    this.config = sanitizeConfig({ ...defaultConfig(), ...config });
    this.soup = new Uint8Array(0);
    this.scheduleRng = createRng(this.config.seed, RNG_STREAM_SCHEDULE);
    this.mutationRng = createRng(this.config.seed, RNG_STREAM_MUTATION);
    this.interventionRng = createRng(this.config.seed, RNG_STREAM_INTERVENTION);
    this.neighbors = buildRadius2NeighborTable(0, 0);
    this.order = new Uint32Array(0);
    this.used = new Uint8Array(0);
    this.pairsA = new Uint32Array(0);
    this.pairsB = new Uint32Array(0);
    this.allocateRuntimeState();
    this.initializeRunState();
  }

  get renderWidth(): number {
    return this.config.gridWidth * TILE_SIZE;
  }

  get renderHeight(): number {
    return this.config.gridHeight * TILE_SIZE;
  }

  reset(config: Partial<SimulationConfig> = {}): void {
    this.config = sanitizeConfig({ ...this.config, ...config });
    this.allocateRuntimeState();
    this.initializeRunState();
  }

  private allocateRuntimeState(): void {
    const programCount = this.config.gridWidth * this.config.gridHeight;
    this.mutationLogKeep = mutationLogKeep(this.config.mutationRate);
    this.soup = new Uint8Array(programCount * TAPE_SIZE);
    this.scheduleRng = createRng(this.config.seed, RNG_STREAM_SCHEDULE);
    this.mutationRng = createRng(this.config.seed, RNG_STREAM_MUTATION);
    this.interventionRng = createRng(this.config.seed, RNG_STREAM_INTERVENTION);
    this.neighbors = buildRadius2NeighborTable(
      this.config.gridWidth,
      this.config.gridHeight
    );
    this.order = new Uint32Array(programCount);
    this.used = new Uint8Array(programCount);
    this.pairsA = new Uint32Array(Math.ceil(programCount / 2));
    this.pairsB = new Uint32Array(Math.ceil(programCount / 2));
    initializeOrder(this.order);
  }

  private initializeRunState(): void {
    this.epoch = 0;
    this.checkpoints = [];
    this.nextCheckpointId = 1;
    this.isViewingCheckpoint = false;
    this.activeCheckpointId = null;
    this.metricHistory = [];
    this.topPrograms = [];
    this.lastBatch = emptyBatchStats();
    this.lastRenderFps = 0;
    this.initializeSoup();
    this.recordMetric();
    this.addCheckpoint();
  }

  updateRuntimeConfig(update: RuntimeConfigUpdate): void {
    const next = sanitizeConfig({ ...this.config, ...update });
    this.config.mutationRate = next.mutationRate;
    this.config.checkpointInterval = next.checkpointInterval;
    this.config.metricInterval = next.metricInterval;
    this.config.timeBudgetMs = next.timeBudgetMs;
    this.mutationLogKeep = mutationLogKeep(this.config.mutationRate);
  }

  injectProgramRandomly(bytes: ArrayLike<number>, requestedCount: number): number {
    if (bytes.length !== TAPE_SIZE) {
      throw new Error(`Injected program must be exactly ${TAPE_SIZE} bytes`);
    }

    const programCount = this.config.gridWidth * this.config.gridHeight;
    const insertedCount = clampInteger(requestedCount, 0, programCount);
    if (insertedCount === 0) {
      return 0;
    }

    this.commitPreviewBranch();
    initializeOrder(this.order);
    for (let i = 0; i < insertedCount; i += 1) {
      const j = i + this.interventionRng.nextInt(programCount - i);
      const selected = this.order[j];
      this.order[j] = this.order[i];
      this.order[i] = selected;
      this.soup.set(bytes, selected * TAPE_SIZE);
    }

    this.recordMetric();
    this.addCheckpoint();
    return insertedCount;
  }

  stepEpoch(): EpochStats {
    this.commitPreviewBranch();
    initializeOrder(this.order);
    const pairCount = selectPairsFromTableInto(
      this.order,
      this.used,
      this.neighbors,
      this.scheduleRng,
      this.pairsA,
      this.pairsB
    );
    let instructionReads = 0;
    let activeOps = 0;

    for (let i = 0; i < pairCount; i += 1) {
      const offsetA = this.pairsA[i] * TAPE_SIZE;
      const offsetB = this.pairsB[i] * TAPE_SIZE;
      this.pairTape.set(this.soup.subarray(offsetA, offsetA + TAPE_SIZE), 0);
      this.pairTape.set(
        this.soup.subarray(offsetB, offsetB + TAPE_SIZE),
        TAPE_SIZE
      );
      mutateBytesWithCachedRate(
        this.pairTape,
        0,
        PAIR_TAPE_SIZE,
        this.config.mutationRate,
        this.mutationLogKeep,
        this.mutationRng
      );
      const result = evaluateTape(
        this.pairTape,
        this.config.maxInstructionReads
      );
      instructionReads += result.instructionReads;
      activeOps += result.activeOps;
      this.soup.set(this.pairTape.subarray(0, TAPE_SIZE), offsetA);
      this.soup.set(this.pairTape.subarray(TAPE_SIZE), offsetB);
    }

    this.mutateUnusedPrograms();

    this.epoch += 1;
    if (this.epoch % this.config.metricInterval === 0) {
      this.recordMetric();
    }
    if (this.epoch % this.config.checkpointInterval === 0) {
      this.addCheckpoint();
    }

    return {
      epoch: this.epoch,
      pairs: pairCount,
      instructionReads,
      activeOps
    };
  }

  runForBudget(timeBudgetMs = this.config.timeBudgetMs): BatchStats {
    const started = performance.now();
    let epochsRun = 0;
    let pairs = 0;
    let instructionReads = 0;
    let activeOps = 0;

    do {
      const stats = this.stepEpoch();
      epochsRun += 1;
      pairs += stats.pairs;
      instructionReads += stats.instructionReads;
      activeOps += stats.activeOps;
    } while (performance.now() - started < timeBudgetMs);

    this.lastBatch = {
      epochsRun,
      elapsedMs: performance.now() - started,
      pairs,
      instructionReads,
      activeOps
    };
    return this.lastBatch;
  }

  previewCheckpoint(id: number): boolean {
    const checkpoint = this.findCheckpoint(id);
    if (!checkpoint) {
      return false;
    }
    this.soup.set(checkpoint.soup);
    this.epoch = checkpoint.epoch;
    this.scheduleRng.setState(checkpoint.scheduleRngState);
    this.mutationRng.setState(checkpoint.mutationRngState);
    this.interventionRng.setState(checkpoint.interventionRngState);
    this.metricHistory = checkpoint.metricHistory.map((sample) => ({
      ...sample
    }));
    this.recordTopPrograms();
    this.isViewingCheckpoint = true;
    this.activeCheckpointId = checkpoint.id;
    return true;
  }

  getCheckpointView(id: number): CheckpointView | null {
    const checkpoint = this.findCheckpoint(id);
    if (!checkpoint) {
      return null;
    }
    return {
      id: checkpoint.id,
      epoch: checkpoint.epoch,
      soup: checkpoint.soup.slice(),
      metricHistory: checkpoint.metricHistory.map((sample) => ({ ...sample }))
    };
  }

  commitPreviewBranch(): void {
    if (!this.isViewingCheckpoint || this.activeCheckpointId === null) {
      return;
    }
    const checkpointIndex = this.checkpoints.findIndex(
      (checkpoint) => checkpoint.id === this.activeCheckpointId
    );
    if (checkpointIndex >= 0) {
      this.checkpoints = this.checkpoints.slice(0, checkpointIndex + 1);
    }
    this.isViewingCheckpoint = false;
  }

  getCheckpointSummaries(): CheckpointSummary[] {
    return this.checkpoints.map((checkpoint) => ({
      id: checkpoint.id,
      epoch: checkpoint.epoch,
      isActive: checkpoint.id === this.activeCheckpointId
    }));
  }

  recordRender(elapsedMs: number): void {
    this.lastRenderFps = elapsedMs > 0 ? 1000 / elapsedMs : 0;
  }

  status(running: boolean): SimulationStatus {
    const batch = this.lastBatch;
    const epochsPerSecond =
      batch.elapsedMs > 0 ? (batch.epochsRun * 1000) / batch.elapsedMs : 0;
    const pairsPerEpoch = batch.epochsRun > 0 ? batch.pairs / batch.epochsRun : 0;
    const avgInstructionReadsPerPair =
      batch.pairs > 0 ? batch.instructionReads / batch.pairs : 0;
    const activeOpsPerEpoch =
      batch.epochsRun > 0 ? batch.activeOps / batch.epochsRun : 0;

    return {
      running,
      epoch: this.epoch,
      gridWidth: this.config.gridWidth,
      gridHeight: this.config.gridHeight,
      renderWidth: this.renderWidth,
      renderHeight: this.renderHeight,
      epochsPerSecond,
      renderFps: this.lastRenderFps,
      pairsPerEpoch,
      avgInstructionReadsPerPair,
      activeOpsPerEpoch,
      checkpoints: this.getCheckpointSummaries(),
      isViewingCheckpoint: this.isViewingCheckpoint,
      activeCheckpointId: this.activeCheckpointId,
      latestMetric: this.metricHistory[this.metricHistory.length - 1],
      metricHistory: this.metricHistory.map((sample) => ({ ...sample })),
      topPrograms: this.topPrograms.map((program) => ({
        ...program,
        bytes: [...program.bytes]
      }))
    };
  }

  private initializeSoup(): void {
    const rng = createRng(this.config.seed, RNG_STREAM_INITIAL_SOUP);
    for (let i = 0; i < this.soup.length; i += 1) {
      this.soup[i] = rng.nextUint32() & 255;
    }
  }

  private addCheckpoint(): void {
    const checkpoint: Checkpoint = {
      id: this.nextCheckpointId,
      epoch: this.epoch,
      scheduleRngState: this.scheduleRng.getState(),
      mutationRngState: this.mutationRng.getState(),
      interventionRngState: this.interventionRng.getState(),
      soup: this.soup.slice(),
      metricHistory: this.metricHistory.map((sample) => ({ ...sample }))
    };
    this.nextCheckpointId += 1;
    this.checkpoints.push(checkpoint);
    if (this.checkpoints.length > MAX_CHECKPOINTS) {
      this.checkpoints.shift();
    }
    this.activeCheckpointId = checkpoint.id;
  }

  private recordMetric(): void {
    const sample = computeEmergenceMetric(
      this.soup,
      this.epoch,
      this.metricHistory
    );
    this.metricHistory.push(sample);
    if (this.metricHistory.length > METRIC_HISTORY_LIMIT) {
      this.metricHistory.shift();
    }
    this.recordTopPrograms();
  }

  private findCheckpoint(id: number): Checkpoint | undefined {
    return this.checkpoints.find((checkpoint) => checkpoint.id === id);
  }

  private recordTopPrograms(): void {
    this.topPrograms = computeTopPrograms(this.soup, 10);
  }

  private mutateUnusedPrograms(): void {
    if (this.config.mutationRate <= 0) {
      return;
    }

    for (let program = 0; program < this.used.length; program += 1) {
      if (this.used[program]) {
        continue;
      }
      mutateBytesWithCachedRate(
        this.soup,
        program * TAPE_SIZE,
        TAPE_SIZE,
        this.config.mutationRate,
        this.mutationLogKeep,
        this.mutationRng
      );
    }
  }
}

const RNG_STREAM_INITIAL_SOUP = 0x6d2b79f5;
const RNG_STREAM_SCHEDULE = 0x1b56c4e9;
const RNG_STREAM_MUTATION = 0xa511e9b3;
const RNG_STREAM_INTERVENTION = 0x8f3d9a41;

function createRng(seed: number, stream: number): XorShift32 {
  return new XorShift32(splitMix32((seed ^ stream) >>> 0));
}

export function sanitizeConfig(config: SimulationConfig): SimulationConfig {
  return {
    gridWidth: Math.max(2, Math.floor(config.gridWidth)),
    gridHeight: Math.max(2, Math.floor(config.gridHeight)),
    seed: Math.floor(config.seed) >>> 0,
    mutationRate: clampNumber(config.mutationRate, 0, 1),
    checkpointInterval: Math.max(1, Math.floor(config.checkpointInterval)),
    metricInterval: Math.max(1, Math.floor(config.metricInterval)),
    timeBudgetMs: clampNumber(config.timeBudgetMs, 1, 100),
    maxInstructionReads: Math.max(1, Math.floor(config.maxInstructionReads))
  };
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function emptyBatchStats(): BatchStats {
  return {
    epochsRun: 0,
    elapsedMs: 0,
    pairs: 0,
    instructionReads: 0,
    activeOps: 0
  };
}
