import type { WorkerInMessage, WorkerOutMessage } from "../types";
import { buildPalette } from "../simulation/palette";
import { renderSoupToImageData } from "../simulation/render";
import { computeTopPrograms } from "../simulation/programSummary";
import {
  BffSimulator,
  defaultConfig,
  type CheckpointView,
  type SimulationStatus
} from "../simulation/simulator";

let simulator = new BffSimulator(defaultConfig());
let running = false;
let viewedCheckpoint: CheckpointView | null = null;
let tickTimer: number | undefined;
let offscreenCanvas: OffscreenCanvas | undefined;
let offscreenContext: OffscreenCanvasRenderingContext2D | null = null;
let offscreenImageData: ImageData | undefined;
let fallbackImageData: ImageData | undefined;
const palette = buildPalette();
const PUBLISH_INTERVAL_MS = 100;
const BACKGROUND_PUBLISH_INTERVAL_MS = 10_000;
const FOREGROUND_TARGET_COMPUTE_DUTY_CYCLE = 0.55;
const BACKGROUND_TARGET_COMPUTE_DUTY_CYCLE = 0.02;
const BACKGROUND_TIME_BUDGET_MS = 1;
const MIN_BACKGROUND_TICK_INTERVAL_MS = 5_000;
let lastPublishAt = 0;
let pageVisible = true;

self.onmessage = (event: MessageEvent<WorkerInMessage>) => {
  const message = event.data;
  switch (message.type) {
    case "init":
      simulator = new BffSimulator(message.config);
      viewedCheckpoint = null;
      if (message.useOffscreen && message.canvas) {
        attachOffscreenCanvas(message.canvas);
      }
      publishFrameAndStatus(true);
      break;
    case "play":
      simulator.commitPreviewBranch();
      running = true;
      scheduleTick();
      postStatus();
      break;
    case "pause":
      pauseSimulation();
      postStatus();
      break;
    case "setPageVisible":
      setPageVisible(message.visible);
      break;
    case "reset":
      pauseSimulation();
      viewedCheckpoint = null;
      simulator.reset(message.config);
      resizeOffscreenIfNeeded();
      publishFrameAndStatus(true);
      break;
    case "updateConfig":
      simulator.updateRuntimeConfig(message.config);
      postStatus();
      break;
    case "injectProgram":
      injectProgram(message.presetId, message.bytes, message.count);
      break;
    case "previewCheckpoint": {
      const view = simulator.getCheckpointView(message.checkpointId);
      const ok = view !== null;
      if (view) {
        viewedCheckpoint = view;
      }
      renderAndPost();
      lastPublishAt = performance.now();
      post({
        type: "previewComplete",
        requestId: message.requestId,
        ok,
        status: statusForClient()
      });
      break;
    }
    case "showLive":
      viewedCheckpoint = null;
      publishFrameAndStatus(true);
      break;
  }
};

function injectProgram(
  presetId: string,
  bytes: Uint8Array,
  requestedCount: number
): void {
  let insertedCount = 0;
  let error: string | null = null;
  try {
    if (viewedCheckpoint) {
      simulator.previewCheckpoint(viewedCheckpoint.id);
      viewedCheckpoint = null;
    }
    insertedCount = simulator.injectProgramRandomly(bytes, requestedCount);
    renderAndPost();
    lastPublishAt = performance.now();
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Injection failed.";
  }

  post({
    type: "injectionComplete",
    presetId,
    requestedCount,
    insertedCount,
    status: statusForClient(),
    error
  });
}

function pauseSimulation(): void {
  running = false;
  if (tickTimer !== undefined) {
    clearTimeout(tickTimer);
    tickTimer = undefined;
  }
}

function scheduleTick(): void {
  if (tickTimer !== undefined) {
    return;
  }
  tickTimer = self.setTimeout(runTick, nextTickDelay(0));
}

function runTick(): void {
  tickTimer = undefined;
  if (!running) {
    return;
  }

  const started = performance.now();
  simulator.runForBudget(currentTimeBudgetMs());
  const elapsedMs = performance.now() - started;
  publishFrameAndStatus(false);

  if (running) {
    tickTimer = self.setTimeout(runTick, nextTickDelay(elapsedMs));
  }
}

function setPageVisible(visible: boolean): void {
  if (pageVisible === visible) {
    return;
  }
  pageVisible = visible;
  if (tickTimer !== undefined) {
    clearTimeout(tickTimer);
    tickTimer = undefined;
  }
  if (visible) {
    publishFrameAndStatus(true);
  }
  if (running) {
    scheduleTick();
  }
}

