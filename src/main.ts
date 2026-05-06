import "katex/dist/katex.min.css";
import "./style.css";
import { fixWebmDuration } from "@fix-webm-duration/fix";
import type { WorkerInMessage, WorkerOutMessage } from "./types";
import { DEFAULT_MAX_INSTRUCTION_READS, TILE_SIZE } from "./simulation/constants";
import {
  parseCellInput,
  encodeCellBytes,
  type ParsedCellInput
} from "./simulation/cellEncoding";
import { evaluatePairInteraction } from "./simulation/interaction";
import { buildPalette, darkenU32 } from "./simulation/palette";
import {
  programToGlyphs,
  type ProgramSummary
} from "./simulation/programSummary";
import {
  DEFAULT_REPLICATOR_PRESET_ID,
  replicatorPresetById,
  replicatorPresetBytes
} from "./simulation/replicatorPresets";
import type { CheckpointSummary } from "./simulation/simulator";
import {
  defaultConfig,
  type RuntimeConfigUpdate,
  type SimulationConfig,
  type SimulationStatus
} from "./simulation/simulator";
import type { MetricSnapshot } from "./simulation/metrics";
import {
  CHART_METRICS,
  drawMetricChart,
  formatChartMetricValue,
  renderChartMetricEquation,
  type ChartMetricKey
} from "./ui/metricChart";
import { RollingCaptureBuffer } from "./ui/captureBuffer";
import { renderAppShell } from "./ui/shell";

const DEFAULT_CONFIG = defaultConfig();
const config = { ...DEFAULT_CONFIG };
const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root");
}

app.innerHTML = renderAppShell(config, DEFAULT_CONFIG);

const canvas = mustGet<HTMLCanvasElement>("dish");
const viewport = mustGet<HTMLDivElement>("viewport");
const canvasHud = document.querySelector<HTMLDivElement>(".canvas-hud");
const canvasScrubber = document.querySelector<HTMLDivElement>(".canvas-scrubber");
const playPauseButton = mustGet<HTMLButtonElement>("playPause");
const resetButton = mustGet<HTMLButtonElement>("reset");
const newRunButton = mustGet<HTMLButtonElement>("newRun");
const fastModeInput = mustGet<HTMLInputElement>("fastMode");
const mutationRateInput = mustGet<HTMLInputElement>("mutationRate");
const checkpointIntervalInput = mustGet<HTMLInputElement>("checkpointInterval");
const metricIntervalInput = mustGet<HTMLInputElement>("metricInterval");
const timeBudgetInput = mustGet<HTMLInputElement>("timeBudgetMs");
const autoCaptureInput = mustGet<HTMLInputElement>("autoCapture");
const captureStatus = mustGet<HTMLParagraphElement>("captureStatus");
const replicatorPresetSelect =
  mustGet<HTMLSelectElement>("replicatorPreset");
const replicatorCountInput = mustGet<HTMLInputElement>("replicatorCount");
const replicatorPreviewCanvas =
  mustGet<HTMLCanvasElement>("replicatorPreviewCanvas");
const replicatorDescription =
  mustGet<HTMLParagraphElement>("replicatorDescription");
const replicatorCode = mustGet<HTMLElement>("replicatorCode");
const injectReplicatorButton =
  mustGet<HTMLButtonElement>("injectReplicator");
const loadReplicatorToLabButton =
  mustGet<HTMLButtonElement>("loadReplicatorToLab");
const injectorStatus = mustGet<HTMLParagraphElement>("injectorStatus");
const checkpointScrubber = mustGet<HTMLInputElement>("checkpointScrubber");
const checkpointLabel = mustGet<HTMLDivElement>("checkpointLabel");
const checkpointEpochLabel = mustGet<HTMLDivElement>("checkpointEpochLabel");
const checkpointLatestButton = mustGet<HTMLButtonElement>("checkpointLatest");
const metricChart = mustGet<HTMLCanvasElement>("metricChart");
const chartMetricSelect = mustGet<HTMLSelectElement>("chartMetric");
const chartEquation = mustGet<HTMLElement>("chartEquation");
const phaseBadge = mustGet<HTMLSpanElement>("phaseBadge");
const programList = mustGet<HTMLDivElement>("programList");
const programDetailCanvas = mustGet<HTMLCanvasElement>("programDetailCanvas");
const programDetailTitle = mustGet<HTMLHeadingElement>("programDetailTitle");
const programDetailStats = mustGet<HTMLParagraphElement>("programDetailStats");
const programDetailCode = mustGet<HTMLElement>("programDetailCode");
const interactionCellA = mustGet<HTMLTextAreaElement>("interactionCellA");
const interactionCellB = mustGet<HTMLTextAreaElement>("interactionCellB");
const interactionMaxReads = mustGet<HTMLInputElement>("interactionMaxReads");
const evaluateInteractionButton =
  mustGet<HTMLButtonElement>("evaluateInteraction");
const loadTopProgramAButton = mustGet<HTMLButtonElement>("loadTopProgramA");
const loadTopProgramBButton = mustGet<HTMLButtonElement>("loadTopProgramB");
const zeroInteractionCellsButton =
  mustGet<HTMLButtonElement>("zeroInteractionCells");
const interactionStatus = mustGet<HTMLParagraphElement>("interactionStatus");
const interactionBeforeA = mustGet<HTMLCanvasElement>("interactionBeforeA");
const interactionBeforeB = mustGet<HTMLCanvasElement>("interactionBeforeB");
const interactionAfterA = mustGet<HTMLCanvasElement>("interactionAfterA");
const interactionAfterB = mustGet<HTMLCanvasElement>("interactionAfterB");
const interactionChangeA = mustGet<HTMLSpanElement>("interactionChangeA");
const interactionChangeB = mustGet<HTMLSpanElement>("interactionChangeB");
const interactionStatsA = mustGet<HTMLParagraphElement>("interactionStatsA");
const interactionStatsB = mustGet<HTMLParagraphElement>("interactionStatsB");
const interactionOutputA = mustGet<HTMLElement>("interactionOutputA");
const interactionOutputB = mustGet<HTMLElement>("interactionOutputB");
const tooltipLayer = mustGet<HTMLDivElement>("tooltipLayer");
const fullscreenButton = mustGet<HTMLButtonElement>("fullscreen");
const resetDefaultsButton = mustGet<HTMLButtonElement>("resetDefaults");
const canUseOffscreen =
  typeof (
    canvas as HTMLCanvasElement & {
      transferControlToOffscreen?: unknown;
    }
  ).transferControlToOffscreen === "function";
