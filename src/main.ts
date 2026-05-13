import "./style.css";
import type { WorkerInMessage, WorkerOutMessage } from "./types";
import { TILE_SIZE } from "./simulation/constants";
import {
  defaultConfig,
  type RuntimeConfigUpdate,
  type SimulationStatus
} from "./simulation/simulator";
import { renderAppShell } from "./ui/shell";
import { bindCollapsibleSections } from "./ui/collapsibleSections";
import { createCheckpointController } from "./ui/checkpointController";
import { mustGet, setText } from "./ui/dom";
import { createInteractionLab } from "./ui/interactionLab";
import { createMetricPanel } from "./ui/metricPanel";
import { createProgramBrowser } from "./ui/programBrowser";
import { createReplicatorControls } from "./ui/replicatorControls";
import { createRuntimeControls } from "./ui/runtimeControls";
import { bindTooltips } from "./ui/tooltipController";
import { createViewportController } from "./ui/viewportController";

const DEFAULT_CONFIG = defaultConfig();
const config = { ...DEFAULT_CONFIG };
const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root");
}

app.innerHTML = renderAppShell(config, DEFAULT_CONFIG);

const canvas = mustGet<HTMLCanvasElement>("dish");
const viewport = mustGet<HTMLDivElement>("viewport");
const playPauseButton = mustGet<HTMLButtonElement>("playPause");
const resetButton = mustGet<HTMLButtonElement>("reset");
const newRunButton = mustGet<HTMLButtonElement>("newRun");
const fullscreenButton = mustGet<HTMLButtonElement>("fullscreen");
const mutationRateInput = mustGet<HTMLInputElement>("mutationRate");
const checkpointIntervalInput = mustGet<HTMLInputElement>("checkpointInterval");
const metricIntervalInput = mustGet<HTMLInputElement>("metricInterval");
const timeBudgetInput = mustGet<HTMLInputElement>("timeBudgetMs");
const resetDefaultsButton = mustGet<HTMLButtonElement>("resetDefaults");
const replicatorPresetSelect = mustGet<HTMLSelectElement>("replicatorPreset");
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

let running = false;
const worker = new Worker(new URL("./worker/sim.worker.ts", import.meta.url), {
  type: "module"
});

const viewportController = createViewportController({
  canvas,
  viewport,
  fullscreenButton,
  overlayElements: [
    document.querySelector<HTMLDivElement>(".canvas-hud"),
    document.querySelector<HTMLDivElement>(".canvas-scrubber")
  ],
  initialRenderWidth: config.gridWidth * TILE_SIZE,
  initialRenderHeight: config.gridHeight * TILE_SIZE
});

const metricPanel = createMetricPanel({
  metricChart,
  metricSelect: chartMetricSelect,
  chartEquation,
  phaseBadge
});

const programBrowser = createProgramBrowser({
  programList,
  detailCanvas: programDetailCanvas,
  detailTitle: programDetailTitle,
  detailStats: programDetailStats,
  detailCode: programDetailCode
});

const interactionLab = createInteractionLab({
  refs: {
    cellA: interactionCellA,
    cellB: interactionCellB,
    maxReads: interactionMaxReads,
    evaluateButton: evaluateInteractionButton,
    loadTopProgramAButton,
    loadTopProgramBButton,
    zeroCellsButton: zeroInteractionCellsButton,
    status: interactionStatus,
    beforeA: interactionBeforeA,
    beforeB: interactionBeforeB,
    afterA: interactionAfterA,
    afterB: interactionAfterB,
    changeA: interactionChangeA,
    changeB: interactionChangeB,
    statsA: interactionStatsA,
    statsB: interactionStatsB,
    outputA: interactionOutputA,
    outputB: interactionOutputB
  },
  selectedProgram: programBrowser.selectedProgram
});

const replicatorControls = createReplicatorControls({
  config,
  refs: {
    presetSelect: replicatorPresetSelect,
    countInput: replicatorCountInput,
    previewCanvas: replicatorPreviewCanvas,
    description: replicatorDescription,
    code: replicatorCode,
    injectButton: injectReplicatorButton,
    loadToLabButton: loadReplicatorToLabButton,
    status: injectorStatus
  },
  onInject: (presetId, bytes, count) => {
    post({ type: "injectProgram", presetId, bytes, count });
  },
  onLoadToLab: (bytes, presetName) => {
    interactionLab.loadReplicator(bytes, presetName);
  }
});

const runtimeControls = createRuntimeControls({
  config,
  defaults: DEFAULT_CONFIG,
  refs: {
    mutationRateInput,
    checkpointIntervalInput,
    metricIntervalInput,
    timeBudgetInput,
    resetDefaultsButton,
    replicatorPresetSelect,
    replicatorCountInput
  },
  onUpdateConfig: updateRuntimeConfig,
  onDefaultsReset: () => replicatorControls.resetToDefault()
});

const checkpointController = createCheckpointController({
  checkpointScrubber,
  checkpointLabel,
  checkpointEpochLabel,
  checkpointLatestButton,
  onPreviewCheckpoint: (checkpointId, requestId) => {
    post({ type: "previewCheckpoint", checkpointId, requestId });
  },
  onShowLive: () => post({ type: "showLive" })
});

bindTooltips(tooltipLayer);
bindCollapsibleSections();

worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
  const message = event.data;
  if (message.type === "status") {
    updateStatus(message.status);
  } else if (message.type === "previewComplete") {
    if (checkpointController.acceptsPreview(message.requestId) && message.ok) {
      updateStatus(message.status);
    }
  } else if (message.type === "injectionComplete") {
    updateStatus(message.status);
    replicatorControls.updateInjectionStatus(message);
  } else if (message.type === "frame") {
    viewportController.drawFallbackFrame(
      message.width,
      message.height,
      message.buffer
    );
  }
};

if (viewportController.canUseOffscreen) {
  const offscreen = viewportController.transferToOffscreen();
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
  viewportController.resetFit();
  post({ type: "reset", config: runtimeControls.readConfig() });
});

newRunButton.addEventListener("click", () => {
  runtimeControls.randomizeSeed();
  viewportController.resetFit();
  post({ type: "reset", config: runtimeControls.readConfig() });
});

function updateStatus(status: SimulationStatus): void {
  running = status.running;
  viewportController.updateCanvasSize(status);
  updatePlayPauseButton();
  updateStatsReadout(status);
  metricPanel.update(status.latestMetric, status.metricHistory);
  programBrowser.update(status.topPrograms);
  checkpointController.update(status);
  replicatorControls.updateStatus(status);
}

function updateStatsReadout(status: SimulationStatus): void {
  setText("epochsPerSecond", status.epochsPerSecond.toFixed(1));
  setText("renderFps", status.renderFps.toFixed(1));
  setText("pairsPerEpoch", Math.round(status.pairsPerEpoch).toLocaleString());
  setText("readsPerPair", status.avgInstructionReadsPerPair.toFixed(1));
  setText("activeOps", Math.round(status.activeOpsPerEpoch).toLocaleString());
}

function updatePlayPauseButton(): void {
  playPauseButton.textContent = running ? "Pause" : "Play";
  playPauseButton.title = running ? "Pause" : "Play";
  playPauseButton.dataset.tip = running ? "Pause simulation" : "Play simulation";
  playPauseButton.setAttribute(
    "aria-label",
    running ? "Pause simulation" : "Play simulation"
  );
}

function updateRuntimeConfig(update: RuntimeConfigUpdate): void {
  post({ type: "updateConfig", config: update });
}

function post(message: WorkerInMessage, transfer?: Transferable[]): void {
  worker.postMessage(message, transfer ?? []);
}