function currentTimeBudgetMs(): number {
  return pageVisible
    ? simulator.config.timeBudgetMs
    : Math.min(BACKGROUND_TIME_BUDGET_MS, simulator.config.timeBudgetMs);
}

function nextTickDelay(elapsedMs: number): number {
  if (!pageVisible) {
    return Math.max(
      MIN_BACKGROUND_TICK_INTERVAL_MS,
      computeYieldDelay(elapsedMs, BACKGROUND_TARGET_COMPUTE_DUTY_CYCLE)
    );
  }
  return computeYieldDelay(elapsedMs, FOREGROUND_TARGET_COMPUTE_DUTY_CYCLE);
}

function computeYieldDelay(elapsedMs: number, targetDutyCycle: number): number {
  if (elapsedMs <= 0) {
    return 0;
  }
  const delay = elapsedMs * ((1 - targetDutyCycle) / targetDutyCycle);
  return Math.max(0, delay);
}

function attachOffscreenCanvas(canvas: OffscreenCanvas): void {
  offscreenCanvas = canvas;
  offscreenContext = canvas.getContext("2d", { alpha: false });
  resizeOffscreenIfNeeded();
}

function resizeOffscreenIfNeeded(): void {
  if (!offscreenCanvas) {
    return;
  }
  if (
    offscreenCanvas.width !== simulator.renderWidth ||
    offscreenCanvas.height !== simulator.renderHeight
  ) {
    offscreenCanvas.width = simulator.renderWidth;
    offscreenCanvas.height = simulator.renderHeight;
    offscreenImageData = undefined;
  }
}

function renderAndPost(): void {
  const renderStarted = performance.now();
  const soup = viewedCheckpoint?.soup ?? simulator.soup;
  if (offscreenContext) {
    resizeOffscreenIfNeeded();
    offscreenImageData ??= offscreenContext.createImageData(
      simulator.renderWidth,
      simulator.renderHeight
    );
    renderSoupToImageData(
      soup,
      simulator.config.gridWidth,
      simulator.config.gridHeight,
      palette,
      offscreenImageData
    );
    offscreenContext.putImageData(offscreenImageData, 0, 0);
  } else {
    fallbackImageData =
      fallbackImageData &&
      fallbackImageData.width === simulator.renderWidth &&
      fallbackImageData.height === simulator.renderHeight
        ? fallbackImageData
        : new ImageData(simulator.renderWidth, simulator.renderHeight);
    renderSoupToImageData(
      soup,
      simulator.config.gridWidth,
      simulator.config.gridHeight,
      palette,
      fallbackImageData
    );
    const copied = new Uint8ClampedArray(fallbackImageData.data);
    post({
      type: "frame",
      width: simulator.renderWidth,
      height: simulator.renderHeight,
      buffer: copied.buffer
    }, [copied.buffer]);
  }
  simulator.recordRender(performance.now() - renderStarted);
}

function publishFrameAndStatus(force: boolean): void {
  const now = performance.now();
  const publishInterval = pageVisible
    ? PUBLISH_INTERVAL_MS
    : BACKGROUND_PUBLISH_INTERVAL_MS;
  if (!force && now - lastPublishAt < publishInterval) {
    return;
  }
  if (pageVisible || force) {
    renderAndPost();
  }
  lastPublishAt = performance.now();
  postStatus();
}

function postStatus(): void {
  post({ type: "status", status: statusForClient() });
}

function statusForClient(): SimulationStatus {
  const base = simulator.status(running);
  if (!viewedCheckpoint) {
    return base;
  }
  if (
    !base.checkpoints.some(
      (checkpoint) => checkpoint.id === viewedCheckpoint?.id
    )
  ) {
    viewedCheckpoint = null;
    return base;
  }
  return {
    ...base,
    epoch: viewedCheckpoint.epoch,
    checkpoints: base.checkpoints.map((checkpoint) => ({
      ...checkpoint,
      isActive: checkpoint.id === viewedCheckpoint?.id
    })),
    isViewingCheckpoint: true,
    activeCheckpointId: viewedCheckpoint.id,
    latestMetric:
      viewedCheckpoint.metricHistory.at(-1) ?? base.latestMetric,
    metricHistory: viewedCheckpoint.metricHistory.map((sample) => ({
      ...sample
    })),
    topPrograms: computeTopPrograms(viewedCheckpoint.soup, 10)
  };
}

function post(message: WorkerOutMessage, transfer?: Transferable[]): void {
  self.postMessage(message, { transfer });
}