const fallbackContext = canUseOffscreen
  ? null
  : canvas.getContext("2d", { alpha: false });

let running = false;
let checkpoints: CheckpointSummary[] = [];
let latestPreviewRequestId = 0;
let pendingCheckpointId: number | null = null;
let pendingPreviewFrame: number | null = null;
let followLatestCheckpointOnNextStatus = false;
let renderWidth = config.gridWidth * TILE_SIZE;
let renderHeight = config.gridHeight * TILE_SIZE;
let viewportScale = 1;
let viewportOffsetX = 0;
let viewportOffsetY = 0;
let fitInitialized = false;
let isPanning = false;
let lastPointerX = 0;
let lastPointerY = 0;
let selectedChartMetric: ChartMetricKey = "structureScore";
let lastMetricHistory: MetricSnapshot[] = [];
let lastTopPrograms: ProgramSummary[] = [];
let selectedProgramIndex = 0;
let currentSeed = config.seed;
const programPalette = buildPalette();
const CAPTURE_FPS = 8;
const CAPTURE_PRE_ROLL_MS = 30_000;
const CAPTURE_POST_ROLL_MS = 30_000;
const CAPTURE_TIMESLICE_MS = 1_000;
const CAPTURE_STRUCTURE_TRIGGER = 0.7;
const CAPTURE_UNIQUE_TRIGGER = 0.98;
let captureRecorder: MediaRecorder | null = null;
let captureStream: MediaStream | null = null;
const captureBuffer = new RollingCaptureBuffer();
let captureState: CaptureState = "off";
let captureTriggeredAt = 0;
let capturePostRollUntil = 0;
let captureDetectionMetric: MetricSnapshot | null = null;
let captureDetectionEpoch = 0;
let lastStatus: SimulationStatus | null = null;

type CaptureState =
  | "off"
  | "watching"
  | "triggered"
  | "saving"
  | "saved"
  | "error";

const worker = new Worker(new URL("./worker/sim.worker.ts", import.meta.url), {
  type: "module"
});

if (!canUseCanvasCapture()) {
  autoCaptureInput.disabled = true;
  setCaptureStatus("error", "Auto-capture unavailable in this browser.");
}

for (const overlay of [canvasHud, canvasScrubber]) {
  overlay?.addEventListener("pointerdown", stopViewportGesture);
  overlay?.addEventListener("pointermove", stopViewportGesture);
  overlay?.addEventListener("pointerup", stopViewportGesture);
  overlay?.addEventListener("click", stopViewportGesture);
  overlay?.addEventListener("wheel", stopViewportGesture, { passive: false });
}

document.querySelectorAll<HTMLElement>("[data-tip]").forEach((element) => {
  element.addEventListener("mouseenter", () => showTooltip(element));
  element.addEventListener("focus", () => showTooltip(element));
  element.addEventListener("mouseleave", hideTooltip);
  element.addEventListener("blur", hideTooltip);
});
document
  .querySelectorAll<HTMLButtonElement>("[data-collapse-toggle]")
  .forEach((button) => {
    button.addEventListener("click", () => toggleSection(button));
  });
window.addEventListener("scroll", hideTooltip, { passive: true });
window.addEventListener("resize", hideTooltip);

worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
  const message = event.data;
  if (message.type === "status") {
    running = message.status.running;
    updateStatus(message.status);
  } else if (message.type === "previewComplete") {
    if (message.requestId === latestPreviewRequestId && message.ok) {
      running = message.status.running;
      updateStatus(message.status);
    }
  } else if (message.type === "injectionComplete") {
    running = message.status.running;
    updateStatus(message.status);
    updateInjectorStatus(message);
  } else if (message.type === "frame" && fallbackContext) {
    canvas.width = message.width;
    canvas.height = message.height;
    const data = new Uint8ClampedArray(message.buffer);
    fallbackContext.putImageData(
      new ImageData(data, message.width, message.height),
      0,
      0
    );
  }
};

if (canUseOffscreen) {
  const offscreen = (
    canvas as HTMLCanvasElement & {
      transferControlToOffscreen: () => OffscreenCanvas;
    }
  ).transferControlToOffscreen();
  post({ type: "init", config, canvas: offscreen, useOffscreen: true }, [
    offscreen
  ]);
} else {
  post({ type: "init", config, useOffscreen: false });
}

playPauseButton.addEventListener("click", () => {
  post({ type: running ? "pause" : "play" });
});

resetButton.addEventListener("click", () => {
  fitInitialized = false;
  resetCaptureBuffer();
  post({ type: "reset", config: readConfig() });
});

newRunButton.addEventListener("click", () => {
  currentSeed = randomSeed();
  fitInitialized = false;
  resetCaptureBuffer();
  post({ type: "reset", config: readConfig() });
});

fastModeInput.addEventListener("change", () => {
  updateRuntimeConfig({
    fastMode: fastModeInput.checked
  });
});

mutationRateInput.addEventListener("change", () => {
  updateRuntimeConfig({
    mutationRate: numberFromInput(mutationRateInput, config.mutationRate)
  });
});

checkpointIntervalInput.addEventListener("change", () => {
  updateRuntimeConfig({
    checkpointInterval: numberFromInput(
      checkpointIntervalInput,
      config.checkpointInterval
    )
  });
});

metricIntervalInput.addEventListener("change", () => {
  updateRuntimeConfig({
    metricInterval: numberFromInput(metricIntervalInput, config.metricInterval)
  });
});

timeBudgetInput.addEventListener("change", () => {
  updateRuntimeConfig({
    timeBudgetMs: numberFromInput(timeBudgetInput, config.timeBudgetMs)
  });
});

autoCaptureInput.addEventListener("change", () => {
  if (autoCaptureInput.checked) {
    startAutoCapture();
  } else {
    stopAutoCapture(false);
  }
});

resetDefaultsButton.addEventListener("click", resetControlsToDefaults);

replicatorPresetSelect.addEventListener("change", renderReplicatorPreset);
replicatorCountInput.addEventListener("change", () => {
  replicatorCountInput.value = String(readReplicatorCount());
});
injectReplicatorButton.addEventListener("click", injectSelectedReplicator);
loadReplicatorToLabButton.addEventListener("click", loadReplicatorIntoLab);

chartMetricSelect.addEventListener("change", () => {
  selectedChartMetric = chartMetricSelect.value as ChartMetricKey;
  updateChartCopy();
  drawMetricChart(metricChart, lastMetricHistory, selectedChartMetric);
});

programList.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "[data-program-index]"
  );
  if (!button) {
    return;
  }
  selectedProgramIndex = Number(button.dataset.programIndex ?? 0);
  renderTopPrograms(lastTopPrograms);
});

for (const cellInput of [interactionCellA, interactionCellB]) {
  cellInput.addEventListener("input", () => {
    updateInteractionPreview();
    clearInteractionOutputs();
  });
}

interactionMaxReads.addEventListener("change", () => {
  interactionMaxReads.value = String(readInteractionMaxReads());
});
evaluateInteractionButton.addEventListener("click", evaluateInteractionLab);
loadTopProgramAButton.addEventListener("click", () =>
  loadSelectedProgramInto(interactionCellA)
);
loadTopProgramBButton.addEventListener("click", () =>
  loadSelectedProgramInto(interactionCellB)
);
zeroInteractionCellsButton.addEventListener("click", () => {
  interactionCellA.value = "";
  interactionCellB.value = "";
  updateInteractionPreview();
  clearInteractionOutputs();
});

checkpointScrubber.addEventListener("input", () => {
  const checkpoint = checkpoints[Math.floor(numberFromInput(checkpointScrubber, 0))];
  if (!checkpoint) {
    return;
  }
  previewCheckpoint(checkpoint.id);
});

checkpointLatestButton.addEventListener("click", () => {
  followLatestCheckpointOnNextStatus = true;
  post({ type: "showLive" });
});

fullscreenButton.addEventListener("click", async () => {
  await toggleFullscreen();
  fitCanvasSoon();
});
document.addEventListener("fullscreenchange", () => {
  viewport.classList.toggle("fullscreen-fallback", false);
  updateFullscreenButton();
  fitCanvasSoon();
});

viewport.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.001);
    zoomAt(event.clientX, event.clientY, factor);
  },
  { passive: false }
);

viewport.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) {
    return;
  }
  isPanning = true;
  lastPointerX = event.clientX;
  lastPointerY = event.clientY;
  viewport.setPointerCapture(event.pointerId);
  viewport.classList.add("panning");
});

viewport.addEventListener("pointermove", (event) => {
  if (!isPanning) {
    return;
  }
  viewportOffsetX += event.clientX - lastPointerX;
  viewportOffsetY += event.clientY - lastPointerY;
  lastPointerX = event.clientX;
  lastPointerY = event.clientY;
  applyViewportTransform();
});

viewport.addEventListener("pointerup", (event) => {
  isPanning = false;
  viewport.releasePointerCapture(event.pointerId);
  viewport.classList.remove("panning");
});

viewport.addEventListener("dblclick", fitCanvas);
window.addEventListener("resize", () => {
  if (!fitInitialized) {
    return;
  }
  fitCanvasSoon();
});

updateInteractionPreview();
evaluateInteractionLab();
renderReplicatorPreset();

function updateStatus(status: SimulationStatus): void {
  lastStatus = status;
  updateCanvasSize(status);
  updateRunState();
  updateStatsReadout(status);
  updateMetricReadout(status.latestMetric);
  lastMetricHistory = status.metricHistory;
  drawMetricChart(metricChart, status.metricHistory, selectedChartMetric);
  renderTopPrograms(status.topPrograms);
  updateCheckpointScrubber(status);
  updateAutoCapture(status);
}

function updateCanvasSize(status: SimulationStatus): void {
  renderWidth = status.renderWidth;
  renderHeight = status.renderHeight;
  canvas.style.width = `${renderWidth}px`;
  canvas.style.height = `${renderHeight}px`;
  if (!fitInitialized) {
    fitCanvas();
    fitInitialized = true;
  } else {
    applyViewportTransform();
  }
}

function updateRunState(): void {
  updatePlayPauseButton();
}

function updateStatsReadout(status: SimulationStatus): void {
  setText("epochsPerSecond", status.epochsPerSecond.toFixed(1));
  setText("renderFps", status.renderFps.toFixed(1));
  setText("pairsPerEpoch", Math.round(status.pairsPerEpoch).toLocaleString());
  setText("readsPerPair", status.avgInstructionReadsPerPair.toFixed(1));
  setText("activeOps", Math.round(status.activeOpsPerEpoch).toLocaleString());
}

function updateCheckpointScrubber(status: SimulationStatus): void {
  const oldMax = Number(checkpointScrubber.max);
  const oldValue = Number(checkpointScrubber.value);
  const shouldFollowLatest = status.running && oldValue === oldMax;
  checkpoints = status.checkpoints;
  const newMax = Math.max(0, checkpoints.length - 1);
  checkpointScrubber.max = String(newMax);

  const activeIndex = status.activeCheckpointId
    ? checkpoints.findIndex((checkpoint) => checkpoint.id === status.activeCheckpointId)
    : -1;
  if (
    followLatestCheckpointOnNextStatus ||
    shouldFollowLatest ||
    Number(checkpointScrubber.value) > newMax
  ) {
    checkpointScrubber.value = String(newMax);
  } else if (status.isViewingCheckpoint && activeIndex >= 0) {
    checkpointScrubber.value = String(activeIndex);
  }
  followLatestCheckpointOnNextStatus = false;

  const selectedIndex = Number(checkpointScrubber.value);
  const selected = checkpoints[selectedIndex] ?? checkpoints.at(-1);
  checkpointLabel.textContent = selected
    ? `Checkpoint ${selectedIndex + 1}/${checkpoints.length}`
    : "Checkpoint 0/0";
  checkpointEpochLabel.textContent = `Epoch: ${status.epoch.toLocaleString()}`;
  checkpointLatestButton.disabled =
    checkpoints.length === 0 ||
    (!status.isViewingCheckpoint && selectedIndex >= newMax);
}

function updateMetricReadout(metric: MetricSnapshot): void {
  updateChartCopy(metric);
  phaseBadge.textContent = metric.phaseTransitionDetected
    ? "transition"
    : "baseline";
  phaseBadge.classList.toggle("detected", metric.phaseTransitionDetected);
}

function startAutoCapture(): void {
  if (!canUseCanvasCapture()) {
    autoCaptureInput.checked = false;
    setCaptureStatus("error", "Auto-capture unavailable in this browser.");
    return;
  }
  if (captureRecorder && captureRecorder.state !== "inactive") {
    return;
  }

  resetCaptureBuffer();
  try {
    captureStream = canvas.captureStream(CAPTURE_FPS);
    const mimeType = preferredVideoMimeType();
    captureRecorder = new MediaRecorder(
      captureStream,
      mediaRecorderOptions(mimeType)
    );
    captureRecorder.addEventListener("dataavailable", handleCaptureChunk);
    captureRecorder.addEventListener("stop", finalizeCaptureIfNeeded);
    captureRecorder.addEventListener("error", () => {
      stopCaptureTracks();
      autoCaptureInput.checked = false;
      setCaptureStatus("error", "Auto-capture stopped after a recorder error.");
    });
    captureRecorder.start(CAPTURE_TIMESLICE_MS);
    setCaptureStatus("watching", "Auto-capture watching; rolling buffer empty.");
  } catch {
    captureRecorder = null;
    stopCaptureTracks();
    autoCaptureInput.checked = false;
    setCaptureStatus("error", "Auto-capture could not start on this canvas.");
  }
}

function stopAutoCapture(save: boolean): void {
  if (!captureRecorder || captureRecorder.state === "inactive") {
    resetCaptureState(save ? "saved" : "off");
    return;
  }

  if (save) {
    setCaptureStatus("saving", "Saving emergence clip...");
    captureRecorder.requestData();
    captureRecorder.stop();
  } else {
    resetCaptureState("off");
    captureRecorder.stop();
  }
}

function updateAutoCapture(status: SimulationStatus): void {
  if (captureState === "watching") {
    pruneCapturePreRoll(performance.now());
    if (
      status.running &&
      !status.isViewingCheckpoint &&
      shouldTriggerCapture(status.latestMetric)
    ) {
      triggerAutoCapture(status);
      return;
    }
    setCaptureStatus(
      "watching",
      `Auto-capture watching; ${(captureBufferedMs() / 1000).toFixed(0)}s buffered.`
    );
    return;
  }

  if (captureState === "triggered") {
    const remainingMs = Math.max(0, capturePostRollUntil - performance.now());
    setCaptureStatus(
      "triggered",
      `Emergence detected at epoch ${captureDetectionEpoch.toLocaleString()}; saving in ${Math.ceil(remainingMs / 1000)}s.`
    );
    if (remainingMs <= 0) {
      stopAutoCapture(true);
    }
  }
}

function triggerAutoCapture(status: SimulationStatus): void {
  captureState = "triggered";
  captureTriggeredAt = performance.now();
  capturePostRollUntil = captureTriggeredAt + CAPTURE_POST_ROLL_MS;
  captureDetectionEpoch = status.epoch;
  captureDetectionMetric = { ...status.latestMetric };
  setCaptureStatus(
    "triggered",
    `Emergence detected at epoch ${status.epoch.toLocaleString()}; recording 30 more seconds.`
  );
}

function shouldTriggerCapture(metric: MetricSnapshot): boolean {
  return (
    metric.structureScore >= CAPTURE_STRUCTURE_TRIGGER &&
    metric.uniqueProgramFraction <= CAPTURE_UNIQUE_TRIGGER
  );
}

function handleCaptureChunk(event: BlobEvent): void {
  if (event.data.size <= 0) {
    return;
  }
  captureBuffer.add(event.data, performance.now());
  if (captureState === "watching") {
    pruneCapturePreRoll(performance.now());
  }
}

async function finalizeCaptureIfNeeded(): Promise<void> {
  stopCaptureTracks();
  const shouldSave = captureState === "saving";
  captureRecorder = null;
  captureStream = null;

  if (!shouldSave) {
    resetCaptureState("off");
    return;
  }

  const mimeType = preferredVideoMimeType() || "video/webm";
  const rawVideo = await captureBuffer.toPlayableWebmBlob(mimeType);
  const video = await fixWebmDuration(
    rawVideo,
    captureBuffer.durationMs(CAPTURE_TIMESLICE_MS),
    { logger: false }
  );
  if (video.size === 0) {
    resetCaptureState("off");
    return;
  }
  const metadata = buildCaptureMetadata(video.size);
  const basename = `bff-emergence-epoch-${captureDetectionEpoch}`;
  downloadBlob(video, `${basename}.webm`);
  downloadBlob(
    new Blob([JSON.stringify(metadata, null, 2)], {
      type: "application/json"
    }),
    `${basename}.json`
  );
  autoCaptureInput.checked = false;
  resetCaptureState("saved");
  setCaptureStatus(
    "saved",
    `Saved emergence clip at epoch ${captureDetectionEpoch.toLocaleString()}.`
  );
}

function buildCaptureMetadata(videoBytes: number): Record<string, unknown> {
  const status = lastStatus;
  return {
    app: "bff-explorer",
    artifact: "auto-captured-emergence",
    videoBytes,
    capturedAt: new Date().toISOString(),
    preRollSeconds: CAPTURE_PRE_ROLL_MS / 1000,
    postRollSeconds: CAPTURE_POST_ROLL_MS / 1000,
    detectionEpoch: captureDetectionEpoch,
    detectionMetric: captureDetectionMetric,
    finalEpoch: status?.epoch ?? captureDetectionEpoch,
    config: readConfig(),
    selectedMetric: selectedChartMetric,
    topPrograms: status?.topPrograms.slice(0, 10) ?? []
  };
}

function pruneCapturePreRoll(now: number): void {
  const firstKeptAt = now - CAPTURE_PRE_ROLL_MS;
  captureBuffer.pruneBefore(firstKeptAt);
}

function resetCaptureBuffer(): void {
  captureBuffer.clear({
    preserveHeader: Boolean(captureRecorder && captureRecorder.state !== "inactive")
  });
  captureTriggeredAt = 0;
  capturePostRollUntil = 0;
  captureDetectionMetric = null;
  captureDetectionEpoch = 0;
  if (captureRecorder && captureRecorder.state !== "inactive") {
    setCaptureStatus("watching", "Auto-capture watching; rolling buffer reset.");
  }
}

function resetCaptureState(nextState: CaptureState): void {
  captureBuffer.clear();
  captureState = nextState;
  captureTriggeredAt = 0;
  capturePostRollUntil = 0;
  captureDetectionMetric = null;
  captureDetectionEpoch = 0;
  if (nextState === "off") {
    setCaptureStatus("off", "Auto-capture off.");
  }
}

function captureBufferedMs(): number {
  return captureBuffer.bufferedMs();
}

function setCaptureStatus(state: CaptureState, text: string): void {
  captureState = state;
  captureStatus.textContent = text;
  captureStatus.classList.toggle("active", state === "watching");
  captureStatus.classList.toggle("triggered", state === "triggered");
  captureStatus.classList.toggle("error", state === "error");
}

function stopCaptureTracks(): void {
  captureStream?.getTracks().forEach((track) => track.stop());
}

function canUseCanvasCapture(): boolean {
  return (
    typeof canvas.captureStream === "function" &&
    typeof MediaRecorder !== "undefined"
  );
}

function preferredVideoMimeType(): string {
  const candidates = [
    "video/webm;codecs=vp8",
    "video/webm;codecs=vp9",
    "video/webm"
  ];
  return (
    candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? ""
  );
}

function mediaRecorderOptions(mimeType: string): MediaRecorderOptions {
  const options: MediaRecorderOptions & {
    videoKeyFrameIntervalDuration?: number;
  } = mimeType ? { mimeType } : {};
  options.videoKeyFrameIntervalDuration = CAPTURE_TIMESLICE_MS;
  return options;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function updateChartCopy(metric?: MetricSnapshot): void {
  const option = CHART_METRICS[selectedChartMetric];
  setText("chartMetricLabel", option.label);
  setText("chartDescription", option.description);
  renderEquation(selectedChartMetric);
  setText("chartCommentary", option.commentary);
  if (metric) {
    setText(
      "chartMetricValue",
      formatChartMetricValue(metric, selectedChartMetric)
    );
  }
}

function renderEquation(metricKey: ChartMetricKey): void {
  chartEquation.innerHTML = renderChartMetricEquation(metricKey);
  chartEquation.setAttribute("aria-label", CHART_METRICS[metricKey].equation);
}

function previewCheckpoint(checkpointId: number): void {
  pendingCheckpointId = checkpointId;
  if (pendingPreviewFrame !== null) {
    return;
  }
  pendingPreviewFrame = requestAnimationFrame(() => {
    pendingPreviewFrame = null;
    if (pendingCheckpointId === null) {
      return;
    }
    latestPreviewRequestId += 1;
    post({
      type: "previewCheckpoint",
      checkpointId: pendingCheckpointId,
      requestId: latestPreviewRequestId
    });
  });
}

function readConfig(): SimulationConfig {
  return {
    gridWidth: config.gridWidth,
    gridHeight: config.gridHeight,
    seed: currentSeed,
    fastMode: fastModeInput.checked,
    mutationRate: numberFromInput(mutationRateInput, config.mutationRate),
    checkpointInterval: numberFromInput(
      checkpointIntervalInput,
      config.checkpointInterval
    ),
    metricInterval: numberFromInput(metricIntervalInput, config.metricInterval),
    timeBudgetMs: numberFromInput(timeBudgetInput, config.timeBudgetMs),
    maxInstructionReads: config.maxInstructionReads
  };
}

function resetControlsToDefaults(): void {
  fastModeInput.checked = DEFAULT_CONFIG.fastMode;
  mutationRateInput.value = String(DEFAULT_CONFIG.mutationRate);
  checkpointIntervalInput.value = String(DEFAULT_CONFIG.checkpointInterval);
  metricIntervalInput.value = String(DEFAULT_CONFIG.metricInterval);
  timeBudgetInput.value = String(DEFAULT_CONFIG.timeBudgetMs);
  replicatorPresetSelect.value = DEFAULT_REPLICATOR_PRESET_ID;
  replicatorCountInput.value = String(
    replicatorPresetById(DEFAULT_REPLICATOR_PRESET_ID).defaultCount
  );
  renderReplicatorPreset();
  updateRuntimeConfig({
    fastMode: DEFAULT_CONFIG.fastMode,
    mutationRate: DEFAULT_CONFIG.mutationRate,
    checkpointInterval: DEFAULT_CONFIG.checkpointInterval,
    metricInterval: DEFAULT_CONFIG.metricInterval,
    timeBudgetMs: DEFAULT_CONFIG.timeBudgetMs
  });
}

function renderReplicatorPreset(): void {
  const preset = selectedReplicatorPreset();
  const bytes = replicatorPresetBytes(preset.id);
  replicatorDescription.textContent = preset.description;
  replicatorCode.textContent = encodeCellBytes(bytes);
  drawProgramBytes(replicatorPreviewCanvas, bytes);
  injectReplicatorButton.title = `Randomly insert ${preset.name} into the current frame`;
  loadReplicatorToLabButton.title = `Copy ${preset.name} into the pair interaction lab`;
}

function injectSelectedReplicator(): void {
  const preset = selectedReplicatorPreset();
  const count = readReplicatorCount();
  replicatorCountInput.value = String(count);
  setInjectorStatus(
    `Injecting ${count.toLocaleString()} ${count === 1 ? "copy" : "copies"} of ${preset.name}...`
  );
  post({
    type: "injectProgram",
    presetId: preset.id,
    bytes: replicatorPresetBytes(preset.id),
    count
  });
}

function updateInjectorStatus(
  message: Extract<WorkerOutMessage, { type: "injectionComplete" }>
): void {
  const preset = replicatorPresetById(message.presetId);
  if (message.error) {
    setInjectorStatus(message.error, true);
    return;
  }

  const copyText =
    message.insertedCount === 1 ? "copy" : "copies";
  setInjectorStatus(
    `Inserted ${message.insertedCount.toLocaleString()} ${copyText} of ${preset.name} at random cells.`
  );
}

function loadReplicatorIntoLab(): void {
  const preset = selectedReplicatorPreset();
  const bytes = replicatorPresetBytes(preset.id);
  interactionCellA.value = encodeCellBytes(bytes);
  interactionCellB.value = "";
  updateInteractionPreview();
  evaluateInteractionLab();
  interactionStatus.textContent = `Loaded ${preset.name} into Cell A and evaluated it against an all-null Cell B.`;
}

function selectedReplicatorPreset() {
  return replicatorPresetById(replicatorPresetSelect.value);
}

function readReplicatorCount(): number {
  const fallback = selectedReplicatorPreset().defaultCount;
  const maxCells =
    (lastStatus?.gridWidth ?? config.gridWidth) *
    (lastStatus?.gridHeight ?? config.gridHeight);
  return clamp(Math.floor(numberFromInput(replicatorCountInput, fallback)), 1, maxCells);
}

function setInjectorStatus(text: string, error = false): void {
  injectorStatus.textContent = text;
  injectorStatus.classList.toggle("error", error);
  injectorStatus.classList.toggle("success", !error);
}

function renderTopPrograms(programs: readonly ProgramSummary[]): void {
  lastTopPrograms = programs.map((program) => ({
    ...program,
    bytes: [...program.bytes]
  }));
  selectedProgramIndex = clamp(
    selectedProgramIndex,
    0,
    Math.max(0, lastTopPrograms.length - 1)
  );
  updateTopProgramLoadButtons();

  if (lastTopPrograms.length === 0) {
    programList.innerHTML = `<p class="empty-programs">Waiting for program samples.</p>`;
    programDetailTitle.textContent = "No program sample yet";
    programDetailStats.textContent =
      "The top program list updates with the emergence metric.";
    programDetailCode.textContent = "";
    clearCanvas(programDetailCanvas);
    return;
  }

  programList.innerHTML = lastTopPrograms
    .map(
      (program, index) => `
        <button class="program-row ${index === selectedProgramIndex ? "selected" : ""}" type="button" data-program-index="${index}" title="Visualize program ${index + 1}">
          <canvas width="64" height="64" aria-hidden="true"></canvas>
          <span class="program-summary">
            <strong>#${index + 1} ${shortProgramId(program.id)}</strong>
            <span>${program.count.toLocaleString()} cells · ${(program.fraction * 100).toFixed(2)}%</span>
            <span>${program.activeBytes}/64 executable · ${program.nullBytes} null bytes · ${program.byteEntropyBpb.toFixed(2)} bits per byte</span>
          </span>
        </button>
      `
    )
    .join("");

  programList
    .querySelectorAll<HTMLCanvasElement>(".program-row canvas")
    .forEach((programCanvas, index) =>
      drawProgramCanvas(programCanvas, lastTopPrograms[index])
    );
  renderProgramDetail(lastTopPrograms[selectedProgramIndex]);
}

function renderProgramDetail(program: ProgramSummary): void {
  drawProgramCanvas(programDetailCanvas, program);
  programDetailTitle.textContent = `Program ${shortProgramId(program.id)}`;
  programDetailStats.textContent = `${program.count.toLocaleString()} cells (${(program.fraction * 100).toFixed(2)}%) · ${program.activeBytes}/64 executable bytes · ${program.nullBytes} null bytes · ${program.byteEntropyBpb.toFixed(2)} bits per byte`;
  programDetailCode.textContent = programToGlyphs(program.bytes);
}

function updateInteractionPreview(): boolean {
  const cellA = parseCellInput(interactionCellA.value);
  const cellB = parseCellInput(interactionCellB.value);
  drawProgramBytes(interactionBeforeA, cellA.bytes);
  drawProgramBytes(interactionBeforeB, cellB.bytes);

  const messages = interactionInputMessages(cellA, cellB);
  const hasError = cellA.error !== null || cellB.error !== null;
  interactionStatus.classList.toggle("error", hasError);
  interactionStatus.textContent =
    messages.length > 0
      ? messages.join(" ")
      : `Ready: Cell A decodes to ${formatByteCount(cellA.decodedByteLength)}, Cell B decodes to ${formatByteCount(cellB.decodedByteLength)}.`;
  return !hasError;
}

function evaluateInteractionLab(): void {
  const cellA = parseCellInput(interactionCellA.value);
  const cellB = parseCellInput(interactionCellB.value);
  drawProgramBytes(interactionBeforeA, cellA.bytes);
  drawProgramBytes(interactionBeforeB, cellB.bytes);

  if (cellA.error || cellB.error) {
    clearInteractionOutputs();
    updateInteractionPreview();
    return;
  }

  const maxReads = readInteractionMaxReads();
  interactionMaxReads.value = String(maxReads);
  const result = evaluatePairInteraction(cellA.bytes, cellB.bytes, maxReads);
  drawProgramBytes(interactionAfterA, result.afterA);
  drawProgramBytes(interactionAfterB, result.afterB);

  interactionChangeA.textContent = formatChangeCount(result.changedA);
  interactionChangeB.textContent = formatChangeCount(result.changedB);
  interactionStatsA.textContent = `${formatByteCount(cellA.decodedByteLength)} input, ${formatChangeCount(result.changedA)} after the interaction.`;
  interactionStatsB.textContent = `${formatByteCount(cellB.decodedByteLength)} input, ${formatChangeCount(result.changedB)} after the interaction.`;
  interactionOutputA.textContent = programToGlyphs(Array.from(result.afterA));
  interactionOutputB.textContent = programToGlyphs(Array.from(result.afterB));

  const warnings = interactionInputMessages(cellA, cellB);
  const haltText = result.haltedByStepLimit
    ? "stopped at the instruction cap"
    : "halted at the edge of the 128-byte pair buffer";
  interactionStatus.classList.remove("error");
  interactionStatus.textContent = [
    `${result.instructionReads.toLocaleString()} reads`,
    `${result.activeOps.toLocaleString()} active operations`,
    haltText,
    "no random mutation applied",
    ...warnings
  ].join(" · ");
}

function clearInteractionOutputs(): void {
  clearCanvas(interactionAfterA);
  clearCanvas(interactionAfterB);
  interactionChangeA.textContent = "0 changes";
  interactionChangeB.textContent = "0 changes";
  interactionStatsA.textContent = "Awaiting evaluation.";
  interactionStatsB.textContent = "Awaiting evaluation.";
  interactionOutputA.textContent = "";
  interactionOutputB.textContent = "";
}

function loadSelectedProgramInto(input: HTMLTextAreaElement): void {
  const program = lastTopPrograms[selectedProgramIndex];
  if (!program) {
    interactionStatus.classList.remove("error");
    interactionStatus.textContent =
      "No top-program sample is available yet; let the metric sampler run first.";
    return;
  }

  input.value = encodeCellBytes(program.bytes);
  updateInteractionPreview();
  clearInteractionOutputs();
  const cellName = input === interactionCellA ? "Cell A" : "Cell B";
  interactionStatus.textContent = `Copied selected top program ${shortProgramId(program.id)} into ${cellName}.`;
}

function updateTopProgramLoadButtons(): void {
  const label = lastTopPrograms[selectedProgramIndex]
    ? `selected top program #${selectedProgramIndex + 1}`
    : "the selected top program";
  loadTopProgramAButton.title = `Copy ${label} into Cell A`;
  loadTopProgramBButton.title = `Copy ${label} into Cell B`;
}

function readInteractionMaxReads(): number {
  const value = Math.floor(
    numberFromInput(interactionMaxReads, DEFAULT_MAX_INSTRUCTION_READS)
  );
  return clamp(value, 1, DEFAULT_MAX_INSTRUCTION_READS);
}

function interactionInputMessages(
  cellA: ParsedCellInput,
  cellB: ParsedCellInput
): string[] {
  const messages: string[] = [];
  if (cellA.error) {
    messages.push(`Cell A: ${cellA.error}`);
  }
  if (cellB.error) {
    messages.push(`Cell B: ${cellB.error}`);
  }
  if (cellA.truncated) {
    messages.push("Cell A decoded past 64 bytes and was truncated.");
  }
  if (cellB.truncated) {
    messages.push("Cell B decoded past 64 bytes and was truncated.");
  }
  return messages;
}

function formatByteCount(count: number): string {
  return `${count.toLocaleString()} decoded ${count === 1 ? "byte" : "bytes"}`;
}

function formatChangeCount(count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? "change" : "changes"}`;
}

function drawProgramCanvas(
  target: HTMLCanvasElement,
  program: ProgramSummary
): void {
  drawProgramBytes(target, program.bytes);
}

function drawProgramBytes(
  target: HTMLCanvasElement,
  bytes: ArrayLike<number>
): void {
  const context = target.getContext("2d", { alpha: false });
  if (!context) {
    return;
  }
  const cellSize = target.width / TILE_SIZE;
  context.clearRect(0, 0, target.width, target.height);
  for (let y = 0; y < TILE_SIZE; y += 1) {
    for (let x = 0; x < TILE_SIZE; x += 1) {
      const color = programPalette[bytes[y * TILE_SIZE + x] ?? 0];
      const displayColor = x === 0 || y === 0 ? darkenU32(color, 28) : color;
      context.fillStyle = u32ToCss(displayColor);
      context.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    }
  }
}

function clearCanvas(target: HTMLCanvasElement): void {
  const context = target.getContext("2d");
  context?.clearRect(0, 0, target.width, target.height);
}

function shortProgramId(id: string): string {
  return id.slice(0, 8);
}

function fitCanvas(): void {
  const rect = viewport.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0 || renderWidth <= 0 || renderHeight <= 0) {
    return;
  }
  viewportScale = fittedViewportScale(rect);
  centerCanvas();
  applyViewportTransform();
}

function fitCanvasSoon(): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(fitCanvas);
  });
}

function centerCanvas(): void {
  const rect = viewport.getBoundingClientRect();
  viewportOffsetX = (rect.width - renderWidth * viewportScale) / 2;
  viewportOffsetY = (rect.height - renderHeight * viewportScale) / 2;
}

function zoomAt(clientX: number, clientY: number, factor: number): void {
  const rect = viewport.getBoundingClientRect();
  if (renderWidth <= 0 || renderHeight <= 0) {
    return;
  }
  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  const worldX = (localX - viewportOffsetX) / viewportScale;
  const worldY = (localY - viewportOffsetY) / viewportScale;
  const fitScale = fittedViewportScale(rect);
  viewportScale = clamp(viewportScale * factor, fitScale, 12);
  viewportOffsetX = localX - worldX * viewportScale;
  viewportOffsetY = localY - worldY * viewportScale;
  applyViewportTransform();
}

function fittedViewportScale(rect: DOMRect): number {
  return Math.min(rect.width / renderWidth, rect.height / renderHeight) * 0.98;
}

function applyViewportTransform(): void {
  const rect = viewport.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return;
  }
  const scaledWidth = renderWidth * viewportScale;
  const scaledHeight = renderHeight * viewportScale;

  if (scaledWidth <= rect.width) {
    viewportOffsetX = (rect.width - scaledWidth) / 2;
  } else {
    viewportOffsetX = clamp(viewportOffsetX, rect.width - scaledWidth, 0);
  }
  if (scaledHeight <= rect.height) {
    viewportOffsetY = (rect.height - scaledHeight) / 2;
  } else {
    viewportOffsetY = clamp(viewportOffsetY, rect.height - scaledHeight, 0);
  }

  canvas.style.transform = `translate(${viewportOffsetX}px, ${viewportOffsetY}px) scale(${viewportScale})`;
}

async function toggleFullscreen(): Promise<void> {
  if (document.fullscreenElement === viewport) {
    await document.exitFullscreen();
    updateFullscreenButton();
    return;
  }

  if (viewport.classList.contains("fullscreen-fallback")) {
    viewport.classList.remove("fullscreen-fallback");
    document.body.classList.remove("viewport-fullscreen-active");
    updateFullscreenButton();
    return;
  }

  try {
    if (viewport.requestFullscreen) {
      await viewport.requestFullscreen();
    } else {
      enableFullscreenFallback();
    }
  } catch {
    enableFullscreenFallback();
  }
  updateFullscreenButton();
}

function enableFullscreenFallback(): void {
  viewport.classList.add("fullscreen-fallback");
  document.body.classList.add("viewport-fullscreen-active");
}

function updateFullscreenButton(): void {
  const active =
    document.fullscreenElement === viewport ||
    viewport.classList.contains("fullscreen-fallback");
  fullscreenButton.textContent = active ? "⤢" : "⛶";
  fullscreenButton.title = active ? "Exit fullscreen" : "Fullscreen";
  fullscreenButton.dataset.tip = active ? "Exit fullscreen" : "Enter fullscreen";
  fullscreenButton.setAttribute(
    "aria-label",
    active ? "Exit fullscreen" : "Enter fullscreen"
  );
}

function updatePlayPauseButton(): void {
  playPauseButton.textContent = running ? "❚❚" : "▶";
  playPauseButton.title = running ? "Pause" : "Play";
  playPauseButton.dataset.tip = running ? "Pause simulation" : "Play simulation";
  playPauseButton.setAttribute(
    "aria-label",
    running ? "Pause simulation" : "Play simulation"
  );
}

function mustGet<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing #${id}`);
  }
  return element as T;
}

function setText(id: string, text: string): void {
  mustGet<HTMLElement>(id).textContent = text;
}

function numberFromInput(input: HTMLInputElement, fallback: number): number {
  const value = Number(input.value);
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function randomSeed(): number {
  const values = new Uint32Array(1);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(values);
    return values[0];
  }
  return (Date.now() ^ Math.floor(Math.random() * 0x1_0000_0000)) >>> 0;
}

function u32ToCss(color: number): string {
  const red = color & 255;
  const green = (color >>> 8) & 255;
  const blue = (color >>> 16) & 255;
  return `rgb(${red} ${green} ${blue})`;
}

function updateRuntimeConfig(update: RuntimeConfigUpdate): void {
  post({ type: "updateConfig", config: update });
}

function showTooltip(anchor: HTMLElement): void {
  const text = anchor.dataset.tip;
  if (!text) {
    return;
  }
  tooltipLayer.textContent = text;
  tooltipLayer.hidden = false;
  tooltipLayer.style.left = "0px";
  tooltipLayer.style.top = "0px";

  const anchorRect = anchor.getBoundingClientRect();
  const tooltipRect = tooltipLayer.getBoundingClientRect();
  const margin = 12;
  const gap = 8;
  const preferredTop = anchorRect.top - tooltipRect.height - gap;
  const top =
    preferredTop >= margin
      ? preferredTop
      : Math.min(
          window.innerHeight - tooltipRect.height - margin,
          anchorRect.bottom + gap
        );
  const left = clamp(
    anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2,
    margin,
    window.innerWidth - tooltipRect.width - margin
  );

  tooltipLayer.style.left = `${left}px`;
  tooltipLayer.style.top = `${Math.max(margin, top)}px`;
}

function hideTooltip(): void {
  tooltipLayer.hidden = true;
}

function toggleSection(button: HTMLButtonElement): void {
  const section = button.closest<HTMLElement>("[data-collapsible-section]");
  if (!section) {
    return;
  }
  const collapsed = section.classList.toggle("collapsed");
  const expanded = !collapsed;
  button.textContent = expanded ? "Hide" : "Show";
  button.setAttribute("aria-expanded", String(expanded));
}

function post(message: WorkerInMessage, transfer?: Transferable[]): void {
  worker.postMessage(message, transfer ?? []);
}

function stopViewportGesture(event: Event): void {
  event.stopPropagation();
}
